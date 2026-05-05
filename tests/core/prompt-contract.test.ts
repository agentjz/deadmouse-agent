import assert from "node:assert/strict";
import test from "node:test";

import { buildStaticPromptBlocks } from "../../src/agent/prompt/static.js";
import { createTestRuntimeConfig } from "./helpers.js";

test("static prompt describes a minimal four-tool coding workbench", () => {
  const root = process.cwd();
  const prompt = buildStaticPromptBlocks({
    config: createTestRuntimeConfig(root),
    runtimeState: {
      identity: {
        kind: "lead",
        name: "lead",
      },
    },
    projectContext: {
      rootDir: root,
      stateRootDir: root,
      cwd: root,
      instructions: [],
      instructionText: "",
      instructionTruncated: false,
      ignoreRules: [],
    },
  }).join("\n");

  assert.match(prompt, /read, edit, write, and bash/);
  assert.match(prompt, /bash locate facts -> read focused file windows -> edit\/write -> bash git diff\/test/);
  assert.doesNotMatch(prompt, /extra default tools/i);
});
