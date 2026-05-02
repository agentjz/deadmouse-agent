import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildInternalWakeInput } from "../../src/agent/checkpoint.js";
import { SessionStore } from "../../src/agent/session.js";
import { runAgentTurn } from "../../src/agent/runTurn.js";
import { runManagedAgentTurn } from "../../src/agent/turn.js";
import { resolveRuntimeConfig } from "../../src/config/store.js";
import type { AgentIdentity } from "../../src/agent/types.js";
import type { ToolExecutionResult } from "../../src/types.js";
import {
  createCapturingToolRegistry,
  createFunctionTool,
  type JsonToolArgs,
} from "./live-api-harness.ts";

async function main(): Promise<void> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "Kitty-runtime-checkpoint-"));
  const resolved = await resolveRuntimeConfig({ cwd: process.cwd() });
  if (!resolved.apiKey) {
    throw new Error("Missing KITTY_API_KEY in .kitty/.env. Real API validation cannot run.");
  }

  const config = {
    ...resolved,
    allowedRoots: [workspace],
    yieldAfterToolSteps: 1,
    mcp: {
      ...resolved.mcp,
      enabled: false,
      servers: [],
    },
  };

  const sessionStore = new SessionStore(path.join(workspace, "sessions"));
  const phaseOneRegistry = createCheckpointRegistry(workspace);
  const phaseOneSession = await sessionStore.create(workspace);

  const phaseOneResult = await runAgentTurn({
    input: [
      "Runtime checkpoint real API validation.",
      "Overall goal: after the session is reloaded from disk, write validation/runtime-checkpoint-summary.md.",
      "That final markdown must say the checkpoint existed, the session resumed from disk, and capture_round2_checkpoint was not repeated in phase two.",
      "For this first phase only, call capture_round2_checkpoint exactly once and do not call any other tool in the first response.",
    ].join(" "),
    cwd: workspace,
    config,
    yieldAfterToolSteps: 1,
    session: phaseOneSession,
    sessionStore,
    toolRegistry: phaseOneRegistry,
  });

  const reloaded = await sessionStore.load(phaseOneResult.session.id);
  const checkpoint = reloaded.checkpoint;
  const checkpointStoragePath = checkpoint?.evidenceArtifacts?.find((artifact) =>
    artifact.toolName === "capture_round2_checkpoint" && artifact.storagePath
  )?.storagePath;
  const phaseTwoRegistry = createCheckpointRegistry(workspace);
  const runtimeIdentity: AgentIdentity = {
    kind: "teammate",
    name: "runtime-verifier",
    role: "checkpoint_runtime",
    teamName: "verification",
  };

  const phaseTwoResult = await runManagedAgentTurn({
    input: buildInternalWakeInput(runtimeIdentity),
    cwd: workspace,
    config: {
      ...config,
      yieldAfterToolSteps: 6,
    },
    session: reloaded,
    sessionStore,
    toolRegistry: phaseTwoRegistry,
    identity: runtimeIdentity,
  });

  const finalSession = await sessionStore.load(phaseTwoResult.session.id);
  const summaryPath = path.join(workspace, "validation", "runtime-checkpoint-summary.md");
  const summaryText = await fs.readFile(summaryPath, "utf8");
  const repeatedSetupInPhaseTwo = phaseTwoRegistry.calls.includes("capture_round2_checkpoint");

  console.log(JSON.stringify({
    workspace,
    model: config.model,
    baseUrl: config.baseUrl,
    sessionId: phaseOneResult.session.id,
    checkpointExists: Boolean(checkpoint?.objective),
    checkpointPhaseAfterPhaseOne: checkpoint?.flow?.phase ?? null,
    checkpointObjective: checkpoint?.objective ?? null,
    checkpointStoragePath,
    phaseOneYielded: phaseOneResult.yielded,
    phaseOneToolCalls: phaseOneRegistry.calls,
    reloadedFromDisk: reloaded.id === phaseOneResult.session.id,
    phaseTwoToolCalls: phaseTwoRegistry.calls,
    repeatedSetupInPhaseTwo,
    finalCheckpointStatus: finalSession.checkpoint?.status ?? null,
    summaryPath: path.relative(workspace, summaryPath),
    summaryPreview: summaryText.slice(0, 320),
  }, null, 2));

  if (!phaseOneResult.yielded) {
    throw new Error("Phase one did not yield after the checkpoint setup step.");
  }
  if (!checkpoint?.objective) {
    throw new Error("Checkpoint was not persisted into the reloaded session.");
  }
  if (!checkpointStoragePath) {
    throw new Error("Checkpoint did not keep the recoverable externalized artifact reference.");
  }
  if (!phaseOneRegistry.calls.includes("capture_round2_checkpoint")) {
    throw new Error("Phase one did not call capture_round2_checkpoint.");
  }
  if (repeatedSetupInPhaseTwo) {
    throw new Error("Phase two repeated capture_round2_checkpoint instead of resuming from the checkpoint.");
  }
  if (!phaseTwoRegistry.calls.includes("write_resume_summary")) {
    throw new Error("Phase two did not write validation/runtime-checkpoint-summary.md.");
  }
  if (!summaryText.trim()) {
    throw new Error("The final round2 resume summary file is empty.");
  }
}

