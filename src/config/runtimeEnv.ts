import type { RuntimeConfig } from "../types.js";

export function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return undefined;
}

export function parseIntegerEnv(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseReasoningEffortEnv(value: string | undefined): RuntimeConfig["reasoningEffort"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "max";
    default:
      return undefined;
  }
}

export function parseThinkingEnv(value: string | undefined): RuntimeConfig["thinking"] | undefined {
  switch ((value ?? "").trim().toLowerCase()) {
    case "enabled":
      return "enabled";
    case "disabled":
      return "disabled";
    default:
      return undefined;
  }
}

