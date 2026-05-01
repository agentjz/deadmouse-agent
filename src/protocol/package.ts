import type { AssignmentContract } from "./assignment.js";
import { normalizeProtocolId, type CapabilityProfile } from "./capability.js";
import { createCapabilityPort, type CapabilityPort, type CapabilityPortInput } from "./port.js";
import { createCapabilityRunnerDescriptor, type CapabilityRunnerDescriptor } from "./runner.js";

export const CAPABILITY_PACKAGE_PROTOCOL = "deadmouse.capability-package" as const;

export type CapabilitySourceKind = string;
export type CapabilityAdapterKind = string;

export interface CapabilityPackageSource {
  kind: CapabilitySourceKind;
  id: string;
  path?: string;
  builtIn: boolean;
}

export interface CapabilityPackageAdapter {
  kind: CapabilityAdapterKind;
  id: string;
  description: string;
}

export interface CapabilityPackageLeadSummary {
  availability: string;
  useWhen: readonly string[];
  avoidWhen: readonly string[];
}

export interface CapabilityPackageMachinePermissions {
  exposeToLead: true;
  executeExplicitAssignment: true;
  autoSelect: false;
  autoDispatch: false;
  decideStrategy: false;
}

export interface CapabilityPackageDependency {
  packageId: string;
  version?: string;
  optional?: boolean;
}

export interface CapabilityPackageDiagnostic {
  severity: "info" | "warning" | "error";
  message: string;
  code?: string;
}

export interface CapabilityPackageGovernance {
  enabled: boolean;
  installed: boolean;
  installRef?: string;
  dependencies: readonly CapabilityPackageDependency[];
  versionConstraints: readonly CapabilityPackageDependency[];
  diagnostics: readonly CapabilityPackageDiagnostic[];
}

export interface CapabilityPackage {
  protocol: typeof CAPABILITY_PACKAGE_PROTOCOL;
  version: string;
  packageId: string;
  profile: CapabilityProfile;
  port: CapabilityPort;
  source: CapabilityPackageSource;
  adapter: CapabilityPackageAdapter;
  runner: CapabilityRunnerDescriptor;
  leadSummary: CapabilityPackageLeadSummary;
  machinePermissions: CapabilityPackageMachinePermissions;
  governance: CapabilityPackageGovernance;
}

export function createCapabilityPackage(input: {
  packageId?: string;
  version?: string;
  profile: CapabilityProfile;
  source: Omit<CapabilityPackageSource, "id"> & { id?: string };
  adapter: CapabilityPackageAdapter;
  port: CapabilityPortInput;
  availability?: string;
  useWhen?: readonly string[];
  avoidWhen?: readonly string[];
  governance?: Partial<CapabilityPackageGovernance>;
}): CapabilityPackage {
  const normalizedProfileId = normalizeProtocolId(input.profile.id);
  const packageId = normalizeProtocolId(
    input.packageId ?? (
      normalizedProfileId.startsWith(`${input.profile.kind}.`)
        ? normalizedProfileId
        : `${input.profile.kind}.${normalizedProfileId}`
    ),
  );
  const port = createCapabilityPort(input.port);
  return {
    protocol: CAPABILITY_PACKAGE_PROTOCOL,
    version: input.version?.trim() || "1.0.0",
    packageId,
    profile: input.profile,
    port,
    source: {
      ...input.source,
      id: normalizeProtocolId(input.source.id ?? packageId),
    },
    adapter: {
      ...input.adapter,
      id: normalizeProtocolId(input.adapter.id),
    },
    runner: createCapabilityRunnerDescriptor({
      type: port.runner.type,
      createsExecution: port.runner.createsExecution,
      emitsProgress: port.runner.emitsProgress,
      emitsArtifacts: port.runner.emitsArtifacts,
      emitsCloseout: port.runner.emitsCloseout,
      emitsWakeSignal: port.runner.emitsWakeSignal,
      leadWaitPolicy: port.runner.leadWaitPolicy,
    }),
    leadSummary: {
      availability: input.availability?.trim() || input.profile.description,
      useWhen: [...(input.useWhen ?? input.profile.bestFor)],
      avoidWhen: [...(input.avoidWhen ?? input.profile.notFor)],
    },
    machinePermissions: {
      exposeToLead: true,
      executeExplicitAssignment: true,
      autoSelect: false,
      autoDispatch: false,
      decideStrategy: false,
    },
    governance: normalizeCapabilityPackageGovernance(input.governance),
  };
}

