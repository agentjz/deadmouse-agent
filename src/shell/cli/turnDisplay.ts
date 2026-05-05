import type { InteractionTurnDisplay } from "../../interaction/shell.js";
import { createWaitingSpinner, wrapCallbacksWithSpinnerStop } from "./spinner.js";
import { createRuntimeUiAgentCallbacks } from "../../runtime-ui/agentCallbacks.js";

export function createCliTurnDisplay(options: {
  cwd: string;
  config: {
    showReasoning: boolean;
  };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  const runtimeUi = createRuntimeUiAgentCallbacks({
    channel: "lead",
    config: options.config,
    cwd: options.cwd,
    assistantLeadingBlankLine: true,
    assistantTrailingNewlines: "\n\n",
    reasoningLeadingBlankLine: true,
    toolArgsMaxChars: 200,
    abortSignal: options.abortSignal,
  });
  const waitingSpinner = createWaitingSpinner({ label: "thinking" });
  const callbacks = wrapCallbacksWithSpinnerStop(runtimeUi.callbacks, () => {
    waitingSpinner.stop();
  });

  callbacks.onModelWaitStart = () => {
    waitingSpinner.start();
  };
  callbacks.onModelWaitStop = () => {
    waitingSpinner.stop();
  };
  return {
    callbacks,
    flush() {
      waitingSpinner.stop();
      runtimeUi.flush();
    },
    dispose() {
      waitingSpinner.stop();
    },
  };
}
