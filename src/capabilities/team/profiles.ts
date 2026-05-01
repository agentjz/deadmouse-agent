import { createAssignmentContract, formatAssignmentContract } from "../../protocol/assignment.js";
import { createCapabilityProfile } from "../../protocol/capability.js";
import { formatCloseoutInstruction } from "../../protocol/closeout.js";
import { createCapabilityPackage, formatCapabilityPackageForLead, type CapabilityPackage } from "../../protocol/package.js";
import { executionPort } from "../ports.js";

const TEAM_CAPABILITY_PROFILE = createCapabilityProfile({
  kind: "team",
  id: "team.teammate",
  name: "Lead-selected teammate",
  description: "A teammate is a longer-running collaborator selected and instructed by Lead for a concrete task slice.",
  bestFor: ["parallel research", "independent review", "long-running collaboration"],
  notFor: ["automatic dispatch", "final user-facing closeout without Lead review"],
  inputSchema: "AssignmentContract created by Lead through spawn_teammate",
  outputSchema: "CloseoutContract returned to Lead",
  budgetPolicy: "High cost; use when parallel perspective or longer collaboration is worth it.",
  tools: [],
  cost: "high",
  extensionPoint: "src/capabilities/team/profiles.ts",
});

export function getTeamCapabilityPackage(): CapabilityPackage {
  return createCapabilityPackage({
    profile: TEAM_CAPABILITY_PROFILE,
    source: {
      kind: "team",
      id: "team.teammate",
      path: "src/capabilities/team/profiles.ts",
      builtIn: true,
    },
    adapter: {
      kind: "agent",
      id: "team.teammate.adapter",
      description: "Docks Lead-selected teammates into the capability port.",
    },
    port: executionPort("worker", {
      runner: {
        invocation: "Lead calls spawn_teammate with AssignmentContract fields; runtime starts a teammate worker.",
      },
      permissionBoundary: {
        world: "Assigned teammate execution lane",
        autonomy: "Teammate owns its assigned work slice and returns evidence; Lead owns final judgment.",
        read: ["assigned context", "allowed project evidence"],
        write: ["assigned execution artifacts", "closeout records"],
        forbidden: ["final user closeout ownership", "machine-selected dispatch", "dispatching strategy for Lead"],
      },
      foregroundOutput: {
        mode: "inline_events",
        sink: "runtime-ui",
        section: "team",
        streams: ["progress", "closeout"],
      },
      artifacts: [
        {
          kind: "execution",
          name: "teammate-execution",
          description: "Execution record for the teammate assignment.",
          required: true,
        },
        {
          kind: "observation",
          name: "teammate-evidence",
          description: "Evidence and findings returned by the teammate.",
          required: false,
        },
      ],
      closeout: {
        required: true,
        contract: "CloseoutContract",
        requiredEvidence: ["evidence", "risks", "next Lead suggestion"],
        mergeProposal: "none",
      },
      wake: {
        required: true,
        reasons: ["completed", "failed", "aborted", "paused", "budget_exhausted"],
      },
    }),
    availability: "Longer-running collaborator with a named role and independent context.",
  });
}

export function buildTeammateAssignment(input: {
  name: string;
  role: string;
  objective: string;
  scope: string;
  expectedOutput: string;
  assignment?: ReturnType<typeof createAssignmentContract>;
}): string {
  const assignment = input.assignment ?? createAssignmentContract({
    capabilityId: TEAM_CAPABILITY_PROFILE.id,
    objective: input.objective,
    scope: input.scope,
    expectedOutput: input.expectedOutput,
    createdBy: "lead",
  });
  return [
    formatCapabilityPackageForLead(getTeamCapabilityPackage()),
    formatAssignmentContract(assignment),
    `teammate: ${input.name}`,
    `role: ${input.role}`,
    "Detailed instructions:",
    input.objective.trim(),
    formatCloseoutInstruction(),
  ].join("\n\n");
}
