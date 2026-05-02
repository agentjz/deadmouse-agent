import { lineNumberAt } from "./files.ts";
import type { RepoContractFinding, RepoContractScanInput } from "./types.ts";

const DISGUISED_LITERAL_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
}> = [
  {
    pattern: /\[[^\]\r\n]*["'][A-Za-z0-9_-]+["'][^\]\r\n]*\]\.join\(\s*["']{2}\s*\)/g,
    message: "disguised literal assembled through array.join(\"\") found; write the literal directly or remove the obsolete check.",
  },
  {
    pattern: /String\.fromCharCode\([^)\r\n]+\)/g,
    message: "disguised literal assembled through String.fromCharCode found; write the literal directly or remove the obsolete check.",
  },
  {
    pattern: /Buffer\.from\(\s*["'][A-Za-z0-9+/=]+["']\s*,\s*["']base64["']\s*\)\.toString\(/g,
    message: "disguised literal assembled through base64 decoding found; write the literal directly or remove the obsolete check.",
  },
];

export async function scanDisguisedStringAssembly({ contents }: RepoContractScanInput): Promise<RepoContractFinding[]> {
  const findings: RepoContractFinding[] = [];

  for (const [file, content] of contents) {
    if (file.startsWith("tests/production-line/repo-contracts/")) {
      continue;
    }

    for (const item of DISGUISED_LITERAL_PATTERNS) {
      for (const match of content.matchAll(item.pattern)) {
        findings.push({
          file,
          line: lineNumberAt(content, match.index ?? 0),
          message: item.message,
        });
      }
    }
  }

  return findings;
}
