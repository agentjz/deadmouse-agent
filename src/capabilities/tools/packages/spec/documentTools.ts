import path from "node:path";

import {
  parseArgs,
  readPossiblyEmptyString,
  readString,
} from "../../core/shared.js";
import type { RegisteredTool } from "../../core/types.js";
import { SpecStore, summarizeSpec } from "../../../../spec/store.js";
import {
  readSpecDocumentName,
  SPEC_DOCUMENT_NAMES,
  specGovernance,
  specOk,
} from "./shared.js";

export const specWriteDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_write_document",
      description: "Write a spec document. The model owns the content; the harness only persists it.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          document: { type: "string", enum: [...SPEC_DOCUMENT_NAMES] },
          content: { type: "string" },
        },
        required: ["specId", "document", "content"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("write"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir);
    const specId = readString(args.specId, "specId");
    const document = readSpecDocumentName(args.document);
    const result = await store.writeDocument(
      specId,
      document,
      readPossiblyEmptyString(args.content, "content"),
    );
    return specOk({
      spec: summarizeSpec(result.state),
      document,
      path: path.relative(context.projectContext.rootDir, result.path),
    });
  },
};

export const specReadDocumentTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_read_document",
      description: "Read one spec document or all documents from a durable spec.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          document: { type: "string", enum: [...SPEC_DOCUMENT_NAMES] },
        },
        required: ["specId"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("read"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir);
    const specId = readString(args.specId, "specId");
    if (typeof args.document === "string") {
      const document = readSpecDocumentName(args.document);
      return specOk({ specId, document, content: await store.readDocument(specId, document) });
    }
    return specOk({ specId, documents: await store.readAllDocuments(specId) });
  },
};

export const specAppendNoteTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "spec_append_note",
      description: "Append a factual interview note to notes.md. The model owns what to record; the harness only appends it.",
      parameters: {
        type: "object",
        properties: {
          specId: { type: "string" },
          heading: { type: "string", description: "Short factual heading for this note entry." },
          content: {
            type: "string",
            description: "Factual note content, such as user answer, confirmed fact, unresolved question, or decision boundary.",
          },
        },
        required: ["specId", "content"],
        additionalProperties: false,
      },
    },
  },
  governance: specGovernance("write"),
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const store = new SpecStore(context.projectContext.stateRootDir);
    const result = await store.appendNote(readString(args.specId, "specId"), {
      heading: typeof args.heading === "string" ? args.heading : undefined,
      content: readPossiblyEmptyString(args.content, "content"),
    });
    return specOk({
      spec: summarizeSpec(result.state),
      document: "notes",
      path: path.relative(context.projectContext.rootDir, result.path),
    });
  },
};
