import { renderPromptLayers } from "./prompt/format.js";
import { measurePromptLayers } from "./prompt/metrics.js";
import type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "./prompt/types.js";
import { buildContextRuntimePromptLayers } from "./contextRuntime/index.js";
import type { AgentProfile } from "./profiles/types.js";
import type {
  ProjectContext,
  RuntimeConfig,
  AcceptanceState,
  SessionCheckpoint,
  TaskState,
  VerificationState,
  StoredMessage,
} from "../types.js";

export type { PromptLayerMetrics, PromptLayers, PromptRuntimeState } from "./prompt/types.js";
export { renderPromptLayers } from "./prompt/format.js";
export { measurePromptLayers } from "./prompt/metrics.js";

export function buildSystemPromptLayers(
  cwd: string,
  config: RuntimeConfig,
  projectContext: ProjectContext,
  taskState?: TaskState,
  verificationState?: VerificationState,
  runtimeState: PromptRuntimeState = {},
  checkpoint?: SessionCheckpoint,
  acceptanceState?: AcceptanceState,
  profile?: AgentProfile,
  messages: StoredMessage[] = [],
): PromptLayers {
  return buildContextRuntimePromptLayers({
    cwd,
    config,
    projectContext,
    taskState,
    verificationState,
    runtimeState,
    checkpoint,
    acceptanceState,
    profile,
    messages,
  });
}
