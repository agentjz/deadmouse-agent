import { enterCrashContext, installCrashRecorder } from "../observability/crashRecorder.js";
import type { RuntimeConfig } from "../types.js";
import { ExecutionStore } from "./store.js";
import { runAgentExecution } from "./workerAgent.js";
import { runCommandExecution } from "./workerCommand.js";
import { runDreamingExecution } from "../capabilities/dreaming/runner.js";

export async function runExecutionWorker(input: {
  rootDir: string;
  config: RuntimeConfig;
  executionId: string;
}): Promise<void> {
  installCrashRecorder({
    rootDir: input.rootDir,
    host: "worker",
    executionId: input.executionId,
  });
  const releaseCrashContext = enterCrashContext({
    host: "worker",
    executionId: input.executionId,
  });
  const execution = await new ExecutionStore(input.rootDir).load(input.executionId);
  try {
    if (execution.profile === "dreaming") {
      await runDreamingExecution(input.rootDir, input.config, execution);
      return;
    }

    if (execution.lane === "command") {
      await runCommandExecution(input.rootDir, execution);
      return;
    }

    await runAgentExecution(input.rootDir, input.config, execution);
  } finally {
    releaseCrashContext();
  }
}
