import type { ChangeStore } from "../changes/store.js";
import { createToolRegistry } from "../../tools/index.js";
import type { ToolRegistry } from "../../tools/core/types.js";
import type {
  ProjectContext,
  SessionRecord,
  ToolCallRecord,
  ToolExecutionResult,
} from "../../types.js";
import type { RunTurnOptions } from "../types.js";
import { executeToolCallWithRecovery } from "./toolExecutor.js";

interface BatchExecutionItem {
  toolCall: ToolCallRecord;
  result: ToolExecutionResult;
  durationMs: number;
}

export interface ExecuteToolBatchResult {
  session: SessionRecord;
  items: BatchExecutionItem[];
}

export async function executeToolBatch(
  params: {
    session: SessionRecord;
    toolCalls: ToolCallRecord[];
    toolRegistry: ToolRegistry;
    options: RunTurnOptions;
    projectContext: ProjectContext;
    changeStore: ChangeStore;
  },
): Promise<ExecuteToolBatchResult> {
  const items: BatchExecutionItem[] = [];

  for (const toolCall of params.toolCalls) {
    const startedAt = Date.now();
    const result = await executeToolCallWithRecovery(
      params.toolRegistry as ReturnType<typeof createToolRegistry>,
      toolCall,
      params.options,
      params.session,
      params.projectContext,
      params.changeStore,
    );
    items.push({
      toolCall,
      result,
      durationMs: Date.now() - startedAt,
    });
  }

  return {
    session: params.session,
    items,
  };
}
