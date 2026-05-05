import type { AgentIdentity } from "../types.js";

export function buildInternalWakeInput(
  identity: AgentIdentity | undefined,
): string {
  void identity;
  const lines = [
    "[internal] Wake lead runtime; runtime state changed. This is not a user objective.",
    "Keep the latest real user input as the current objective.",
  ];

  return lines.join("\n");
}
