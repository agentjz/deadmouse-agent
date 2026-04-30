import crypto from "node:crypto";

import type { AgentTraceEventKind, AgentTraceEventRecord } from "../trace/schema.js";
import type { SessionRecord } from "../types.js";

export const REGRESSION_CASE_PROTOCOL = "agent.regression-case" as const;
export const REGRESSION_CASE_SCHEMA_VERSION = 1 as const;

export interface RegressionCase {
  protocol: typeof REGRESSION_CASE_PROTOCOL;
  schemaVersion: typeof REGRESSION_CASE_SCHEMA_VERSION;
  caseId: string;
  capturedAt: string;
  source: {
    sessionId: string;
    turnIds: readonly string[];
  };
  expectations: {
    minTraceEvents: number;
    requiredTraceKinds: readonly AgentTraceEventKind[];
    finalAssistantText?: string;
    terminalTraceKind?: AgentTraceEventKind;
  };
  evidence: {
    sessionMessageCount: number;
    traceEventCount: number;
    traceDigest: string;
  };
}

export interface RegressionCaseRunResult {
  caseId: string;
  status: "passed" | "failed";
  failures: readonly string[];
  checkedAt: string;
}

export function createRegressionCase(input: {
  session: SessionRecord;
  traceEvents: readonly AgentTraceEventRecord[];
  caseId?: string;
}): RegressionCase {
  const finalAssistantText = [...input.session.messages]
    .reverse()
    .find((message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim().length > 0)
    ?.content ?? undefined;
  const terminal = [...input.traceEvents]
    .reverse()
    .find((event) => event.kind.startsWith("turn_"));
  const requiredKinds = [...new Set(input.traceEvents.map((event) => event.kind))];

  return {
    protocol: REGRESSION_CASE_PROTOCOL,
    schemaVersion: REGRESSION_CASE_SCHEMA_VERSION,
    caseId: normalizeCaseId(input.caseId ?? input.session.id),
    capturedAt: new Date().toISOString(),
    source: {
      sessionId: input.session.id,
      turnIds: [...new Set(input.traceEvents.map((event) => event.turnId))],
    },
    expectations: {
      minTraceEvents: input.traceEvents.length,
      requiredTraceKinds: requiredKinds,
      finalAssistantText,
      terminalTraceKind: terminal?.kind,
    },
    evidence: {
      sessionMessageCount: input.session.messageCount,
      traceEventCount: input.traceEvents.length,
      traceDigest: digestTrace(input.traceEvents),
    },
  };
}

export function parseRegressionCase(value: unknown): RegressionCase {
  const record = readRecord(value, "RegressionCase");
  const protocol = readRequiredString(record, "protocol", "RegressionCase");
  if (protocol !== REGRESSION_CASE_PROTOCOL) {
    throw new Error(`Unsupported regression case protocol '${protocol}'.`);
  }
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== REGRESSION_CASE_SCHEMA_VERSION) {
    throw new Error(`Unsupported regression case schema version '${String(schemaVersion)}'.`);
  }
  const source = readRecord(record.source, "RegressionCase.source");
  const expectations = readRecord(record.expectations, "RegressionCase.expectations");
  const evidence = readRecord(record.evidence, "RegressionCase.evidence");

  return {
    protocol: REGRESSION_CASE_PROTOCOL,
    schemaVersion: REGRESSION_CASE_SCHEMA_VERSION,
    caseId: normalizeCaseId(readRequiredString(record, "caseId", "RegressionCase")),
    capturedAt: readRequiredString(record, "capturedAt", "RegressionCase"),
    source: {
      sessionId: readRequiredString(source, "sessionId", "RegressionCase.source"),
      turnIds: readStringArray(source.turnIds, "RegressionCase.source.turnIds"),
    },
    expectations: {
      minTraceEvents: readNonNegativeNumber(expectations.minTraceEvents, "RegressionCase.expectations.minTraceEvents"),
      requiredTraceKinds: readStringArray(expectations.requiredTraceKinds, "RegressionCase.expectations.requiredTraceKinds") as AgentTraceEventKind[],
      finalAssistantText: readOptionalString(expectations.finalAssistantText, "RegressionCase.expectations.finalAssistantText"),
      terminalTraceKind: readOptionalString(expectations.terminalTraceKind, "RegressionCase.expectations.terminalTraceKind") as AgentTraceEventKind | undefined,
    },
    evidence: {
      sessionMessageCount: readNonNegativeNumber(evidence.sessionMessageCount, "RegressionCase.evidence.sessionMessageCount"),
      traceEventCount: readNonNegativeNumber(evidence.traceEventCount, "RegressionCase.evidence.traceEventCount"),
      traceDigest: readRequiredString(evidence, "traceDigest", "RegressionCase.evidence"),
    },
  };
}

export function evaluateRegressionCase(input: {
  regressionCase: RegressionCase;
  session: SessionRecord;
  traceEvents: readonly AgentTraceEventRecord[];
}): RegressionCaseRunResult {
  const failures: string[] = [];
  const expected = input.regressionCase.expectations;
  if (input.session.messageCount < input.regressionCase.evidence.sessionMessageCount) {
    failures.push(`session message count regressed: expected at least ${input.regressionCase.evidence.sessionMessageCount}, found ${input.session.messageCount}`);
  }
  if (input.traceEvents.length < expected.minTraceEvents) {
    failures.push(`trace event count regressed: expected at least ${expected.minTraceEvents}, found ${input.traceEvents.length}`);
  }

  const kinds = new Set(input.traceEvents.map((event) => event.kind));
  for (const kind of expected.requiredTraceKinds) {
    if (!kinds.has(kind)) {
      failures.push(`missing trace event kind '${kind}'`);
    }
  }

  if (expected.finalAssistantText) {
    const finalAssistantText = [...input.session.messages]
      .reverse()
      .find((message) => message.role === "assistant" && typeof message.content === "string" && message.content.trim().length > 0)
      ?.content;
    if (finalAssistantText !== expected.finalAssistantText) {
      failures.push("final assistant text differs from captured case.");
    }
  }

  if (expected.terminalTraceKind && input.traceEvents.at(-1)?.kind !== expected.terminalTraceKind) {
    failures.push(`terminal trace kind differs: expected '${expected.terminalTraceKind}', found '${input.traceEvents.at(-1)?.kind ?? "none"}'`);
  }

  return {
    caseId: input.regressionCase.caseId,
    status: failures.length > 0 ? "failed" : "passed",
    failures,
    checkedAt: new Date().toISOString(),
  };
}

export function digestTrace(traceEvents: readonly AgentTraceEventRecord[]): string {
  const normalized = traceEvents.map((event) => ({
    kind: event.kind,
    turnId: event.turnId,
    summary: event.summary,
    data: event.data,
    artifactCount: event.artifacts?.length ?? 0,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeCaseId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "regression-case";
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readRequiredString(record: Record<string, unknown>, key: string, label: string): string {
  const value = readOptionalString(record[key], `${label}.${key}`);
  if (!value) {
    throw new Error(`${label}.${key} is required.`);
  }
  return value;
}

function readOptionalString(value: unknown, label: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const normalized = value.trim();
  return normalized || undefined;
}

function readStringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array.`);
  }
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function readNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative number.`);
  }
  return Math.trunc(value);
}
