import { spawnExecutionWorker } from "../../../../execution/launch.js";
import { ExecutionStore } from "../../../../execution/store.js";
import { createExecutionFromAssignment } from "../../../../execution/createFromAssignment.js";
import { createAssignmentContract } from "../../../../protocol/assignment.js";
import { getDreamingCapabilityPackage } from "../../../dreaming/capabilityAdapter.js";
import {
  appendDreamingLoopLedger,
  DREAMING_LOOP_STATE_PROTOCOL,
  readDreamingLoopState,
  reconcileDreamingLoopState,
  writeDreamingLoopState,
} from "../../../dreaming/loopState.js";
import { createTimestampedDreamingLoopId, createTimestampedDreamingRoundId } from "../../../dreaming/ids.js";
import { createForegroundStreamRef } from "../../../../execution/foregroundStream.js";
import { DREAMING_STATE_PROTOCOL, writeDreamingState } from "../../../dreaming/state.js";
import { okResult, parseArgs, readString, clampNumber } from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import type { ToolExecutionMetadata } from "../../../../types.js";

export const dreamingLoopStartTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "dreaming_loop_start",
      description:
        "Lead-only: create a Dreaming Loop ledger. This does not launch Dreaming; Lead must explicitly call dreaming_loop_next for each round.",
      parameters: {
        type: "object",
        properties: {
          objective: { type: "string", description: "Long-running Dreaming Loop objective." },
          scope: { type: "string", description: "Loop boundary and Mirror World scope." },
          evaluator: { type: "string", description: "Facts or commands Lead wants recorded for each round." },
        },
        required: ["objective", "scope", "evaluator"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    assertLead(context.identity.kind);
    const args = parseArgs(rawArgs);
    const now = new Date().toISOString();
    const state = await writeDreamingLoopState(context.projectContext.stateRootDir, {
      protocol: DREAMING_LOOP_STATE_PROTOCOL,
      loopId: createTimestampedDreamingLoopId(),
      objective: readString(args.objective, "objective"),
      scope: readString(args.scope, "scope"),
      evaluator: readString(args.evaluator, "evaluator"),
      status: "waiting_for_lead",
      decisionOwner: "lead",
      rounds: [],
      createdAt: now,
      updatedAt: now,
    });
    await appendDreamingLoopLedger({
      rootDir: context.projectContext.stateRootDir,
      loopId: state.loopId,
      event: "loop_created",
      data: {
        objective: state.objective,
        scope: state.scope,
        evaluator: state.evaluator,
        decisionOwner: "lead",
      },
    });

    return okResult(JSON.stringify({
      ok: true,
      protocol: DREAMING_LOOP_STATE_PROTOCOL,
      status: state.status,
      loopId: state.loopId,
      loop: state,
      nextAction: "Lead may call dreaming_loop_next to start one explicit Dreaming round.",
      decision: "Machine records facts only; Lead decides whether to continue, stop, or change mission.",
    }, null, 2));
  },
};

