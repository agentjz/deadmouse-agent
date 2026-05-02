import { diagnoseLiveEcologyInventory, loadLiveEcologyGroups } from "../live-ecology/groups.ts";
import { listRegisteredTools } from "../readme-capabilities/core.ts";
import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

export async function scanLiveEcologyInventory({ root }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const registeredTools = await listRegisteredTools(root);
  const groups = await loadLiveEcologyGroups(root);
  const findings = diagnoseLiveEcologyInventory([...registeredTools], groups);

  return findings.map((finding) => ({
    file: "spec/用户审阅/capability-ecology.json",
    message: `live ecology inventory ${finding.kind}: ${finding.tool}`,
  }));
}
