import { loadProjectContext } from "../context/projectContext.js";
import type { RegisteredTool } from "../capabilities/tools/core/types.js";
import { createSpecTools } from "../capabilities/tools/packages/spec/specTools.js";
import { buildSpecModePromptBlock } from "./prompt.js";
import { SpecStore } from "./store.js";
import type { SpecState } from "./types.js";

export interface SpecRuntime {
  activeSpec: SpecState | null;
  cwd: string;
  stateRootDir: string;
  promptBlock: string;
  tools: readonly RegisteredTool[];
}

export async function loadSpecRuntime(input: {
  cwd: string;
  sessionId: string;
}): Promise<SpecRuntime> {
  const projectContext = await loadProjectContext(input.cwd);
  const store = new SpecStore(projectContext.stateRootDir, {
    rootDir: projectContext.rootDir,
  });
  const binding = await store.loadSessionBinding(input.sessionId);
  const activeSpec = binding ? await store.load(binding.specId).catch(() => null) : null;
  return {
    activeSpec,
    cwd: activeSpec?.workspace?.path ?? input.cwd,
    stateRootDir: projectContext.stateRootDir,
    promptBlock: buildSpecModePromptBlock(activeSpec),
    tools: createSpecTools(),
  };
}
