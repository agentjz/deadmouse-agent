import { truncateText } from "../../utils/fs.js";
import type { ToolExecutionResult } from "../../types.js";

const DEFAULT_MAX_CHARS = 4_000;
const DIFF_MAX_CHARS = 3_000;
const OUTPUT_MAX_CHARS = 1_500;
const LIST_MAX_ITEMS = 30;
const STATUS_MAX_FILES = 12;
const DIFF_STAT_MAX_FILES = 12;
const LARGE_DIFF_FILE_THRESHOLD = 8;

export function projectToolResultForModel(input: {
  toolName: string;
  result: ToolExecutionResult;
}): string {
  const parsed = parseObject(input.result.output);
  if (!input.result.ok) {
    return projectFailure(input.toolName, input.result.output, parsed);
  }

  if (!parsed) {
    return truncateText(input.result.output.trim(), DEFAULT_MAX_CHARS);
  }

  switch (input.toolName) {
    case "read_file":
      return projectReadFile(parsed);
    case "edit_file":
      return projectEditFile(parsed);
    case "patch_file":
      return projectPatchFile(parsed);
    case "write_file":
      return projectWriteFile(parsed);
    case "git_status":
      return projectGitStatus(parsed);
    case "git_diff":
      return projectGitDiff(parsed);
    case "run_shell":
      return projectRunShell(parsed);
    case "search_files":
      return projectSearchFiles(parsed);
    case "find_files":
      return projectFindFiles(parsed);
    case "list_files":
      return projectListFiles(parsed);
    default:
      return projectGenericSuccess(parsed, input.result.output);
  }
}

function projectReadFile(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? readString(payload.requestedPath) ?? "file";
  if (payload.readable === false) {
    return joinLines([
      `${path}: not readable`,
      readString(payload.reason),
      readString(payload.detectedCapability) ? `capability: ${readString(payload.detectedCapability)}` : undefined,
    ]);
  }

  const startLine = readNumber(payload.startLine);
  const endLine = readNumber(payload.endLine);
  const content = readString(payload.content) ?? "";
  const continuation = readObject(payload.continuation);
  const continuationArgs = readObject(continuation?.continuationArgs);

  return joinLines([
    `${path}${startLine && endLine ? `:${startLine}-${endLine}` : ""}`,
    truncateText(content, DEFAULT_MAX_CHARS),
    continuationArgs ? `next: read_file ${JSON.stringify(continuationArgs)}` : undefined,
  ]);
}

function projectEditFile(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const applied = readNumber(payload.appliedEdits) ?? readNumber(payload.requestedEdits);
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `edited ${path}${applied ? ` (${applied} replacement${applied === 1 ? "" : "s"})` : ""}`,
    diff ? truncateText(diff, DIFF_MAX_CHARS) : undefined,
  ]);
}

function projectPatchFile(payload: Record<string, unknown>): string {
  const files = readNumber(payload.files) ?? readArray(payload.appliedFiles)?.length;
  const hunks = readNumber(payload.appliedHunks);
  const dryRun = payload.dryRun === true;
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `${dryRun ? "patch dry-run ok" : "patched"}${files !== undefined ? ` ${files} file${files === 1 ? "" : "s"}` : ""}${hunks !== undefined ? `, ${hunks} hunk${hunks === 1 ? "" : "s"}` : ""}`,
    diff ? truncateText(diff, DIFF_MAX_CHARS) : undefined,
  ]);
}

function projectWriteFile(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "file";
  const bytes = readNumber(payload.bytes);
  const existed = payload.existed === true;
  const diff = readString(payload.diff) ?? readString(payload.preview);
  return joinLines([
    `${existed ? "wrote" : "created"} ${path}${bytes !== undefined ? ` (${bytes} bytes)` : ""}`,
    diff ? truncateText(diff, DIFF_MAX_CHARS) : undefined,
  ]);
}

