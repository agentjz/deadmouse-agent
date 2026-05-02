import path from "node:path";

import { ChangeStore } from "../../src/changes/store.js";
import { createToolRegistry } from "../../src/capabilities/tools/index.js";
import type { FunctionToolDefinition, ToolContext, ToolRegistry } from "../../src/capabilities/tools/index.js";
import type { ProjectContext, RuntimeConfig, ToolExecutionResult } from "../../src/types.js";

export interface CapturedToolRegistry extends ToolRegistry {
  calls: string[];
}

export interface JsonToolArgs {
  path?: string;
  content?: string;
}

export function createCapturingToolRegistry(
  definitions: FunctionToolDefinition[],
  executeTool: (name: string, args: JsonToolArgs) => Promise<ToolExecutionResult>,
): CapturedToolRegistry {
  const calls: string[] = [];

  return {
    calls,
    definitions,
    async execute(name: string, rawArgs: string, _context: ToolContext): Promise<ToolExecutionResult> {
      calls.push(name);
      return executeTool(name, parseJsonToolArgs(rawArgs));
    },
    async close(): Promise<void> {
      return;
    },
  };
}

export function createFunctionTool(
  name: string,
  description: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
): FunctionToolDefinition {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties,
        required,
        additionalProperties: false,
      },
    },
  };
}

export function parseJsonToolArgs(rawArgs: string): JsonToolArgs {
  if (!rawArgs.trim()) {
    return {};
  }

  const parsed = JSON.parse(rawArgs) as Record<string, unknown>;
  return {
    path: typeof parsed.path === "string" ? parsed.path : undefined,
    content: typeof parsed.content === "string" ? parsed.content : undefined,
  };
}

export function createMinimalToolContext(input: {
  config: RuntimeConfig;
  cwd: string;
  projectContext: ProjectContext;
  sessionId: string;
}) {
  return {
    config: input.config,
    cwd: input.cwd,
    sessionId: input.sessionId,
    identity: {
      kind: "lead" as const,
      name: "lead",
    },
    projectContext: input.projectContext,
    changeStore: new ChangeStore(input.config.paths.changesDir),
    createToolRegistry,
  };
}

export async function writeWorkspaceFile(
  workspace: string,
  relativePath: string,
  content: string,
  writeFile: (absolutePath: string, content: string) => Promise<void>,
): Promise<string> {
  const absolutePath = path.resolve(workspace, relativePath);
  await writeFile(absolutePath, content);
  return absolutePath;
}
