import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { createHostSession, loadLatestSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig, SessionRecord } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { createSessionStore } from "./sessionHelpers.js";

export function registerSpecCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    dependencies: CliProgramDependencies;
  },
): void {
  program
    .command("spec")
    .description("Start spec mode: SDD for new projects and new features.")
    .argument("[prompt...]", "Optional one-shot spec prompt. Without a prompt, opens interactive spec mode.")
    .option("--resume [sessionId]", "Resume the latest or specified session in spec mode.")
    .action(async (promptParts: string[], commandOptions: { resume?: boolean | string }) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = await resolveSpecSession({
        resume: commandOptions.resume,
        sessionStore,
        cwd: runtime.cwd,
      });
      const cwd = commandOptions.resume && !runtime.overrides.cwd ? session.cwd : runtime.cwd;

      if (!prompt) {
        await startSpecInteractive(options.dependencies, {
          cwd,
          config: runtime.config,
          session,
          sessionStore,
        });
        return;
      }

      const result = await runSpecOneShot(options.dependencies, {
        prompt,
        cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
      writeStdoutLine(JSON.stringify(result.closeout));
    });
}

async function resolveSpecSession(options: {
  resume?: boolean | string;
  sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  cwd: string;
}): Promise<SessionRecord> {
  if (!options.resume) {
    return options.sessionStore.save(await createHostSession(options.sessionStore, options.cwd));
  }

  const session = typeof options.resume === "string"
    ? await options.sessionStore.load(options.resume)
    : await loadLatestSession(options.sessionStore);
  if (!session) {
    throw new Error("No saved sessions found.");
  }
  return session;
}

async function startSpecInteractive(
  dependencies: CliProgramDependencies,
  options: {
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
): Promise<void> {
  if (dependencies.startSpecInteractive) {
    await dependencies.startSpecInteractive(options);
    return;
  }

  const { startSpecInteractive } = await import("../../ui/specInteractive.js");
  await startSpecInteractive(options);
}

async function runSpecOneShot(
  dependencies: CliProgramDependencies,
  options: {
    prompt: string;
    cwd: string;
    config: RuntimeConfig;
    session: SessionRecord;
    sessionStore: Awaited<ReturnType<typeof createSessionStore>>;
  },
) {
  if (dependencies.runSpecOneShot) {
    return dependencies.runSpecOneShot(options);
  }

  const { runSpecOneShotPrompt } = await import("../specOneShot.js");
  return runSpecOneShotPrompt(options.prompt, options.cwd, options.config, options.session, options.sessionStore);
}

