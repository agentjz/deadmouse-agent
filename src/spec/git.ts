import { loadExeca } from "../utils/execa.js";

export interface GitCommandOutput {
  stdout: string;
  stderr: string;
  all: string;
}

export async function runSpecGit(
  cwd: string,
  args: readonly string[],
  options: {
    timeoutMs?: number;
  } = {},
): Promise<GitCommandOutput> {
  const execa = await loadExeca();
  const result = await execa("git", ["-C", cwd, ...args], {
    reject: true,
    timeout: options.timeoutMs ?? 120_000,
    all: true,
    windowsHide: true,
  });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    all: result.all ?? "",
  };
}

export async function readGitHead(cwd: string): Promise<string> {
  return (await runSpecGit(cwd, ["rev-parse", "HEAD"])).stdout.trim();
}

export async function readGitStatus(cwd: string): Promise<string> {
  return (await runSpecGit(cwd, ["status", "--short"])).stdout.trim();
}

export async function gitRefExists(cwd: string, ref: string): Promise<boolean> {
  try {
    await runSpecGit(cwd, ["show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch {
    return false;
  }
}
