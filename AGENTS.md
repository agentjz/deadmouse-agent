# Kitty Agent 运行宪法

## 0. 沟通铁律

项目所有者不懂代码细节。沟通时永远先说用户体验、真实使用感受、架构判断、风险和验证状态。

不要向项目所有者倾倒技术细节。除非被明确要求，不解释内部实现，不粘贴大段日志，不用复杂术语包装简单事实。

所有沟通必须使用简体中文，必须简短、直接、基于仓库事实。不要编造实现、行为、计划或验证结果。没有验证，就不要说完成。

## 1. 编码铁律

除非文件格式明确要求其他编码，否则本仓库所有文件都必须按 UTF-8 阅读和写入。

永远不要用脚本对源码做批量字符串替换。涉及路径、命名、概念和架构迁移时，先删除或移动旧结构，再按当前真相手工重建。

物理删除，不做优雅过渡。确定废弃的旧东西要直接删除，避免打补丁、旧实现残留、概念别名、半新半旧的复杂状态。需要这类能力时，按当前设计重新建。

不要用兜底补丁伪装架构。runtime 不偷偷改写历史、工具结果或用户内容。需要的能力必须成为正式链路，不需要的兜底直接删除。

## 2. 持续运行

持续运行是 Kitty 的基本体验。

Kitty 要支持模型长时间工作，目标是 24 小时、7x24 小时，甚至长期持续运行。上下文变长、网络抖动、provider 临时失败，不能轻易把编程体验打断。

用户看到的体验应该是：任务还在，状态还在，session 还能继续，失败信息短而可行动。只有真正不可恢复的硬错误才停止。

Agent 不是小孩，不需要保姆。它需要清晰环境、清晰工具、清晰反馈。不要给模型堆限制、路线指挥、预算暂停和假保护。

## 3. 当前架构

Kitty 是一个极简编程 Agent runtime。

它的核心体验是：

搜得到，看得懂，改得准，跑得通，记得住，能继续。

当前有六大核心模块：

- Agent 循环：让模型一轮一轮工作，持续推进和收尾。
- Context 上下文：告诉模型当前该看什么，长任务中负责压缩上下文。
- Session 连续性：保存对话、工作记忆、checkpoint 和恢复状态。
- Provider / Config：连接不同模型，处理 API 差异和临时失败恢复。
- Tools：默认只暴露 `read`、`edit`、`write`、`bash`。
- Observability：记录事件、终端日志和崩溃事实，只当记录仪，不当第二个脑子。

默认核心只做编程 runtime。复杂能力未来走扩展入口，不能污染默认核心。

## 4. 工作方式

不要机械执行用户字面指令。用户给出局部方向时，必须先基于仓库事实主动 research，理解目标、边界、相关模块和风险，再形成系统判断。

要有架构师思维。不要单点乱改；涉及六大核心边界时，要一起看 Agent、Context、Session、Provider、Tools、Observability。

不要为了满足一句话而删除、集中、重写或保留任何东西。架构动作只能服务当前真实架构。

## 5. 仓库地图

- `src/agent/`：Agent 循环、prompt、turn 执行。
- `src/context/`：项目上下文、运行时上下文、长上下文压缩。
- `src/session/`：session、checkpoint、工作记忆、连续性。
- `src/provider/`：模型 provider 调用链、API 适配、请求恢复。
- `src/config/`：配置、环境变量、provider 设置。
- `src/tools/`：四个基础工具和共享工具 runtime。
- `src/host/`：CLI、Web、Telegram 共用运行边界。
- `src/runtime-ui/`：运行时展示。
- `src/observability/`：事件、终端日志、崩溃记录。
- `src/shell/`、`src/web/`、`src/telegram/`：具体产品入口。
- `tests/core/`：核心行为测试。
- `tests/production-line/verify-repo-contracts.ts`：仓库结构契约。

## 6. 验证

写文件不是完成。验证通过才是完成。

搜索、Git 检查、构建、测试和本地验证，都通过 `bash` 完成。

大型改动完成前运行：

```bash
npm.cmd run verify
```

常用命令：

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run test:core
npm.cmd run verify:repo-contracts
```

不要 git commit / git push，除非项目所有者明确要求。
