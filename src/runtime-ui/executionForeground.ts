import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { createRuntimeUiEvent, normalizeRuntimeUiChannel } from "./events.js";
import { createRuntimeUiTerminalRenderer } from "./terminalRenderer.js";

export async function followExecutionForegroundStream(input: {
  executionId: string;
  label: string;
  streamPath: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  const channel = normalizeRuntimeUiChannel(input.label);
  const renderer = createRuntimeUiTerminalRenderer();
  await fsp.mkdir(path.dirname(input.streamPath), { recursive: true });
  await fsp.writeFile(input.streamPath, "", { flag: "a" });
  renderer.render(createRuntimeUiEvent({
    channel,
    kind: "foreground_start",
    executionId: input.executionId,
  }));
  let offset = 0;
  const flush = async (): Promise<void> => {
    const content = await fsp.readFile(input.streamPath, "utf8").catch(() => "");
    if (content.length <= offset) {
      return;
    }
    const next = content.slice(offset);
    offset = content.length;
    for (const line of next.split(/\r?\n/).filter(Boolean)) {
      renderer.render(toRuntimeUiEvent(input.label, input.executionId, line));
    }
  };

  await flush();

  return new Promise((resolve, reject) => {
    let settled = false;
    let watcher: fs.FSWatcher | undefined;
    const interval = setInterval(() => {
      void flush().catch(settleError);
    }, 500);

    const settle = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(interval);
      watcher?.close();
      input.abortSignal?.removeEventListener("abort", onAbort);
      void flush().finally(() => {
        renderer.render(createRuntimeUiEvent({
          channel,
          kind: "foreground_end",
          executionId: input.executionId,
        }));
        resolve();
      });
    };
    const settleError = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(interval);
      watcher?.close();
      input.abortSignal?.removeEventListener("abort", onAbort);
      reject(error);
    };
    const onAbort = (): void => settleError(new Error("Execution foreground stream aborted."));
    if (input.abortSignal?.aborted) {
      onAbort();
      return;
    }

    try {
      watcher = fs.watch(input.streamPath, () => {
        void flush().catch(settleError);
      });
    } catch {
      // Polling above is enough on filesystems where fs.watch cannot attach.
    }

    input.abortSignal?.addEventListener("abort", onAbort, { once: true });
    waitForStreamTerminal(input.streamPath, input.executionId)
      .then(settle, settleError);
  });
}

async function waitForStreamTerminal(streamPath: string, executionId: string): Promise<void> {
  for (;;) {
    const content = await fsp.readFile(streamPath, "utf8").catch(() => "");
    if (content.includes(`"executionId":"${executionId}"`) && /"message":"Dreaming (completed|failed|paused)|"message":"Merge proposal written/.test(content)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

function toRuntimeUiEvent(label: string, executionId: string, line: string) {
  const channel = normalizeRuntimeUiChannel(label);
  try {
    const parsed = JSON.parse(line) as {
      label?: string;
      message?: string;
      level?: "info" | "warn" | "error";
      data?: {
        eventKind?: string;
        toolName?: string;
        payload?: string;
        ok?: boolean;
      };
      createdAt?: string;
    };
    const parsedChannel = normalizeRuntimeUiChannel(parsed.label || label);
    const eventKind = parsed.data?.eventKind;
    if (eventKind === "tool_call" || eventKind === "tool_result" || eventKind === "tool_error") {
      return createRuntimeUiEvent({
        channel: parsedChannel,
        kind: eventKind,
        executionId,
        toolName: parsed.data?.toolName,
        payload: parsed.data?.payload ?? parsed.message,
        ok: parsed.data?.ok,
        level: parsed.level,
        createdAt: parsed.createdAt,
      });
    }
    return createRuntimeUiEvent({
      channel: parsedChannel,
      kind: "foreground_message",
      executionId,
      message: parsed.message ?? "",
      level: parsed.level,
      createdAt: parsed.createdAt,
    });
  } catch {
    return createRuntimeUiEvent({
      channel,
      kind: "foreground_message",
      executionId,
      message: line,
    });
  }
}
