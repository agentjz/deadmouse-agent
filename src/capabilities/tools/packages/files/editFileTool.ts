import fs from "node:fs/promises";

import { resolveUserPath, truncateText } from "../../../../utils/fs.js";
import { decodeTextFileEnvelope, encodeTextFileEnvelope } from "../../../../utils/text.js";
import { recordToolChange } from "../../core/changeTracking.js";
import { ToolExecutionError } from "../../core/errors.js";
import { toToolRelativePath } from "../../core/pathDisplay.js";
import { buildDiffPreview, okResult, parseArgs, readOptionalNumber, readPossiblyEmptyString, readString } from "../../core/shared.js";
import { buildToolChangeFeedback } from "./toolChangeFeedback.js";
import { collectWriteDiagnostics } from "./writeDiagnostics.js";
import type { RegisteredTool } from "../../core/types.js";

interface RequestedEdit {
  oldString: string;
  newString: string;
  line?: number;
}

interface PlannedEdit {
  start: number;
  end: number;
  oldString: string;
  newString: string;
  sourceIndex: number;
}

const fileEditLocks = new Map<string, Promise<void>>();

export const editFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit an existing file by replacing exact text. Use read_file first for the target area, then provide old_string, new_string, and optionally the 1-based line near the edit.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to edit.",
          },
          edits: {
            type: "array",
            description: "Batch edit plan applied against the current file contents.",
            items: {
              type: "object",
              properties: {
                old_string: {
                  type: "string",
                  description: "Exact current text to replace.",
                },
                line: {
                  type: "number",
                  description: "Optional 1-based line near the edit. Use this when the same old_string appears more than once.",
                },
                new_string: {
                  type: "string",
                  description: "Replacement text.",
                },
              },
              required: ["old_string", "new_string"],
              additionalProperties: false,
            },
          },
        },
        required: ["path", "edits"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const edits = readRequestedEdits(args.edits);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const displayPath = toToolRelativePath(context.cwd, resolved);

    return withFileEditLock(resolved, async () => {
      const beforeBuffer = await fs.readFile(resolved);
      const beforeEnvelope = decodeTextFileEnvelope(beforeBuffer);
      if (!beforeEnvelope) {
        throw new ToolExecutionError(`edit_file cannot edit binary or unsupported text encoding for ${resolved}`, {
          code: "EDIT_UNREADABLE_TEXT",
          details: {
            path: resolved,
          },
        });
      }

      const before = beforeEnvelope.text;
      const plannedEdits = buildEditPlan(before, edits, displayPath);
      const after = applyEditPlan(before, plannedEdits);

      if (after === before) {
        throw new ToolExecutionError(`edit_file did not change the file contents for ${resolved}`, {
          code: "EDIT_NOOP",
          details: {
            path: resolved,
          },
        });
      }

      const diff = buildDiffPreview(before, after);

      await fs.writeFile(resolved, encodeTextFileEnvelope(after, beforeEnvelope));
      const changeRecord = await recordToolChange(context, {
        toolName: "edit_file",
        summary: `edit_file ${displayPath}`,
        preview: diff,
        operations: [
          {
            path: resolved,
            kind: "update",
            binary: false,
            preview: diff,
            beforeText: before,
            afterText: after,
          },
        ],
      });
      const diagnostics = await collectWriteDiagnostics([resolved]);
      const feedback = buildToolChangeFeedback({
        toolName: "edit_file",
        changeId: changeRecord.change?.id,
        changedPaths: [resolved],
        diff: truncateText(diff, 6_000),
        diagnostics,
      });

      return okResult(
        JSON.stringify(
          {
            path: displayPath,
            requestedEdits: edits.length,
            appliedEdits: plannedEdits.length,
            changedPaths: [displayPath],
            changeId: changeRecord.change?.id,
            changeHistoryWarning: changeRecord.warning,
            diff: feedback.diff,
          },
          null,
          2,
        ),
        {
          changedPaths: [resolved],
          changeId: changeRecord.change?.id,
          ...feedback,
        },
      );
    });
  },
};

function readRequestedEdits(value: unknown): RequestedEdit[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Tool argument "edits" must contain at least one edit.');
  }

  return value.map((entry, index) => readRequestedEdit(entry, `edits[${index}]`));
}

