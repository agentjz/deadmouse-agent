import { formatRuntimeUiRoleLabel } from "../runtime-ui/channelIdentity.js";
import { buildToolCallDisplay, buildToolFailureDetail, buildToolResultDisplay } from "../runtime-ui/toolDisplay.js";
import type { WorkbenchBroadcaster } from "./broadcaster.js";
import { nowEventTime, type WorkbenchEvent, type WorkbenchRuntimeChannel, type WorkbenchRuntimeLineEvent, type WorkbenchRuntimeLineKind } from "./events.js";

export function sendToolCallLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  args: string;
  cwd: string;
}): void {
  sendRuntimeLineEvent(input.broadcaster, createToolCallRuntimeLine({
    channel: "lead",
    name: input.name,
    args: input.args,
    cwd: input.cwd,
  }));
}

export function sendToolResultLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  output: string;
  cwd: string;
}): void {
  const event = createToolResultRuntimeLine({
    channel: "lead",
    name: input.name,
    output: input.output,
    cwd: input.cwd,
  });
  if (event) {
    sendRuntimeLineEvent(input.broadcaster, event);
    return;
  }
}

export function sendToolErrorLine(input: {
  broadcaster: WorkbenchBroadcaster;
  name: string;
  error: string;
  cwd: string;
}): void {
  sendRuntimeLineEvent(input.broadcaster, {
    channel: "lead",
    kind: "error",
    message: `${input.name} failed`,
    detail: buildToolFailureDetail(input.name, input.error, input.cwd),
  });
}

export function createRuntimeLineEvent(
  input: {
    channel: WorkbenchRuntimeChannel;
    kind: WorkbenchRuntimeLineKind;
    label?: string;
    message: string;
    detail?: string;
    executionId?: string;
  },
): WorkbenchEvent | null {
  if (!input.message && !input.detail) {
    return null;
  }
  return {
    type: "runtime.line",
    channel: input.channel,
    kind: input.kind,
    label: input.label ?? runtimeLineLabel(input.channel, input.kind),
    message: input.message,
    detail: input.detail,
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

export function createToolCallRuntimeLine(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  args: string;
  cwd?: string;
  executionId?: string;
}): WorkbenchRuntimeLineEvent {
  const display = buildToolCallDisplay(input.name, input.args, 160, input.cwd);
  return {
    type: "runtime.line",
    channel: input.channel,
    kind: "tool",
    message: display.summary,
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

export function createToolCallRuntimeLineSummary(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  args: string;
  cwd?: string;
  executionId?: string;
}): Pick<WorkbenchRuntimeLineEvent, "channel" | "kind" | "label" | "message" | "detail" | "executionId"> {
  const event = createToolCallRuntimeLine(input);
  return {
    channel: event.channel,
    kind: event.kind,
    label: event.label,
    message: event.message,
    detail: event.detail,
    executionId: event.executionId,
  };
}

export function createToolResultRuntimeLine(input: {
  channel: WorkbenchRuntimeChannel;
  name: string;
  output: string;
  cwd?: string;
  executionId?: string;
}): WorkbenchRuntimeLineEvent | null {
  const display = buildToolResultDisplay(input.name, input.output, input.cwd);
  const ok = display.ok !== false;
  if (ok) {
    return null;
  }

  return {
    type: "runtime.line",
    channel: input.channel,
    kind: "result",
    message: `${display.summary || input.name} failed`,
    detail: buildToolFailureDetail(input.name, input.output, input.cwd),
    executionId: input.executionId,
    createdAt: nowEventTime(),
  };
}

function sendRuntimeLineEvent(
  broadcaster: WorkbenchBroadcaster,
  input: {
    channel: WorkbenchRuntimeChannel;
    kind: WorkbenchRuntimeLineKind;
    label?: string;
    message: string;
    detail?: string;
    executionId?: string;
  },
): void {
  const event = createRuntimeLineEvent(input);
  if (event) {
    broadcaster.send(event);
  }
}

function runtimeLineLabel(channel: WorkbenchRuntimeChannel, kind: WorkbenchRuntimeLineKind): string | undefined {
  if (kind === "assistant") {
    return formatRuntimeUiRoleLabel(channel, "assistant");
  }
  if (kind === "reasoning") {
    return formatRuntimeUiRoleLabel(channel, "reasoning");
  }
  if (kind === "tool") {
    return "工具";
  }
  if (kind === "result") {
    return "结果";
  }
  if (kind === "error") {
    return "错误";
  }
  if (kind === "status") {
    return "状态";
  }
  return undefined;
}
