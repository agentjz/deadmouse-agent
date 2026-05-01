import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeUiEvent, normalizeRuntimeUiChannel } from "../../src/runtime-ui/events.js";
import { createRuntimeUiTerminalRenderer } from "../../src/runtime-ui/terminalRenderer.js";
import { RUNTIME_UI_CHANNEL_IDENTITIES } from "../../src/runtime-ui/channelIdentity.js";
import { captureStdout } from "../observability.helpers.js";

test("runtime UI renders Dreaming foreground tool events through the shared tool display", async () => {
  const output = await captureStdout(async () => {
    const renderer = createRuntimeUiTerminalRenderer({
      cwd: process.cwd(),
      showReasoning: false,
    });
    renderer.render(createRuntimeUiEvent({
      channel: "dream",
      kind: "foreground_start",
      executionId: "exec-dream",
    }));
    renderer.render(createRuntimeUiEvent({
      channel: "dream",
      kind: "tool_call",
      toolName: "read_file",
      payload: JSON.stringify({ path: "package.json", start_line: 1, end_line: 10 }),
    }));
    renderer.render(createRuntimeUiEvent({
      channel: "dream",
      kind: "tool_result",
      toolName: "read_file",
      payload: JSON.stringify({ path: "package.json", content: "large body" }),
    }));
    renderer.render(createRuntimeUiEvent({
      channel: "dream",
      kind: "foreground_end",
      executionId: "exec-dream",
    }));
  });
  const plain = stripAnsi(output);

  assert.match(plain, /\[做梦\]\nforeground started exec-dream/);
  assert.match(plain, /\[tool\] read_file package\.json:1-10/);
  assert.doesNotMatch(plain, /\[result\] read_file package\.json ok/);
  assert.match(plain, /foreground ended exec-dream/);
  assert.doesNotMatch(plain, /\[做梦\] tool|\[做梦\] result/);
  assert.doesNotMatch(plain, /large body/);
});

test("runtime UI renders only failed tool results", async () => {
  const output = await captureStdout(async () => {
    const renderer = createRuntimeUiTerminalRenderer({
      cwd: process.cwd(),
      showReasoning: false,
    });
    renderer.render(createRuntimeUiEvent({
      channel: "lead",
      kind: "tool_result",
      toolName: "read_file",
      payload: JSON.stringify({ ok: false, error: "blocked by contract" }),
    }));
  });
  const plain = stripAnsi(output);

  assert.match(plain, /\[决策主脑\]\n\[result\] read_file failed: error: blocked by contract/);
});

test("runtime UI renders Chinese channel headers from the central identity map", async () => {
  const output = await captureStdout(async () => {
    const renderer = createRuntimeUiTerminalRenderer();
    renderer.render(createRuntimeUiEvent({ channel: "workflow", kind: "status", message: "loop" }));
    renderer.render(createRuntimeUiEvent({ channel: "subagent", kind: "status", message: "running" }));
    renderer.render(createRuntimeUiEvent({ channel: "team", kind: "status", message: "handoff" }));
    renderer.render(createRuntimeUiEvent({ channel: "background", kind: "status", message: "job active" }));
    renderer.render(createRuntimeUiEvent({ channel: "system", kind: "status", message: "notice" }));
  });
  const plain = stripAnsi(output);

  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.lead.label, "决策主脑");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.dream.label, "做梦");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.workflow.label, "工作流");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.subagent.label, "子代理");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.team.label, "队友");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.background.label, "后台");
  assert.equal(RUNTIME_UI_CHANNEL_IDENTITIES.system.label, "系统");
  assert.match(plain, /\[工作流\]\nloop/);
  assert.match(plain, /\[子代理\]\nrunning/);
  assert.match(plain, /\[队友\]\nhandoff/);
  assert.match(plain, /\[后台\]\njob active/);
  assert.match(plain, /\[系统\]\nnotice/);
});

test("runtime UI normalizes ecosystem aliases before display mapping", () => {
  assert.equal(normalizeRuntimeUiChannel("dreaming"), "dream");
  assert.equal(normalizeRuntimeUiChannel("workflow"), "workflow");
  assert.equal(normalizeRuntimeUiChannel("sub-agent"), "subagent");
  assert.equal(normalizeRuntimeUiChannel("teammate"), "team");
  assert.equal(normalizeRuntimeUiChannel("unknown"), "system");
});

test("runtime UI renders reasoning as low-emphasis dark text", async () => {
  const output = await captureStdout(async () => {
    const renderer = createRuntimeUiTerminalRenderer({
      showReasoning: true,
    });
    renderer.render(createRuntimeUiEvent({
      channel: "lead",
      kind: "reasoning",
      message: "thinking text",
    }));
  });
  const plain = stripAnsi(output);

  assert.match(plain, /\[决策主脑\]\n\[reasoning\]\nthinking text/);
});

function stripAnsi(value: string): string {
  return value.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, "");
}