function readRequestedEdit(value: unknown, field: string): RequestedEdit {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Tool argument "${field}" must be an object.`);
  }

  const record = value as Record<string, unknown>;
  return {
    oldString: readPossiblyEmptyString(record.old_string, `${field}.old_string`),
    newString: readPossiblyEmptyString(record.new_string, `${field}.new_string`),
    line: readOptionalNumber(record.line),
  };
}

function buildEditPlan(before: string, request: RequestedEdit[], displayPath: string): PlannedEdit[] {
  const planned: PlannedEdit[] = [];

  request.forEach((edit, sourceIndex) => {
    const matches = findEditOccurrences(before, edit.oldString, edit.line);
    if (matches.length === 0) {
      throw new ToolExecutionError(`edit_file could not find edit ${sourceIndex + 1}. Fresh read_file around the target area, then retry with current old_string.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.line,
          readArgs: buildFreshReadArgs(displayPath, edit.line),
        },
      });
    }

    if (matches.length > 1) {
      throw new ToolExecutionError(`edit_file edit ${sourceIndex + 1} matched multiple regions; add a line hint, merge the edit, or make old_string more specific.`, {
        code: "EDIT_AMBIGUOUS",
        details: {
          editIndex: sourceIndex,
          matches: matches.length,
          line: edit.line,
          readArgs: buildFreshReadArgs(displayPath, edit.line),
        },
      });
    }

    const match = matches[0];
    if (!match) {
      throw new ToolExecutionError(`edit_file lost its match for edit ${sourceIndex + 1}. Fresh read_file around the target area, then retry.`, {
        code: "EDIT_NOT_FOUND",
        details: {
          editIndex: sourceIndex,
          line: edit.line,
          readArgs: buildFreshReadArgs(displayPath, edit.line),
        },
      });
    }

    planned.push({
      start: match.start,
      end: match.end,
      oldString: match.oldString,
      newString: edit.newString,
      sourceIndex,
    });
  });

  planned.sort((left, right) => left.start - right.start || left.end - right.end || left.sourceIndex - right.sourceIndex);
  assertNoOverlappingEdits(planned);
  return planned;
}

function findEditOccurrences(
  before: string,
  oldString: string,
  lineHint: number | undefined,
): Array<{ start: number; end: number; oldString: string }> {
  const matches: Array<{ start: number; end: number; oldString: string; distance: number }> = [];
  let offset = 0;

  if (oldString.length === 0) {
    return [];
  }

  while (offset <= before.length) {
    const index = before.indexOf(oldString, offset);
    if (index === -1) {
      break;
    }

    const line = lineForOffset(before, index);
    matches.push({
      start: index,
      end: index + oldString.length,
      oldString,
      distance: lineHint === undefined ? 0 : Math.abs(line - lineHint),
    });
    offset = index + Math.max(1, oldString.length);
  }

  if (lineHint === undefined || matches.length <= 1) {
    return matches.map(({ start, end, oldString }) => ({ start, end, oldString }));
  }

  const closestDistance = Math.min(...matches.map((match) => match.distance));
  return matches
    .filter((match) => match.distance === closestDistance)
    .map(({ start, end, oldString }) => ({ start, end, oldString }));
}

function lineForOffset(input: string, offset: number): number {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (input.charCodeAt(index) === 10) {
      line += 1;
    }
  }
  return line;
}

function buildFreshReadArgs(path: string, line: number | undefined): {
  path: string;
  offset: number;
  limit: number;
} {
  return {
    path,
    offset: Math.max(1, (line ?? 1) - 20),
    limit: 60,
  };
}

function assertNoOverlappingEdits(edits: PlannedEdit[]): void {
  for (let index = 1; index < edits.length; index += 1) {
    const previous = edits[index - 1];
    const current = edits[index];
    if (!previous || !current) {
      continue;
    }

    if (current.start < previous.end) {
      throw new ToolExecutionError(
        `edit_file edits ${previous.sourceIndex + 1} and ${current.sourceIndex + 1} overlap in the original file. Merge adjacent edits or make them more specific.`,
        {
          code: "EDIT_OVERLAP",
          details: {
            leftEditIndex: previous.sourceIndex,
            rightEditIndex: current.sourceIndex,
          },
        },
      );
    }
  }
}

function applyEditPlan(before: string, edits: PlannedEdit[]): string {
  if (edits.length === 0) {
    return before;
  }

  let cursor = 0;
  let result = "";

  for (const edit of edits) {
    result += before.slice(cursor, edit.start);
    result += edit.newString;
    cursor = edit.end;
  }

  result += before.slice(cursor);
  return result;
}

async function withFileEditLock<T>(filePath: string, action: () => Promise<T>): Promise<T> {
  const previous = fileEditLocks.get(filePath) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => gate);
  fileEditLocks.set(filePath, queued);
  await previous;

  try {
    return await action();
  } finally {
    release?.();
    if (fileEditLocks.get(filePath) === queued) {
      fileEditLocks.delete(filePath);
    }
  }
}
