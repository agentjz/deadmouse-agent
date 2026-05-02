import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

export interface ProcessRunOptions {
  cwd: string;
  timeoutMs: number;
  capturePath: string;
  streamOutput?: boolean;
  streamLabel?: string;
}

export interface ProcessRunResult {
  exitCode: number;
  timedOut: boolean;
}

export async function runCommand(command: string, args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });
  let output = "";
  let timedOut = false;
  const writeStdout = createLinePrefixWriter(process.stdout, options.streamLabel);
  const writeStderr = createLinePrefixWriter(process.stderr, options.streamLabel);
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    output += text;
    if (options.streamOutput) {
      writeStdout(text);
    }
  });
  child.stderr.on("data", (chunk) => {
    const text = chunk.toString("utf8");
    output += text;
    if (options.streamOutput) {
      writeStderr(text);
    }
  });

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  clearTimeout(timer);

  if (timedOut) {
    output += `\n[TIMEOUT] process exceeded ${options.timeoutMs}ms\n`;
  }

  await fs.mkdir(path.dirname(options.capturePath), { recursive: true });
  await fs.writeFile(options.capturePath, output, "utf8");
  return {
    exitCode: typeof exitCode === "number" ? exitCode : 1,
    timedOut,
  };
}

export interface StreamWriterTarget {
  write(text: string): unknown;
}

export function createLinePrefixWriter(stream: StreamWriterTarget, label?: string): (text: string) => void {
  let atLineStart = true;
  return (text: string): void => {
    if (!label) {
      stream.write(text);
      return;
    }

    const normalized = text.replace(/\r\n/g, "\n");
    const lines = normalized.split(/(\n)/);
    for (const part of lines) {
      if (!part) {
        continue;
      }
      if (atLineStart) {
        stream.write(`[${label}] `);
      }
      stream.write(part);
      atLineStart = part === "\n";
    }
  };
}

export async function runNodeProcess(args: string[], options: ProcessRunOptions): Promise<ProcessRunResult> {
  return runCommand(process.execPath, args, options);
}

export function createTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "-",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
