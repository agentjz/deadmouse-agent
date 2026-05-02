import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { MineruClient } from "../../src/integrations/mineru/client.js";

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

test("MineruClient creates upload batches with Bearer token and expected request body", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new MineruClient(
    {
      token: "mineru-token",
      baseUrl: "https://mineru.net/api/v4",
      agentBaseUrl: "https://mineru.net/api/v1",
      modelVersion: "vlm",
      language: "ch",
      enableFormula: true,
      enableTable: true,
      pollIntervalMs: 200,
      timeoutMs: 10_000,
    },
    async (input: unknown, init?: RequestInit) => {
      requests.push({
        url: String(input),
        init,
      });

      return createJsonResponse({
        code: 0,
        msg: "ok",
        trace_id: "trace-1",
        data: {
          batch_id: "batch-1",
          file_urls: ["https://upload.example.com/file-1"],
        },
      });
    },
  );

  const batch = await client.createUploadBatch({
    fileName: "paper.pdf",
    isOcr: true,
  });

  assert.equal(batch.batchId, "batch-1");
  assert.deepEqual(batch.fileUrls, ["https://upload.example.com/file-1"]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.url, "https://mineru.net/api/v4/file-urls/batch");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(
    (requests[0]?.init?.headers as Record<string, string>)?.Authorization,
    "Bearer mineru-token",
  );

  const body = JSON.parse(String(requests[0]?.init?.body)) as Record<string, unknown>;
  assert.equal(body.model_version, "vlm");
  assert.equal(body.language, "ch");
  assert.equal(body.enable_formula, true);
  assert.equal(body.enable_table, true);
  assert.deepEqual(body.files, [
    {
      name: "paper.pdf",
      is_ocr: true,
    },
  ]);
});

test("MineruClient polls batch results until done and returns the matching file result", async () => {
  let pollCount = 0;
  const client = new MineruClient(
    {
      token: "mineru-token",
      baseUrl: "https://mineru.net/api/v4",
      agentBaseUrl: "https://mineru.net/api/v1",
      modelVersion: "vlm",
      language: "ch",
      enableFormula: true,
      enableTable: true,
      pollIntervalMs: 1,
      timeoutMs: 10_000,
    },
    async (input: unknown) => {
      const url = String(input);
      if (!url.endsWith("/extract-results/batch/batch-1")) {
        return createJsonResponse({ code: 0, data: {} });
      }

      pollCount += 1;
      return createJsonResponse({
        code: 0,
        msg: "ok",
        trace_id: `trace-${pollCount}`,
        data: {
          batch_id: "batch-1",
          extract_result: [
            pollCount === 1
              ? {
                  file_name: "paper.pdf",
                  state: "running",
                  err_msg: "",
                  extract_progress: {
                    extracted_pages: 1,
                    total_pages: 5,
                    start_time: "2026-04-04 10:00:00",
                  },
                }
              : {
                  file_name: "paper.pdf",
                  state: "done",
                  err_msg: "",
                  full_zip_url: "https://cdn.example.com/paper.zip",
                },
          ],
        },
      });
    },
  );

  const result = await client.waitForBatchResult({
    batchId: "batch-1",
    fileName: "paper.pdf",
  });

  assert.equal(pollCount, 2);
  assert.equal(result.fileName, "paper.pdf");
  assert.equal(result.state, "done");
  assert.equal(result.fullZipUrl, "https://cdn.example.com/paper.zip");
});

test("MineruClient parses through the tokenless Agent API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const client = new MineruClient(
    {
      token: "",
      baseUrl: "https://mineru.net/api/v4",
      agentBaseUrl: "https://mineru.net/api/v1",
      modelVersion: "vlm",
      language: "ch",
      enableFormula: true,
      enableTable: true,
      pollIntervalMs: 200,
      timeoutMs: 10_000,
    },
    async (input: unknown, init?: RequestInit) => {
      requests.push({
        url: String(input),
        init,
      });

      const url = String(input);
      if (url.endsWith("/agent/parse/file")) {
        return createJsonResponse({
          code: 0,
          msg: "ok",
          data: {
            task_id: "agent-task-1",
            file_url: "https://upload.example.com/agent-task-1",
          },
        });
      }

      if (url === "https://upload.example.com/agent-task-1") {
        return new Response(null, { status: 200 });
      }

      if (url.endsWith("/agent/parse/agent-task-1")) {
        return createJsonResponse({
          code: 0,
          msg: "ok",
          data: {
            task_id: "agent-task-1",
            state: "done",
            markdown_url: "https://cdn.example.com/agent-task-1.md",
          },
        });
      }

      if (url === "https://cdn.example.com/agent-task-1.md") {
        return new Response("# Agent Result\n\nhello", { status: 200 });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    },
  );

  const result = await client.parseWithAgentApi({
    filePath: path.join(process.cwd(), "package.json"),
    fileName: "sample.pdf",
    isOcr: true,
  });

  assert.match(result.markdown, /Agent Result/);
  assert.equal(result.taskId, "agent-task-1");
  assert.equal(result.markdownUrl, "https://cdn.example.com/agent-task-1.md");
  assert.equal(requests[0]?.url, "https://mineru.net/api/v1/agent/parse/file");
  assert.equal(requests[0]?.init?.method, "POST");
  assert.equal(String(requests[1]?.url), "https://upload.example.com/agent-task-1");
  assert.equal(requests[1]?.init?.method, "PUT");
  assert.equal(String(requests[2]?.url), "https://mineru.net/api/v1/agent/parse/agent-task-1");
  assert.equal(String(requests[3]?.url), "https://cdn.example.com/agent-task-1.md");
});
