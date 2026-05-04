import path from "node:path";

import type { StoredMessage } from "../../types.js";

export function collectActiveFiles(messages: StoredMessage[]): string[] {
  const files: string[] = [];

  for (const message of messages) {
    if (!message) {
      continue;
    }

    if (message.role === "assistant" && message.tool_calls?.length) {
      for (const toolCall of message.tool_calls) {
        const parsed = safeParseObject(toolCall.function.arguments);
        collectPathsFromValue(parsed, files);
      }
      continue;
    }

    if (message.role === "tool") {
      const parsed = safeParseObject(message.content ?? "");
      collectPathsFromValue(parsed, files);
    }
  }

  return files.map((value) => normalizeFilePath(value)).filter(Boolean) as string[];
}

export function collectPlannedActions(messages: StoredMessage[]): string[] {
  const actions: string[] = [];

  for (const message of messages) {
    if (message?.role !== "assistant" || !message.tool_calls?.length) {
      continue;
    }

    const names = message.tool_calls.map((toolCall) => toolCall.function.name).join(", ");
    if (names) {
      actions.push(`plan ${names}`);
    }
  }

  return actions;
}

export function collectCompletedActions(messages: StoredMessage[]): string[] {
  const actions: string[] = [];

  for (const message of messages) {
    if (message?.role !== "tool" || !message.name) {
      continue;
    }

    const content = message.content ?? "";
    const parsed = safeParseObject(content);
    if (parsed && typeof parsed.error === "string" && parsed.error.length > 0) {
      continue;
    }

    actions.push(formatCompletedAction(message.name, parsed, content));
  }

  return actions.filter(Boolean);
}

export function collectBlockers(messages: StoredMessage[]): string[] {
  const blockers: string[] = [];

  for (const message of messages) {
    if (message?.role !== "tool") {
      continue;
    }

    const parsed = safeParseObject(message.content ?? "");
    if (!parsed || typeof parsed.error !== "string" || parsed.error.length === 0) {
      continue;
    }

    blockers.push(`${message.name ?? "tool"}: ${truncate(oneLine(parsed.error), 180)}`);
  }

  return blockers;
}

export function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}

function formatCompletedAction(toolName: string, payload: Record<string, unknown> | null, rawContent = ""): string {
  const pathValue = normalizeFilePath(readPath(payload?.path));

  if (toolName === "run_shell") {
    const command = typeof payload?.command === "string" ? payload.command : "command";
    const exitCode = typeof payload?.exitCode === "number" ? payload.exitCode : "unknown";
    return `run_shell ${truncate(oneLine(command), 120)} (exit ${exitCode})`;
  }

  if (toolName === "search_files") {
    const count = readCount(payload, "matches") ||
      readNumericField(payload, "totalMatches") ||
      readNumericField(payload, "matchedFilesCount") ||
      readCountFromText(rawContent, "matches");
    return `search_files ${count} match(es)`;
  }

  if (toolName === "list_files") {
    const count = readCount(payload, "entries") || readCountFromText(rawContent, "entries");
    return `list_files ${count} entr${count === 1 ? "y" : "ies"}`;
  }

  if (toolName === "find_files") {
    const count = readCount(payload, "files") || readCountFromText(rawContent, "files");
    return `find_files ${count} file${count === 1 ? "" : "s"}`;
  }

  if (toolName === "load_skill") {
    return "load_skill";
  }

  return pathValue ? `${toolName} ${truncate(pathValue, 160)}` : toolName;
}

function collectPathsFromValue(value: unknown, bucket: string[]): void {
  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectPathsFromValue(item, bucket);
    }
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && isPathLikeKey(key)) {
      bucket.push(item);
      continue;
    }

    if (Array.isArray(item)) {
      for (const nested of item) {
        collectPathsFromValue(nested, bucket);
      }
      continue;
    }

    if (item && typeof item === "object") {
      collectPathsFromValue(item, bucket);
    }
  }
}

function isPathLikeKey(key: string): boolean {
  return key === "path" || key === "cwd" || key.endsWith("Path");
}

function readPath(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readCount(payload: Record<string, unknown> | null, key: string): number {
  const collection = payload?.[key];
  if (Array.isArray(collection)) {
    return collection.length;
  }

  const explicitCount = payload?.[`${key}Count`];
  if (typeof explicitCount === "number" && Number.isFinite(explicitCount)) {
    return Math.max(0, Math.trunc(explicitCount));
  }

  return readSummaryCount(payload?.summary, key) ?? 0;
}

function readNumericField(payload: Record<string, unknown> | null, key: string): number {
  const value = payload?.[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

function readSummaryCount(summary: unknown, key: string): number | undefined {
  if (typeof summary !== "string") {
    return undefined;
  }

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`(?:^|[;\\s])${escapedKey}\\s*=\\s*(\\d+)\\b`).exec(summary);
  if (!match) {
    return undefined;
  }

  const count = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(count) ? count : undefined;
}

function readCountFromText(value: string, label: string): number {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`\\b(\\d+)\\s+${escapedLabel}\\b`, "i").exec(value);
  if (!match) {
    return 0;
  }

  const count = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(count) ? count : 0;
}

function safeParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function normalizeFilePath(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("<") || trimmed.includes("\n")) {
    return undefined;
  }

  if (trimmed.length > 260) {
    return truncate(trimmed, 260);
  }

  return trimmed.includes(path.sep) || trimmed.includes("/") || trimmed.includes(".")
    ? trimmed
    : undefined;
}
