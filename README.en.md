# Kitty

Kitty is a minimal coding agent runtime.

The current design optimizes for simplicity, clarity, and maintainability first. The default core contains only the agent loop, context, session, config, providers, UI entry points, and four foundation tools:

- `read`: read text files.
- `edit`: perform exact replacements against current file content.
- `write`: create or overwrite files.
- `bash`: run local commands.

The core does not include task boards, background jobs, collaboration systems, web research, document parsing, or automatic delegation. Those capabilities should be handled with files, command-line tools, or future standalone extensions instead of returning to the default core.

## Layout

- `src/agent/`: agent loop, provider layer, session, context runtime, and the four tools.
- `src/config/`: config loading and normalization.
- `src/context/`: project context and repository root detection.
- `src/host/`: shared host boundary for CLI, Web, and Telegram.
- `src/runtime-ui/`: runtime event rendering.
- `src/web/`: Web workbench.
- `src/telegram/`: Telegram private chat host.
- `tests/core/`: core tool and prompt-contract tests.
- `tests/production-line/`: repository structure contracts.

## Development

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run verify:repo-contracts
```

Before publishing, run at least:

```bash
npm.cmd run check
npm.cmd run verify
```

