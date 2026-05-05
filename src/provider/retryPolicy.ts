import { isRetryableApiError } from "./apiRetry.js";
import { sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import type { RuntimeConfig, RuntimeRecoverTransition } from "../types.js";

export type RecoveryRequestConfig = Pick<
  RuntimeConfig,
  "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars"
>;

export function isRecoverableTurnError(error: unknown): boolean {
  if (isRetryableApiError(error)) {
    return true;
  }

  const code = String((error as { code?: unknown }).code ?? "");
  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();

  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_HEADERS_TIMEOUT" ||
    code === "UND_ERR_SOCKET" ||
    message.includes("connection error") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("connection refused") ||
    message.includes("connect timeout") ||
    message.includes("headers timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily unavailable") ||
    message.includes("stream ended unexpectedly")
  );
}

export function buildRecoveryRequestConfig(
  config: RuntimeConfig,
  model: string,
  _consecutiveFailures: number,
): RecoveryRequestConfig {
  return {
    model,
    contextWindowMessages: config.contextWindowMessages,
    maxContextChars: config.maxContextChars,
    contextSummaryChars: config.contextSummaryChars,
  };
}

export function buildRecoveryStatus(
  transition: RuntimeRecoverTransition,
): string {
  const reason = transition.reason;
  const fragments = [
    `Model request failed (${truncateForStatus(reason.error, 160)}).`,
    `Auto-retrying in ${formatDelay(reason.delayMs)}.`,
    `streak=${reason.consecutiveFailures}`,
  ];

  return fragments.join(" ");
}

export function computeRecoveryDelayMs(consecutiveFailures: number): number {
  const exponent = Math.min(6, Math.max(0, consecutiveFailures - 1));
  return Math.min(30_000, 1_000 * (2 ** exponent));
}

export async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal, "Retry delay aborted");
  await sleepWithSignal(ms, signal);
}

function formatDelay(ms: number): string {
  if (ms % 1_000 === 0) {
    return `${ms / 1_000}s`;
  }

  return `${ms}ms`;
}

function truncateForStatus(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}
