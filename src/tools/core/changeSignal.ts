import { ToolExecutionError } from "./errors.js";
import type { ToolRegistryEntry } from "./types.js";
import type { ToolExecutionResult } from "../../types.js";

export function validateToolChangeSignal(
  entry: Pick<ToolRegistryEntry, "name" | "changeSignal">,
  result: ToolExecutionResult,
): ToolExecutionResult {
  if (!result.ok || !entry.changeSignal) {
    return result;
  }

  const changedPaths = result.metadata?.changedPaths?.length ?? 0;
  if (entry.changeSignal === "required" && changedPaths === 0) {
    throw new ToolExecutionError(
      `${entry.name} must emit changedPaths metadata.`,
      { code: "CHANGE_SIGNAL_REQUIRED", details: { toolName: entry.name } },
    );
  }

  if (entry.changeSignal === "none" && changedPaths > 0) {
    throw new ToolExecutionError(
      `${entry.name} emitted changedPaths metadata even though it is marked as non-changing.`,
      { code: "CHANGE_SIGNAL_FORBIDDEN", details: { toolName: entry.name } },
    );
  }

  return result;
}
