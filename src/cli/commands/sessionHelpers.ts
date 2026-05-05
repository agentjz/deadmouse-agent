import type { CliProgramDependencies } from "../dependencies.js";
import type { RuntimeConfig, SessionRecord } from "../../types.js";

export async function createSessionStore(sessionsDir: string) {
  const { SessionStore } = await import("../../agent/session.js");
  return new SessionStore(sessionsDir);
}

export async function startInteractive(
  dependencies: CliProgramDependencies,
  options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
): Promise<void> {
  if (dependencies.startInteractive) {
    await dependencies.startInteractive(options);
    return;
  }

  const { startInteractiveChat } = await import("../../shell/cli/interactive.js");
  await startInteractiveChat(options);
}

export async function runOneShot(
  dependencies: CliProgramDependencies,
  options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
) {
  if (dependencies.runOneShot) {
    return dependencies.runOneShot(options);
  }

  const { runOneShotPrompt } = await import("../oneShot.js");
  return runOneShotPrompt(options.prompt, options.cwd, options.config, options.session, options.sessionStore);
}

