import type { RuntimeConfig } from "../../types.js";
import { createToolRegistry } from "./registry.js";
import type { ToolRegistry, ToolRegistryOptions } from "./types.js";

export interface RuntimeToolRegistryDependencies {
  close?: () => Promise<void>;
}

export async function createRuntimeToolRegistry(
  config: RuntimeConfig,
  options: ToolRegistryOptions = {},
  dependencies: RuntimeToolRegistryDependencies = {},
): Promise<ToolRegistry> {
  void config;
  const registry = createToolRegistry(options);

  return {
    ...registry,
    async close() {
      await registry.close?.();
      await dependencies.close?.();
    },
  };
}
