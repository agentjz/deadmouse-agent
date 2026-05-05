import type { SessionDiffChange } from "./session.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";

export interface ToolExecutionMetadata {
  changedPaths?: string[];
  changeId?: string;
  runtime?: {
    status: "completed" | "failed" | "timed_out" | "stalled" | "aborted";
    exitCode: number | null;
    durationMs: number;
    attempts: number;
    timedOut: boolean;
    stalled: boolean;
    aborted: boolean;
    truncated: boolean;
    outputPath?: string;
    outputPreview: string;
  };
  diff?: string;
  diagnostics?: ToolDiagnosticsReport;
  sessionDiff?: SessionDiffChange;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  metadata?: ToolExecutionMetadata;
}
