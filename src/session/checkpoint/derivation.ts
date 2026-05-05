import type { SessionCheckpointToolBatch, SessionRecord, StoredMessage } from "../../types.js";
import { MAX_BATCH_PATHS, MAX_BATCH_TOOLS, MAX_COMPLETED_STEPS, MAX_SUMMARY_CHARS, normalizeText, normalizeTimestamp, readString, safeParseObject, takeLastUnique, truncate } from "./shared.js";

export function deriveCompletedSteps(session: SessionRecord): string[] {
  const completedActions = session.taskState?.completedActions ?? [];
  return takeLastUnique(completedActions, MAX_COMPLETED_STEPS);
}

export function deriveRecentToolBatchFromMessages(
  messages: StoredMessage[],
  timestamp: string,
): SessionCheckpointToolBatch | undefined {
  let lastToolIndex = messages.length - 1;
  while (lastToolIndex >= 0 && messages[lastToolIndex]?.role !== "tool") {
    lastToolIndex -= 1;
  }

  if (lastToolIndex < 0) {
    return undefined;
  }
  let startIndex = lastToolIndex;
  while (startIndex >= 0 && messages[startIndex]?.role === "tool") {
    startIndex -= 1;
  }

  const toolMessages = messages
    .slice(startIndex + 1, lastToolIndex + 1)
    .filter((message) => message.role === "tool");
  const toolNames = toolMessages
    .map((message) => normalizeText(message.name))
    .filter(Boolean) as string[];

  return buildToolBatch(toolNames, toolMessages, undefined, timestamp);
}

export function buildToolBatch(
  toolNames: string[],
  toolMessages: StoredMessage[],
  changedPaths: string[] | undefined,
  timestamp: string,
): SessionCheckpointToolBatch | undefined {
  const tools = takeLastUnique(toolNames, MAX_BATCH_TOOLS);
  if (tools.length === 0) {
    return undefined;
  }
  const batchChangedPaths = takeLastUnique(
    [
      ...(changedPaths ?? []),
      ...toolMessages
        .map((message) => readPathFromMessage(message))
        .filter(Boolean) as string[],
    ],
    MAX_BATCH_PATHS,
  );
  const recordedAt = normalizeTimestamp(
    toolMessages[toolMessages.length - 1]?.createdAt,
    timestamp,
  );

  return {
    tools,
    summary: buildToolBatchSummary(tools, batchChangedPaths),
    changedPaths: batchChangedPaths,
    recordedAt,
  };
}

function readPathFromMessage(message: StoredMessage): string | undefined {
  const payload = safeParseObject(message.content);
  return readString(payload?.path) ?? readString(payload?.requestedPath);
}

function buildToolBatchSummary(
  toolNames: string[],
  changedPaths: string[],
): string {
  const fragments = [`Ran ${toolNames.join(", ")}`];

  if (changedPaths.length > 0) {
    fragments.push(`changed ${changedPaths.join(" | ")}`);
  }
  return truncate(fragments.join("; "), MAX_SUMMARY_CHARS)!;
}