function createCheckpointRegistry(workspace: string) {
  const setupMarkerPath = path.join(workspace, ".checkpoint-ready");

  return createCapturingToolRegistry(
    [
      createFunctionTool(
        "capture_round2_checkpoint",
        "One-time setup step for round2 validation. Call it exactly once before any resume summary is written. Never call it again after it has already succeeded.",
      ),
      createFunctionTool(
        "write_resume_summary",
        "Write validation/runtime-checkpoint-summary.md after capture_round2_checkpoint has already succeeded and the checkpoint has been reloaded from disk.",
        {
          path: { type: "string" },
          content: { type: "string" },
        },
        ["path", "content"],
      ),
    ],
    async (name, args) => {
      switch (name) {
        case "capture_round2_checkpoint":
          return captureCheckpoint(setupMarkerPath);
        case "write_resume_summary":
          return writeResumeSummary(workspace, setupMarkerPath, args);
        default:
          throw new Error(`Unexpected tool: ${name}`);
      }
    },
  );
}

async function captureCheckpoint(setupMarkerPath: string): Promise<ToolExecutionResult> {
  if (await exists(setupMarkerPath)) {
    return toolResult({
      ok: false,
      error: "capture_round2_checkpoint already completed for the current objective. Continue without repeating it.",
    }, false);
  }

  await fs.writeFile(setupMarkerPath, "ready\n", "utf8");
  return toolResult(buildLargeCheckpointPayload());
}

async function writeResumeSummary(
  workspace: string,
  setupMarkerPath: string,
  args: JsonToolArgs,
): Promise<ToolExecutionResult> {
  if (!(await exists(setupMarkerPath))) {
    return toolResult({
      ok: false,
      error: "capture_round2_checkpoint must succeed before write_resume_summary.",
    }, false);
  }

  const relativePath = args.path ?? "validation/runtime-checkpoint-summary.md";
  const absolutePath = path.resolve(workspace, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, args.content ?? "", "utf8");
  return toolResult({
    ok: true,
    path: path.relative(workspace, absolutePath) || relativePath,
    preview: (args.content ?? "").slice(0, 240),
  });
}

function buildLargeCheckpointPayload(): string {
  return JSON.stringify(
    {
      ok: true,
      title: "Round2 checkpoint artifact",
      path: "validation/round2-phase-one.json",
      format: "json",
      content: `ROUND2-REAL-API::${"R".repeat(24_000)}`,
      entries: Array.from({ length: 80 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        type: "file",
      })),
      matches: Array.from({ length: 6 }, (_, index) => ({
        path: `reports/chunk-${index}.md`,
        line: index + 1,
        text: `resume signal ${index + 1}`,
      })),
    },
    null,
    2,
  );
}

function toolResult(output: unknown, ok = true): ToolExecutionResult {
  return {
    ok,
    output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
  };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