export function assertCapabilityPackageAcceptsAssignment(
  pkg: CapabilityPackage,
  assignment: AssignmentContract,
): void {
  if (assignment.capabilityId !== pkg.packageId) {
    throw new Error(
      `Assignment '${assignment.assignmentId}' targets capability '${assignment.capabilityId}', not package '${pkg.packageId}'.`,
    );
  }
}

export function formatCapabilityPackageForLead(pkg: CapabilityPackage): string {
  return [
    `- ${pkg.packageId} [${pkg.profile.kind}] ${pkg.profile.name}`,
    `  available: ${pkg.leadSummary.availability}`,
    `  cost: ${pkg.profile.cost}; runner: ${pkg.runner.type}; source: ${pkg.source.kind}`,
    `  port: ${pkg.port.permissionBoundary.world}; output: ${pkg.port.closeout.contract}; wake: ${pkg.port.wake.required ? "required" : "optional"}`,
  ].join("\n");
}

export function isCapabilitySourceKind(value: unknown): value is CapabilitySourceKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}

export function isCapabilityAdapterKind(value: unknown): value is CapabilityAdapterKind {
  return typeof value === "string" && normalizeProtocolId(value) === value.trim().toLowerCase();
}

export interface CapabilityPackageDiagnosisFinding {
  severity: "warning" | "error";
  packageId?: string;
  message: string;
}

export interface CapabilityPackageDiagnosisReport {
  status: "ok" | "warning" | "error";
  total: number;
  enabled: number;
  disabled: number;
  byKind: Record<string, number>;
  findings: CapabilityPackageDiagnosisFinding[];
}

export function diagnoseCapabilityPackages(packages: readonly CapabilityPackage[]): CapabilityPackageDiagnosisReport {
  const findings: CapabilityPackageDiagnosisFinding[] = [];
  const byKind: Record<string, number> = {};
  const packageIds = new Map<string, number>();
  let enabled = 0;
  let disabled = 0;

  for (const pkg of packages) {
    byKind[pkg.profile.kind] = (byKind[pkg.profile.kind] ?? 0) + 1;
    packageIds.set(pkg.packageId, (packageIds.get(pkg.packageId) ?? 0) + 1);
    if (pkg.governance.enabled) {
      enabled += 1;
    } else {
      disabled += 1;
      findings.push({
        severity: "warning",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' is disabled.`,
      });
    }

    if (!pkg.version.trim()) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' has no version.`,
      });
    }

    if (!pkg.source.kind || !pkg.adapter.kind || !pkg.runner.type) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' has incomplete source adapter or runner metadata.`,
      });
    }

    if (pkg.port.runner.type !== pkg.runner.type) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' port runner '${pkg.port.runner.type}' does not match runner '${pkg.runner.type}'.`,
      });
    }

    if (!pkg.port.permissionBoundary.world || !pkg.port.permissionBoundary.autonomy) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' has incomplete port permission boundary.`,
      });
    }

    if (pkg.port.foregroundOutput.sink !== "runtime-ui") {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' does not dock foreground output through runtime-ui.`,
      });
    }

    if (pkg.runner.createsExecution && !pkg.runner.emitsCloseout) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' creates execution without closeout emission.`,
      });
    }

    if (pkg.machinePermissions.autoSelect || pkg.machinePermissions.autoDispatch || pkg.machinePermissions.decideStrategy) {
      findings.push({
        severity: "error",
        packageId: pkg.packageId,
        message: `Capability package '${pkg.packageId}' grants machine strategy permissions.`,
      });
    }

    for (const diagnostic of pkg.governance.diagnostics) {
      if (diagnostic.severity === "warning" || diagnostic.severity === "error") {
        findings.push({
          severity: diagnostic.severity,
          packageId: pkg.packageId,
          message: diagnostic.message,
        });
      }
    }
  }

  for (const [packageId, count] of packageIds) {
    if (count > 1) {
      findings.push({
        severity: "error",
        packageId,
        message: `Duplicate capability package '${packageId}' registered ${count} times.`,
      });
    }
  }

  for (const pkg of packages) {
    for (const dependency of pkg.governance.dependencies) {
      const resolved = packages.find((candidate) => candidate.packageId === dependency.packageId);
      if (!dependency.optional && !resolved) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' depends on missing package '${dependency.packageId}'.`,
        });
        continue;
      }
      if (resolved && dependency.version && !satisfiesVersionConstraint(resolved.version, dependency.version)) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' requires '${dependency.packageId}' version '${dependency.version}', found '${resolved.version}'.`,
        });
      }
    }
    for (const constraint of pkg.governance.versionConstraints) {
      const resolved = packages.find((candidate) => candidate.packageId === constraint.packageId);
      if (resolved && constraint.version && !satisfiesVersionConstraint(resolved.version, constraint.version)) {
        findings.push({
          severity: "error",
          packageId: pkg.packageId,
          message: `Capability package '${pkg.packageId}' requires '${constraint.packageId}' version '${constraint.version}', found '${resolved.version}'.`,
        });
      }
    }
  }

  return {
    status: findings.some((finding) => finding.severity === "error")
      ? "error"
      : findings.length > 0
        ? "warning"
        : "ok",
    total: packages.length,
    enabled,
    disabled,
    byKind,
    findings,
  };
}

