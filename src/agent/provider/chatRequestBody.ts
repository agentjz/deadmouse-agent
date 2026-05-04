import type { FunctionToolDefinition } from "../../capabilities/tools/index.js";
import { resolveProviderCapabilities } from "../provider.js";
import type { ProviderMessage } from "./contract.js";
import { toChatCompletionMessages } from "./chatCompletionsAdapter.js";

interface BuildProviderRequestBodyInput {
  provider?: string;
  model: string;
  messages: ProviderMessage[];
  tools: FunctionToolDefinition[] | undefined;
  stream: boolean;
  forceReasoning: boolean;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens?: number;
}

export function buildProviderRequestBody(
  input: BuildProviderRequestBodyInput,
): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities(input);
  const thinking = capabilities.provider === "deepseek"
    ? resolveDeepSeekThinking(input.messages, input.thinking ?? "enabled")
    : input.thinking;
  const body: Record<string, unknown> = {
    model: input.model,
    messages: toChatCompletionMessages(input.messages),
    tools: input.tools,
    stream: input.stream,
  };

  if (capabilities.provider !== "deepseek" && input.tools?.length) {
    body.tool_choice = "auto";
  }

  if (input.stream) {
    body.stream_options = {
      include_usage: true,
    };
  }

  if (typeof input.maxOutputTokens === "number" && Number.isFinite(input.maxOutputTokens)) {
    body.max_tokens = Math.max(1, Math.trunc(input.maxOutputTokens));
  }

  if (capabilities.provider === "deepseek") {
    body.thinking = { type: thinking };
    if (thinking === "enabled") {
      body.reasoning_effort = normalizeDeepSeekReasoningEffort(input.reasoningEffort ?? capabilities.defaultReasoningEffort);
    }
  } else if (input.forceReasoning || capabilities.defaultReasoningEnabled) {
    body.thinking = { type: "enabled" };
  }

  return body;
}

function resolveDeepSeekThinking(
  messages: ProviderMessage[],
  requested: "enabled" | "disabled",
): "enabled" | "disabled" {
  if (requested === "disabled") {
    return "disabled";
  }

  return hasUnreplayableAssistantReasoning(messages) ? "disabled" : "enabled";
}

function hasUnreplayableAssistantReasoning(messages: ProviderMessage[]): boolean {
  return messages.some((message) =>
    message.role === "assistant" &&
    Array.isArray(message.toolCalls) &&
    message.toolCalls.length > 0 &&
    message.reasoningContent === undefined,
  );
}

function normalizeDeepSeekReasoningEffort(
  effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | undefined,
): "high" | "max" {
  if (effort === undefined || effort === "minimal" || effort === "low" || effort === "medium" || effort === "high") {
    return "high";
  }

  if (effort === "xhigh" || effort === "max") {
    return "max";
  }

  return "high";
}
