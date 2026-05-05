import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimeRecoverTransition,
  RuntimeTransition,
} from "../../types.js";
import {
  clampWholeNumber,
  normalizeText,
  normalizeTimestamp,
  takeLastUnique,
  truncate,
} from "./shared.js";

export function normalizeRuntimeTransition(
  transition: RuntimeTransition | undefined,
  timestamp = new Date().toISOString(),
): RuntimeTransition | undefined {
  if (!transition || typeof transition !== "object") {
    return undefined;
  }

  const action = normalizeAction(transition.action);
  const reason = transition.reason;
  const normalizedTimestamp = normalizeTimestamp(transition.timestamp, timestamp);
  if (!reason || typeof reason !== "object") {
    return undefined;
  }

  switch (action) {
    case "continue":
      return normalizeContinueTransition(reason as RuntimeContinueTransition["reason"], normalizedTimestamp);
    case "recover":
      return normalizeRecoverTransition(reason as RuntimeRecoverTransition["reason"], normalizedTimestamp);
    case "finalize":
      return normalizeFinalizeTransition(reason as RuntimeFinalizeTransition["reason"], normalizedTimestamp);
    default:
      return undefined;
  }
}

function normalizeContinueTransition(
  reason: RuntimeContinueTransition["reason"],
  timestamp: string,
): RuntimeContinueTransition | undefined {
  switch (reason.code) {
    case "continue.after_tool_batch": {
      const toolNames = takeLastUnique(reason.toolNames);
      if (toolNames.length === 0) {
        return undefined;
      }
      return {
        action: "continue",
        reason: {
          code: reason.code,
          toolNames,
          changedPaths: takeLastUnique(reason.changedPaths ?? []),
        },
        timestamp,
      };
    }
    case "continue.empty_assistant_response":
      return {
        action: "continue",
        reason: {
          code: reason.code,
        },
        timestamp,
      };
    default:
      return undefined;
  }
}

function normalizeRecoverTransition(
  reason: RuntimeRecoverTransition["reason"],
  timestamp: string,
): RuntimeRecoverTransition | undefined {
  if (reason.code !== "recover.provider_request_retry") {
    return undefined;
  }

  return {
    action: "recover",
    reason: {
      code: reason.code,
      consecutiveFailures: clampWholeNumber(reason.consecutiveFailures, 1, 50, 1) ?? 1,
      error: truncate(normalizeText(reason.error) || "request failed"),
      configuredModel: normalizeText(reason.configuredModel) || "unknown_model",
      requestModel: normalizeText(reason.requestModel) || "unknown_model",
      contextWindowMessages: clampWholeNumber(reason.contextWindowMessages, 1, 999, 1) ?? 1,
      maxContextChars: clampWholeNumber(reason.maxContextChars, 1, 1_000_000, 1) ?? 1,
      contextSummaryChars: clampWholeNumber(reason.contextSummaryChars, 1, 1_000_000, 1) ?? 1,
      delayMs: clampWholeNumber(reason.delayMs, 0, 3_600_000, 0) ?? 0,
    },
    timestamp,
  };
}

function normalizeFinalizeTransition(
  reason: RuntimeFinalizeTransition["reason"],
  timestamp: string,
): RuntimeFinalizeTransition | undefined {
  if (reason.code !== "finalize.completed") {
    return undefined;
  }

  return {
    action: "finalize",
    reason: {
      code: reason.code,
      changedPaths: takeLastUnique(reason.changedPaths ?? []),
    },
    timestamp,
  };
}

function normalizeAction(value: unknown): RuntimeTransition["action"] | undefined {
  return value === "continue" || value === "recover" || value === "finalize"
    ? value
    : undefined;
}
