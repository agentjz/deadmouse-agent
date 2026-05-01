import { createCapabilityProfile, type CapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import { executionPort } from "../ports.js";

export interface DreamingLoopWorkflowProfile extends CapabilityProfile {
  kind: "workflow";
  decisionOwner: "lead";
}

const DREAMING_LOOP_WORKFLOW_PROFILE: DreamingLoopWorkflowProfile = {
  ...createCapabilityProfile({
    kind: "workflow",
    id: "dreaming-loop",
    name: "Dreaming Loop",
    description: "Lead-selected workflow for repeated Dreaming rounds with factual ledgers and Lead-owned continuation.",
    bestFor: [
      "multi-round mirror-world self-improvement",
      "timestamped Dreaming iteration ledgers",
      "Lead-reviewed continuation between Dreaming rounds",
    ],
    notFor: [
      "machine-decided continuation",
      "automatic Real World merge",
      "silent token spending without round artifacts",
    ],
    inputSchema: "Lead objective, scope, evaluator facts, and explicit next-round command",
    outputSchema: "Dreaming Loop ledger plus per-round Dreaming closeout",
    budgetPolicy: "High cost; Lead explicitly starts each round and reviews factual evidence before continuing.",
    tools: ["dreaming_loop_start", "dreaming_loop_next", "dreaming_loop_status"],
    cost: "high",
    extensionPoint: "src/capabilities/workflows/dreamingLoop.ts",
  }),
  kind: "workflow",
  decisionOwner: "lead",
};

export function getDreamingLoopWorkflowCapabilityPackage(): CapabilityPackage {
  const profile = DREAMING_LOOP_WORKFLOW_PROFILE;
  return createCapabilityPackage({
    packageId: "workflow.dreaming-loop",
    profile,
    source: {
      kind: "workflow",
      id: "workflow.dreaming-loop",
      path: "src/capabilities/workflows/dreamingLoop.ts",
      builtIn: true,
    },
    adapter: {
      kind: "workflow",
      id: "workflow.dreaming-loop.adapter",
      description: "Docks Dreaming Loop into the workflow capability port.",
    },
    port: executionPort("workflow", {
      runner: {
        invocation: "Lead selects Dreaming Loop; runtime records loop facts and launches only explicitly requested rounds.",
      },
      permissionBoundary: {
        world: "Dreaming Loop workflow lane",
        autonomy: "Dreaming Loop owns round bookkeeping only; Lead owns every continuation decision.",
        read: ["Dreaming Loop ledger", "Dreaming closeouts", "assigned objective"],
        write: ["Dreaming Loop state", "iteration ledger", "per-round execution references"],
        forbidden: ["machine-decided continuation", "automatic Dreaming round dispatch", "automatic Real World merge"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "workflow",
        streams: ["progress", "artifact", "closeout"],
      },
      artifacts: [
        {
          kind: "execution",
          name: "dreaming-loop-execution",
          description: "Workflow execution record for the Dreaming Loop run.",
          required: true,
        },
        {
          kind: "observation",
          name: "dreaming-loop-ledger",
          description: "Per-round factual ledger and Dreaming execution references.",
          required: true,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["round ledger", "Dreaming closeout facts", "handoff status"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: profile.description,
  });
}

export function listDreamingLoopWorkflowCapabilityPackages(): CapabilityPackage[] {
  return [getDreamingLoopWorkflowCapabilityPackage()];
}
