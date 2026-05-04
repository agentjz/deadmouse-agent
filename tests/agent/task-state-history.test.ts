import assert from "node:assert/strict";
import test from "node:test";

import { collectCompletedActions } from "../../src/agent/session/taskStateHistory.js";
import type { StoredMessage } from "../../src/types.js";

function toolMessage(name: string, payload: Record<string, unknown>): StoredMessage {
  return {
    role: "tool",
    tool_call_id: `call-${name}`,
    name,
    content: JSON.stringify(payload),
    createdAt: new Date().toISOString(),
  };
}

test("completed action summaries preserve counts from externalized foundation tool results", () => {
  const actions = collectCompletedActions([
    toolMessage("search_files", {
      externalized: true,
      tool: "search_files",
      summary: "matches=20; searched=155",
      matchesCount: 20,
      searched: 155,
      preview: "src/a.ts:1 needle",
    }),
    toolMessage("list_files", {
      externalized: true,
      tool: "list_files",
      summary: "entries=12",
      entriesCount: 12,
    }),
    toolMessage("find_files", {
      externalized: true,
      tool: "find_files",
      summary: "files=3",
    }),
    toolMessage("search_files", {
      searched: 527,
      mode: "files",
      matchedFilesCount: 15,
      totalMatches: 30,
      files: [
        { path: "src/a.ts", matches: 2 },
        { path: "src/b.ts", matches: 1 },
      ],
    }),
  ]);

  assert.deepEqual(actions, [
    "search_files 20 match(es)",
    "list_files 12 entries",
    "find_files 3 files",
    "search_files 30 match(es)",
  ]);
});

test("completed action summaries read counts from speed-first text tool messages", () => {
  const actions = collectCompletedActions([
    {
      role: "tool",
      tool_call_id: "call-find",
      name: "find_files",
      content: "find package.json: 1 files\npackage.json",
      createdAt: new Date().toISOString(),
    },
    {
      role: "tool",
      tool_call_id: "call-search",
      name: "search_files",
      content: 'search "needle": 3 matches in 2 files\nsrc/a.ts:1 needle',
      createdAt: new Date().toISOString(),
    },
    {
      role: "tool",
      tool_call_id: "call-list",
      name: "list_files",
      content: ".: 12 entries\nfile package.json",
      createdAt: new Date().toISOString(),
    },
  ]);

  assert.deepEqual(actions, [
    "find_files 1 file",
    "search_files 3 match(es)",
    "list_files 12 entries",
  ]);
});
