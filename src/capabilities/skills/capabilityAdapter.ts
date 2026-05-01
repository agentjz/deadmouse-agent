import { createCapabilityProfile } from "../../protocol/capability.js";
import { createCapabilityPackage, type CapabilityPackage } from "../../protocol/package.js";
import { nonExecutionPort } from "../ports.js";
import type { LoadedSkill } from "./types.js";

export function listSkillCapabilityPackages(skills: readonly LoadedSkill[]): CapabilityPackage[] {
  return skills.map((skill) => {
    const profile = createCapabilityProfile({
      kind: "skill",
      id: `skill.${skill.name}`,
      name: skill.name,
      description: skill.description || `Project skill ${skill.name}`,
      bestFor: [
        ...skill.taskTypes.map((item) => `task:${item}`),
        ...skill.scenes.map((item) => `scene:${item}`),
        ...skill.triggers.keywords.slice(0, 5).map((item) => `keyword:${item}`),
      ],
      notFor: ["automatic route changes", "bypassing explicit load_skill", "machine-owned strategy"],
      inputSchema: "AssignmentContract plus explicit load_skill when Lead chooses the skill",
      outputSchema: "CloseoutContract through the tool or execution path that uses the skill",
      budgetPolicy: "Load only when Lead judges the skill relevant.",
      tools: [...skill.tools.required, ...skill.tools.optional],
      cost: "low",
      extensionPoint: skill.path,
    });

    return createCapabilityPackage({
      packageId: profile.id,
      profile,
      source: {
        kind: "skill",
        id: profile.id,
        path: skill.path,
        builtIn: false,
      },
      adapter: {
        kind: "skill",
        id: `${profile.id}.adapter`,
        description: "Docks a discovered skill into the capability port.",
      },
      port: nonExecutionPort("skill_load", {
        runner: {
          invocation: "Lead calls load_skill explicitly; runtime exposes the skill body as context evidence.",
        },
        permissionBoundary: {
          world: "Lead context lane",
          autonomy: "Skill contributes method context only; the active model still owns judgment.",
          read: [skill.path],
          write: ["runtime context evidence"],
          forbidden: ["automatic skill loading", "route-changing machine strategy"],
        },
        foregroundOutput: {
          mode: "silent",
          sink: "runtime-ui",
          section: "skill",
          streams: ["tool"],
        },
        artifacts: [
          {
            kind: "observation",
            name: "skill-context",
            description: "Loaded skill body exposed as runtime evidence.",
            required: false,
          },
        ],
        closeout: {
          required: false,
          contract: "CloseoutContract",
          requiredEvidence: [],
          mergeProposal: "none",
        },
        wake: {
          required: false,
          reasons: [],
        },
      }),
      availability: skill.description || `Skill body available through explicit load_skill: ${skill.name}.`,
    });
  });
}
