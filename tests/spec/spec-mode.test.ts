import assert from "node:assert/strict";
import test from "node:test";

import { InProcessSessionStore } from "../../src/agent/session.js";
import { createPersistedSession } from "../../src/host/session.js";
import { loadSpecRuntime } from "../../src/spec/runtime.js";
import { SpecStore } from "../../src/spec/store.js";
import { runHostTurn } from "../../src/host/turn.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import type { ToolRegistry } from "../../src/capabilities/tools/core/types.js";
import { createTestRuntimeConfig, createTempWorkspace, initGitRepo } from "../helpers.js";

test("spec runtime injects spec contract and spec tools only when spec mode asks for them", async (t) => {
  const root = await createTempWorkspace("spec-runtime", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({
    title: "Web Shell",
    sessionId: "session-1",
  });

  const runtime = await loadSpecRuntime({ cwd: root, sessionId: "session-1" });
  const toolNames = runtime.tools.map((tool) => tool.definition.function.name).sort();

  assert.equal(runtime.activeSpec?.id, spec.id);
  assert.equal(runtime.cwd, spec.workspace?.path);
  assert.match(runtime.promptBlock, /Spec mode flow: requirements clarification -> requirements -> design -> tasks -> implement -> validate -> archive/);
  assert.match(runtime.promptBlock, /Isolated workspace:/);
  assert.match(runtime.promptBlock, /Notes\.md is the traceable interview ledger/i);
  assert.equal(toolNames.includes("spec_create"), true);
  assert.equal(toolNames.includes("spec_append_note"), true);
  assert.equal(toolNames.includes("spec_checkpoint_restore"), true);
});

test("host turn receives spec mode prompt state and tools through the host boundary", async (t) => {
  const root = await createTempWorkspace("spec-host", t);
  await initGitRepo(root);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await createPersistedSession(sessionStore, root);
  const specRuntime = await loadSpecRuntime({ cwd: root, sessionId: session.id });

  let sawSpecTool = false;
  let sawSpecPrompt = false;
  const outcome = await runHostTurn(
    {
      input: "我要做一个 Web 端壳",
      cwd: root,
      config,
      session,
      sessionStore,
      extraTools: specRuntime.tools,
      runtimePromptState: {
        mode: "spec",
        extraStaticBlocks: [specRuntime.promptBlock],
      },
    },
    {
      createToolRegistry: async (_config, options) => {
        sawSpecTool = Boolean(options.extraTools?.some((tool) => tool.definition.function.name === "spec_create"));
        return {
          definitions: [],
          async execute() {
            throw new Error("Unexpected tool execution.");
          },
          async close() {
            return;
          },
        } satisfies ToolRegistry;
      },
      runTurn: async (options) => {
        sawSpecPrompt = options.runtimePromptState?.mode === "spec"
          && Boolean(options.runtimePromptState.extraStaticBlocks?.join("\n").includes("Spec mode contract"));
        return {
          session: options.session,
          changedPaths: [],
          verificationAttempted: false,
          yielded: false,
        };
      },
    },
  );

  assert.equal(outcome.status, "completed");
  assert.equal(sawSpecTool, true);
  assert.equal(sawSpecPrompt, true);
});

test("interactive spec turns execute inside the active spec workspace", async (t) => {
  const root = await createTempWorkspace("spec-interactive-workspace", t);
  await initGitRepo(root);
  const store = new SpecStore(root, { rootDir: root });
  const spec = await store.create({
    title: "Workspace Bound Feature",
    sessionId: "session-1",
  });
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.save({
    id: "session-1",
    cwd: root,
    messages: [],
    messageCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  let receivedCwd = "";
  const driver = new InteractiveSessionDriver({
    cwd: root,
    config,
    session,
    sessionStore,
    shell: {
      input: {
        bindInterrupt: () => () => undefined,
        readInput: async () => ({ kind: "submit", value: receivedCwd ? "quit" : "写代码" }),
        readMultiline: async () => ({ kind: "cancel" }),
      },
      output: {
        plain() {},
        info() {},
        warn() {},
        error() {},
        dim() {},
        heading() {},
        interrupt() {},
      },
      createTurnDisplay: () => ({
        callbacks: {},
        flush() {},
        dispose() {},
      }),
    },
    turnContextProvider: async () => {
      const runtime = await loadSpecRuntime({ cwd: root, sessionId: session.id });
      return {
        cwd: runtime.cwd,
        stateRootDir: runtime.stateRootDir,
        extraTools: runtime.tools,
        runtimePromptState: {
          mode: "spec",
          extraStaticBlocks: [runtime.promptBlock],
        },
      };
    },
    localCommandHandler: async (input) => input === "quit" ? "quit" : "continue",
    runTurn: async (options) => {
      receivedCwd = options.cwd;
      return {
        session: options.session,
        changedPaths: [],
        verificationAttempted: false,
        yielded: false,
      };
    },
  });

  await driver.run();

  assert.equal(receivedCwd, spec.workspace?.path);
});
