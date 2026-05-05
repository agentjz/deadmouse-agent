export interface LoadedInstructionFile {
  path: string;
  relativePath: string;
  filename: "AGENTS.override.md" | "AGENTS.md";
  content: string;
}

export interface ProjectIgnoreRule {
  pattern: string;
  source: string;
  baseDir: string;
  negated: boolean;
  directoryOnly: boolean;
  anchored: boolean;
  matcher: RegExp;
}

export interface ProjectContext {
  rootDir: string;
  stateRootDir: string;
  cwd: string;
  instructions: LoadedInstructionFile[];
  instructionText: string;
  instructionTruncated: boolean;
  ignoreRules: ProjectIgnoreRule[];
}
