import type { StoredMessage } from "../../types.js";

export type AcceptanceSignal =
  | {
      kind: "command_completed";
      sourceToolName: string;
      command?: string;
      exitCode?: number;
    }
  | {
      kind: "output_valid";
      sourceToolName: string;
      path: string;
      format?: string;
    };

export function collectAcceptanceSignals(
  messages: StoredMessage[],
): AcceptanceSignal[] {
  const collected: AcceptanceSignal[] = [];

  for (const message of messages) {
    if (message.role !== "tool" || typeof message.name !== "string") {
      continue;
    }

    const parsed = tryParseRecord(message.content);
    collected.push(...readExplicitSignals(message.name, parsed));

    if (message.name === "bash" && parsed) {
      collected.push({
        kind: "command_completed",
        sourceToolName: message.name,
        command: readString(parsed.command),
        exitCode: readNumber(parsed.exitCode),
      });
    }
  }

  return dedupeSignals(collected);
}

function readExplicitSignals(
  sourceToolName: string,
  payload: Record<string, unknown> | null,
): AcceptanceSignal[] {
  if (!payload || !Array.isArray(payload.signals)) {
    return [];
  }

  const signals: AcceptanceSignal[] = [];

  for (const entry of payload.signals) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      continue;
    }

    const record = entry as Record<string, unknown>;
    if (readString(record.kind) !== "output_valid") {
      continue;
    }

    const path = readString(record.path);
    if (!path) {
      continue;
    }

    signals.push({
      kind: "output_valid",
      sourceToolName,
      path,
      format: readString(record.format),
    });
  }

  return signals;
}

function tryParseRecord(content: string | null): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content ?? "") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function dedupeSignals(signals: AcceptanceSignal[]): AcceptanceSignal[] {
  const seen = new Set<string>();
  const result: AcceptanceSignal[] = [];

  for (const signal of signals) {
    const key = JSON.stringify(signal);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(signal);
  }

  return result;
}
