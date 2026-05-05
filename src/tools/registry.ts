import { createRuntimeToolRegistry } from "../tools/core/runtimeRegistry.js";
import type { RuntimeConfig } from "../types.js";
import { AGENT_CORE_TOOL_NAMES } from "./index.js";

export function createDefaultAgentToolRegistry(config: RuntimeConfig) {
  // Default Coding exposes only the foundation tools. Other product surfaces may opt into extension sources explicitly.
  return createRuntimeToolRegistry(config, { onlyNames: AGENT_CORE_TOOL_NAMES });
}
