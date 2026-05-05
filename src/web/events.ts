export type WorkbenchEvent =
  | { type: "server.ready"; cwd: string; projectName: string; sessionId?: string; createdAt: string }
  | { type: "project.updated"; cwd: string; projectName: string; createdAt: string }
  | { type: "session.status"; status: "idle" | "running" | "error"; message?: string; createdAt: string }
  | { type: "runtime.line"; channel: WorkbenchRuntimeChannel; kind: WorkbenchRuntimeLineKind; label?: string; message: string; detail?: string; executionId?: string; createdAt: string }
  | { type: "execution.finished"; status: "completed" | "aborted" | "failed"; createdAt: string }
  | { type: "assistant.done"; createdAt: string }
  | { type: "tool.call"; name: string; args: string; createdAt: string }
  | { type: "tool.result"; name: string; output: string; createdAt: string }
  | { type: "tool.error"; name: string; error: string; createdAt: string }
  | { type: "file.changed"; paths: string[]; createdAt: string }
  | { type: "git.status"; files: GitStatusFile[]; createdAt: string }
  | { type: "runtime.error"; message: string; createdAt: string };

export interface GitStatusFile {
  path: string;
  index: string;
  workingTree: string;
  ignored?: boolean;
}

export type WorkbenchMode = "agent";

export type WorkbenchRuntimeChannel = "lead" | "system";

export type WorkbenchRuntimeLineKind = "assistant" | "reasoning" | "tool" | "result" | "status" | "error";

export interface WorkbenchRuntimeLineEvent {
  type: "runtime.line";
  channel: WorkbenchRuntimeChannel;
  kind: WorkbenchRuntimeLineKind;
  label?: string;
  message: string;
  detail?: string;
  executionId?: string;
  createdAt: string;
}

export function nowEventTime(): string {
  return new Date().toISOString();
}
