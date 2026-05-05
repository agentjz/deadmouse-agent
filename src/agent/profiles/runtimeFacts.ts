import { buildFieldBlock, formatLimitedList } from "../prompt/structured.js";
import type { RuntimeFactsProfileInput } from "./types.js";

export function buildRuntimeEnvironmentBlock(input: RuntimeFactsProfileInput): string | undefined {
  return buildFieldBlock("Runtime environment", [
    { label: "Current working directory", value: input.cwd },
    { label: "Task file boundary", value: "Work from the current working directory unless the user explicitly names another path." },
    { label: "Model", value: input.config.model },
    { label: "Thinking", value: input.config.thinking ?? "provider default" },
    { label: "Reasoning effort", value: input.config.reasoningEffort ?? "provider default" },
    { label: "Date", value: new Date().toISOString() },
  ]);
}

export function buildCapabilityBlock(input: RuntimeFactsProfileInput): string | undefined {
  void input;
  return undefined;
}

export { formatLimitedList };
