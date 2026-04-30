import type OpenAI from "openai";

import { createAbortError, throwIfAborted } from "../../utils/abort.js";
import type { AssistantResponse } from "../types.js";
import type { ProviderAdapterRequest, ProviderWireAdapter } from "./contract.js";

export type ScriptedProviderStep =
  | {
      kind: "text";
      content: string;
      reasoningContent?: string;
      usage?: ScriptedProviderUsage;
    }
  | {
      kind: "tool_calls";
      toolCalls: readonly ScriptedProviderToolCall[];
      content?: string | null;
      reasoningContent?: string;
      usage?: ScriptedProviderUsage;
    }
  | {
      kind: "empty";
      usage?: ScriptedProviderUsage;
    }
  | {
      kind: "error";
      message: string;
    }
  | {
      kind: "abort";
      message?: string;
    };

export interface ScriptedProviderToolCall {
  id?: string;
  name: string;
  arguments?: Record<string, unknown> | string;
}

export interface ScriptedProviderUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
}

export interface ScriptedProviderHarness {
  readonly adapter: ProviderWireAdapter;
  readonly requests: readonly ScriptedProviderCapturedRequest[];
  remainingSteps(): number;
}

export interface ScriptedProviderCapturedRequest {
  wireApi: "responses" | "chat.completions";
  streaming: boolean;
  provider: string;
  model: string;
  messageCount: number;
  toolCount: number;
}

export function createScriptedProviderHarness(steps: readonly ScriptedProviderStep[]): ScriptedProviderHarness {
  const queue = [...steps];
  const requests: ScriptedProviderCapturedRequest[] = [];

  const adapter: ProviderWireAdapter = {
    wireApi: "chat.completions",
    fetchStreaming: async (_client: OpenAI, request: ProviderAdapterRequest) => executeStep("chat.completions", true, request),
    fetchNonStreaming: async (_client: OpenAI, request: ProviderAdapterRequest) => executeStep("chat.completions", false, request),
  };

  return {
    adapter,
    get requests() {
      return requests;
    },
    remainingSteps() {
      return queue.length;
    },
  };

  async function executeStep(
    wireApi: "responses" | "chat.completions",
    streaming: boolean,
    request: ProviderAdapterRequest,
  ): Promise<AssistantResponse> {
    throwIfAborted(request.abortSignal, "Scripted provider request aborted");
    requests.push({
      wireApi,
      streaming,
      provider: request.provider,
      model: request.model,
      messageCount: request.messages.length,
      toolCount: request.tools?.length ?? 0,
    });

    const step = queue.shift();
    if (!step) {
      throw new Error("Scripted provider harness has no remaining response steps.");
    }

    if (step.kind === "error") {
      throw new Error(step.message);
    }
    if (step.kind === "abort") {
      throw createAbortError(step.message ?? "Scripted provider request aborted");
    }

    const response = buildAssistantResponse(step);
    emitCallbacks(response, request, streaming);
    request.onRequestMetric?.({
      durationMs: 0,
      usage: step.usage,
    });
    return response;
  }
}

function buildAssistantResponse(step: Exclude<ScriptedProviderStep, { kind: "error" | "abort" }>): AssistantResponse {
  if (step.kind === "empty") {
    return {
      content: null,
      streamedAssistantContent: false,
      streamedReasoningContent: false,
      toolCalls: [],
    };
  }

  if (step.kind === "text") {
    return {
      content: step.content,
      reasoningContent: step.reasoningContent,
      streamedAssistantContent: false,
      streamedReasoningContent: false,
      toolCalls: [],
    };
  }

  return {
    content: step.content ?? null,
    reasoningContent: step.reasoningContent,
    streamedAssistantContent: false,
    streamedReasoningContent: false,
    toolCalls: step.toolCalls.map((toolCall, index) => ({
      id: toolCall.id ?? `scripted-tool-${index}`,
      type: "function",
      function: {
        name: toolCall.name,
        arguments: typeof toolCall.arguments === "string"
          ? toolCall.arguments
          : JSON.stringify(toolCall.arguments ?? {}),
      },
    })),
  };
}

function emitCallbacks(response: AssistantResponse, request: ProviderAdapterRequest, streaming: boolean): void {
  if (response.reasoningContent) {
    if (streaming) {
      request.callbacks?.onReasoningDelta?.(response.reasoningContent);
    }
    request.callbacks?.onReasoning?.(response.reasoningContent);
  }
  if (response.content) {
    if (streaming) {
      request.callbacks?.onAssistantDelta?.(response.content);
    }
    request.callbacks?.onAssistantText?.(response.content);
  }
  for (const toolCall of response.toolCalls) {
    request.callbacks?.onToolCall?.(toolCall.function.name, toolCall.function.arguments);
  }
}
