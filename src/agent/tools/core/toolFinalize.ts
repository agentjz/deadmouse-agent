import type { ToolExecutionMetadata, ToolExecutionProtocolMetadata, ToolExecutionResult } from "../../../types.js";
import { isAbortError } from "../../../utils/abort.js";
import { ToolExecutionError } from "./errors.js";
import { ensureBlockedResultHasContinuation } from "./blockingResult.js";
import { validateToolExecutionResult } from "./governance.js";
import type { ToolRegistryEntry } from "./types.js";
import type { PreparedToolExecution } from "./toolPrepare.js";

const TOOL_EXECUTION_PROTOCOL_SYMBOL = Symbol.for("kitty.toolExecutionProtocol");

export function finalizeToolExecution(
  entry: Pick<ToolRegistryEntry, "name" | "governance">,
  result: ToolExecutionResult,
  prepared: PreparedToolExecution,
  options: {
    status?: ToolExecutionProtocolMetadata["status"];
    blockedIn?: ToolExecutionProtocolMetadata["blockedIn"];
    guardCode?: string;
  } = {},
): ToolExecutionResult {
  const finalized = result.ok ? validateToolExecutionResult(entry, result) : result;
  const status = options.status ?? (finalized.ok ? "completed" : "failed");
  const continued = status === "blocked" ? ensureBlockedResultHasContinuation(finalized) : finalized;
  const guardCode = options.guardCode ?? (status === "blocked" ? readGuardCode(continued.output) : undefined);
  const protocol = buildToolExecutionProtocolMetadata(prepared, {
    phases: status === "blocked" ? ["prepare", "finalize"] : ["prepare", "execute", "finalize"],
    status,
    blockedIn: options.blockedIn,
    guardCode,
  });

  return {
    ...continued,
    metadata: mergeToolExecutionMetadata(continued.metadata, protocol),
  };
}

export function attachToolExecutionProtocol(
  error: unknown,
  prepared: PreparedToolExecution,
  options: {
    status?: ToolExecutionProtocolMetadata["status"];
    blockedIn?: ToolExecutionProtocolMetadata["blockedIn"];
  } = {},
): never {
  if (isAbortError(error)) {
    throw error;
  }

  const protocol = buildToolExecutionProtocolMetadata(prepared, {
    phases: ["prepare", "execute", "finalize"],
    status: options.status ?? "failed",
    blockedIn: options.blockedIn ?? "execute",
  });

  if (error && typeof error === "object") {
    Object.defineProperty(error, TOOL_EXECUTION_PROTOCOL_SYMBOL, {
      configurable: true,
      enumerable: false,
      writable: true,
      value: protocol,
    });
  }

  throw error;
}

export function buildFailedToolExecutionResult(
  error: unknown,
  prepared: PreparedToolExecution,
  options: {
    status?: ToolExecutionProtocolMetadata["status"];
    blockedIn?: ToolExecutionProtocolMetadata["blockedIn"];
  } = {},
): ToolExecutionResult {
  if (isAbortError(error)) {
    throw error;
  }

  const protocol = buildToolExecutionProtocolMetadata(prepared, {
    phases: ["prepare", "execute", "finalize"],
    status: options.status ?? "failed",
    blockedIn: options.blockedIn ?? "execute",
  });
  const payload: Record<string, unknown> = {
    ok: false,
    error: error instanceof Error ? error.message : String(error),
    hint: buildFailureHint(error),
    protocol,
  };

  if (error instanceof ToolExecutionError) {
    payload.code = error.code;
    if (error.details) {
      payload.details = error.details;
    }
  }

  return {
    ok: false,
    output: JSON.stringify(payload, null, 2),
    metadata: { protocol },
  };
}

function buildFailureHint(error: unknown): string {
  if (error instanceof ToolExecutionError) {
    if (error.code === "EDIT_NOT_FOUND" || error.code === "EDIT_AMBIGUOUS" || error.code === "EDIT_OVERLAP") {
      return "Read the target area, then retry edit with current oldText/newText and a line hint when useful.";
    }

    if (error.code === "EDIT_UNREADABLE_TEXT") {
      return "The target is not editable text. Use bash to inspect file type or choose a text source.";
    }
  }

  return "Use the error facts to choose the next tool call.";
}

export function readToolExecutionProtocol(error: unknown): ToolExecutionProtocolMetadata | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  return (error as Record<PropertyKey, unknown>)[TOOL_EXECUTION_PROTOCOL_SYMBOL] as
    | ToolExecutionProtocolMetadata
    | undefined;
}

function buildToolExecutionProtocolMetadata(
  prepared: PreparedToolExecution,
  input: {
    phases: ToolExecutionProtocolMetadata["phases"];
    status: ToolExecutionProtocolMetadata["status"];
    blockedIn?: ToolExecutionProtocolMetadata["blockedIn"];
    guardCode?: string;
  },
): ToolExecutionProtocolMetadata {
  return {
    policy: prepared.policy,
    phases: input.phases,
    status: input.status,
    blockedIn: input.blockedIn,
    guardCode: input.guardCode,
    argumentStrictness: prepared.argumentStrictness,
  };
}

function mergeToolExecutionMetadata(
  metadata: ToolExecutionMetadata | undefined,
  protocol: ToolExecutionProtocolMetadata,
): ToolExecutionMetadata {
  return {
    ...(metadata ?? {}),
    protocol,
  };
}

function readGuardCode(output: string): string | undefined {
  try {
    const parsed = JSON.parse(output) as { code?: unknown };
    return typeof parsed.code === "string" && parsed.code.trim().length > 0 ? parsed.code.trim() : undefined;
  } catch {
    return undefined;
  }
}
