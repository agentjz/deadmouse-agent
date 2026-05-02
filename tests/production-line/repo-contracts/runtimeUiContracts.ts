import { lineNumberAt, normalizePath } from "./files.ts";
import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

const FORBIDDEN_RUNTIME_TAGS = [
  /\[lead\]/i,
  /\[dream\]/i,
  /\[subagent\]/i,
  /\[team\]/i,
  /\[workflow\]/i,
  /\[background\]/i,
];

export async function scanRuntimeUiStringResidue({ contents }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const findings: RepoContractFinding[] = [];
  for (const [file, content] of contents) {
    const normalized = normalizePath(file);
    if (!normalized.startsWith("src/") || normalized.startsWith("src/runtime-ui/")) {
      continue;
    }
    for (const pattern of FORBIDDEN_RUNTIME_TAGS) {
      const match = pattern.exec(content);
      if (match) {
        findings.push({
          file,
          line: lineNumberAt(content, match.index),
          message: "runtime terminal identity labels must be rendered through src/runtime-ui.",
        });
      }
    }
  }
  return findings;
}
