# Kitty

Kitty 是一个极简编程 Agent runtime。

它不追求把所有能力都塞进默认核心。默认核心只服务一件事：让强模型像成熟工程师一样持续编程。

核心体验很简单：

搜得到，看得懂，改得准，跑得通，记得住，能继续。

## 当前核心

Kitty 当前由六块组成：

| 核心 | 作用 |
| --- | --- |
| Agent 循环 | 一轮一轮让模型工作，调用工具，继续推进，最后收尾。 |
| Context 上下文 | 告诉模型现在该看什么；长任务中负责压缩上下文。 |
| Session 连续性 | 保存对话、工作记忆、checkpoint 和恢复状态。 |
| Provider / Config | 连接 OpenAI、DeepSeek 等模型，处理 API 差异和临时失败恢复。 |
| Tools | 默认四个基础手脚：`read`、`edit`、`write`、`bash`。 |
| Observability | 记录事件、终端日志、崩溃事实；只当记录仪，不当第二个脑子。 |

## 默认工具

| 工具 | 作用 |
| --- | --- |
| `read` | 读取本地文本文件。 |
| `edit` | 按当前文件内容做精确替换。 |
| `write` | 创建或覆盖文件。 |
| `bash` | 运行本机命令；搜索、Git、构建、测试都走这里。 |

默认核心不内置联网搜索、MCP、团队协作、子代理、后台任务、文档解析或旧能力生态。未来可以加扩展，但扩展必须有明确入口，不能污染默认核心。

## 目录

| 路径 | 职责 |
| --- | --- |
| `src/agent/` | Agent 循环、prompt、turn 执行。 |
| `src/context/` | 项目上下文、运行时上下文、长上下文压缩。 |
| `src/session/` | session、checkpoint、工作记忆、连续性。 |
| `src/provider/` | 模型 provider 调用链、API 适配、请求恢复。 |
| `src/config/` | 配置、环境变量、provider 设置。 |
| `src/tools/` | 四个基础工具和共享工具 runtime。 |
| `src/host/` | CLI、Web、Telegram 共用运行边界。 |
| `src/runtime-ui/` | 运行时展示。 |
| `src/observability/` | 事件、终端日志、崩溃记录。 |
| `src/shell/` | 终端交互入口。 |
| `src/web/` | Web workbench。 |
| `src/telegram/` | Telegram 私聊入口。 |
| `tests/core/` | 核心行为测试。 |
| `tests/production-line/` | 仓库结构契约。 |

## 运行

```bash
npm.cmd install
npm.cmd run build
npm.cmd start
```

常用验证：

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:core
npm.cmd run verify:repo-contracts
npm.cmd run verify
```

## 设计原则

Agent 是大脑，runtime 是身体。

模型负责判断：看什么、改什么、跑什么、失败后怎么继续。

runtime 负责执行：暴露工具、保存连续性、压缩上下文、连接 provider、记录事实。

Kitty 的默认核心要锋利、清楚、可持续。该删的旧东西物理删除；真正需要的能力按当前架构重新建立。
