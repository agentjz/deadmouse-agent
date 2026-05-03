import {
  parseArgs,
  readOptionalNumber,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { SpecStore } from "../../../../spec/store.js";
import { specGovernance, specOk } from "./shared.js";

export const specListTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_list",
      description: "List durable specs as a read-only index. This does not choose relevance or inject a spec automatically.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum specs to list." },
        },
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("read"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const specs = await new SpecStore(context.projectContext.stateRootDir).list(readOptionalNumber(args.limit) ?? 20);
    return specOk({ specs });
  },
};

export const specSearchTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_search",
      description: "Search durable specs by title, summary, and document text. Use when the user asks to continue or inspect a previous spec.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
          limit: { type: "number", description: "Maximum specs to return." },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("read"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const specs = await new SpecStore(context.projectContext.stateRootDir).search(
      readString(args.query, "query"),
      readOptionalNumber(args.limit) ?? 20,
    );
    return specOk({ specs });
  },
};

