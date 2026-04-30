import type { Command } from "commander";

import { captureRegressionCase, runRegressionCases } from "../../regression/store.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";

export function registerRegressionCommands(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  const regression = program
    .command("regression")
    .description("Capture and run evidence-backed regression cases.");

  regression
    .command("capture")
    .argument("<sessionId>", "Session id to capture")
    .option("--case-id <caseId>", "Regression case id")
    .description("Capture a session and trace dossier into a regression case file.")
    .action(async (sessionId: string, commandOptions: { caseId?: string }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const result = await captureRegressionCase({
        rootDir: runtime.cwd,
        sessionsDir: runtime.paths.sessionsDir,
        sessionId,
        caseId: commandOptions.caseId,
      });
      ui.plain(`captured ${result.regressionCase.caseId}`);
      ui.plain(`traceEvents=${result.regressionCase.evidence.traceEventCount}`);
    });

  regression
    .command("run")
    .argument("[casePath]", "Optional regression case file path")
    .description("Run regression case checks against recorded session and trace evidence.")
    .action(async (casePath: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const results = await runRegressionCases({
        rootDir: runtime.cwd,
        sessionsDir: runtime.paths.sessionsDir,
        casePath,
      });
      if (results.length === 0) {
        ui.plain("regression cases: none");
        return;
      }
      for (const result of results) {
        ui.plain(`${result.caseId}: ${result.status}`);
        for (const failure of result.failures) {
          ui.plain(`failure: ${failure}`);
        }
      }
      if (results.some((result) => result.status === "failed")) {
        process.exitCode = 1;
      }
    });
}
