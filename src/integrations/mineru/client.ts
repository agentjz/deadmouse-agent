import fs from "node:fs/promises";

import type { MineruRuntimeConfig } from "../../types.js";
import type {
  MineruAgentParseInput,
  MineruAgentFileTask,
  MineruAgentParseResult,
  MineruAgentTaskResult,
  MineruBatchCreateInput,
  MineruBatchCreateResult,
  MineruBatchResult,
} from "./types.js";

type FetchLike = typeof fetch;
type SleepLike = (ms: number) => Promise<void>;

export class MineruClient {
  constructor(
    private readonly config: MineruRuntimeConfig,
    private readonly fetchImpl: FetchLike = fetch,
    private readonly sleep: SleepLike = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  async createUploadBatch(input: MineruBatchCreateInput): Promise<MineruBatchCreateResult> {
    const response = await this.fetchJson("/file-urls/batch", {
      method: "POST",
      headers: this.buildJsonHeaders(),
      body: JSON.stringify({
        language: input.language ?? this.config.language,
        model_version: input.modelVersion ?? this.config.modelVersion,
        enable_table: input.enableTable ?? this.config.enableTable,
        enable_formula: input.enableFormula ?? this.config.enableFormula,
        files: [
          {
            name: input.fileName,
            is_ocr: input.isOcr,
          },
        ],
      }),
    });

    const data = asRecord(response.data);
    const batchId = readString(data, ["batch_id", "batchId"]);
    const fileUrls = readStringArray(data, ["file_urls", "fileUrls"]);
    if (!batchId || fileUrls.length === 0) {
      throw new Error("MinerU createUploadBatch response is missing batch_id or file_urls.");
    }

    return {
      batchId,
      fileUrls,
    };
  }

  async uploadFile(uploadUrl: string, filePath: string): Promise<void> {
    const buffer = await fs.readFile(filePath);
    const response = await this.fetchImpl(uploadUrl, {
      method: "PUT",
      body: buffer,
    });

    if (!response.ok) {
      throw new Error(`MinerU upload failed with status ${response.status}.`);
    }
  }

  async waitForBatchResult(options: {
    batchId: string;
    fileName: string;
  }): Promise<MineruBatchResult> {
    const startedAt = Date.now();

    for (;;) {
      const result = await this.getBatchResult(options.batchId, options.fileName);
      const state = result.state.toLowerCase();
      if (state === "done") {
        return result;
      }

      if (state === "failed") {
        throw new Error(result.errMsg || `MinerU batch ${options.batchId} failed.`);
      }

      if (Date.now() - startedAt >= this.config.timeoutMs) {
        throw new Error(`MinerU batch ${options.batchId} timed out after ${this.config.timeoutMs}ms.`);
      }

      await this.sleep(this.config.pollIntervalMs);
    }
  }

  async downloadBuffer(url: string): Promise<Buffer> {
    const response = await this.fetchImpl(url);
    if (!response.ok) {
      throw new Error(`MinerU download failed with status ${response.status}.`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async parseWithAgentApi(input: MineruAgentParseInput): Promise<MineruAgentParseResult> {
    const task = await this.createAgentFileTask(input);
    await this.uploadFile(task.fileUrl, input.filePath);
    const result = await this.waitForAgentResult(task.taskId);
    if (!result.markdownUrl) {
      throw new Error(`MinerU Agent task ${task.taskId} completed without markdown_url.`);
    }

    return {
      taskId: task.taskId,
      state: result.state,
      markdownUrl: result.markdownUrl,
      markdown: (await this.downloadBuffer(result.markdownUrl)).toString("utf8"),
    };
  }

  async createAgentFileTask(input: MineruAgentParseInput): Promise<MineruAgentFileTask> {
    const response = await this.fetchAgentJson("/parse/file", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_name: input.fileName,
        language: input.language ?? this.config.language,
        enable_table: input.enableTable ?? this.config.enableTable,
        is_ocr: input.isOcr,
        enable_formula: input.enableFormula ?? this.config.enableFormula,
      }),
    });

    const data = asRecord(response.data);
    const taskId = readString(data, ["task_id", "taskId"]);
    const fileUrl = readString(data, ["file_url", "fileUrl"]);
    if (!taskId || !fileUrl) {
      throw new Error("MinerU Agent file task response is missing task_id or file_url.");
    }

    return {
      taskId,
      fileUrl,
    };
  }

  async waitForAgentResult(taskId: string): Promise<MineruAgentTaskResult> {
    const startedAt = Date.now();

    for (;;) {
      const result = await this.getAgentResult(taskId);
      const state = result.state.toLowerCase();
      if (state === "done") {
        return result;
      }

      if (state === "failed") {
        throw new Error(result.errMsg || `MinerU Agent task ${taskId} failed.`);
      }

      if (Date.now() - startedAt >= this.config.timeoutMs) {
        throw new Error(`MinerU Agent task ${taskId} timed out after ${this.config.timeoutMs}ms.`);
      }

      await this.sleep(this.config.pollIntervalMs);
    }
  }

  private async getAgentResult(taskId: string): Promise<MineruAgentTaskResult> {
    const response = await this.fetchAgentJson(`/parse/${encodeURIComponent(taskId)}`, {
      method: "GET",
    });
    const data = asRecord(response.data);

    return {
      taskId: readString(data, ["task_id", "taskId"]) ?? taskId,
      state: readString(data, ["state"]) ?? "unknown",
      markdownUrl: readString(data, ["markdown_url", "markdownUrl"]),
      errCode: readNumber(data, ["err_code", "errCode"]),
      errMsg: readString(data, ["err_msg", "errMsg"]),
    };
  }

  private async getBatchResult(batchId: string, fileName: string): Promise<MineruBatchResult> {
    const response = await this.fetchJson(`/extract-results/batch/${encodeURIComponent(batchId)}`, {
      method: "GET",
      headers: this.buildJsonHeaders(),
    });
    const data = asRecord(response.data);
    const results = readArray(data, ["extract_result", "extractResult"]);
    const match = results
      .map((item) => normalizeBatchResult(item))
      .find((item) => item.fileName === fileName);

    if (!match) {
      throw new Error(`MinerU batch ${batchId} does not contain file "${fileName}".`);
    }

    return match;
  }

  private buildJsonHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.token}`,
    };
  }

  private async fetchJson(relativePath: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${trimTrailingSlash(this.config.baseUrl)}${relativePath}`, init);
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(`MinerU request failed with status ${response.status}: ${JSON.stringify(payload)}`);
    }

    const record = asRecord(payload);
    const code = typeof record.code === "number" ? record.code : 0;
    if (code !== 0) {
      throw new Error(`MinerU request failed: ${readString(record, ["msg", "message"]) ?? `code=${code}`}`);
    }

    return record;
  }

  private async fetchAgentJson(relativePath: string, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${trimTrailingSlash(this.config.agentBaseUrl)}/agent${relativePath}`, init);
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(`MinerU Agent request failed with status ${response.status}: ${JSON.stringify(payload)}`);
    }

    const record = asRecord(payload);
    const code = typeof record.code === "number" ? record.code : 0;
    if (code !== 0) {
      throw new Error(`MinerU Agent request failed: ${readString(record, ["msg", "message"]) ?? `code=${code}`}`);
    }

    return record;
  }
}

function normalizeBatchResult(value: unknown): MineruBatchResult {
  const record = asRecord(value);
  const progress = asRecord(record.extract_progress);

  return {
    fileName: readString(record, ["file_name", "fileName"]) ?? "",
    state: readString(record, ["state"]) ?? "unknown",
    errMsg: readString(record, ["err_msg", "errMsg"]),
    fullZipUrl: readString(record, ["full_zip_url", "fullZipUrl"]),
    fullMarkdownUrl: readString(record, ["full_md_url", "fullMdUrl", "md_url", "mdUrl"]),
    extractedPages: readNumber(progress, ["extracted_pages", "extractedPages"]),
    totalPages: readNumber(progress, ["total_pages", "totalPages"]),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function readStringArray(record: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  }

  return [];
}

function readArray(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return undefined;
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
