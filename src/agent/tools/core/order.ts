import type { ToolRegistryEntry } from "./types.js";

export function sortToolRegistryEntriesForExposure(entries: readonly ToolRegistryEntry[]): ToolRegistryEntry[] {
  return [...entries]
    .map((tool, index) => ({
      tool,
      index,
      rank: getExposureRank(tool),
    }))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.index - right.index;
    })
    .map((entry) => entry.tool);
}

function getExposureRank(entry: ToolRegistryEntry): number {
  if (entry.name === "read") {
    return 30;
  }

  if (entry.name === "edit") {
    return 31;
  }

  if (entry.name === "write") {
    return 32;
  }

  if (entry.name === "bash") {
    return 100;
  }

  if (entry.governance.specialty === "filesystem" && entry.governance.mutation === "read") {
    return 30;
  }

  if (entry.governance.specialty === "shell") {
    return 100;
  }

  return 50;
}
