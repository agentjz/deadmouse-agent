import type { PromptLayers } from "../promptSections.js";

export function extendPromptLayersForTurnState(
  promptLayers: PromptLayers,
  consecutiveRequestFailures: number,
): PromptLayers {
  const nextRuntimeFactBlocks = [...promptLayers.runtimeFactBlocks];
  if (consecutiveRequestFailures > 0) {
    nextRuntimeFactBlocks.push(
      [
        "Provider request state:",
        `- Consecutive request failures in this turn: ${consecutiveRequestFailures}`,
      ].join("\n"),
    );
  }

  return {
    ...promptLayers,
    runtimeFactBlocks: nextRuntimeFactBlocks,
  };
}
