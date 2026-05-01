import assert from "node:assert/strict";
import test from "node:test";

import { hasActiveLeadWaitExecutions, waitForLeadWaitExecutionsToSettle } from "../../src/execution/leadWait.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace } from "../helpers.js";

test("lead wait is driven by execution wait policy snapshots, not profile names", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-profile-agnostic", t);
  const store = new ExecutionStore(root);

  const workflow = await store.create({
    lane: "agent",
    profile: "workflow",
    launch: "worker",
    requestedBy: "lead",
    actorName: "generic-workflow",
    cwd: root,
    worktreePolicy: "none",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "global",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  await store.start(workflow.id, { pid: process.pid });

  assert.equal(await hasActiveLeadWaitExecutions(root), true);
});

test("executions with non-blocking wait policy do not suspend Lead even when running", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-none", t);
  const store = new ExecutionStore(root);

  const execution = await store.create({
    lane: "agent",
    profile: "workflow",
    launch: "worker",
    requestedBy: "lead",
    actorName: "non-blocking-workflow",
    cwd: root,
    worktreePolicy: "none",
    waitPolicy: {
      lead: "none",
      wake: "optional",
      scope: "global",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  await store.start(execution.id, { pid: process.pid });

  assert.equal(await hasActiveLeadWaitExecutions(root), false);
});

test("execution wait policy survives ledger round trips as an audit snapshot", async (t) => {
  const root = await createTempWorkspace("lead-wait-policy-round-trip", t);
  const store = new ExecutionStore(root);

  const execution = await store.create({
    lane: "command",
    profile: "background",
    launch: "worker",
    requestedBy: "lead",
    actorName: "background",
    cwd: root,
    command: "npm test",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "objective",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  const loaded = await store.load(execution.id);

  assert.deepEqual(loaded.waitPolicy, execution.waitPolicy);
});

test("lead wait announces active Dreaming foreground stream before suspending", async (t) => {
  const root = await createTempWorkspace("lead-wait-dreaming-foreground", t);
  const store = new ExecutionStore(root);
  const execution = await store.create({
    lane: "agent",
    profile: "dreaming",
    launch: "worker",
    requestedBy: "lead",
    actorName: "Dreaming",
    cwd: root,
    worktreePolicy: "none",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "global",
      terminalStatuses: ["completed", "failed", "aborted", "paused"],
    },
  });
  await store.start(execution.id, { pid: process.pid });
  const seen: Array<{ executionId: string; label: string; streamPath: string }> = [];

  const waiting = waitForLeadWaitExecutionsToSettle({
    cwd: root,
    onForegroundStream(event) {
      seen.push(event);
    },
  });
  await waitFor(() => seen.length > 0);
  await store.close(execution.id, {
    status: "completed",
    summary: "done",
  });
  await waiting;

  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.executionId, execution.id);
  assert.equal(seen[0]?.label, "dreaming");
  assert.match(seen[0]?.streamPath ?? "", /execution-streams/);
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > 3_000) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
