import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeCapabilityRegistry } from "../../src/capabilities/registry.js";
import {
  dreamingLoopNextTool,
  dreamingLoopStartTool,
  dreamingLoopStatusTool,
} from "../../src/capabilities/tools/packages/dreaming/dreamingLoopTools.js";
import { createToolRegistry } from "../../src/capabilities/tools/index.js";
import { readDreamingLoopState } from "../../src/capabilities/dreaming/loopState.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { closeExecution } from "../../src/execution/closeout.js";
import type { ToolContext } from "../../src/capabilities/tools/core/types.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("Dreaming Loop is a Lead-selected workflow capability, not an autonomous machine intent", () => {
  const registry = createRuntimeCapabilityRegistry();
  const pkg = registry.resolve("workflow.dreaming-loop");

  assert.equal(pkg.packageId, "workflow.dreaming-loop");
  assert.equal(pkg.profile.kind, "workflow");
  assert.equal(pkg.source.path, "src/capabilities/workflows/dreamingLoop.ts");
  assert.equal(pkg.profile.tools.includes("dreaming_loop_start"), true);
  assert.equal(pkg.profile.tools.includes("dreaming_loop_next"), true);
  assert.equal(pkg.profile.tools.includes("dreaming_loop_status"), true);
  assert.equal(pkg.runner.type, "workflow");
  assert.equal(pkg.machinePermissions.autoSelect, false);
  assert.equal(pkg.machinePermissions.autoDispatch, false);
  assert.equal(pkg.machinePermissions.decideStrategy, false);
  assert.match(pkg.port.permissionBoundary.forbidden.join("\n"), /machine-decided continuation/i);
});

test("dreaming_loop_start creates a timestamped loop ledger without launching Dreaming", async (t) => {
  const root = await createTempWorkspace("dreaming-loop-start", t);
  const result = await dreamingLoopStartTool.execute(
    JSON.stringify({
      objective: "Continuously improve protocol design.",
      scope: "Mirror World only; Lead decides each next round.",
      evaluator: "Record tests, artifacts, and Real World unchanged evidence.",
    }),
    makeToolContext(root) as unknown as ToolContext,
  );
  const payload = JSON.parse(result.output) as {
    loopId: string;
    status: string;
    nextAction: string;
  };
  const state = await readDreamingLoopState(root, payload.loopId);
  const executions = await new ExecutionStore(root).listRelevant({ profile: "dreaming" });

  assert.equal(result.ok, true);
  assert.match(payload.loopId, /^dreaming-loop-\d{8}-\d{6}-[a-f0-9]{6}$/);
  assert.equal(payload.status, "waiting_for_lead");
  assert.equal(payload.nextAction, "Lead may call dreaming_loop_next to start one explicit Dreaming round.");
  assert.equal(state.rounds.length, 0);
  assert.equal(executions.length, 0);
});

test("dreaming_loop_next starts exactly one timestamped Dreaming round and records a pending Lead handoff", async (t) => {
  const root = await createTempWorkspace("dreaming-loop-next", t);
  let dispatch: Record<string, unknown> | undefined;
  const context = makeToolContext(root, root, {
    callbacks: {
      onDispatch(event: Record<string, unknown>) {
        dispatch = event;
      },
    },
  }) as unknown as ToolContext;
  const started = JSON.parse((await dreamingLoopStartTool.execute(
    JSON.stringify({
      objective: "Improve Dreaming architecture.",
      scope: "Mirror World only.",
      evaluator: "Full tests and merge proposal evidence.",
    }),
    context,
  )).output) as { loopId: string };

  const result = await dreamingLoopNextTool.execute(
    JSON.stringify({
      loop_id: started.loopId,
      round_objective: "Inspect protocol residue and propose one improvement.",
      max_runtime_ms: 5_000,
      max_idle_ms: 2_000,
    }),
    context,
  );
  const payload = JSON.parse(result.output) as {
    loopId: string;
    roundId: string;
    executionId: string;
    nextDecisionOwner: string;
  };
  const state = await readDreamingLoopState(root, started.loopId);
  const execution = await new ExecutionStore(root).load(payload.executionId);

  assert.equal(result.ok, true);
  assert.match(payload.roundId, /^dreaming-\d{8}-\d{6}-r01-[a-f0-9]{6}$/);
  assert.equal(payload.nextDecisionOwner, "lead");
  assert.equal(state.status, "round_running");
  assert.equal(state.rounds.length, 1);
  assert.equal(state.rounds[0]?.roundId, payload.roundId);
  assert.equal(state.rounds[0]?.executionId, payload.executionId);
  assert.equal(state.rounds[0]?.decisionOwner, "lead");
  assert.equal(execution.profile, "dreaming");
  assert.equal(execution.assignmentSnapshot?.capabilityId, "external_agent.dreaming");
  assert.equal(dispatch?.profile, "dreaming");
});

