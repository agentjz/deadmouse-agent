import process from "node:process";

import { listTextFiles, readTextFileMap } from "./repo-contracts/files.ts";
import { REPO_CONTRACTS } from "./repo-contracts/index.ts";
import type { RepoContractReportedFinding } from "./repo-contracts/types.ts";

const ROOT = process.cwd();
const CHECK_ROOTS = ["src", "tests", "spec", "scripts"];

async function main() {
  const files = await listTextFiles(ROOT, CHECK_ROOTS);
  const contents = await readTextFileMap(ROOT, files);
  const findings: RepoContractReportedFinding[] = [];

  for (const contract of REPO_CONTRACTS) {
    const result = await contract.scan({ root: ROOT, files, contents });
    for (const finding of result) {
      findings.push({
        contract: contract.id,
        description: contract.description,
        ...finding,
      });
    }
  }

  if (findings.length > 0) {
    console.error("repository contracts: failed");
    for (const finding of findings) {
      console.error(`- ${finding.contract}: ${finding.file ?? "repository"}${finding.line ? `:${finding.line}` : ""}`);
      console.error(`  ${finding.message}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`repository contracts: passed (${REPO_CONTRACTS.length} checks, ${files.length} files)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
