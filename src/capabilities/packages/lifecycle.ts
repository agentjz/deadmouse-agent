import fs from "node:fs/promises";
import path from "node:path";

import { normalizeProtocolId } from "../../protocol/capability.js";
import { parseCapabilityPackageManifest, type CapabilityPackageManifest } from "../../protocol/manifest.js";
import { diagnoseCapabilityPackages, type CapabilityPackageDiagnosisReport } from "../../protocol/package.js";
import { stringifyJson } from "../../utils/json.js";
import {
  discoverCapabilityPackages,
  getCapabilityPackageRoot,
  listCapabilityPackageManifestFiles,
} from "./discovery.js";

export interface CapabilityPackageInstallResult {
  packageId: string;
  manifestPath: string;
}

export interface CapabilityPackageListItem {
  packageId: string;
  version: string;
  kind: string;
  enabled: boolean;
  installed: boolean;
  manifestPath: string;
}

export interface CapabilityPackageTestReport {
  status: "passed" | "failed";
  total: number;
  checkedFiles: readonly string[];
  diagnosis: CapabilityPackageDiagnosisReport;
  errors: readonly string[];
}

export async function installCapabilityPackageManifest(
  rootDir: string,
  sourceManifestPath: string,
): Promise<CapabilityPackageInstallResult> {
  const sourcePath = path.resolve(sourceManifestPath);
  const manifest = parseCapabilityPackageManifest(JSON.parse(await fs.readFile(sourcePath, "utf8")));
  const packageId = normalizeProtocolId(manifest.packageId ?? `${manifest.kind}.${manifest.id}`);
  const installedManifest = normalizeInstalledManifest(manifest, packageId, sourcePath);
  const packageRoot = getCapabilityPackageRoot(rootDir);
  await fs.mkdir(packageRoot, { recursive: true });
  const manifestPath = path.join(packageRoot, `${sanitizeManifestFileName(packageId)}.capability.json`);
  await fs.writeFile(manifestPath, stringifyJson(installedManifest), "utf8");
  return { packageId, manifestPath };
}

export async function listInstalledCapabilityPackages(rootDir: string): Promise<CapabilityPackageListItem[]> {
  const files = await listCapabilityPackageManifestFiles(rootDir);
  const packages = await discoverCapabilityPackages(rootDir);
  return packages.map((pkg, index) => ({
    packageId: pkg.packageId,
    version: pkg.version,
    kind: pkg.profile.kind,
    enabled: pkg.governance.enabled,
    installed: pkg.governance.installed,
    manifestPath: files[index] ?? "",
  }));
}

export async function setCapabilityPackageEnabled(
  rootDir: string,
  packageId: string,
  enabled: boolean,
): Promise<CapabilityPackageInstallResult> {
  const normalizedPackageId = normalizeProtocolId(packageId);
  const manifestRef = await findCapabilityPackageManifest(rootDir, normalizedPackageId);
  if (!manifestRef) {
    throw new Error(`Capability package '${normalizedPackageId}' was not found.`);
  }

  const next: CapabilityPackageManifest = {
    ...manifestRef.manifest,
    governance: {
      ...manifestRef.manifest.governance,
      enabled,
      installed: manifestRef.manifest.governance?.installed ?? true,
    },
  };
  await fs.writeFile(manifestRef.filePath, stringifyJson(next), "utf8");
  return {
    packageId: normalizedPackageId,
    manifestPath: manifestRef.filePath,
  };
}

export async function diagnoseInstalledCapabilityPackages(rootDir: string): Promise<CapabilityPackageDiagnosisReport> {
  return diagnoseCapabilityPackages(await discoverCapabilityPackages(rootDir));
}

export async function testInstalledCapabilityPackages(rootDir: string): Promise<CapabilityPackageTestReport> {
  const files = await listCapabilityPackageManifestFiles(rootDir);
  const errors: string[] = [];
  for (const file of files) {
    try {
      parseCapabilityPackageManifest(JSON.parse(await fs.readFile(file, "utf8")));
    } catch (error) {
      errors.push(`${file}: ${(error as Error).message}`);
    }
  }

  const diagnosis = await diagnoseInstalledCapabilityPackages(rootDir);
  for (const finding of diagnosis.findings) {
    if (finding.severity === "error") {
      errors.push(finding.packageId ? `${finding.packageId}: ${finding.message}` : finding.message);
    }
  }

  return {
    status: errors.length > 0 ? "failed" : "passed",
    total: files.length,
    checkedFiles: files,
    diagnosis,
    errors,
  };
}

async function findCapabilityPackageManifest(
  rootDir: string,
  packageId: string,
): Promise<{ filePath: string; manifest: CapabilityPackageManifest } | null> {
  for (const filePath of await listCapabilityPackageManifestFiles(rootDir)) {
    const manifest = parseCapabilityPackageManifest(JSON.parse(await fs.readFile(filePath, "utf8")));
    const resolvedPackageId = normalizeProtocolId(manifest.packageId ?? `${manifest.kind}.${manifest.id}`);
    if (resolvedPackageId === packageId) {
      return { filePath, manifest };
    }
  }
  return null;
}

function normalizeInstalledManifest(
  manifest: CapabilityPackageManifest,
  packageId: string,
  sourcePath: string,
): CapabilityPackageManifest {
  return {
    ...manifest,
    packageId,
    source: {
      ...manifest.source,
      builtIn: manifest.source.builtIn ?? false,
    },
    governance: {
      ...manifest.governance,
      enabled: manifest.governance?.enabled !== false,
      installed: true,
      installRef: manifest.governance?.installRef ?? `file:${sourcePath}`,
    },
  };
}

function sanitizeManifestFileName(packageId: string): string {
  return normalizeProtocolId(packageId).replace(/[^a-z0-9._-]/g, "-") || "capability-package";
}
