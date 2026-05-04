import path from "node:path";
import fs from "node:fs/promises";

import { loadExeca } from "../../../../utils/execa.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import type { ToolContext } from "../../core/types.js";

export interface GitFileStatus {
  path: string;
  indexStatus: string;
  worktreeStatus: string;
  status: string;
  ignored: boolean;
  untracked: boolean;
  renamedFrom?: string;
}

export interface GitStatusSnapshot {
  root: string;
  branch: string;
  files: GitFileStatus[];
  summary: {
    modified: number;
    added: number;
    deleted: number;
    renamed: number;
    untracked: number;
    ignored: number;
    conflicted: number;
  };
}

export interface GitScope {
  root: string;
  pathspec?: string;
}

export async function runGit(
  context: ToolContext,
  args: string[],
  options: {
    cwd?: string;
    reject?: boolean;
  } = {},
): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const execa = await loadExeca();
  const cwd = options.cwd ? resolveUserPath(options.cwd, context.cwd) : context.cwd;
  const result = await execa("git", args, {
    cwd,
    reject: options.reject ?? false,
    timeout: 30_000,
    windowsHide: true,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode ?? 0,
  };
}

export async function resolveGitRoot(context: ToolContext, cwd?: string): Promise<string> {
  const resolvedCwd = cwd ? await resolveGitProbeCwd(resolveUserPath(cwd, context.cwd)) : context.cwd;
  const result = await runGit(context, ["rev-parse", "--show-toplevel"], {
    cwd: resolvedCwd,
  });
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    throw new Error("git tool requires a Git worktree.");
  }

  return path.resolve(result.stdout.trim());
}

export async function resolveGitScope(context: ToolContext, inputPath?: string): Promise<GitScope> {
  const root = await resolveGitRoot(context, inputPath);
  const trimmedPath = inputPath?.trim();
  if (!trimmedPath) {
    return { root };
  }

  const resolvedPath = path.resolve(resolveUserPath(trimmedPath, context.cwd));
  const relativePath = await resolveGitRelativePath(root, resolvedPath);
  if (!relativePath) {
    return { root };
  }
  if (relativePath === ".." || relativePath.startsWith("../")) {
    throw new Error(`Git path is outside the worktree: ${trimmedPath}`);
  }

  return {
    root,
    pathspec: relativePath,
  };
}

async function resolveGitRelativePath(root: string, resolvedPath: string): Promise<string> {
  const direct = normalizeGitRelativePath(root, resolvedPath);
  if (!isOutsideGitRoot(direct)) {
    return direct;
  }

  const realRoot = await realpathIfExists(root);
  const realResolvedPath = await realpathTargetOrParent(resolvedPath);
  const realRelative = normalizeGitRelativePath(realRoot, realResolvedPath);
  if (!isOutsideGitRoot(realRelative)) {
    return realRelative;
  }

  return direct;
}

function normalizeGitRelativePath(root: string, resolvedPath: string): string {
  return path.relative(root, resolvedPath).replace(/\\/g, "/");
}

function isOutsideGitRoot(relativePath: string): boolean {
  return relativePath === ".." || relativePath.startsWith("../") || path.isAbsolute(relativePath);
}

