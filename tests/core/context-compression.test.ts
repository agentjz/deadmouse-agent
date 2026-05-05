import assert from "node:assert/strict";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/turn.js";
import { buildContextRuntimeRequest } from "../../src/context/runtime/request.js";
import { createMessage } from "../../src/session/messages.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { createTestRuntimeConfig } from "./helpers.js";

test("context compression keeps long turns runnable", () => {
  const root = process.cwd();
  const config = {
    ...createTestRuntimeConfig(root),
    contextWindowMessages: 40,
    maxContextChars: 8_000,
    contextSummaryChars: 1_200,
  };
  const largeContent = "0123456789 ".repeat(1_000);
  const messages = [
    createMessage("user", "Keep working on the current coding task."),
    ...Array.from({ length: 24 }, (_, index) =>
      createMessage(index % 2 === 0 ? "assistant" : "user", `${index}: ${largeContent}`),
    ),
  ];

  const request = buildContextRuntimeRequest({
    prompt: "You are Kitty.",
    session: {
      messages,
    },
    config,
  });

  assert.equal(request.compressed, true);
  assert.ok(request.messages.length > 1);
  assert.equal(request.messages[0]?.role, "system");
  assert.ok(request.estimatedChars > 0);
  assert.ok(request.messages.length < messages.length + 1);
});

test("provider recovery keeps the turn running", async () => {
  const root = process.cwd();
  const store = new InProcessSessionStore();
  const session = await store.create(root);
  const statuses: string[] = [];
  let attempts = 0;

  const result = await runAgentTurn({
    input: "Keep going after a temporary provider failure.",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore: store,
    toolRegistry: {
      definitions: [],
      entries: [],
      execute: async () => ({ ok: false, output: "unreachable" }),
    },
    callbacks: {
      onStatus: (text) => statuses.push(text),
    },
    fetchAssistantResponse: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw Object.assign(new Error("connection reset"), { code: "ECONNRESET" });
      }

      return {
        content: "Recovered and continued.",
        toolCalls: [],
      };
    },
    recoverySleep: async () => undefined,
  });

  assert.equal(attempts, 2);
  assert.equal(result.transition?.action, "finalize");
  assert.match(statuses.join("\n"), /Auto-retrying/);
  const saved = await store.load(result.session.id);
  assert.equal(saved.checkpoint?.status, "completed");
  assert.equal(saved.checkpoint?.flow.phase, "active");
});
