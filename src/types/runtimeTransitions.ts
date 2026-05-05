export interface RuntimeContinueToolBatchReason {
  code: "continue.after_tool_batch";
  toolNames: string[];
  changedPaths: string[];
}

export interface RuntimeContinueEmptyAssistantResponseReason {
  code: "continue.empty_assistant_response";
}

export interface RuntimeRecoverProviderRequestReason {
  code: "recover.provider_request_retry";
  consecutiveFailures: number;
  error: string;
  configuredModel: string;
  requestModel: string;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  delayMs: number;
}

export interface RuntimeFinalizeCompletedReason {
  code: "finalize.completed";
  changedPaths: string[];
}

export type RuntimeContinueReason =
  | RuntimeContinueToolBatchReason
  | RuntimeContinueEmptyAssistantResponseReason;

export type RuntimeRecoverReason = RuntimeRecoverProviderRequestReason;

export type RuntimeFinalizeReason = RuntimeFinalizeCompletedReason;

export interface RuntimeContinueTransition {
  action: "continue";
  reason: RuntimeContinueReason;
  timestamp: string;
}

export interface RuntimeRecoverTransition {
  action: "recover";
  reason: RuntimeRecoverReason;
  timestamp: string;
}

export interface RuntimeFinalizeTransition {
  action: "finalize";
  reason: RuntimeFinalizeReason;
  timestamp: string;
}

export type RuntimeTransition =
  | RuntimeContinueTransition
  | RuntimeRecoverTransition
  | RuntimeFinalizeTransition;

export type RuntimeTerminalTransition = RuntimeFinalizeTransition;
