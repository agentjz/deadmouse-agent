# Kitty 速度优先瘦身重构执行 Checklist

## 已确定方向

- [ ] Kitty 追求快刀斩乱麻的编程体验。
- [ ] Kitty 追求“天下武功唯快不破”。
- [ ] 成功就是成功，不展开账本。
- [ ] 只有失败时才展开简短、可恢复的证据。
- [ ] 机器层只记录事实，不替模型做决策。
- [ ] 机器层不强制“下一步必须怎样”。
- [ ] 模型才是最终裁判。
- [ ] runtime 提供死的事实，模型基于事实继续推进。
- [ ] 这是激进项目，拒绝保守主义。
- [ ] 不做旧输出兼容。
- [ ] 不保留无意义旧字段。
- [ ] 不为了“稳”牺牲基础编程速度。

## 执行策略

- [ ] 当前任务就是先完成一场大幅瘦身。
- [ ] 先集中大幅删除、压缩、改短模型热路径输出。
- [ ] 不改一点测一点。
- [ ] 不边改边循环。
- [ ] 等大幅瘦身整体完成后，再进入真实 CLI 循环测试。
- [ ] 循环测试只用于瘦身完成后的验收和二次修正。
- [ ] 不先做复杂测量系统。
- [ ] 不先写固定 harness。
- [ ] 不把测试变成 runtime 门槛。
- [ ] 大幅瘦身完成后，每一轮测试都用真实构建产物跑。
- [ ] 大幅瘦身完成后，每一轮测试都看真实日志、session、tool trace。
- [ ] 瘦身后的二次修正来自真实运行暴露的问题。

## 总体重构目标

- [ ] 模型热路径只保留下一步需要的最短事实。
- [ ] UI 只展示人类能读懂的过程和结果。
- [ ] ledger 只记录恢复、resume、trace、审计需要的最小事实。
- [ ] 成功输出从“账本 JSON”改成“短结果”。
- [ ] 失败输出从“协议 JSON”改成“短错误 + 下一刀证据”。
- [ ] 基础工具体验靠近熟练工程师：搜、读、改、diff、必要时测。

## 第一刀：建立统一输出投影

- [ ] 在 tool executor / finalize 附近建立统一输出投影层。
- [ ] 禁止每个工具自己随意拼大 JSON 给模型。
- [ ] 内部工具结果可以结构化。
- [ ] 给模型的输出必须极短。
- [ ] 给 UI 的输出必须人类可读。
- [ ] 给 ledger 的输出必须最小可恢复。
- [ ] 成功时默认不输出 protocol。
- [ ] 成功时默认不输出 sessionDiff。
- [ ] 成功时默认不输出 clean diagnostics。
- [ ] 成功时默认不输出重复 preview。

技术执行：

- [ ] 新增统一投影函数，例如 `projectToolResultForModel`。
- [ ] 模型消息使用投影后的短输出。
- [ ] session / trace / change store 使用 ledger。
- [ ] 删除旧的模型可见大字段，不做兼容。

## 第二刀：瘦身 read_file

- [ ] 成功只给模型：路径、行号、内容。
- [ ] 有更多内容时只给下一次 read 参数。
- [ ] 默认不输出 `absolutePath`。
- [ ] 默认不输出完整 `identity`。
- [ ] 默认不输出完整 `anchors`。
- [ ] 默认不输出 `anchorWindow`。
- [ ] 默认不输出 protocol。
- [ ] anchors / identity 只进机器账本。

目标模型输出：

```text
src/a.ts:120-145
120 | ...
121 | ...
next: read_file {"path":"src/a.ts","offset":146,"limit":40}
```

执行判断：

- [ ] read_file 不是审计报告。
- [ ] read_file 是模型的眼睛。
- [ ] 眼睛要快，要直接看到内容。

## 第三刀：瘦身 edit_file

- [ ] `edit_file` 只锁目标位置。
- [ ] 不锁整份文件。
- [ ] 文件别处变了，不阻止编辑。
- [ ] 文件别处变了，不提醒模型。
- [ ] 目标位置没变，直接成功。
- [ ] 目标位置变了，失败并返回 fresh read 参数。
- [ ] 多处匹配，失败并要求 old text 更具体。
- [ ] 重叠编辑，失败并要求合并 edits。
- [ ] 成功只返回文件、替换次数、短 diff。
- [ ] 成功不返回 `identityChangedBeforeEdit`。
- [ ] 成功不返回完整 diagnostics。
- [ ] 成功不返回 sessionDiff。

目标模型输出：

```text
edited src/a.ts (1 replacement)
- old
+ new
```

执行判断：

- [ ] edit_file 是镊子，不是文件审计器。
- [ ] 能安全改目标位置就立刻改。
- [ ] 不要因为别处变化拖慢模型。

## 第四刀：强化 patch_file 快刀

- [ ] `patch_file` 是强模型主力快改路径。
- [ ] 多文件改动优先 patch_file。
- [ ] 结构性改动优先 patch_file。
- [ ] 成功只返回文件数、hunk 数、短 diff。
- [ ] 成功不返回 protocol。
- [ ] 成功不返回完整 sessionDiff。
- [ ] 失败只返回文件、失败位置、失败 hunk、fresh read 参数。
- [ ] 失败后机器不自动 fallback。
- [ ] 模型自己决定重写 patch 还是切 edit_file。

目标失败输出：

```text
patch failed: src/a.ts near line 80
read: read_file {"path":"src/a.ts","offset":70,"limit":40}
```

执行判断：

