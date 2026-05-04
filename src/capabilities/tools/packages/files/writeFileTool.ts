import fs from "node:fs/promises";

import { ensureParentDirectory, fileExists, resolveUserPath, truncateText } from "../../../../utils/fs.js";
import { recordToolChange } from "../../core/changeTracking.js";
import { toToolRelativePath } from "../../core/pathDisplay.js";
import { buildDiffPreview, okResult, parseArgs, readBoolean, readPossiblyEmptyString, readString } from "../../core/shared.js";
import { buildToolChangeFeedback } from "./toolChangeFeedback.js";
import { collectWriteDiagnostics } from "./writeDiagnostics.js";
import type { RegisteredTool } from "../../core/types.js";

export const writeFileTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "write_file",
      description: "Write full file content. Use this for brand-new files or deliberate full-file rewrites; for small targeted changes, prefer edit_file or patch_file.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "File path to write.",
          },
          content: {
            type: "string",
            description: "The full target content.",
          },
          create_directories: {
            type: "boolean",
            description: "Whether to create parent directories if they do not exist.",
          },
        },
        required: ["path", "content"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const targetPath = readString(args.path, "path");
    const content = readPossiblyEmptyString(args.content, "content");
    const createDirectories = readBoolean(args.create_directories, true);
    const resolved = resolveUserPath(targetPath, context.cwd);
    const displayPath = toToolRelativePath(context.cwd, resolved);
    const existed = await fileExists(resolved);
    const before = existed ? await fs.readFile(resolved, "utf8") : "";
    const preview = buildDiffPreview(before, content);

    if (createDirectories) {
      await ensureParentDirectory(resolved);
    }

    await fs.writeFile(resolved, content, "utf8");
    const changeRecord = await recordToolChange(context, {
      toolName: "write_file",
      summary: `write_file ${displayPath}`,
      preview,
      operations: [
        {
          path: resolved,
          kind: existed ? "update" : "create",
          binary: false,
          preview,
          beforeText: existed ? before : undefined,
          afterText: content,
        },
      ],
    });
    const diagnostics = await collectWriteDiagnostics([resolved]);
    const feedback = buildToolChangeFeedback({
      toolName: "write_file",
      changeId: changeRecord.change?.id,
      changedPaths: [resolved],
      diff: truncateText(preview, 6_000),
      diagnostics,
    });

    return okResult(
      JSON.stringify(
          {
          path: displayPath,
          existed,
          bytes: Buffer.byteLength(content, "utf8"),
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
  },
};