export const dreamingLoopNextTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "dreaming_loop_next",
      description:
        "Lead-only: start exactly one Dreaming round from an existing Dreaming Loop. This never schedules another round automatically.",
      parameters: {
        type: "object",
        properties: {
          loop_id: { type: "string", description: "Dreaming Loop id." },
          round_objective: { type: "string", description: "Optional objective override for this round." },
          max_runtime_ms: { type: "number", description: "Optional maximum runtime for this round." },
          max_idle_ms: { type: "number", description: "Optional maximum idle time for this round." },
        },
        required: ["loop_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    assertLead(context.identity.kind);
    const args = parseArgs(rawArgs);
    const state = await reconcileDreamingLoopState(context.projectContext.stateRootDir, readString(args.loop_id, "loop_id"));
    if (state.status === "round_running") {
      throw new Error(`Dreaming Loop '${state.loopId}' already has a running round. Lead must inspect status before starting another.`);
    }

    const roundNumber = state.rounds.length + 1;
    const roundId = createTimestampedDreamingRoundId(roundNumber);
    const objective = typeof args.round_objective === "string" && args.round_objective.trim()
      ? readString(args.round_objective, "round_objective")
      : state.objective;
    const capability = getDreamingCapabilityPackage();
    const assignment = createAssignmentContract({
      capabilityId: capability.packageId,
      objective,
      scope: [
        state.scope,
        `Dreaming Loop: ${state.loopId}`,
        `Round: ${roundId}`,
        "Lead decides whether any later round happens.",
      ].join("\n"),
      expectedOutput: [
        "CloseoutContract with Mirror World evidence.",
        `Evaluator facts to record: ${state.evaluator}`,
        "Merge proposal if the round found a candidate improvement.",
        "No automatic continuation decision.",
      ].join("\n"),
      createdBy: context.identity.name,
    });
    const execution = await createExecutionFromAssignment({
      rootDir: context.projectContext.stateRootDir,
      capability,
      assignment,
      lane: "agent",
      profile: "dreaming",
      launch: "worker",
      requestedBy: context.identity.name,
      actorName: "Dreaming",
      actorRole: `dreaming loop ${state.loopId} round ${roundNumber}`,
      objectiveKey: context.currentObjective?.key,
      objectiveText: context.currentObjective?.text,
      cwd: context.projectContext.rootDir,
      prompt: buildRoundPrompt({
        state,
        roundNumber,
        roundId,
        objective,
      }),
      worktreePolicy: "none",
      timeoutMs: clampNumber(args.max_runtime_ms, 1_000, 900_000, 900_000),
      stallTimeoutMs: clampNumber(args.max_idle_ms, 1_000, 300_000, 300_000),
    });
    const foreground = await createForegroundStreamRef({
      rootDir: context.projectContext.stateRootDir,
      executionId: execution.id,
      label: "dreaming",
    });
    await writeDreamingState(context.projectContext.stateRootDir, {
      protocol: DREAMING_STATE_PROTOCOL,
      executionId: execution.id,
      objective,
      scope: assignment.scope,
      expectedOutput: assignment.expectedOutput,
      foregroundStreamPath: foreground.path,
      status: "created",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const round = {
      roundNumber,
      roundId,
      executionId: execution.id,
      objective,
      status: "started" as const,
      decisionOwner: "lead" as const,
      startedAt: new Date().toISOString(),
      artifactRefs: [foreground.path],
      factualSummary: "Round launched. Machine will not decide the next round.",
    };
    const nextState = await writeDreamingLoopState(context.projectContext.stateRootDir, {
      ...state,
      status: "round_running",
      rounds: [...state.rounds, round],
    });
    await appendDreamingLoopLedger({
      rootDir: context.projectContext.stateRootDir,
      loopId: state.loopId,
      event: "round_started",
      data: {
        roundId,
        roundNumber,
        executionId: execution.id,
        objective,
        decisionOwner: "lead",
      },
    });

    const pid = spawnExecutionWorker({
      rootDir: context.projectContext.stateRootDir,
      config: context.config,
      executionId: execution.id,
      actorName: "Dreaming",
    });
    await new ExecutionStore(context.projectContext.stateRootDir).start(execution.id, { pid });
    context.callbacks?.onDispatch?.({
      profile: "dreaming",
      actorName: "Dreaming",
      executionId: execution.id,
      pid,
      summary: `dreaming loop ${state.loopId} round ${roundNumber}`,
    });

    const metadata: ToolExecutionMetadata = {
      collaboration: {
        action: "spawn",
        actor: "Dreaming",
        executionId: execution.id,
        yieldLeadUntilCloseout: true,
      },
    };

    return okResult(JSON.stringify({
      ok: true,
      protocol: DREAMING_LOOP_STATE_PROTOCOL,
      loopId: state.loopId,
      roundId,
      roundNumber,
      executionId: execution.id,
      pid,
      foregroundStream: foreground,
      loop: nextState,
      nextDecisionOwner: "lead",
      decision: "Machine launched one explicit round only; Lead decides whether any next round exists.",
    }, null, 2), metadata);
  },
};

export const dreamingLoopStatusTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "dreaming_loop_status",
      description: "Lead-only: read Dreaming Loop factual ledger state.",
      parameters: {
        type: "object",
        properties: {
          loop_id: { type: "string", description: "Dreaming Loop id." },
        },
        required: ["loop_id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    assertLead(context.identity.kind);
    const args = parseArgs(rawArgs);
    const state = await reconcileDreamingLoopState(context.projectContext.stateRootDir, readString(args.loop_id, "loop_id"));
    return okResult(JSON.stringify({
      ok: true,
      protocol: DREAMING_LOOP_STATE_PROTOCOL,
      loop: state,
      decision: "Machine records facts only; Lead decides whether to continue, stop, or change mission.",
    }, null, 2));
  },
};

function assertLead(kind: string): void {
  if (kind !== "lead") {
    throw new Error("Only the lead can manage Dreaming Loop.");
  }
}

function buildRoundPrompt(input: {
  state: Awaited<ReturnType<typeof readDreamingLoopState>>;
  roundNumber: number;
  roundId: string;
  objective: string;
}): string {
  return [
    "You are Dreaming inside a Lead-selected Dreaming Loop.",
    "",
    "Loop boundary:",
    `- Loop: ${input.state.loopId}`,
    `- Round: ${input.roundId}`,
    `- Round number: ${input.roundNumber}`,
    "- This is one explicit round only.",
    "- Do not decide whether another round should happen.",
    "- Return evidence, artifacts, risks, and a merge proposal if useful.",
    "",
    `Loop objective: ${input.state.objective}`,
    `Round objective: ${input.objective}`,
    `Scope: ${input.state.scope}`,
    `Evaluator facts Lead wants recorded: ${input.state.evaluator}`,
  ].join("\n");
}
