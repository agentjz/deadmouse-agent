import type { SessionStoreLike } from "../session/store.js";
import type { ToolRegistry } from "../tools/core/types.js";
import type { RuntimeConfig, RuntimeTerminalTransition, SessionRecord, ToolCallRecord } from "../types.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ProviderMessage } from "../provider/contract.js";
import type { PromptRuntimeState } from "./prompt/types.js";

export interface AgentIdentity {
  kind: "lead";
  name: string;
}

export interface AgentCallbacks {
  onModelWaitStart?: () => void;
  onModelWaitStop?: () => void;
  onStatus?: (text: string) => void;
  onAssistantStage?: (text: string) => void;
  onAssistantDelta?: (delta: string) => void;
  onAssistantDone?: (fullText: string) => void;
  onAssistantText?: (text: string) => void;
  onReasoningDelta?: (delta: string) => void;
  onReasoning?: (text: string) => void;
  onToolCall?: (name: string, args: string) => void;
  onToolResult?: (name: string, output: string) => void;
  onToolError?: (name: string, error: string) => void;
}

export interface RunTurnOptions {
  input: string;
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  toolRegistry?: ToolRegistry;
  identity?: AgentIdentity;
  runtimePromptState?: Partial<PromptRuntimeState>;
  abortSignal?: AbortSignal;
  callbacks?: AgentCallbacks;
  fetchAssistantResponse?: (input: ModelRequestInput) => Promise<AssistantResponse>;
  recoverySleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ModelRequestInput {
  messages: ProviderMessage[];
  request: {
    provider: string;
    model: string;
    thinking?: RuntimeConfig["thinking"];
    reasoningEffort?: RuntimeConfig["reasoningEffort"];
    maxOutputTokens?: RuntimeConfig["maxOutputTokens"];
  };
  tools: FunctionToolDefinition[];
  callbacks?: AgentCallbacks;
  abortSignal?: AbortSignal;
  observability?: {
    rootDir: string;
    sessionId: string;
    identityKind?: string;
    identityName?: string;
    configuredModel: string;
  };
}

export interface AssistantResponse {
  content: string | null;
  reasoningContent?: string;
  streamedAssistantContent?: boolean;
  streamedReasoningContent?: boolean;
  toolCalls: ToolCallRecord[];
}

export interface RunTurnResult {
  session: SessionRecord;
  changedPaths: string[];
  transition?: RuntimeTerminalTransition;
}
