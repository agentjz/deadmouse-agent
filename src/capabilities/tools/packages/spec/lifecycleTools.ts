import path from "node:path";

import {
  parseArgs,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { getSpecPaths } from "../../../../spec/layout.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import { specGovernance, specOk } from "./shared.js";

export const specCreateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_create",
      description: "Create a new durable spec and bind it to the current session. Content decisions remain with the model.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Human-readable spec title." },
          summary: { type: "string", description: "Short factual summary if already known." },
        },
        required: ["title"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("state"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    });
    const state = await store.create({
      title: readString(args.title, "title"),
      summary: typeof args.summary === "string" ? args.summary : undefined,
      sessionId: context.sessionId,
    });
    return specOk({
      spec: summarizeSpec(state),
      directory: path.relative(context.projectContext.rootDir, getSpecPaths(context.projectContext.stateRootDir, state.id).specDir),
      workspace: state.workspace,
    });
  },
};

export const specOpenTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_open",
      description: "Open an existing spec and bind it to the current session.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string", description: "Spec id to open." },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("state"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir, {
      rootDir: context.projectContext.rootDir,
    });
    const specId = readString(args.specId, "specId");
    const state = await store.load(specId);
    await store.bindSession(context.sessionId, specId);
    const documents = await store.readAllDocuments(specId);
    return specOk({
      spec: summarizeSpec(state),
      workspace: state.workspace,
      documents,
    });
  },
};
