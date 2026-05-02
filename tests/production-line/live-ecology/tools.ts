import path from "node:path";
import { pathToFileURL } from "node:url";

interface RegisteredToolLike {
  definition: {
    function: {
      name: string;
    };
  };
}

export async function loadRegisteredToolNames(rootDir: string): Promise<string[]> {
  const moduleUrl = pathToFileURL(
    path.join(rootDir, ".test-build", "src", "capabilities", "tools", "core", "builtinCatalog.js"),
  );
  const module = await import(moduleUrl.href);
  return module.getBuiltinTools()
    .map((tool: RegisteredToolLike) => tool.definition.function.name)
    .sort();
}
