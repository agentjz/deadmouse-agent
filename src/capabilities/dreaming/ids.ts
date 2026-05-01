import crypto from "node:crypto";

export function createTimestampedDreamingLoopId(date = new Date()): string {
  return `dreaming-loop-${formatTimestamp(date)}-${shortId()}`;
}

export function createTimestampedDreamingRoundId(roundNumber: number, date = new Date()): string {
  return `dreaming-${formatTimestamp(date)}-r${String(roundNumber).padStart(2, "0")}-${shortId()}`;
}

function formatTimestamp(date: Date): string {
  const digits = date.toISOString().replace(/\D/g, "");
  return `${digits.slice(0, 8)}-${digits.slice(8, 14)}`;
}

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 6);
}
