import type { RecoveryRequestConfig } from "../../provider/retryPolicy.js";
import type { RunTurnResult } from "../types.js";
import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimeRecoverTransition,
  RuntimeTerminalTransition,
  SessionRecord,
} from "../../types.js";
import { normalizeText, takeLastUnique, truncate } from "./shared.js";

export function createToolBatchTransition(
  input: {
    toolNames: string[];
    changedPaths?: string[];
  },
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.after_tool_batch",
      toolNames: takeLastUnique(input.toolNames),
      changedPaths: takeLastUnique(input.changedPaths ?? []),
    },
    timestamp,
  };
}

export function createEmptyAssistantResponseTransition(
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.empty_assistant_response",
    },
    timestamp,
  };
}

export function createProviderRecoveryTransition(
  input: {
    consecutiveFailures: number;
    error: unknown;
    configuredModel: string;
    requestModel: string;
    requestConfig: RecoveryRequestConfig;
    delayMs: number;
  },
  timestamp = new Date().toISOString(),
): RuntimeRecoverTransition {
  return {
    action: "recover",
    reason: {
      code: "recover.provider_request_retry",
      consecutiveFailures: Math.max(1, Math.trunc(input.consecutiveFailures)),
      error: truncate(normalizeText((input.error as { message?: unknown })?.message ?? input.error) || "request failed"),
      configuredModel: normalizeText(input.configuredModel) || "unknown_model",
      requestModel: normalizeText(input.requestModel) || "unknown_model",
      contextWindowMessages: Math.max(1, Math.trunc(input.requestConfig.contextWindowMessages)),
      maxContextChars: Math.max(1, Math.trunc(input.requestConfig.maxContextChars)),
      contextSummaryChars: Math.max(1, Math.trunc(input.requestConfig.contextSummaryChars)),
      delayMs: Math.max(0, Math.trunc(input.delayMs)),
    },
    timestamp,
  };
}

export function createFinalizeTransition(
  input: {
    changedPaths: Iterable<string>;
  },
  timestamp = new Date().toISOString(),
): RuntimeFinalizeTransition {
  return {
    action: "finalize",
    reason: {
      code: "finalize.completed",
      changedPaths: takeLastUnique([...input.changedPaths]),
    },
    timestamp,
  };
}

export function buildRunTurnResult(input: {
  session: SessionRecord;
  changedPaths: Iterable<string>;
  transition: RuntimeTerminalTransition;
}): RunTurnResult {
  return {
    session: input.session,
    changedPaths: [...input.changedPaths],
    transition: input.transition,
  };
}
