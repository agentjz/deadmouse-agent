import type { TelegramConfig, TelegramRuntimeConfig } from "../config/hosts.js";

export type ModelThinkingMode = "enabled" | "disabled";
export type ModelReasoningEffort = "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AppPaths {
  configDir: string;
  dataDir: string;
  cacheDir: string;
  configFile: string;
  sessionsDir: string;
  changesDir: string;
}

export interface AppConfig {
  schemaVersion: 1;
  provider: string;
  baseUrl: string;
  model: string;
  profile: string;
  thinking?: ModelThinkingMode;
  reasoningEffort?: ModelReasoningEffort;
  maxOutputTokens?: number;
  yieldAfterToolSteps: number;
  contextWindowMessages: number;
  maxContextChars: number;
  contextSummaryChars: number;
  maxToolIterations: number;
  maxContinuationBatches: number;
  providerRecoveryMaxAttempts?: number;
  providerRecoveryMaxElapsedMs?: number;
  managedTurnMaxSlices?: number;
  managedTurnMaxElapsedMs?: number;
  maxReadBytes: number;
  maxSearchResults: number;
  commandStallTimeoutMs: number;
  commandMaxRetries: number;
  commandRetryBackoffMs: number;
  showReasoning: boolean;
  telegram: TelegramConfig;
}

export interface RuntimeConfig extends AppConfig {
  apiKey: string;
  paths: AppPaths;
  telegram: TelegramRuntimeConfig;
}

export interface CliOverrides {
  cwd?: string;
  model?: string;
}

