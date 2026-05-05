import { buildCheckpointFlow } from "../../agent/runtimeTransition.js";
import type {
  RuntimeFinalizeTransition,
  RuntimeRecoverTransition,
  RuntimeTransition,
  SessionRecord,
} from "../../types.js";
import { deriveCompletedSteps } from "./derivation.js";
import { resolveCurrentObjectiveCheckpoint } from "./state.js";

export function noteCheckpointTransition(
  session: SessionRecord,
  transition: RuntimeTransition,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        defaultPhase: checkpoint.flow.phase,
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointRecovery(
  session: SessionRecord,
  transition: RuntimeRecoverTransition,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);

  if (checkpoint.status === "completed") {
    return {
      ...session,
      checkpoint,
    };
  }

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        defaultPhase: "recovery",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function noteCheckpointCompleted(
  session: SessionRecord,
  transition: RuntimeFinalizeTransition | undefined,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentObjectiveCheckpoint(session, timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      status: "completed",
      completedSteps:
        checkpoint.completedSteps.length > 0 ? checkpoint.completedSteps : deriveCompletedSteps(session),
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: "completed",
        transition,
        defaultPhase: "active",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}
