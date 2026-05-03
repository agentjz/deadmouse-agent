import {
  parseArgs,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import {
  readSpecTaskStatus,
  SPEC_TASK_STATUSES,
  specGovernance,
  specOk,
} from "./shared.js";

export const specTaskUpdateTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_task_update",
      description: "Persist factual task progress for the active spec. The model decides which task changed.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          taskId: { type: "string" },
          title: { type: "string" },
          status: { type: "string", enum: [...SPEC_TASK_STATUSES] },
          evidence: { type: "string" },
          checkpointLabel: { type: "string", description: "Optional checkpoint label to create after this task update." },
        },
        required: ["specId", "taskId", "status"],
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
    const taskId = readString(args.taskId, "taskId");
    const state = await store.updateTask(
      readString(args.specId, "specId"),
      taskId,
      {
        title: typeof args.title === "string" ? args.title : undefined,
        status: readSpecTaskStatus(readString(args.status, "status")),
        evidence: typeof args.evidence === "string" ? args.evidence : undefined,
      },
    );
    let checkpoint;
    if (typeof args.checkpointLabel === "string" && args.checkpointLabel.trim()) {
      checkpoint = await store.createCheckpoint(state.id, { label: args.checkpointLabel });
    }
    return specOk({ spec: summarizeSpec(state), task: state.tasks[taskId], checkpoint });
  },
};
