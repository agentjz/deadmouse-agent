export interface MineruBatchCreateInput {
  fileName: string;
  isOcr: boolean;
  language?: string;
  modelVersion?: string;
  enableTable?: boolean;
  enableFormula?: boolean;
}

export interface MineruBatchCreateResult {
  batchId: string;
  fileUrls: string[];
}

export interface MineruBatchResult {
  fileName: string;
  state: string;
  errMsg?: string;
  fullZipUrl?: string;
  fullMarkdownUrl?: string;
  extractedPages?: number;
  totalPages?: number;
}

export interface MineruAgentParseInput {
  filePath: string;
  fileName: string;
  isOcr: boolean;
  language?: string;
  enableTable?: boolean;
  enableFormula?: boolean;
}

export interface MineruAgentFileTask {
  taskId: string;
  fileUrl: string;
}

export interface MineruAgentTaskResult {
  taskId: string;
  state: string;
  markdownUrl?: string;
  errCode?: number;
  errMsg?: string;
}

export interface MineruAgentParseResult {
  taskId: string;
  state: string;
  markdown: string;
  markdownUrl: string;
}
