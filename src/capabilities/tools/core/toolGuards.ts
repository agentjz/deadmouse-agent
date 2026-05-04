import type { ToolRegistryEntry, ToolContext } from "./types.js";
import type { ToolExecutionResult } from "../../../types.js";

export async function runToolGuards(
  entry: Pick<ToolRegistryEntry, "name">,
  args: Record<string, unknown>,
  context: ToolContext,
): Promise<ToolExecutionResult | null> {
  void entry;
  void args;
  void context;
  return null;
}
