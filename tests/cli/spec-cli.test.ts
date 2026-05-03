import assert from "node:assert/strict";
import test from "node:test";

import { buildCliProgram } from "../../src/cli.js";
import type { RuntimeConfig, SessionRecord } from "../../src/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

test("CLI exposes explicit agent and spec modes", async (t) => {
  const root = await createTempWorkspace("spec-cli", t);
  const config = createTestRuntimeConfig(root);
  const started: string[] = [];
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    startInteractive: async (options) => {
      started.push(`agent:${options.cwd}`);
    },
  });
  program.exitOverride();

  await program.parseAsync(["agent"], { from: "user" });

  assert.deepEqual(started, [`agent:${root}`]);
});

test("agent one-shot command goes through agent command path", async (t) => {
  const root = await createTempWorkspace("spec-cli-one-shot", t);
  const config = createTestRuntimeConfig(root);
  let oneShotPrompt = "";
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runOneShot: async (options: {
      prompt: string;
      cwd: string;
      config: RuntimeConfig;
      session: SessionRecord;
    }) => {
      oneShotPrompt = options.prompt;
      return {
        session: options.session,
        closeout: {
          sessionId: options.session.id,
          completed: true,
          terminalTransition: null,
          verification: {
            status: "idle",
            observedPaths: [],
            attempts: 0,
          },
          acceptance: {
            status: "idle",
            pendingChecks: [],
            stalledPhaseCount: 0,
          },
        },
      };
    },
  });
  program.exitOverride();

  await program.parseAsync(["agent", "修 README"], { from: "user" });

  assert.equal(oneShotPrompt, "修 README");
});

test("spec mode has an explicit resume entry instead of cross-session auto-pollution", async (t) => {
  const root = await createTempWorkspace("spec-cli-resume", t);
  const config = createTestRuntimeConfig(root);
  const started: string[] = [];
  const program = buildCliProgram({
    resolveRuntime: async () => ({
      cwd: root,
      config,
      paths: config.paths,
      overrides: {},
    }),
    runSpecOneShot: async (options) => ({
      session: options.session,
      closeout: {
        sessionId: options.session.id,
        completed: true,
        terminalTransition: null,
        verification: {
          status: "idle",
          observedPaths: [],
          attempts: 0,
        },
        acceptance: {
          status: "idle",
          pendingChecks: [],
          stalledPhaseCount: 0,
        },
      },
    }),
    startSpecInteractive: async (options) => {
      started.push(options.session.id);
    },
  });
  program.exitOverride();

  await program.parseAsync(["spec", "seed spec"], { from: "user" });
  await program.parseAsync(["spec", "--resume"], { from: "user" });

  assert.equal(started.length, 1);
});
