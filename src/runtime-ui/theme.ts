import chalk from "chalk";

import type { RuntimeUiChannel } from "./events.js";
import { getRuntimeUiChannelIdentity } from "./channelIdentity.js";

export type RuntimeUiSemanticTag = "tool" | "dispatch" | "result" | "preview" | "content";

export function formatRuntimeUiChannelHeader(channel: RuntimeUiChannel): string {
  return channelHeaderColor(channel)(`[${channelLabel(channel)}]`);
}

export function formatRuntimeUiSemanticTag(tag: RuntimeUiSemanticTag, state?: "ok" | "failed"): string {
  switch (tag) {
    case "tool":
    case "dispatch":
      return chalk.magenta(`[${tag}]`);
    case "result":
      return state === "failed" ? chalk.red("[result]") : "[result]";
    case "preview":
    case "content":
      return `[${tag}]`;
  }
}

export function colorRuntimeUiText(channel: RuntimeUiChannel, text: string): string {
  return colorForChannel(channel)(text);
}

export function channelLabel(channel: RuntimeUiChannel): string {
  return getRuntimeUiChannelIdentity(channel).label;
}

function colorForChannel(channel: RuntimeUiChannel): (text: string) => string {
  switch (channel) {
    case "dream":
    case "workflow":
    case "subagent":
    case "team":
    case "background":
      return chalk.gray;
    case "system":
      return chalk.gray;
    case "lead":
      return (text: string) => text;
  }
}

function channelHeaderColor(channel: RuntimeUiChannel): (text: string) => string {
  switch (channel) {
    case "lead":
    case "dream":
    case "workflow":
    case "subagent":
    case "team":
    case "background":
    case "system":
      return chalk.red.bold;
  }
}
