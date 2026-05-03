import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { SessionStore } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { buildInternalWakeInput } from "../../src/agent/checkpoint.js";
import { createToolRegistry, createToolSource } from "../../src/capabilities/tools/index.js";
import { createSpecTools } from "../../src/capabilities/tools/packages/spec/specTools.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import { loadSpecRuntime } from "../../src/spec/runtime.js";
import { SpecStore } from "../../src/spec/store.js";

const FEATURE_MARKER = "SPEC-LIVE-WEB-SHELL-0513";

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-spec-mode-api-"));
  await initGitRepo(workspace);
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    paths: {
      ...resolved.paths,
      sessionsDir: path.join(workspace, ".kitty", "sessions"),
      changesDir: path.join(workspace, ".kitty", "changes"),
    },
    yieldAfterToolSteps: 3,
    contextWindowMessages: 8,
    maxContextChars: 12_000,
    contextSummaryChars: 1_800,
    maxToolIterations: 6,
    maxContinuationBatches: 2,
    maxOutputTokens: Math.min(resolved.maxOutputTokens ?? 1_800, 1_800),
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.create(workspace);
  const registry = createToolRegistry({
    onlyNames: [
      "spec_create",
      "spec_open",
      "spec_update_state",
      "spec_write_document",
      "spec_read_document",
      "spec_checkpoint_create",
      "spec_checkpoint_list",
      "spec_task_update",
    ],
    sources: [createToolSource("host", "production-line:spec", createSpecTools())],
  });

  for (let round = 1; round <= 4; round += 1) {
    const specRuntime = await loadSpecRuntime({ cwd: workspace, sessionId: session.id });
    const input = buildRoundInput(round);
    const result = await runAgentTurn({
      input,
      cwd: specRuntime.cwd,
      config,
      session,
      sessionStore,
      toolRegistry: registry,
      runtimePromptState: {
        mode: "spec",
        extraStaticBlocks: [specRuntime.promptBlock],
      },
      yieldAfterToolSteps: 3,
      callbacks: {
        onStatus(text) {
          console.log(`[spec-mode-api] ${text}`);
        },
      },
    });
    session = result.session;
    if (!result.yielded) {
      break;
    }
  }

  await registry.close?.();
  const store = new SpecStore(workspace, { rootDir: workspace });
  const binding = await store.loadSessionBinding(session.id);
  if (!binding) {
    throw new Error("Spec mode did not bind a durable spec to the current session.");
  }

  const spec = await store.load(binding.specId);
  const searchResults = await store.search("local developer web shell", 5);
  if (!searchResults.some((item) => item.id === spec.id)) {
    throw new Error("Spec mode did not make the durable spec discoverable by its saved documents.");
  }
  const documents = await store.readAllDocuments(spec.id);
  const checkpoints = await store.listCheckpoints(spec.id);
  const output = {
    workspace,
    model: config.model,
    sessionId: session.id,
    spec,
    documentsPreview: {
      requirements: documents.requirements.slice(0, 800),
      design: documents.design.slice(0, 500),
      tasks: documents.tasks.slice(0, 500),
      notes: documents.notes.slice(0, 500),
    },
    checkpointCount: checkpoints.length,
    checkpoints,
  };

  console.log(JSON.stringify(output, null, 2));
  assertSpecResult(spec, documents, checkpoints.length);
}

function buildRoundInput(round: number): string {
  if (round === 1) {
    return [
      `Run a real spec-mode validation for ${FEATURE_MARKER}.`,
      "Create or use a durable spec for a new local developer Web shell feature.",
      "Do not implement application code.",
      "Act as if the user has already answered these requirement clarifications:",
      "Audience: local developer only.",
      "Primary value: inspect and drive the existing Kitty agent from a browser.",
      "Security boundary: local machine only, no public exposure.",
      "Persist progress using spec tools.",
      "Write a concise requirements document, mark requirements confirmed, and create a checkpoint.",
    ].join(" ");
  }

  if (round === 2) {
    return [
      "Continue the active spec in this same session.",
      "Requirements are confirmed.",
      "Write a concise design document for the local-only Web shell.",
      "Update the spec stage to design and create a design checkpoint.",
      "Do not implement code.",
    ].join(" ");
  }

  if (round === 3) {
    return [
      "Continue the active spec in this same session.",
      "Treat the design as accepted for this production-line validation.",
      "Mark design confirmed, write a concise tasks document with markdown checkboxes, update the stage to tasks, and create a tasks checkpoint.",
      "Do not implement code.",
    ].join(" ");
  }

  return buildInternalWakeInput({
    kind: "teammate",
    name: "spec-mode-verifier",
    role: "production_line",
    teamName: "spec",
  });
}

function assertSpecResult(
  spec: Awaited<ReturnType<SpecStore["load"]>>,
  documents: Awaited<ReturnType<SpecStore["readAllDocuments"]>>,
  checkpointCount: number,
): void {
  const combined = [
    spec.title,
    spec.summary ?? "",
    documents.requirements,
    documents.design,
    documents.tasks,
    documents.notes,
  ].join("\n");

  if (!/local/i.test(combined) || !/web shell|browser/i.test(combined)) {
    throw new Error("Durable spec documents did not preserve the requested local web shell feature.");
  }
  if (!spec.confirmed.requirements) {
    throw new Error("Spec mode did not persist requirements confirmation.");
  }
  if (!["tasks", "implement", "validate", "archive"].includes(spec.stage)) {
    throw new Error(`Spec mode did not advance to tasks or later after confirmation. Stage=${spec.stage}`);
  }
  if (!documents.requirements.includes("local") && !documents.requirements.includes("本机")) {
    throw new Error("Requirements document did not record the local developer boundary.");
  }
  if (checkpointCount < 1) {
    throw new Error("Spec mode did not create a durable checkpoint.");
  }
  if (!spec.workspace?.path || !spec.workspace.branch) {
    throw new Error("Spec mode did not bind the spec to an isolated git worktree.");
  }
  if (!documents.design.trim()) {
    throw new Error("Spec mode did not write design.md.");
  }
  if (!documents.tasks.trim()) {
    throw new Error("Spec mode did not write tasks.md.");
  }
}

async function initGitRepo(root: string): Promise<void> {
  execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Kitty Spec API"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "kitty-spec-api@example.com"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["config", "core.filemode", "false"], { cwd: root, stdio: "ignore" });
  await fs.writeFile(path.join(root, "README.md"), "# spec api workspace\n", "utf8");
  execFileSync("git", ["add", "README.md"], { cwd: root, stdio: "ignore" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: root, stdio: "ignore" });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
