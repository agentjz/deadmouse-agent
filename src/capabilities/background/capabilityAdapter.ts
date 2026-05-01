import { createCapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import { executionPort } from "../ports.js";

export function getBackgroundCapabilityPackage(): CapabilityPackage {
  const profile = createCapabilityProfile({
    kind: "background",
    id: "background.command",
    name: "Lead-selected background command",
    description: "A background execution is a machine-run command selected by Lead for durable non-blocking work.",
    bestFor: ["long-running commands", "non-blocking local processes", "durable command observation"],
    notFor: ["automatic shell execution", "strategy decisions", "final closeout without Lead review"],
    inputSchema: "AssignmentContract plus explicit background_run tool arguments",
    outputSchema: "Execution record, progress/output artifacts, CloseoutContract, and WakeSignal",
    budgetPolicy: "High cost when long-running; Lead chooses timeout and whether background execution is worth it.",
    tools: ["background_run", "background_check", "background_terminate"],
    cost: "high",
    extensionPoint: "src/execution/background.ts",
  });

  return createCapabilityPackage({
    profile,
    source: {
      kind: "background",
      id: "background.command",
      path: "src/execution/background.ts",
      builtIn: true,
    },
    adapter: {
      kind: "background",
      id: "background.command.adapter",
      description: "Docks Lead-selected background command execution into the capability port.",
    },
    port: executionPort("background", {
      runner: {
        invocation: "Lead calls background_run with an explicit command assignment; runtime records process execution.",
      },
      permissionBoundary: {
        world: "Real World process lane",
        autonomy: "The command runs as requested; protocol observes process state and evidence without deciding strategy.",
        read: ["working directory", "process output", "execution ledger"],
        write: ["process artifacts", "execution records", "closeout records"],
        forbidden: ["machine-selected command startup", "implicit strategy delegation"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "background",
        streams: ["progress", "stdout", "stderr", "closeout"],
      },
      artifacts: [
        {
          kind: "execution",
          name: "background-execution",
          description: "Execution record for the background command.",
          required: true,
        },
        {
          kind: "log",
          name: "process-output",
          description: "Captured stdout and stderr from the background process.",
          required: false,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["execution status", "process output when available"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: "Durable background command execution with progress and execution-state reporting.",
  });
}