function projectGitStatus(payload: Record<string, unknown>): string {
  const branch = readString(payload.branch);
  const summary = readObject(payload.summary);
  const files = readArray(payload.files);
  const counts = [
    ["modified", readNumber(summary?.modified)],
    ["added", readNumber(summary?.added)],
    ["deleted", readNumber(summary?.deleted)],
    ["renamed", readNumber(summary?.renamed)],
    ["untracked", readNumber(summary?.untracked)],
    ["ignored", readNumber(summary?.ignored)],
    ["conflicted", readNumber(summary?.conflicted)],
  ]
    .filter(([, value]) => typeof value === "number" && value > 0)
    .map(([label, value]) => `${label} ${value}`)
    .join(", ");

  const fileLines = (files ?? [])
    .slice(0, STATUS_MAX_FILES)
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => `${readString(item.status) ?? ""} ${readString(item.path) ?? ""}`.trim())
    .filter(Boolean);

  return joinLines([
    `git status${branch ? ` on ${branch}` : ""}: ${counts || "clean"}`,
    ...fileLines,
    files && files.length > STATUS_MAX_FILES ? `... ${files.length - STATUS_MAX_FILES} more` : undefined,
  ]);
}

function projectGitDiff(payload: Record<string, unknown>): string {
  const path = readString(payload.path);
  const root = readString(payload.root);
  const stats = readObject(payload.stats);
  const filesChanged = readNumber(stats?.filesChanged);
  const insertions = readNumber(stats?.insertions);
  const deletions = readNumber(stats?.deletions);
  const files = readArray(stats?.files);
  const diff = readString(payload.diff);
  const statLines = (files ?? [])
    .slice(0, DIFF_STAT_MAX_FILES)
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const path = readString(item.path);
      const adds = readNumber(item.insertions);
      const dels = readNumber(item.deletions);
      return path ? `${path} +${adds ?? "-"} -${dels ?? "-"}` : undefined;
    })
    .filter((line): line is string => Boolean(line));

  return joinLines([
    filesChanged !== undefined
      ? `${filesChanged} files changed${path ? ` in ${path}` : ""}, +${insertions ?? 0} -${deletions ?? 0}`
      : "git diff",
    ...statLines,
    files && files.length > DIFF_STAT_MAX_FILES ? `... ${files.length - DIFF_STAT_MAX_FILES} more` : undefined,
    shouldIncludeDiffBody(path, root, filesChanged, diff) ? truncateText(diff ?? "", DIFF_MAX_CHARS) : undefined,
    !shouldIncludeDiffBody(path, root, filesChanged, diff) && diff
      ? "diff body omitted for large worktree diff; call git_diff with a specific path for focused patch evidence"
      : undefined,
    payload.truncated === true ? "diff truncated" : undefined,
  ]);
}

function shouldIncludeDiffBody(
  path: string | undefined,
  root: string | undefined,
  filesChanged: number | undefined,
  diff: string | undefined,
): boolean {
  if (!diff?.trim()) {
    return false;
  }
  if (path && !isWorktreeRootPath(path, root)) {
    return true;
  }
  return (filesChanged ?? 0) <= LARGE_DIFF_FILE_THRESHOLD;
}

function isWorktreeRootPath(pathValue: string, root: string | undefined): boolean {
  const normalizedPath = normalizePathLike(pathValue);
  if (normalizedPath === "." || normalizedPath === "") {
    return true;
  }
  return root !== undefined && normalizedPath === normalizePathLike(root);
}

function normalizePathLike(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
}

function projectRunShell(payload: Record<string, unknown>): string {
  const exitCode = readNumber(payload.exitCode);
  const durationMs = readNumber(payload.durationMs);
  const status = readString(payload.status);
  const output = readString(payload.output);
  const lines = [
    `exit ${exitCode ?? "?"}${durationMs !== undefined ? ` in ${durationMs}ms` : ""}${status && status !== "completed" ? ` (${status})` : ""}`,
  ];
  if (output?.trim()) {
    lines.push(truncateText(output.trim(), OUTPUT_MAX_CHARS));
  }
  if (payload.truncated === true) {
    lines.push("output truncated");
  }
  return joinLines(lines);
}

function projectSearchFiles(payload: Record<string, unknown>): string {
  const mode = readString(payload.mode) ?? "files";
  const pattern = readString(payload.pattern);
  const totalMatches = readNumber(payload.totalMatches);
  const matchedFilesCount = readNumber(payload.matchedFilesCount);
  const matches = readArray(payload.matches);
  const files = readArray(payload.files);
  const rows = (mode === "matches" ? matches : files) ?? [];
  const lines = rows
    .slice(0, LIST_MAX_ITEMS)
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => {
      const path = readString(item.path);
      const line = readNumber(item.line) ?? readNumber(item.firstLine);
      const text = readString(item.text);
      const count = readNumber(item.matches);
      const suffix = text ? ` ${text}` : count !== undefined ? ` (${count})` : "";
      return `${path ?? "(match)"}${line ? `:${line}` : ""}${suffix}`.trim();
    })
    .filter(Boolean);

  return joinLines([
    `search "${pattern ?? ""}": ${totalMatches ?? 0} matches in ${matchedFilesCount ?? files?.length ?? 0} files`,
    ...lines,
    payload.truncated === true ? "results truncated" : undefined,
  ]);
}

