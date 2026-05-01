import { createCapabilityPackage } from "../../protocol/package.js";
import { createCapabilityProfile } from "../../protocol/capability.js";
import { executionPort } from "../ports.js";

export function getDreamingCapabilityPackage() {
  return createCapabilityPackage({
    profile: createCapabilityProfile({
      kind: "external_agent",
      id: "dreaming",
      name: "Dreaming",
      description: "Autonomous mirror-world self-improvement ecology selected by Lead.",
      bestFor: [
        "long-running self-improvement in a mirror world",
        "architecture experiments that must not modify the real world",
        "candidate improvements that require evidence and a merge proposal",
      ],
      notFor: [
        "automatic startup without Lead selection",
        "direct real-world source modification",
        "silent background work without observable execution stream",
      ],
      inputSchema: "AssignmentContract plus explicit dreaming_start runtime bounds",
      outputSchema: "CloseoutContract with mirror-world artifacts and merge proposal",
      budgetPolicy: "High cost; Lead sets runtime and verification expectations before dispatch.",
      tools: ["dreaming_start"],
      cost: "high",
      extensionPoint: "src/capabilities/dreaming",
    }),
    source: {
      kind: "external_agent",
      id: "dreaming",
      path: "src/capabilities/dreaming",
      builtIn: true,
    },
    adapter: {
      kind: "external_agent",
      id: "dreaming.adapter",
      description: "Adapts Lead-selected Dreaming into the generic execution protocol.",
    },
    port: executionPort("dreaming", {
      runner: {
        invocation: "Lead calls dreaming_start; runtime launches the Mirror World runner and foreground stream.",
        leadWaitPolicy: {
          lead: "while_execution_active",
          wake: "required",
          scope: "objective",
        },
      },
      permissionBoundary: {
        world: "Mirror World",
        autonomy: "Dreaming owns its internal exploration loop inside Mirror World; protocol only governs docking, evidence, closeout, and wake.",
        read: ["Real World project files", "Mirror World files", "configured external references"],
        write: ["Mirror World only", "Dreaming artifacts", "merge proposal artifacts"],
        forbidden: ["direct Real World source mutation", "automatic Real World merge", "machine-selected startup"],
      },
      foregroundOutput: {
        mode: "foreground_stream",
        sink: "runtime-ui",
        section: "dream",
        streams: ["stdout", "stderr", "progress", "closeout"],
      },
      artifacts: [
        {
          kind: "execution",
          name: "mirror-world-execution",
          description: "Execution record for the Dreaming run.",
          required: true,
        },
        {
          kind: "file",
          name: "merge-proposal",
          description: "Candidate Real World merge proposal produced from Mirror World evidence.",
          required: true,
        },
        {
          kind: "log",
          name: "foreground-stream",
          description: "Foreground Dreaming stream captured as runtime evidence.",
          required: false,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["mirror world path", "real world unchanged statement", "artifacts", "merge proposal"],
        mergeProposal: "required",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: "Dreaming runs as a foreground-streamed mirror-world execution. Real World remains unchanged; Dreaming can change only Mirror World until the user approves a later merge.",
  });
}
