import type { Command } from "commander";

import {
  diagnoseInstalledCapabilityPackages,
  installCapabilityPackageManifest,
  listInstalledCapabilityPackages,
  setCapabilityPackageEnabled,
  testInstalledCapabilityPackages,
} from "../../capabilities/packages/lifecycle.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";

export function registerCapabilityCommands(
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
  const capability = program
    .command("capability")
    .description("Manage capability surfaces exposed to Lead.");

  const packageCommand = capability
    .command("package")
    .description("Install, list, diagnose, and test capability package manifests.");

  packageCommand
    .command("install")
    .argument("<manifest>", "Capability package manifest path")
    .description("Install a capability package manifest into the project capability root.")
    .action(async (manifestPath: string) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const result = await installCapabilityPackageManifest(runtime.cwd, manifestPath);
      ui.plain(`installed ${result.packageId}`);
    });

  packageCommand
    .command("list")
    .description("List installed capability package manifests.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const packages = await listInstalledCapabilityPackages(runtime.cwd);
      if (packages.length === 0) {
        ui.plain("no capability packages installed");
        return;
      }
      for (const pkg of packages) {
        ui.plain([
          pkg.packageId,
          pkg.version,
          pkg.kind,
          pkg.enabled ? "enabled" : "disabled",
          pkg.installed ? "installed" : "not-installed",
        ].join("  "));
      }
    });

  packageCommand
    .command("enable")
    .argument("<packageId>", "Capability package id")
    .description("Enable an installed capability package manifest.")
    .action(async (packageId: string) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const result = await setCapabilityPackageEnabled(runtime.cwd, packageId, true);
      ui.plain(`enabled ${result.packageId}`);
    });

  packageCommand
    .command("disable")
    .argument("<packageId>", "Capability package id")
    .description("Disable an installed capability package manifest.")
    .action(async (packageId: string) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const result = await setCapabilityPackageEnabled(runtime.cwd, packageId, false);
      ui.plain(`disabled ${result.packageId}`);
    });

  packageCommand
    .command("doctor")
    .description("Diagnose installed capability package manifests.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const report = await diagnoseInstalledCapabilityPackages(runtime.cwd);
      ui.plain(`capability packages: ${report.status}`);
      ui.plain(`total=${report.total} enabled=${report.enabled} disabled=${report.disabled}`);
      for (const finding of report.findings) {
        ui.plain(`${finding.severity}: ${finding.packageId ? `${finding.packageId}: ` : ""}${finding.message}`);
      }
    });

  packageCommand
    .command("test")
    .description("Run structural checks for installed capability package manifests.")
    .action(async () => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const report = await testInstalledCapabilityPackages(runtime.cwd);
      ui.plain(`package tests: ${report.status}`);
      ui.plain(`checked=${report.total}`);
      for (const error of report.errors) {
        ui.plain(`error: ${error}`);
      }
      if (report.status === "failed") {
        process.exitCode = 1;
      }
    });
}
