import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext, parseToolJson } from "./helpers.js";

test("default agent tool registry exposes only read edit write bash", async (t) => {
  const root = await createTempWorkspace("tool-registry", t);
  const registry = await createDefaultAgentToolRegistry(createTestRuntimeConfig(root));
  const names = registry.definitions.map((tool) => tool.function.name);

  assert.deepEqual(names, ["read", "edit", "write", "bash"]);
});

test("read write edit bash complete the core coding loop", async (t) => {
  const root = await createTempWorkspace("foundation-loop", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const write = await registry.execute("write", JSON.stringify({
    path: "src/message.txt",
    content: "alpha\nbeta\n",
    create_directories: true,
  }), context);
  assert.equal(write.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\nbeta\n");

  const read = await registry.execute("read", JSON.stringify({
    path: "src/message.txt",
    offset: 1,
    limit: 2,
  }), context);
  assert.equal(read.ok, true);
  assert.match(String(parseToolJson(read.output).content), /1\s+\|\s+alpha/);

  const edit = await registry.execute("edit", JSON.stringify({
    path: "src/message.txt",
    edits: [
      {
        oldText: "beta",
        newText: "gamma",
      },
    ],
  }), context);
  assert.equal(edit.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\ngamma\n");

  const bash = await registry.execute("bash", JSON.stringify({
    command: "node -e \"const fs=require('fs'); process.stdout.write(fs.readFileSync('src/message.txt','utf8'))\"",
    cwd: ".",
    timeout_ms: 30_000,
  }), context);
  assert.equal(bash.ok, true);
  const payload = parseToolJson(bash.output);
  assert.equal(payload.exitCode, 0);
  assert.match(String(payload.output), /alpha\ngamma/);
});

test("edit rejects stale oldText with focused recovery facts", async (t) => {
  const root = await createTempWorkspace("edit-stale", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "message.txt"), "current\n", "utf8");

  const result = await registry.execute("edit", JSON.stringify({
    path: "src/message.txt",
    edits: [
      {
        oldText: "stale",
        newText: "next",
      },
    ],
  }), context);

  assert.equal(result.ok, false);
  const payload = parseToolJson(result.output);
  assert.equal(payload.code, "EDIT_NOT_FOUND");
  assert.match(String(payload.hint), /Read the target area/);
});
