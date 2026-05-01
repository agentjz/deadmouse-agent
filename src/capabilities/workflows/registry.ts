import { createCapabilityProfile, type CapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import { executionPort } from "../ports.js";
import { listDreamingLoopWorkflowCapabilityPackages } from "./dreamingLoop.js";

export interface WorkflowProfile extends CapabilityProfile {
  kind: "workflow";
  decisionOwner: "lead";
}

const BASE_WORKFLOW_PROFILE: WorkflowProfile = {
  ...createCapabilityProfile({
    kind: "workflow",
    id: "manual-lead-selected",
    name: "Manual Lead-selected workflow",
    description: "A workflow is a reusable work method offered to Lead; it never dispatches workers by itself.",
    bestFor: ["repeatable method", "multi-step work pattern", "Lead-selected loop skeleton"],
    notFor: ["machine-owned strategy", "automatic dispatch", "bypassing Lead review between steps"],
    inputSchema: "AssignmentContract selected by Lead",
    outputSchema: "CloseoutContract at each workflow handoff",
    budgetPolicy: "Medium cost; use when a repeatable method improves evidence and control.",
    tools: [],
    cost: "medium",
    extensionPoint: "src/capabilities/workflows/registry.ts",
  }),
  kind: "workflow",
  decisionOwner: "lead",
};

function listWorkflowProfiles(): WorkflowProfile[] {
  return [BASE_WORKFLOW_PROFILE];
}

export function listWorkflowCapabilityPackages(): CapabilityPackage[] {
  return [
    ...listWorkflowProfiles().map((profile) => createCapabilityPackage({
    packageId: `workflow.${profile.id}`,
    profile,
    source: {
      kind: "workflow",
      id: `workflow.${profile.id}`,
      path: "src/capabilities/workflows/registry.ts",
      builtIn: true,
    },
    adapter: {
      kind: "workflow",
      id: `workflow.${profile.id}.adapter`,
      description: "Docks Lead-selected workflow methods into the capability port.",
    },
    port: executionPort("workflow", {
      runner: {
        invocation: "Lead selects a workflow assignment; runtime records workflow progress and handoff points.",
      },
      permissionBoundary: {
        world: "Lead-selected workflow lane",
        autonomy: "Workflow owns method shape after Lead selection; protocol records stage evidence and handoffs.",
        read: ["assigned context", "workflow artifacts"],
        write: ["workflow progress", "workflow artifacts", "closeout records"],
        forbidden: ["automatic worker dispatch", "machine-owned strategy", "bypassing Lead review between handoffs"],
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
          name: "workflow-execution",
          description: "Execution record for the workflow run.",
          required: true,
        },
        {
          kind: "observation",
          name: "workflow-stage-evidence",
          description: "Stage evidence produced by the workflow.",
          required: false,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["stage evidence", "handoff status"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: profile.description,
    })),
    ...listDreamingLoopWorkflowCapabilityPackages(),
  ];
}
