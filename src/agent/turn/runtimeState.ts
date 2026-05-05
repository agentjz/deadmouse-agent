import type { PromptRuntimeState } from "../systemPrompt.js";
import type { AgentIdentity, RunTurnOptions } from "../types.js";
import type { SessionRecord } from "../../types.js";

export function shouldYieldTurn(yieldAfterToolSteps: number | undefined, iteration: number): boolean {
  return typeof yieldAfterToolSteps === "number" && Number.isFinite(yieldAfterToolSteps) && yieldAfterToolSteps > 0
    ? iteration > 0 && iteration % Math.trunc(yieldAfterToolSteps) === 0
    : false;
}

export async function injectInboxMessagesIfNeeded(
  session: SessionRecord,
  _options: RunTurnOptions,
  _identity: AgentIdentity,
  _rootDir: string,
): Promise<SessionRecord> {
  return session;
}

export async function loadPromptRuntimeState(
  _rootDir: string,
  identity: AgentIdentity,
  _cwd?: string,
  _objectiveText?: string,
): Promise<PromptRuntimeState> {
  return { identity };
}
