# Kitty

Kitty 是一个极简编程 Agent runtime。

当前设计先追求简单、清晰、可维护。默认核心只包含 Agent 循环、上下文、会话、配置、Provider、UI 入口，以及四个基础工具：

- `read`：读取文本文件。
- `edit`：按当前文件内容做精确替换。
- `write`：创建或覆盖文件。
- `bash`：运行本机命令。

核心不内置任务面板、后台任务、团队协作、联网研究、文档解析或自动委派。需要这些能力时，优先用文件、命令行或未来独立扩展完成，不把它们塞回默认核心。

## 目录

- `src/agent/`：Agent 循环、Provider、Session、Context runtime、四件套工具。
- `src/config/`：配置读取和归一化。
- `src/context/`：项目上下文和仓库根识别。
- `src/host/`：CLI、Web、Telegram 等宿主入口共享的运行边界。
- `src/runtime-ui/`：运行时事件显示。
- `src/web/`：Web workbench。
- `src/telegram/`：Telegram 私聊入口。
- `tests/core/`：核心工具和提示词契约测试。
- `tests/production-line/`：仓库结构契约。

## 开发

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run verify:repo-contracts
```

发布前应至少通过：

```bash
npm.cmd run check
npm.cmd run verify
```

