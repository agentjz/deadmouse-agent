import { isAbortError } from "../abort.js";
import { createBashOutputCapture } from "../../tools/outputCapture.js";
import { launchCommand } from "./launch.js";
import { normalizeCommandForPlatform } from "./platform.js";

export interface CommandRunOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  stallTimeoutMs: number;
  abortSignal?: AbortSignal;
  outputCapture?: {
    stateRootDir?: string;
    sessionId?: string;
    maxPreviewChars?: number;
  };
}

export interface CommandRunResult {
  exitCode: number | null;
  output: string;
  outputPath?: string;
  truncated: boolean;
  outputChars: number;
  outputBytes: number;
  timedOut: boolean;
  aborted: boolean;
  stalled: boolean;
  attempts: number;
  durationMs: number;
}

const STALL_KILL_TIMEOUT_MS = 5_000;

export async function runCommandWithPolicy(options: CommandRunOptions): Promise<CommandRunResult> {
  const normalizedCommand = normalizeCommandForPlatform(options.command);
  return runCommandOnce({
    ...options,
    command: normalizedCommand,
  });
}

async function runCommandOnce(options: CommandRunOptions): Promise<CommandRunResult> {
  const start = Date.now();
  let stalled = false;
  let stallTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const { subprocess } = await launchCommand(options.command, options.cwd, options.timeoutMs, options.abortSignal);
  const outputCapture = await createBashOutputCapture(options.outputCapture ?? {});

  const clearTimers = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const resetStallTimer = () => {
    if (stalled) {
      return;
    }

    if (stallTimer) {
      clearTimeout(stallTimer);
    }

    if (options.stallTimeoutMs > 0) {
      stallTimer = setTimeout(() => {
        stalled = true;
        try {
          subprocess.kill("SIGTERM");
        } catch {
          // ignore
        }
        if (STALL_KILL_TIMEOUT_MS > 0) {
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => {
            try {
              if (typeof subprocess.exitCode !== "number") {
                subprocess.kill("SIGKILL");
              }
            } catch {
              // ignore
            }
          }, STALL_KILL_TIMEOUT_MS);
        }
      }, options.stallTimeoutMs);
    }
  };

  resetStallTimer();

  if (subprocess.all) {
    subprocess.all.on("data", (chunk) => {
      resetStallTimer();
      outputCapture.append(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });
  }

  try {
    const result = await subprocess;
    clearTimers();
    const shellOutput = await outputCapture.finalize();

    return {
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      output: shellOutput.outputPreview,
      outputPath: shellOutput.outputPath,
      truncated: shellOutput.truncated,
      outputChars: shellOutput.outputChars,
      outputBytes: shellOutput.outputBytes,
      timedOut: Boolean((result as { timedOut?: unknown }).timedOut),
      aborted: !Boolean((result as { timedOut?: unknown }).timedOut) && isAbortedProcessResult(result, options.abortSignal),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const timedOut = isTimedOutError(error);
    clearTimers();
    const shellOutput = await outputCapture.finalize();

    return {
      exitCode: readExitCode(error),
      output: shellOutput.outputChars > 0 ? shellOutput.outputPreview : readProcessOutput(error),
      outputPath: shellOutput.outputPath,
      truncated: shellOutput.truncated,
      outputChars: shellOutput.outputChars,
      outputBytes: shellOutput.outputBytes,
      timedOut,
      aborted: !timedOut && isAbortedProcessResult(error, options.abortSignal),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
  }
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

function readExitCode(error: unknown): number | null {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : null;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Command failed.";
}

function isAbortedProcessResult(value: unknown, signal: AbortSignal | undefined): boolean {
  if ((value as { isCanceled?: unknown }).isCanceled === true) {
    return true;
  }

  return Boolean(signal?.aborted) || isAbortError(value);
}
