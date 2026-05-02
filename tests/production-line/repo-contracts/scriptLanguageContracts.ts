import path from "node:path";

import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

export async function scanScriptLanguageResidue({ files }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const findings: RepoContractFinding[] = [];
  for (const file of files) {
    if (!file.startsWith("scripts/")) {
      continue;
    }

    const extension = path.extname(file);
    if (extension === ".js" || extension === ".mjs") {
      findings.push({
        file,
        message: "Node repository scripts must be TypeScript. Use .ts and run through tsx.",
      });
    }
  }
  return findings;
}