- [ ] patch_file 是快刀。
- [ ] 快刀可以失败。
- [ ] 失败要短、准、能继续。

## 第五刀：瘦身 write_file

- [ ] 成功只返回路径、字节数、短 diff。
- [ ] 成功不返回完整 diagnostics。
- [ ] 成功不返回 sessionDiff。
- [ ] 成功不返回 protocol。
- [ ] 保留新建文件能力。
- [ ] 重新设计已有文件覆盖路径，不保留旧保守逻辑。

执行判断：

- [ ] write_file 是新建和全量写入工具。
- [ ] 如果真实循环显示覆盖已有文件更快，就设计显式快速覆盖协议。
- [ ] 不让旧的保守 guard 永久绑架速度。

## 第六刀：瘦身 git 工具

- [ ] `git_status` 默认只给短摘要。
- [ ] `git_status` 大结果只给计数和少量文件。
- [ ] `git_diff` 默认给 stat + diff。
- [ ] 大 diff 冷存，只给摘要和读取入口。
- [ ] `git_diff` 保留热路径。
- [ ] `git_diff` 不算保守主义。

目标输出：

```text
3 files changed, +130 -41
src/a.ts +20 -3
src/b.ts +9 -1
```

执行判断：

- [ ] diff 是镜子。
- [ ] 快改之后必须照镜子。
- [ ] 但镜子不能变成审计报告。

## 第七刀：瘦身 run_shell

- [ ] 成功只返回 exit code、耗时、短输出。
- [ ] 不每次返回 shellGuidance。
- [ ] 不每次返回 platform。
- [ ] 不每次返回 shellInvocation。
- [ ] shell 方言提示只在失败或必要时出现。
- [ ] 长输出冷存。
- [ ] 失败返回 stderr 摘要和恢复信息。

目标输出：

```text
exit 0 in 372ms
v22.19.0
```

执行判断：

- [ ] run_shell 是验证和必要命令工具。
- [ ] 成功时不要啰嗦。
- [ ] 失败时再解释。

## 第八刀：砍保守 guard

- [ ] 扫描所有基础工具 guard。
- [ ] 删除只会制造绕路的 guard。
- [ ] 保留能防灾、且有快替代路径的 guard。
- [ ] `write_file` 禁止覆盖必须重新评估。
- [ ] `run_shell` 禁止直接读文件必须重新评估。
- [ ] 参数 strictness 如果导致反复修参数，就改轻。
- [ ] todo 只做强建议，不做强制机器约束。
- [ ] verification 只做事实记录，不做强制下一步。

执行判断：

- [ ] guard 不是越多越好。
- [ ] guard 只应该挡灾难，不应该挡速度。
- [ ] 如果 guard 让模型绕路，就删或重写。

## 第九刀：瘦身系统提示

- [ ] 删除流程味太重的提示。
- [ ] 删除过度解释 runtime 的提示。
- [ ] 删除让模型犹豫的成功提醒。
- [ ] 保留最短工具哲学。
- [ ] 保留定位、读取、编辑、diff、测试的主链路。
- [ ] 成功时不提示“证据如何恢复”。
- [ ] 失败时才提示 fresh read / rewrite patch。

目标提示哲学：

```text
定位事实 -> 精读 -> patch/edit/write -> git_diff -> 必要时 run_shell
```

## 第十刀：大幅瘦身完成后的真实循环检查

- [ ] 只有前九刀整体完成后，才进入这一阶段。
- [ ] 这一阶段是验收，不是边改边试探。
- [ ] build 后用 `node dist/cli.js agent "<自由 prompt>"` 跑。
- [ ] 跑只读定位循环。
- [ ] 跑小范围 edit_file 循环。
- [ ] 跑多文件 patch_file 循环。
- [ ] 跑 patch 失败恢复循环。
- [ ] 跑 run_shell 验证循环。
- [ ] 看真实 terminal log。
- [ ] 看 session。
- [ ] 看 tool trace。
- [ ] 看 token 是否下降。
- [ ] 看 tool call 是否减少。
- [ ] 看失败是否仍能恢复。

## 必砍字段

- [ ] 成功结果里的 `protocol`。
- [ ] 成功结果里的 `absolutePath`。
- [ ] 成功结果里的完整 `sessionDiff`。
- [ ] 成功结果里的 clean `diagnostics`。
- [ ] 成功结果里的 `identityChangedBeforeEdit`。
- [ ] 成功结果里的重复 `preview`。
- [ ] 成功结果里的重复 `diff`。
- [ ] `read_file` 默认完整 `anchors`。
- [ ] `read_file` 默认完整 `identity`。
- [ ] `run_shell` 成功时的 shellGuidance。
- [ ] `run_shell` 成功时的 shellInvocation。

## 暂不砍能力

- [ ] 不砍 `patch_file`。
- [ ] 不砍 `edit_file`。
- [ ] 不砍 `git_diff`。
- [ ] 不砍最小 ledger。
- [ ] 不砍 resume 需要的最小 session 事实。
- [ ] 不砍失败恢复需要的 fresh read 参数。

## 完成标准

- [ ] 小改任务明显更快。
- [ ] 成功输出明显更短。
- [ ] 模型不再读账本 JSON。
- [ ] 失败恢复仍然清楚。
- [ ] `patch_file` 默认成为快改主路径。
- [ ] `edit_file` 不因为文件别处变化拖慢。
- [ ] CLI 真实循环 token 明显下降。
- [ ] UI 仍能展示清楚过程。
- [ ] resume 仍能依靠最小事实恢复。
