import type {
  SessionRunState,
  SessionRunStateSource,
  RuntimeContinueTransition,
  RuntimeTransition,
  SessionCheckpointFlow,
  SessionCheckpointPhase,
  SessionCheckpointStatus,
} from "../../types.js";
import { normalizeRuntimeTransition } from "./normalize.js";
import { clampWholeNumber, normalizeText, normalizeTimestamp } from "./shared.js";

interface BuildCheckpointFlowInput {
  current: SessionCheckpointFlow | undefined;
  status: SessionCheckpointStatus;
  transition?: RuntimeTransition;
  defaultPhase?: SessionCheckpointPhase;
  runState?: {
    status: SessionRunState["status"];
    source?: SessionRunStateSource;
  };
  timestamp?: string;
}

export function normalizeCheckpointFlow(
  flow: SessionCheckpointFlow | undefined,
  status: SessionCheckpointStatus,
  timestamp = new Date().toISOString(),
): SessionCheckpointFlow {
  const lastTransition = normalizeRuntimeTransition(flow?.lastTransition, timestamp);
  const phase = normalizePhase(lastTransition ? getRuntimeTransitionPhase(lastTransition) : flow?.phase, status);
  const runState = normalizeRunState({
    current: flow?.runState,
    status,
    timestamp,
  });

  return {
    phase,
    reason: lastTransition ? formatRuntimeTransitionReason(lastTransition) : normalizeText(flow?.reason) || undefined,
    recoveryFailures:
      lastTransition?.action === "recover"
        ? lastTransition.reason.consecutiveFailures
        : phase === "recovery"
          ? clampWholeNumber(flow?.recoveryFailures, 1, 50, undefined)
          : undefined,
    runState,
    lastTransition,
    updatedAt: normalizeTimestamp(flow?.updatedAt, timestamp),
  };
}

export function buildCheckpointFlow(input: BuildCheckpointFlowInput): SessionCheckpointFlow {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const transition = normalizeRuntimeTransition(input.transition, timestamp);
  const phase = normalizePhase(
    transition ? getRuntimeTransitionPhase(transition) : input.defaultPhase ?? input.current?.phase,
    input.status,
  );
  const runState = normalizeRunState({
    current: input.current?.runState,
    status: input.status,
    override: input.runState,
    timestamp,
  });

  return {
    phase,
    reason: transition ? formatRuntimeTransitionReason(transition) : undefined,
    recoveryFailures: transition?.action === "recover" ? transition.reason.consecutiveFailures : undefined,
    runState,
    lastTransition: transition,
    updatedAt: timestamp,
  };
}

export function getTurnInputTransition(
  input: string,
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition | undefined {
  return undefined;
}

export function formatRuntimeTransitionReason(transition: RuntimeTransition): string {
  return transition.reason.code;
}

export function getRuntimeTransitionPhase(transition: RuntimeTransition): SessionCheckpointPhase {
  if (transition.action === "recover") {
    return "recovery";
  }

  return "active";
}

function normalizePhase(
  value: SessionCheckpointPhase | undefined,
  status: SessionCheckpointStatus,
): SessionCheckpointPhase {
  if (status === "completed") {
    return "active";
  }

  return value === "recovery" ? value : "active";
}

function normalizeRunState(input: {
  current: SessionRunState | undefined;
  status: SessionCheckpointStatus;
  override?: {
    status: SessionRunState["status"];
    source?: SessionRunStateSource;
  };
  timestamp: string;
}): SessionRunState {
  const normalizedStatus = input.status === "completed"
    ? "idle"
    : input.override?.status === "busy" || input.override?.status === "idle"
      ? input.override.status
      : input.current?.status === "busy"
        ? "busy"
        : "idle";

  const source = normalizeRunStateSource(
    input.status === "completed"
      ? "checkpoint"
      : input.override?.source ?? input.current?.source,
    normalizedStatus,
  );

  return {
    status: normalizedStatus,
    source,
    pendingToolCallCount: 0,
    updatedAt: input.timestamp,
  };
}

function normalizeRunStateSource(
  source: SessionRunStateSource | undefined,
  status: SessionRunState["status"],
): SessionRunStateSource {
  if (status === "idle") {
    return source === "turn" ? "checkpoint" : source ?? "checkpoint";
  }

  if (source === "turn" || source === "tool_batch") {
    return source;
  }

  return "checkpoint";
}
