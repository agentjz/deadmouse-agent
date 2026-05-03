import {
  parseArgs,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { specGovernance, specOk } from "./shared.js";

export const specCheckpointCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_create",
      description: "Create a durable recovery checkpoint for the current spec state and documents.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          label: { type: "string" },
          reason: { type: "string" },
        },
        required: ["specId", "label"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("state"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const checkpoint = await new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    }).createCheckpoint(
      readString(args.specId, "specId"),
      {
        label: readString(args.label, "label"),
        reason: typeof args.reason === "string" ? args.reason : undefined,
      },
    );
    return specOk({ checkpoint });
  },
};

export const specCheckpointListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_list",
      description: "List recovery checkpoints for a spec.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("read"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const checkpoints = await new SpecStore(context.projectContext.stateRootDir).listCheckpoints(
      readString(args.specId, "specId"),
    );
    return specOk({ checkpoints });
  },
};

export const specCheckpointRestoreTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_checkpoint_restore",
      description: "Restore a spec state and documents from a checkpoint after the model decides this is the right user-requested revision path.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          checkpointId: { type: "string" },
        },
        required: ["specId", "checkpointId"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("write"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const state = await new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    }).restoreCheckpoint(
      readString(args.specId, "specId"),
      readString(args.checkpointId, "checkpointId"),
    );
    return specOk({ spec: summarizeSpec(state) });
  },
};
