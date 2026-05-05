import crypto from "node:crypto";
import path from "node:path";

import type {
  SessionCheckpoint,
  SessionCheckpointToolBatch,
} from "../../types.js";

export const MAX_COMPLETED_STEPS = 8;
export const MAX_BATCH_TOOLS = 6;
export const MAX_BATCH_PATHS = 6;
export const MAX_SUMMARY_CHARS = 220;

export function fingerprintObjective(objective: string): string {
  return crypto.createHash("sha1").update(objective.trim().toLowerCase()).digest("hex");
}

export function normalizeText(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string | undefined, maxChars: number): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

export function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const normalized = normalizeText(values[index]);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.unshift(normalized);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

export function normalizeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
}

export function safeParseObject(raw: string | null | undefined): Record<string, unknown> | null {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readString(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized || undefined;
}

export function displayPath(cwd: string, candidate: string): string {
  if (!path.isAbsolute(candidate)) {
    return candidate;
  }

  const relative = path.relative(cwd, candidate);
  return relative && !relative.startsWith("..") ? relative : candidate;
}

export function formatList(values: string[]): string {
  return values.length > 0 ? values.join(" | ") : "none";
}

export function normalizeToolBatch(
  toolBatch: SessionCheckpointToolBatch | undefined,
): SessionCheckpointToolBatch | undefined {
  if (!toolBatch) {
    return undefined;
  }

  const tools = takeLastUnique(toolBatch.tools ?? [], MAX_BATCH_TOOLS);
  if (tools.length === 0) {
    return undefined;
  }

  return {
    tools,
    summary: truncate(normalizeText(toolBatch.summary) || `Ran ${tools.join(", ")}`, MAX_SUMMARY_CHARS)!,
    changedPaths: takeLastUnique(toolBatch.changedPaths ?? [], MAX_BATCH_PATHS),
    recordedAt: normalizeTimestamp(toolBatch.recordedAt, new Date().toISOString()),
  };
}

