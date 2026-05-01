import fs from "node:fs";
import path from "node:path";

import type { InteractionShell, InteractionTurnDisplay, ShellInputPort, ShellOutputPort } from "../interaction/shell.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { createRuntimeUiEvent } from "../runtime-ui/events.js";
import { formatRuntimeUiEventLine } from "../runtime-ui/terminalRenderer.js";

export interface TerminalLogWriter {
  write(text: string): void;
  dispose?(): void;
}

let outputMirrorSuppressDepth = 0;
let outputMirrorWriteCount = 0;

export function createTerminalLogWriter(rootDir: string, sessionId: string, now = new Date()): TerminalLogWriter {
  const timestamp = now.toISOString();
  const date = timestamp.slice(0, 10).replaceAll("-", "");
  const terminalDir = path.join(getProjectStatePaths(rootDir).observabilityDir, "terminal", date);
  fs.mkdirSync(terminalDir, { recursive: true });
  const logPath = path.join(terminalDir, `${safePathPart(sessionId)}.log`);
  return {
    write(text) {
      fs.appendFileSync(logPath, text, "utf8");
    },
  };
}

export function mirrorProcessOutputToTerminalLog(writer: TerminalLogWriter): () => void {
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);
  const writeSync = fs.writeSync;
  let active = true;

  process.stdout.write = ((chunk: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0) {
      writeMirroredProcessChunk(writer, chunk);
    }
    return (stdoutWrite as (...input: unknown[]) => boolean)(chunk, ...args);
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0) {
      writeMirroredProcessChunk(writer, chunk);
    }
    return (stderrWrite as (...input: unknown[]) => boolean)(chunk, ...args);
  }) as typeof process.stderr.write;

  fs.writeSync = ((fd: number, buffer: unknown, ...args: unknown[]) => {
    if (active && outputMirrorSuppressDepth === 0 && (fd === 1 || fd === 2)) {
      writeMirroredProcessChunk(writer, buffer);
    }
    return (writeSync as (...input: unknown[]) => number)(fd, buffer, ...args);
  }) as typeof fs.writeSync;

  return () => {
    active = false;
    process.stdout.write = stdoutWrite as typeof process.stdout.write;
    process.stderr.write = stderrWrite as typeof process.stderr.write;
    fs.writeSync = writeSync;
    writer.dispose?.();
  };
}

function safePathPart(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || `session-${process.pid}`;
}

export function mirrorInteractionShellToTerminalLog(
  shell: InteractionShell,
  writer: TerminalLogWriter,
): InteractionShell {
  return {
    input: mirrorInput(shell.input, writer),
    output: mirrorOutput(shell.output, writer),
    createTurnDisplay(options) {
      return mirrorTurnDisplay(shell.createTurnDisplay(options), writer);
    },
    dispose() {
      shell.dispose?.();
    },
  };
}

function mirrorOutput(output: ShellOutputPort, writer: TerminalLogWriter): ShellOutputPort {
  return {
    plain(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.plain(text));
    },
    info(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.info(text));
    },
    warn(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.warn(text));
    },
    error(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.error(text));
    },
    dim(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.dim(text));
    },
    heading(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.heading(text));
    },
    interrupt(text) {
      writeOutputAndForward(writer, `${text}\n`, () => output.interrupt(text));
    },
  };
}

function writeOutputAndForward(writer: TerminalLogWriter, text: string, forward: () => void): void {
  outputMirrorWriteCount += 1;
  writer.write(text);
  outputMirrorSuppressDepth += 1;
  try {
    forward();
  } finally {
    outputMirrorSuppressDepth -= 1;
  }
}

function mirrorTurnDisplay(display: InteractionTurnDisplay, writer: TerminalLogWriter): InteractionTurnDisplay {
  return {
    callbacks: {
      ...display.callbacks,
      onAssistantDelta(delta) {
        forwardWithFallback(writer, () => display.callbacks.onAssistantDelta?.(delta), delta);
      },
      onAssistantText(text) {
        forwardWithFallback(writer, () => display.callbacks.onAssistantText?.(text), text);
      },
      onAssistantDone(text) {
        display.callbacks.onAssistantDone?.(text);
      },
      onReasoningDelta(delta) {
        forwardWithFallback(writer, () => display.callbacks.onReasoningDelta?.(delta), delta);
      },
      onReasoning(text) {
        forwardWithFallback(writer, () => display.callbacks.onReasoning?.(text), text);
      },
      onStatus(message) {
        forwardWithFallback(writer, () => display.callbacks.onStatus?.(message), `${message}\n`);
      },
      onToolCall(name, args) {
        forwardWithFallback(writer, () => display.callbacks.onToolCall?.(name, args), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_call",
          toolName: name,
        })));
      },
      onToolResult(name, output) {
        forwardWithFallback(writer, () => display.callbacks.onToolResult?.(name, output), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_result",
          toolName: name,
        })));
      },
      onToolError(name, error) {
        forwardWithFallback(writer, () => display.callbacks.onToolError?.(name, error), formatRuntimeUiEventLine(createRuntimeUiEvent({
          channel: "lead",
          kind: "tool_error",
          toolName: name,
        })));
      },
      onExecutionForegroundStream(event) {
        return display.callbacks.onExecutionForegroundStream?.(event);
      },
    },
    flush() {
      display.flush();
    },
    dispose() {
      display.dispose();
    },
  };
}

function forwardWithFallback(writer: TerminalLogWriter, forward: () => void, fallback: string): void {
  const before = outputMirrorWriteCount;
  forward();
  if (outputMirrorWriteCount === before && fallback.length > 0) {
    outputMirrorWriteCount += 1;
    writer.write(`${fallback}\n`);
  }
}

function mirrorInput(input: ShellInputPort, writer: TerminalLogWriter): ShellInputPort {
  return {
    async readInput(promptLabel) {
      const result = await input.readInput(promptLabel);
      if (result.kind === "submit") {
        writer.write(`${promptLabel ?? "> "}${result.value}\n`);
      }
      return result;
    },
    async readMultiline(promptLabel) {
      const result = await input.readMultiline(promptLabel);
      if (result.kind === "submit") {
        writer.write(`${promptLabel ?? "... "}${result.value}\n`);
      } else if (result.kind === "cancel") {
        writer.write(`${promptLabel ?? "... "}::cancel\n`);
      }
      return result;
    },
    bindInterrupt(handler) {
      return input.bindInterrupt(handler);
    },
  };
}

function bufferToText(chunk: unknown): string {
  if (typeof chunk === "string") {
    return chunk;
  }
  if (Buffer.isBuffer(chunk)) {
    return chunk.toString("utf8");
  }
  return String(chunk ?? "");
}

function writeMirroredProcessChunk(writer: TerminalLogWriter, chunk: unknown): void {
  const text = bufferToText(chunk);
  if (isTransientTerminalFrame(text)) {
    return;
  }
  outputMirrorWriteCount += 1;
  writer.write(text);
}

function isTransientTerminalFrame(text: string): boolean {
  const normalized = stripAnsi(text).replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");
  return /^\r?\[[ ■]{4}\] thinking\s*$/.test(normalized);
}

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
