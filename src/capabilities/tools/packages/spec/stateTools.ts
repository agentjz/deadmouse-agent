import {
  parseArgs,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import {
  readSpecStage,
  readSpecStatus,
  SPEC_STAGES,
  SPEC_STATUSES,
  specGovernance,
  specOk,
} from "./shared.js";

export const specUpdateStateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_update_state",
      description: "Persist factual spec state: stage, status, confirmation flags, title, or short summary. This tool does not decide what the state should be.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          title: { type: "string" },
          summary: { type: "string" },
          stage: { type: "string", enum: [...SPEC_STAGES] },
          status: { type: "string", enum: [...SPEC_STATUSES] },
          requirementsConfirmed: { type: "boolean" },
          designConfirmed: { type: "boolean" },
          tasksConfirmed: { type: "boolean" },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("state"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const confirmed = {
      ...(typeof args.requirementsConfirmed === "boolean" ? { requirements: args.requirementsConfirmed } : {}),
      ...(typeof args.designConfirmed === "boolean" ? { design: args.designConfirmed } : {}),
      ...(typeof args.tasksConfirmed === "boolean" ? { tasks: args.tasksConfirmed } : {}),
    };
    const state = await new SpecStore(context.projectContext.stateRootDir).updateState(
      readString(args.specId, "specId"),
      {
        title: typeof args.title === "string" ? args.title : undefined,
        summary: typeof args.summary === "string" ? args.summary : undefined,
        stage: typeof args.stage === "string" ? readSpecStage(args.stage) : undefined,
        status: typeof args.status === "string" ? readSpecStatus(args.status) : undefined,
        confirmed,
        sessionId: context.sessionId,
      },
    );
    return specOk({ spec: summarizeSpec(state), confirmed: state.confirmed });
  },
};

