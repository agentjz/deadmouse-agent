import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  specAppendNoteTool,
  specCheckpointCreateTool,
  specCheckpointRestoreTool,
  specCreateTool,
  specOpenTool,
  specTaskUpdateTool,
  specWriteDocumentTool,
} from "../../src/capabilities/tools/packages/spec/specTools.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo, makeToolContext } from "../helpers.js";

test("spec tools expose factual persistence without deciding document content", async (t) => {
  const root = await createTempWorkspace("spec-tools", t);
  await initGitRepo(root);
  const context = makeToolContext(root) as never;

  const created = JSON.parse((await specCreateTool.execute(JSON.stringify({
    title: "Web Shell",
    summary: "Local SDD feature.",
  }), context)).output);
  const specId = created.spec.id as string;

  const requirements = "# Requirements\n\n用户已确认本机开发者使用。\n";
  await specAppendNoteTool.execute(JSON.stringify({
    specId,
    heading: "Round 1 answer",
    content: "用户原话：只给本机开发者使用，不要公网暴露。\n已确认：本机开发者。",
  }), context);
  await specAppendNoteTool.execute(JSON.stringify({
    specId,
    heading: "Open question",
    content: "待确认：是否需要持久化浏览器状态。",
  }), context);
  await specWriteDocumentTool.execute(JSON.stringify({
    specId,
    document: "requirements",
    content: requirements,
  }), context);
  await specTaskUpdateTool.execute(JSON.stringify({
    specId,
    taskId: "T001",
    title: "Create requirements document",
    status: "completed",
    evidence: "requirements.md written",
  }), context);
  const checkpoint = JSON.parse((await specCheckpointCreateTool.execute(JSON.stringify({
    specId,
    label: "requirements confirmed",
  }), context)).output);

  const store = new SpecStore(root, { rootDir: root });
  const state = await store.load(specId);
  assert.equal(await store.readDocument(specId, "requirements"), requirements);
  const notes = await store.readDocument(specId, "notes");
  assert.match(notes, /用户原话：只给本机开发者使用/);
  assert.match(notes, /待确认：是否需要持久化浏览器状态/);
  assert.equal(state.tasks.T001?.status, "completed");
  assert.equal(checkpoint.checkpoint.stage, "requirements");
  assert.ok(checkpoint.checkpoint.workspace.commit);
});

test("spec_open binds an existing spec to the current session for same-session continuity", async (t) => {
  const root = await createTempWorkspace("spec-open-tool", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({ title: "Resumable Feature" });
  const context = makeToolContext(root, root, { sessionId: "new-session" }) as never;

  const result = JSON.parse((await specOpenTool.execute(JSON.stringify({
    specId: spec.id,
  }), context)).output);

  assert.equal(result.spec.id, spec.id);
  assert.equal((await store.loadSessionBinding("new-session"))?.specId, spec.id);
});

test("spec checkpoint restore returns spec documents and isolated workspace code to the saved point", async (t) => {
  const root = await createTempWorkspace("spec-restore-tool", t);
  await initGitRepo(root);
  const context = makeToolContext(root) as never;
  const created = JSON.parse((await specCreateTool.execute(JSON.stringify({
    title: "Rollback Feature",
  }), context)).output);
  const specId = created.spec.id as string;
  const workspacePath = created.workspace.path as string;
  await specWriteDocumentTool.execute(JSON.stringify({
    specId,
    document: "requirements",
    content: "# Requirements\n\nbefore\n",
  }), context);
  await fs.writeFile(path.join(workspacePath, "feature.txt"), "before\n", "utf8");
  const checkpoint = JSON.parse((await specCheckpointCreateTool.execute(JSON.stringify({
    specId,
    label: "before change",
  }), context)).output);

  await specWriteDocumentTool.execute(JSON.stringify({
    specId,
    document: "requirements",
    content: "# Requirements\n\nafter\n",
  }), context);
  await fs.writeFile(path.join(workspacePath, "feature.txt"), "after\n", "utf8");
  await specCheckpointCreateTool.execute(JSON.stringify({
    specId,
    label: "after change",
  }), context);
  await specCheckpointRestoreTool.execute(JSON.stringify({
    specId,
    checkpointId: checkpoint.checkpoint.id,
  }), context);

  const store = new SpecStore(root, { rootDir: root });
  assert.match(await store.readDocument(specId, "requirements"), /before/);
  assert.equal(normalizeNewlines(await fs.readFile(path.join(workspacePath, "feature.txt"), "utf8")), "before\n");
});

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n");
}
