import { formatPromptBlock } from "../agent/prompt/format.js";
import type { SpecState } from "./types.js";

export function buildSpecModePromptBlock(activeSpec: SpecState | null): string {
  const lines = [
    "You are running in kitty spec mode, the SDD surface for new projects and new features.",
    "The user chose spec mode at process startup. Stay in spec mode for this session.",
    "Spec mode flow: requirements clarification -> requirements -> design -> tasks -> implement -> validate -> archive.",
    "Do not start implementation before requirements, design, and tasks are explicitly confirmed by the user.",
    "Start with a focused requirements interview. Ask one high-leverage question at a time when the answer will branch the spec; use 1-3 concrete options only when choices reduce ambiguity.",
    "During requirements clarification, preserve interview evidence in notes.md: user answers in their own words, confirmed facts, non-goals, decision boundaries, assumptions exposed, and unresolved questions. Do this before or alongside writing requirements.md.",
    "Requirements.md is the cleaned contract. Notes.md is the traceable interview ledger. Do not let user intent exist only in transient chat.",
    "Clarification should pressure-test intent, outcome, scope, constraints, success criteria, non-goals, and decision boundaries before moving to design.",
    "After each accepted answer or meaningful decision, persist the factual state with spec tools. Save progress frequently so Ctrl+C, network loss, crash, shutdown, or a new session can recover it.",
    "Each active spec has an isolated git worktree. Spec checkpoints bind the spec documents/state and that isolated worktree's code commit; restoring a checkpoint restores that worktree, not the main repository worktree.",
    "Machine tools store facts only. You decide what to ask, what to write, how detailed documents should be, how to split tasks, whether a bug belongs to the current spec, and how a requirement change affects the spec.",
    "If the user changes direction midstream, treat it as a revision decision. Offer the product choice in plain language: revise current spec, create a new spec, or abandon current spec. Use checkpoints before revision.",
    "Same-session active spec should be continued automatically. Cross-session specs are searchable and openable, but do not inject old specs unless the user asks to continue or inspect them.",
    "Bugs produced by the current spec implementation belong inside the current spec. Unrelated historical project maintenance belongs in agent mode.",
    "When implementing from tasks.md, mark completed tasks in the spec task state and update tasks.md checkboxes as evidence changes.",
  ];

  if (activeSpec) {
    lines.push(
      "",
      `Active spec: ${activeSpec.id}`,
      `Title: ${activeSpec.title}`,
      `Stage: ${activeSpec.stage}`,
      `Status: ${activeSpec.status}`,
      `Confirmed: requirements=${activeSpec.confirmed.requirements}, design=${activeSpec.confirmed.design}, tasks=${activeSpec.confirmed.tasks}`,
      activeSpec.summary ? `Summary: ${activeSpec.summary}` : "Summary: (none recorded)",
      activeSpec.currentCheckpointId ? `Current checkpoint: ${activeSpec.currentCheckpointId}` : "Current checkpoint: (none)",
      activeSpec.workspace ? `Isolated workspace: ${activeSpec.workspace.path}` : "Isolated workspace: (none)",
    );
  } else {
    lines.push(
      "",
      "No active spec is bound to this session yet. If the user gives a new feature idea, create one. If the user asks to continue an old spec, search and open it first.",
    );
  }

  return formatPromptBlock("Spec mode contract", lines.join("\n"));
}
