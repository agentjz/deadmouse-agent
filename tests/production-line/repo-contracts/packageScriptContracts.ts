import fs from "node:fs/promises";
import path from "node:path";

import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

interface PackageJsonShape {
  scripts?: Record<string, string>;
}

export async function scanPackageScripts({ root }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")) as PackageJsonShape;
  const scripts = packageJson.scripts ?? {};
  const findings: RepoContractFinding[] = [];

  if (scripts.verify !== "npm run verify:repo-contracts && npm test") {
    findings.push({
      file: "package.json",
      message: "scripts.verify must be the standard repository verification entry: npm run verify:repo-contracts && npm test",
    });
  }
  if (scripts["verify:repo-contracts"] !== "tsx tests/production-line/verify-repo-contracts.ts") {
    findings.push({
      file: "package.json",
      message: "scripts.verify:repo-contracts must run tests/production-line/verify-repo-contracts.ts through tsx.",
    });
  }
  if (scripts.sync !== "tsx tests/production-line/sync-generated.ts") {
    findings.push({
      file: "package.json",
      message: "scripts.sync must run the standard generated artifact sync entry.",
    });
  }
  if (scripts["verify:generated"] !== "tsx tests/production-line/verify-generated.ts") {
    findings.push({
      file: "package.json",
      message: "scripts.verify:generated must run the standard generated artifact check entry.",
    });
  }
  return findings;
}
