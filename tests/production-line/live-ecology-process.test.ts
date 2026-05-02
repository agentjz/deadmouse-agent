import assert from "node:assert/strict";
import test from "node:test";

import { createLinePrefixWriter, type StreamWriterTarget } from "./live-ecology/process.ts";

test("live ecology stream prefix is written once per line, not once per token", () => {
  const chunks: string[] = [];
  const writer = createLinePrefixWriter(makeTarget(chunks), "execution-ecology");

  writer("Let me");
  writer(" batch");
  writer(" as many independent calls as possible.\nNext line");
  writer(" continues");

  assert.equal(
    chunks.join(""),
    "[execution-ecology] Let me batch as many independent calls as possible.\n[execution-ecology] Next line continues",
  );
});

function makeTarget(chunks: string[]): StreamWriterTarget {
  return {
    write(text: string): void {
      chunks.push(text);
    },
  };
}