test("dreaming_loop_next and status remain Lead-only factual surfaces", async (t) => {
  const root = await createTempWorkspace("dreaming-loop-lead-only", t);
  const nonLead = makeToolContext(root, root, {
    identity: {
      kind: "teammate",
      name: "worker",
    },
  }) as unknown as ToolContext;
  const registry = createToolRegistry({
    onlyNames: ["dreaming_loop_start", "dreaming_loop_next", "dreaming_loop_status"],
  });

  await assert.rejects(
    () => registry.execute(
      "dreaming_loop_start",
      JSON.stringify({
        objective: "Try to start loop.",
        scope: "No.",
        evaluator: "No.",
      }),
      nonLead,
    ),
    /Only the lead can manage Dreaming Loop/i,
  );

  const leadContext = makeToolContext(root) as unknown as ToolContext;
  const started = JSON.parse((await dreamingLoopStartTool.execute(
    JSON.stringify({
      objective: "Track facts only.",
      scope: "Mirror World.",
      evaluator: "Record evidence.",
    }),
    leadContext,
  )).output) as { loopId: string };
  const status = JSON.parse((await dreamingLoopStatusTool.execute(
    JSON.stringify({ loop_id: started.loopId }),
    leadContext,
  )).output) as {
    loop: {
      status: string;
      rounds: unknown[];
    };
    decision: string;
  };

  assert.equal(status.loop.status, "waiting_for_lead");
  assert.deepEqual(status.loop.rounds, []);
  assert.equal(status.decision, "Machine records facts only; Lead decides whether to continue, stop, or change mission.");
});

test("dreaming_loop_status reconciles terminal round facts without deciding continuation", async (t) => {
  const root = await createTempWorkspace("dreaming-loop-reconcile", t);
  const context = makeToolContext(root) as unknown as ToolContext;
  const started = JSON.parse((await dreamingLoopStartTool.execute(
    JSON.stringify({
      objective: "Improve protocol truth.",
      scope: "Mirror World only.",
      evaluator: "Record test result facts.",
    }),
    context,
  )).output) as { loopId: string };
  const next = JSON.parse((await dreamingLoopNextTool.execute(
    JSON.stringify({
      loop_id: started.loopId,
      round_objective: "Produce one factual closeout.",
      max_runtime_ms: 5_000,
      max_idle_ms: 2_000,
    }),
    context,
  )).output) as { executionId: string; roundId: string };

  await closeExecution({
    rootDir: root,
    executionId: next.executionId,
    status: "completed",
    summary: "Dreaming completed with factual evidence.",
    resultText: "Closeout evidence only.",
    output: "stream evidence",
    notifyRequester: false,
  });

  const status = JSON.parse((await dreamingLoopStatusTool.execute(
    JSON.stringify({ loop_id: started.loopId }),
    context,
  )).output) as {
    loop: {
      status: string;
      rounds: Array<{
        status: string;
        closeoutRef?: string;
        factualSummary?: string;
      }>;
    };
    decision: string;
  };

  assert.equal(status.loop.status, "waiting_for_lead");
  assert.equal(status.loop.rounds[0]?.status, "completed");
  assert.equal(status.loop.rounds[0]?.closeoutRef, next.executionId);
  assert.match(status.loop.rounds[0]?.factualSummary ?? "", /Dreaming completed/);
  assert.equal(status.decision, "Machine records facts only; Lead decides whether to continue, stop, or change mission.");
});