async function realpathIfExists(resolvedPath: string): Promise<string> {
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

async function realpathTargetOrParent(resolvedPath: string): Promise<string> {
  try {
    return await fs.realpath(resolvedPath);
  } catch {
    const parent = await realpathIfExists(path.dirname(resolvedPath));
    return path.join(parent, path.basename(resolvedPath));
  }
}

async function resolveGitProbeCwd(resolvedPath: string): Promise<string> {
  try {
    const stat = await fs.stat(resolvedPath);
    return stat.isDirectory() ? resolvedPath : path.dirname(resolvedPath);
  } catch {
    return path.extname(resolvedPath) ? path.dirname(resolvedPath) : resolvedPath;
  }
}

export async function readGitStatusSnapshot(
  context: ToolContext,
  input: {
    path?: string;
    includeIgnored?: boolean;
    includeUntracked?: boolean;
  } = {},
): Promise<GitStatusSnapshot> {
  const scope = await resolveGitScope(context, input.path);
  const root = scope.root;
  const branchResult = await runGit(context, ["branch", "--show-current"], { cwd: root });
  const statusArgs = ["status", "--porcelain=v1", "-z"];
  if (input.includeIgnored) {
    statusArgs.push("--ignored");
  }
  if (!input.includeUntracked) {
    statusArgs.push("--untracked-files=no");
  }
  if (scope.pathspec) {
    statusArgs.push("--", scope.pathspec);
  }
  const statusResult = await runGit(context, statusArgs, { cwd: root });
  const files = await expandUntrackedDirectories(root, parsePorcelainStatus(statusResult.stdout));

  return {
    root,
    branch: branchResult.stdout.trim(),
    files,
    summary: summarizeStatus(files),
  };
}

async function expandUntrackedDirectories(root: string, files: GitFileStatus[]): Promise<GitFileStatus[]> {
  const expanded: GitFileStatus[] = [];

  for (const file of files) {
    if (!file.untracked || !file.path.endsWith("/")) {
      expanded.push(file);
      continue;
    }

    const absolutePath = path.join(root, file.path);
    const nestedFiles = await collectFiles(absolutePath);
    if (nestedFiles.length === 0) {
      expanded.push(file);
      continue;
    }

    for (const nestedFile of nestedFiles) {
      expanded.push({
        ...file,
        path: path.relative(root, nestedFile).replace(/\\/g, "/"),
      });
    }
  }

  return expanded.sort((left, right) => left.path.localeCompare(right.path));
}

async function collectFiles(root: string): Promise<string[]> {
  const results: string[] = [];
  let entries;

  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return results;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await collectFiles(entryPath));
    } else if (entry.isFile()) {
      results.push(entryPath);
    }
  }

  return results;
}

export function parsePorcelainStatus(stdout: string): GitFileStatus[] {
  const tokens = stdout.split("\0").filter((item) => item.length > 0);
  const files: GitFileStatus[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index] ?? "";
    const indexStatus = token[0] ?? " ";
    const worktreeStatus = token[1] ?? " ";
    const filePath = token.slice(3);
    if (!filePath) {
      continue;
    }

    let renamedFrom: string | undefined;
    if (indexStatus === "R" || indexStatus === "C") {
      renamedFrom = tokens[index + 1];
      index += renamedFrom ? 1 : 0;
    }

    files.push({
      path: filePath.replace(/\\/g, "/"),
      indexStatus,
      worktreeStatus,
      status: `${indexStatus}${worktreeStatus}`,
      ignored: indexStatus === "!" && worktreeStatus === "!",
      untracked: indexStatus === "?" && worktreeStatus === "?",
      renamedFrom: renamedFrom?.replace(/\\/g, "/"),
    });
  }

  return files;
}

function summarizeStatus(files: GitFileStatus[]): GitStatusSnapshot["summary"] {
  const summary: GitStatusSnapshot["summary"] = {
    modified: 0,
    added: 0,
    deleted: 0,
    renamed: 0,
    untracked: 0,
    ignored: 0,
    conflicted: 0,
  };

  for (const file of files) {
    if (file.ignored) {
      summary.ignored += 1;
      continue;
    }
    if (file.untracked) {
      summary.untracked += 1;
      continue;
    }
    if (file.indexStatus === "U" || file.worktreeStatus === "U") {
      summary.conflicted += 1;
    }
    if (file.indexStatus === "A" || file.worktreeStatus === "A") {
      summary.added += 1;
    }
    if (file.indexStatus === "M" || file.worktreeStatus === "M") {
      summary.modified += 1;
    }
    if (file.indexStatus === "D" || file.worktreeStatus === "D") {
      summary.deleted += 1;
    }
    if (file.indexStatus === "R" || file.worktreeStatus === "R") {
      summary.renamed += 1;
    }
  }

  return summary;
}
