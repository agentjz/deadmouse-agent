# Spec Runtime Boundary

`src/spec` owns durable spec state, layout, prompt contract, and mode runtime assembly.

Each spec owns an isolated git worktree under `.kitty/specs/workspaces/`. Spec checkpoints bind two facts together:

- spec facts: state, stage, confirmed flags, tasks, and markdown documents
- code facts: the isolated worktree branch and checkpoint commit

Restoring a checkpoint restores both the spec facts and the isolated worktree code state. It never resets the main repository worktree.

`notes.md` is the interview evidence ledger. Requirements, design, and tasks are cleaned contract documents; notes preserve the user answers, confirmed facts, non-goals, assumptions, decision boundaries, and unresolved questions that led to those documents.

Spec tools are concrete capability surfaces and live under `src/capabilities/tools/packages/spec/`.
Spec CLI and terminal interaction entrypoints live under `src/cli/` and `src/ui/`.

Machine code stores, appends, and restores facts only. The model decides what to ask, which user answers matter, what to record in notes, when to create a spec, when to checkpoint, which checkpoint to restore, and how to handle requirement revisions.
