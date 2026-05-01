import type { AgentCallbacks } from "../agent/types.js";
import type { RuntimeConfig } from "../types.js";
import { createRuntimeUiEvent, normalizeRuntimeUiChannel, type RuntimeUiChannel } from "./events.js";
import { createRuntimeUiTerminalRenderer } from "./terminalRenderer.js";

export function createRuntimeUiAgentCallbacks(input: {
  channel: RuntimeUiChannel;
  cwd: string;
  config: Pick<RuntimeConfig, "showReasoning"> & { terminalVerbosity?: "minimal" | "normal" | "verbose" };
  abortSignal?: AbortSignal;
  assistantLeadingBlankLine?: boolean;
  assistantTrailingNewlines?: string;
  reasoningLeadingBlankLine?: boolean;
  toolArgsMaxChars?: number;
}): {
  callbacks: AgentCallbacks;
  flush: () => void;
} {
  let aborted = false;
  const renderer = createRuntimeUiTerminalRenderer({
    cwd: input.cwd,
    showReasoning: input.config.showReasoning,
    terminalVerbosity: input.config.terminalVerbosity,
    assistantLeadingBlankLine: input.assistantLeadingBlankLine,
    assistantTrailingNewlines: input.assistantTrailingNewlines,
    reasoningLeadingBlankLine: input.reasoningLeadingBlankLine,
    toolArgsMaxChars: input.toolArgsMaxChars,
  });
  const isAborted = (): boolean => aborted || input.abortSignal?.aborted === true;
  const render = (event: Parameters<typeof renderer.render>[0]): void => {
    if (!isAborted()) {
      renderer.render(event);
    }
  };

  input.abortSignal?.addEventListener("abort", () => {
    aborted = true;
    renderer.flush();
  });

  return {
    flush: renderer.flush,
    callbacks: {
      onReasoningDelta(delta) {
        render(createRuntimeUiEvent({ channel: input.channel, kind: "reasoning", message: delta }));
      },
      onReasoning(text) {
        render(createRuntimeUiEvent({ channel: input.channel, kind: "reasoning", message: `${text}\n` }));
      },
      onAssistantDelta(delta) {
        render(createRuntimeUiEvent({ channel: input.channel, kind: "assistant_text", message: delta }));
      },
      onAssistantStage(text) {
        render(createRuntimeUiEvent({ channel: input.channel, kind: "assistant_text", message: text }));
      },
      onAssistantText(text) {
        render(createRuntimeUiEvent({ channel: input.channel, kind: "assistant_text", message: text }));
      },
      onAssistantDone() {
        renderer.flush();
      },
      onDispatch(event) {
        const channel = normalizeRuntimeUiChannel(event.profile);
        render(createRuntimeUiEvent({
          channel,
          kind: "dispatch",
          actor: event.actorName,
          executionId: event.executionId,
          message: formatDispatchMessage(event),
        }));
      },
      onToolCall(name, args) {
        render(createRuntimeUiEvent({
          channel: input.channel,
          kind: "tool_call",
          toolName: name,
          payload: args,
        }));
      },
      onToolResult(name, output) {
        render(createRuntimeUiEvent({
          channel: input.channel,
          kind: "tool_result",
          toolName: name,
          payload: output,
        }));
      },
      onToolError(name, error) {
        render(createRuntimeUiEvent({
          channel: input.channel,
          kind: "tool_error",
          toolName: name,
          payload: error,
          level: "error",
        }));
      },
      onStatus(text) {
        render(createRuntimeUiEvent({ channel: "system", kind: "status", message: text }));
      },
    },
  };
}

function formatDispatchMessage(event: {
  actorName: string;
  taskId?: number;
  pid?: number;
  summary?: string;
}): string {
  return [
    event.actorName,
    "started",
    typeof event.taskId === "number" ? `task=${event.taskId}` : undefined,
    typeof event.pid === "number" ? `pid=${event.pid}` : undefined,
    event.summary,
  ].filter(Boolean).join(" ");
}
