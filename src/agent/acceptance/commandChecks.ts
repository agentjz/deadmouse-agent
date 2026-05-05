import type { AcceptanceContract, StoredMessage } from "../../types.js";
import { tryParseRecord } from "./utils.js";

export function evaluateCommandChecks(contract: AcceptanceContract, messages: StoredMessage[]): {
  completedChecks: string[];
  pendingChecks: string[];
} {
  const completedChecks: string[] = [];
  const pendingChecks: string[] = [];

  for (const check of contract.commandChecks) {
    if (hasSuccessfulCommand(messages, check.commandContains)) {
      completedChecks.push(`command:${check.id}`);
    } else {
      pendingChecks.push(`command:${check.id}`);
    }
  }

  return {
    completedChecks,
    pendingChecks,
  };
}

function hasSuccessfulCommand(messages: StoredMessage[], commandContains: string): boolean {
  const needle = commandContains.toLowerCase();
  return messages.some((message) => {
    if (message.role !== "tool" || !message.content || message.name !== "bash") {
      return false;
    }

    const payload = tryParseRecord(message.content);
    if (!payload) {
      return false;
    }

    const command = String(payload.command ?? "").toLowerCase();
    const status = String(payload.status ?? "").toLowerCase();
    const exitCode = typeof payload.exitCode === "number" ? payload.exitCode : null;
    return command.includes(needle) && status === "completed" && exitCode === 0;
  });
}
