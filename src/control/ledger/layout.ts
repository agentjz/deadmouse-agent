import { ensureProjectStateDirectories } from "../../project/statePaths.js";
import type { ProjectStatePaths } from "../../project/statePaths.js";

export async function prepareControlPlaneLayout(rootDir: string): Promise<ProjectStatePaths> {
  return ensureProjectStateDirectories(rootDir);
}