function projectFindFiles(payload: Record<string, unknown>): string {
  const pattern = readString(payload.pattern);
  const total = readNumber(payload.totalMatches);
  const files = readArray(payload.files)?.map((item) => readString(item)).filter((item): item is string => Boolean(item)) ?? [];
  return joinLines([
    `find ${pattern ?? ""}: ${total ?? files.length} files`,
    ...files.slice(0, LIST_MAX_ITEMS),
    payload.truncated === true ? "results truncated" : undefined,
  ]);
}

function projectListFiles(payload: Record<string, unknown>): string {
  const path = readString(payload.path) ?? "path";
  const type = readString(payload.type);
  if (type === "file") {
    return `${path} file`;
  }

  const entries = readArray(payload.entries) ?? [];
  const lines = entries
    .slice(0, LIST_MAX_ITEMS)
    .map((item) => readObject(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .map((item) => `${readString(item.type) === "directory" ? "dir " : "file"} ${readString(item.path) ?? ""}`.trim())
    .filter(Boolean);
  return joinLines([
    `${path}: ${readNumber(payload.total) ?? entries.length} entries`,
    ...lines,
    entries.length > LIST_MAX_ITEMS ? `... ${entries.length - LIST_MAX_ITEMS} more` : undefined,
  ]);
}

function projectGenericSuccess(payload: Record<string, unknown>, rawOutput: string): string {
  const lines = [
    readString(payload.summary),
    readString(payload.preview),
    readString(payload.output),
    readString(payload.content),
  ].filter((line): line is string => Boolean(line));

  if (lines.length > 0) {
    return truncateText(lines.join("\n"), DEFAULT_MAX_CHARS);
  }

  const fragments = [
    formatScalar("path", payload.path),
    formatScalar("title", payload.title),
    formatArrayCount("entries", payload.entries),
    formatArrayCount("matches", payload.matches),
    formatScalar("total", payload.total),
    formatScalar("jobId", payload.jobId),
    formatScalar("taskId", payload.taskId),
    formatScalar("status", payload.status ?? payload.jobStatus),
  ].filter((fragment): fragment is string => Boolean(fragment));

  return fragments.length > 0
    ? truncateText(fragments.join("; "), DEFAULT_MAX_CHARS)
    : truncateText(rawOutput.trim(), DEFAULT_MAX_CHARS);
}

function projectFailure(toolName: string, rawOutput: string, payload: Record<string, unknown> | null): string {
  if (!payload) {
    return truncateText(rawOutput.trim(), DEFAULT_MAX_CHARS);
  }

  const details = readObject(payload.details);
  const readArgs = readObject(details?.readArgs);
  const suggestions = readArray(details?.suggestions);
  const lines = [
    `${toolName} failed: ${readString(payload.error) ?? "unknown error"}`,
    readString(payload.code) ? `code: ${readString(payload.code)}` : undefined,
    readString(payload.hint) ? `hint: ${readString(payload.hint)}` : undefined,
    readArgs ? `read: read_file ${JSON.stringify(readArgs)}` : undefined,
    suggestions && suggestions.length > 0 ? `suggestions: ${suggestions.slice(0, 5).map((item) => String(item)).join(", ")}` : undefined,
  ];

  return truncateText(joinLines(lines), DEFAULT_MAX_CHARS);
}

function joinLines(lines: Array<string | undefined>): string {
  return lines
    .map((line) => line?.trimEnd())
    .filter((line): line is string => Boolean(line && line.length > 0))
    .join("\n");
}

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function formatScalar(key: string, value: unknown): string | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${String(value)}`;
  }
  return undefined;
}

function formatArrayCount(key: string, value: unknown): string | undefined {
  return Array.isArray(value) ? `${key}: ${value.length}` : undefined;
}