function normalizeCapabilityPackageGovernance(
  input: Partial<CapabilityPackageGovernance> | undefined,
): CapabilityPackageGovernance {
  return {
    enabled: input?.enabled !== false,
    installed: input?.installed !== false,
    installRef: normalizeOptionalText(input?.installRef),
    dependencies: normalizeDependencies(input?.dependencies),
    versionConstraints: normalizeDependencies(input?.versionConstraints),
    diagnostics: normalizeDiagnostics(input?.diagnostics),
  };
}

function normalizeDependencies(value: readonly CapabilityPackageDependency[] | undefined): CapabilityPackageDependency[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((dependency) => ({
      packageId: normalizeProtocolId(String(dependency.packageId ?? "")),
      version: normalizeOptionalText(dependency.version),
      optional: dependency.optional === true,
    }))
    .filter((dependency) => dependency.packageId.length > 0);
}

function normalizeDiagnostics(value: readonly CapabilityPackageDiagnostic[] | undefined): CapabilityPackageDiagnostic[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((diagnostic) => ({
      severity: normalizeDiagnosticSeverity(diagnostic.severity),
      message: normalizeOptionalText(diagnostic.message) ?? "",
      code: normalizeOptionalText(diagnostic.code),
    }))
    .filter((diagnostic) => diagnostic.message.length > 0);
}

function normalizeDiagnosticSeverity(value: unknown): CapabilityPackageDiagnostic["severity"] {
  if (value === "error" || value === "warning" || value === "info") {
    return value;
  }
  return "info";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function satisfiesVersionConstraint(version: string, constraint: string): boolean {
  const normalizedVersion = parseSemver(version);
  if (!normalizedVersion) {
    return false;
  }
  const normalizedConstraint = constraint.trim();
  if (!normalizedConstraint) {
    return true;
  }

  if (normalizedConstraint.startsWith(">=")) {
    const minimum = parseSemver(normalizedConstraint.slice(2));
    return Boolean(minimum && compareSemver(normalizedVersion, minimum) >= 0);
  }
  if (normalizedConstraint.startsWith("^")) {
    const base = parseSemver(normalizedConstraint.slice(1));
    return Boolean(base && normalizedVersion.major === base.major && compareSemver(normalizedVersion, base) >= 0);
  }
  if (normalizedConstraint.startsWith("~")) {
    const base = parseSemver(normalizedConstraint.slice(1));
    return Boolean(
      base
        && normalizedVersion.major === base.major
        && normalizedVersion.minor === base.minor
        && compareSemver(normalizedVersion, base) >= 0,
    );
  }
  if (/^\d+\.\d+\.\d+$/.test(normalizedConstraint)) {
    const exact = parseSemver(normalizedConstraint);
    return Boolean(exact && compareSemver(normalizedVersion, exact) === 0);
  }

  return version.trim() === normalizedConstraint;
}

function parseSemver(value: string): { major: number; minor: number; patch: number } | null {
  const match = value.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(
  left: { major: number; minor: number; patch: number },
  right: { major: number; minor: number; patch: number },
): number {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
}
