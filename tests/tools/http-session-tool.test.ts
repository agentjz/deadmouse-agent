import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createToolRegistry } from "../../src/capabilities/tools/core/registry.js";
import { HTTP_SESSION_STORE_RELATIVE_PATH } from "../../src/capabilities/tools/packages/network/httpSessionStore.js";
import { createTempWorkspace, makeToolContext } from "../helpers.js";

test("http_session persistence metadata matches real persisted state changes", async (t) => {
  const root = await createTempWorkspace("http-session-persist", t);
  const registry = createToolRegistry({ onlyNames: ["http_session"] });
  const context = makeToolContext(root);

  const transient = await registry.execute(
    "http_session",
    JSON.stringify({
      action: "create",
      session_id: "transient",
      base_url: "http://example.test",
    }),
    context as never,
  );

  assert.equal(transient.ok, true);
  assert.equal(transient.metadata?.changedPaths, undefined);
  await assert.rejects(
    () => fs.stat(path.join(root, HTTP_SESSION_STORE_RELATIVE_PATH)),
    /ENOENT/,
  );

  const persisted = await registry.execute(
    "http_session",
    JSON.stringify({
      action: "create",
      session_id: "persisted",
      base_url: "http://example.test",
      persist: true,
    }),
    context as never,
  );

  assert.equal(persisted.ok, true);
  assert.deepEqual(persisted.metadata?.changedPaths, [HTTP_SESSION_STORE_RELATIVE_PATH]);
  assert.equal((await fs.stat(path.join(root, HTTP_SESSION_STORE_RELATIVE_PATH))).isFile(), true);
});

test("http_session is governed as state with optional change signals", () => {
  const registry = createToolRegistry({ onlyNames: ["http_session"] });
  const entry = registry.entries?.find((item) => item.name === "http_session");

  assert(entry);
  assert.equal(entry.governance.mutation, "state");
  assert.equal(entry.governance.changeSignal, "optional");
});
