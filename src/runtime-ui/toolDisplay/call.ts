import { tryParseJson } from "../../utils/json.js";
import { normalizeDisplayPath } from "../pathDisplay.js";
import { truncate } from "../previewPolicy.js";
import { readStringField } from "./shared.js";
import type { ToolDisplay } from "./types.js";

export function buildToolCallDisplay(
  name: string,
  rawArgs: string,
  maxChars: number,
  cwd?: string,
): ToolDisplay {
  const parsed = tryParseJson(rawArgs);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      summary: `${name} ${truncate(rawArgs, maxChars)}`,
    };
  }

  const args = parsed as Record<string, unknown>;
  const path = normalizeDisplayPath(readStringField(args, "path"), cwd);

  switch (name) {
    case "read": {
      const offset = typeof args.offset === "number" ? Math.trunc(args.offset) : undefined;
      const limit = typeof args.limit === "number" ? Math.trunc(args.limit) : undefined;
      const range = offset === undefined
        ? ""
        : limit === undefined
          ? `:${offset}`
          : `:${offset}-${Math.max(offset, offset + limit - 1)}`;
      return {
        summary: `${name} ${path ?? "(missing path)"}${range}`,
      };
    }
    case "write":
      return {
        summary: `${name} ${path ?? "(missing path)"}`,
      };
    case "edit": {
      const edits = Array.isArray(args.edits) ? args.edits : [];
      return {
        summary:
          `${name} ${path ?? "(missing path)"}` +
          (edits.length > 0 ? ` edits=${edits.length}` : ""),
      };
    }
    case "bash": {
      const command = readStringField(args, "command");
      const runCwd = readStringField(args, "cwd");
      return {
        summary:
          `${name} ${command ?? ""}`.trim() +
          (runCwd ? ` cwd=${runCwd}` : ""),
      };
    }
    default:
      return {
        summary: `${name} ${truncate(rawArgs, maxChars)}`,
      };
  }
}
