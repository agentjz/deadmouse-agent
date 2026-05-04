# Kitty / Codex 基础工具打磨循环 Plan

## 最终方向

基础工具的主干哲学固定为：

`定位事实 -> 精读证据 -> 编辑 -> diff 对账 -> 测试验证`

这是一套工程师工作节奏，不是固定脚本。

Kitty 要学习 Codex 的：

- 快速定位事实
- 只读必要上下文
- 快速编辑
- 改完立即 diff
- 最后用命令验证
- 少绕路、少噪音

Kitty 不照搬 Codex 的：

- 不把 `read_file` 退化成裸 `Get-Content`
- 不把所有能力都塞进 `run_shell`
- 不丢掉 anchors、identity、change record、session trace
- 不把机器证据原样塞给模型和用户

最终取舍：

- 机器层保留完整证据
- 模型层只看低噪音、可操作证据
- 用户层只看清楚过程、结果和短失败摘要

## 基础工具范围

只打磨这些基础工具：

- 定位：`list_files` / `find_files` / `search_files`
- 精读：`read_file`
- 编辑：`write_file` / `patch_file` / `edit_file` / `undo_last_change`
- 对账：`git_status` / `git_diff`
- 验证：`run_shell`

不打磨：

- Web UI
- dreaming
- subagent / teammate
- network / documents
- task / worktree / background ecology
- capability package

## 硬规则

1. 不使用固定 `live:ecology -- --group ...` 命令。
2. 不把 live ecology 作为本循环的回归入口。
3. 不写过度严格的测试文件来约束模型。
4. 不强迫模型输出固定报告。
5. 不要求固定格式文件作为通过门槛。
6. 不把测试 harness 的要求塞进 runtime。
7. 所有改动必须来自真实运行暴露的问题。
8. 可以激进删改，但必须基于事实。

## 运行入口

每轮都使用构建产物入口，不使用 `tsx` / `npm run dev`。

每轮先构建：

```powershell
npm.cmd run build
```

然后运行 Kitty：

```powershell
node dist/cli.js agent "<自由 prompt>"
```

判断依据：

- terminal 输出
- session record
- tool trace
- changed paths
- diff
- 工具失败与恢复路径

## 循环流程

每一轮都按这个顺序：

1. 设计一个小而真实的基础工具任务。
2. 用 Codex 风格先跑一遍。
3. 用 Kitty 构建产物 CLI 跑同类自由 prompt。
4. 对比两边输出、速度、噪音、失败恢复。
5. 判断 Kitty 差距在哪里。
6. 如果是工具、提示、展示或证据分层问题，直接改代码。
7. 改完后重新 build。
8. 用相近但不同的自由 prompt 复测。
9. 把观察、改动、复测结果写回本文档。
10. 继续下一轮，直到基础工具手感足够接近“熟练工程师”。

## 每轮记录模板

```md
## Round N - <主题>

### 任务设计

本轮测试什么：

为什么这个任务能暴露问题：

### Codex 侧

命令或提示词：

观察：
- 工具链：
- 速度：
- 噪音：
- 失败/恢复：
- 值得 Kitty 学的点：

### Kitty 侧

自由 prompt：

运行命令：

观察：
- 工具链：
- 速度：
- 噪音：
- 失败/恢复：
- 证据是否有用：
- 证据是否拖慢：

### 差距判断

- 

### 代码改动

- 

### 复测

复测 prompt：

结果：

### 下一轮

- 
```

## Round 1 - 已完成：基础读写改闭环

### 观察

Codex 风格：

- `rg -> Get-Content -> git diff -> node --version`
- 快，直接，短链路。
- 噪音来自裸 `git diff --stat` 的大工作区和 CRLF warning。
- 证据结构弱，但强模型短任务很顺。

Kitty 风格：

- `list_files / find_files / search_files / read_file`
- `write_file / patch_file / edit_file / undo_last_change`
- `git_status / git_diff`
- `run_shell`

已确认：

- `patch_file` 补上了 Codex 式快改能力。
- `edit_file` 保留了 Kitty 的锚点稳态能力。
- `git_status` / `git_diff` 变成正式对账工具。
- `read_file` 的 anchors / identity 对恢复有价值。

### 已改动

- 新增 `patch_file`，替代旧 `apply_patch`。
- 新增 `git_status` / `git_diff`。
- 移除旧工具结果 artifact 层。
- live ecology 分组已拆开，但不作为本循环入口。
- 报告文件不再作为 live harness 通过门槛。
- 成功识别从 `ok === true` 改为 `parsed && parsed.ok !== false`。

### 当前结论

基础方向正确。下一步只用构建产物入口做灵活场景打磨。

## Round 2 - 已完成：run_shell 方言与验证手感

### 任务设计

测试 `run_shell` 是否让模型清楚知道当前 shell 环境，是否会诱导写错 shell 方言。

重点观察：

- 当前 shell 是否显式可见。
- PowerShell / cmd / node / python inline 哪个最稳。
- 模型是否会写 Unix heredoc。
- 失败摘要是否短、准、可恢复。
- `run_shell` 是否应该返回 shell/runtime 字段。

### Codex 侧基线命令

```powershell
Get-Location; $PSVersionTable.PSVersion.ToString(); node --version; git status --short
python -c "from pathlib import Path; print('cwd=', Path.cwd()); print('package=', Path('package.json').exists())"
node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('package.json','utf8')).name)"
```

已观察：

- PowerShell 分号命令稳定。
- `python -c` 稳定。
- `node -e` 稳定。
- 不使用 heredoc 时问题少。

### Kitty 侧自由 prompt

```text
只测试基础工具，重点观察 run_shell。

请完成这些只读动作：
1. 用 run_shell 判断当前 shell 环境和工作目录。
2. 用 run_shell 跑 node -e 读取 package.json 的 name。
3. 用 run_shell 跑 python -c 检查 package.json 是否存在。
4. 用 git_status / git_diff 对账，不要用 shell 替代 Git 工具。
5. 不要修改任何文件。

不要写报告。最后只用中文说：哪些命令成功，是否遇到 shell 方言问题。
```

运行方式：

```powershell
npm.cmd run build
node dist/cli.js agent "<上面的自由 prompt>"
```

### 可能改动

真实运行暴露的问题：

- 模型第一次用 `echo $0; pwd; uname -a` 判断 shell。
- 构建产物入口实际在 Windows 上通过 `powershell.exe` 执行。
- 该 POSIX 命令 exitCode 为 0，但输出只有空行，模型只能事后判断“不是 Unix shell”。
- 说明 `run_shell` 工具协议没有把默认 shell 方言事实给模型。

已改：

- 新增 `getShellRuntimeInfo()`。
- Windows 返回 `powershell / powershell.exe -NoLogo -NoProfile -EncodedCommand <command>`。
- Linux/macOS 返回 `bash / /bin/bash -lc <command>`。
- `launchCommand()` 使用同一个 runtime helper 选择 shell。
- `run_shell` tool description 暴露当前默认 shell、调用方式和方言提示。
- `run_shell` 工具结果返回 `shell` / `platform` / `shellInvocation` / `shellGuidance`。
- 新增测试：`run_shell exposes the default shell runtime so models do not infer the wrong dialect`。

复测：

```powershell
npm.cmd run build
node dist/cli.js agent "只测试基础工具里的 run_shell 和 Git 对账。请只读完成：1. 用 run_shell 输出当前目录和一条能说明当前 shell 的信息。2. 用 run_shell 跑 node -e 打印 process.platform。3. 用 run_shell 跑 python -c 打印当前目录名。4. 用 git_status 查看工作区。不要写报告，不要改文件。最后中文总结有没有 shell 方言问题。"
```

复测结果：

- 模型使用了 PowerShell 语法：`Get-Location; $PSVersionTable.PSVersion`。
- `node -e` 成功输出 `win32`。
- `python -c` 成功输出 `kitty`。
- `git_status` 成功。
- 没有再使用 `uname` / `$0` / Bash heredoc。

验证命令：

```powershell
npm.cmd run typecheck
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npx.cmd tsx tests\tools\tools-convergence.test.ts
npm.cmd run build
```

当前判断：

- `run_shell` 方言事实已经进入工具协议。
- 这不是 Windows 写死；helper 根据 runtime 平台返回 PowerShell 或 Bash。
- 后续继续观察失败摘要是否还需要针对 heredoc 做更短提示。

## 后续轮次候选

Round 3 - `read_file` 低噪音：

- 对比裸 `Get-Content -TotalCount` 与 Kitty `read_file`。
- 看 anchors / identity 是否干扰模型。
- 如果干扰，压缩模型可见摘要，完整证据留机器层。

## Round 3 - 已完成：read_file 先给内容，再给编辑证据

### 任务设计

本轮只测试 `read_file`。

核心问题不是“要不要保留证据”，而是模型看到工具结果时，是否能先理解文件内容，再按需使用 identity / anchors 做后续编辑。

### Codex 侧

命令：

```powershell
Get-Content -Encoding UTF8 -TotalCount 20 package.json
Get-Content -Encoding UTF8 -TotalCount 16 src\capabilities\tools\packages\files\readFileTool.ts
```

观察：

- Codex 的文件读取非常直接，先看到内容。
- 没有编辑证据，所以读起来快。
- 代价是后续精确编辑和失败恢复只能依赖模型自己重新定位。

### Kitty 侧

自由 prompt：

```text
只测试基础工具里的 read_file，不改文件。请完成：1. 用 find_files 定位 package.json 和 src/capabilities/tools/packages/files/readFileTool.ts。2. 用 read_file 只读 package.json 前 18 行。3. 用 read_file 只读 readFileTool.ts 前 16 行。4. 不要使用 run_shell 读文件。最后中文简短总结：read_file 输出是否直接，identity/anchors 是否会挡住你先理解内容。
```

运行命令：

```powershell
npm.cmd run build
node dist/cli.js agent "<上面的自由 prompt>"
```

Session：

- `.kitty\sessions\20260504045811-f230b2ad.json`

观察：

- 工具链是 `todo_write -> find_files -> read_file -> todo_write -> final`。
- 没有用 `run_shell` 读文件。
- 模型反馈：`read_file` 输出直接，identity / anchors 不会挡住先理解内容。
- 原始 session payload 中已确认字段顺序为：路径和行窗 -> `content` -> `continuation` -> `identity` -> `anchors`。

### 差距判断

真实问题是一般性的：

- 文件内容是模型下一步判断的主证据，应该先出现。
- identity / anchors 是编辑恢复证据，应该保留，但不应该挡在内容前面。

这不是针对某个目录、某个文件、某个测试样本的特殊处理。

### 代码改动

- `read_file` 输出顺序调整为先给 `content` 和 `continuation`，再给 `identity` 和 `anchors`。
- 保留完整编辑证据，不退化成裸 `Get-Content`。
- 新增测试：`read_file keeps content before edit evidence in the model-visible payload`。

### 验证

```powershell
npm.cmd run typecheck
npx.cmd tsx tests\tools\tools-convergence.test.ts
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npm.cmd run build
```

结果：

- 全部通过。

当前判断：

- `read_file` 更接近 Codex 的直接阅读手感。
- Kitty 仍保留 edit_file 需要的证据层。
- 证据没有被删除，只是放到模型读完内容之后。

Round 4 - `git_status/git_diff` 低噪音：

- 大工作区下对比裸 Git 和 Kitty Git 工具。
- 判断默认摘要是否过重。
- 必要时给模型短 summary，完整结果 externalize。

## Round 4 - 已完成：定位工具排序与 ignore 集中治理

### 任务设计

本轮测试 `find_files` 的定位手感和底层治理。

真实问题不是某个目录是否应该隐藏，而是：

- 大量匹配时，入口文件是否能先出现。
- 深层结果是否仍然保留。
- ignore 规则是否集中管理，而不是每个工具自己硬编码一套隐藏目录。

### Kitty 侧第一次运行

自由 prompt：

```text
只测试基础工具里的 find_files，不改文件。请完成：1. 用 find_files 在根目录查找 **/README.md，limit 25。2. 用 find_files 在根目录查找 README.md，limit 25。3. 不要使用 run_shell。最后中文简短总结：结果是否容易先定位根目录 README，是否有隐藏或排序噪音。
```

Session：

- `.kitty\sessions\20260504050012-b3e6d96f.json`

观察：

- `**/README.md` 命中很多时，根目录 `README.md` 没有先出现。
- 模型总结为：根目录 README 会被大量子目录结果淹没。

### 差距判断

这暴露的是一般性排序问题：

- `find_files` 不应该按深层路径字典序压过浅层入口文件。
- 也不应该为了样本目录写特殊过滤。
- 正确做法是通用排序：浅路径优先，然后稳定按文件名和路径排序。

同时检查到更大的治理问题：

- `find_files` / `search_files` / `codeFacts` / `pathSuggestions` 各自硬编码了 `.git/node_modules/dist/coverage`。
- 项目已经有 `loadProjectIgnoreRules()` 和 `isPathIgnored()`。
- 这说明 ignore 规则存在分散治理。

### 代码改动

- 新增通用 `comparePathForDiscovery()`：
  - 浅层路径优先。
  - 同深度按 basename 和路径稳定排序。
  - 不隐藏深层结果。
- `find_files` 使用通用排序。
- `search_files` 和 code fact 文件收集也使用同一排序。
- 新增 `buildFastGlobIgnorePatterns()`，让 fast-glob 的预过滤消费统一 ignore rules。
- `find_files` / `search_files` / code facts / path suggestions 不再各自写一套 `.git/node_modules/dist/coverage` 硬编码。
- 修复 `.kitty/.kittyignore` 规则基准：
  - root 下 `.kitty/.kittyignore` 以项目根为 baseDir。
  - cwd 下 `.kitty/.kittyignore` 以 cwd 为 baseDir。
  - 不再错误地以 `.kitty` 配置目录作为规则根。
- 存在 `!` 否定规则时，fast-glob 不做预过滤，避免提前藏掉后续应恢复的文件；统一后过滤负责最终语义。
- 修复 anchored 目录规则：
  - `/generated/` 只匹配项目根下的 `generated/`。
  - 不再因为去掉尾部 `/` 后误判成无 slash 规则，扩展成任意层级 `generated/`。
  - fast-glob 预过滤也尊重 anchored 语义。

### 测试

新增覆盖：

- `find_files ranks shallow discovery facts before deep matches without hiding deep results`
- `find_files consumes centralized ignore rules instead of per-tool hidden directory lists`
- `find_files preserves centralized ignore negation semantics`
- `find_files preserves anchored ignore semantics during glob prefiltering`

验证：

```powershell
npm.cmd run typecheck
npx.cmd tsx tests\tools\tools-convergence.test.ts
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npm.cmd run build
```

结果：

- 全部通过。

### Kitty 侧复测

自由 prompt：

```text
只测试基础工具里的 find_files，不改文件。请完成：1. 用 find_files 在根目录查找 **/README.md，limit 25。2. 用 find_files 在根目录查找 README.md，limit 25。3. 不要使用 run_shell。最后中文简短总结：根目录 README 是否能先出现，深层结果是否仍然保留。
```

Session：

- `.kitty\sessions\20260504050459-e308d78f.json`

结果：

- `**/README.md` 先返回根目录 `README.md`。
- 深层结果仍然保留。
- `README.md` 精确查询仍然只返回根目录文件。

当前判断：

- `find_files` 更接近“先定位事实”的工程师手感。
- 没有做样本特判。
- ignore 治理从工具分散硬编码收回到统一规则。

Round 5 - `patch_file/edit_file` 选择：

- 多文件小改用 `patch_file`。
- 单点精确改用 `edit_file`。
- stale anchor 后必须 fresh read。
- 看模型是否会盲修 patch 或跳过 fresh read。

## Round 5 - 已完成：Git 对账 path 过滤必须兑现协议

### 任务设计

本轮测试 `git_status` / `git_diff` 是否真的能做局部对账。

关键判断：

- 工具 schema 暴露了 `path` 参数，就必须真正过滤结果。
- 不能只把 `path` 用来定位 Git root。
- 对账工具要给模型精确文件事实，不能混入无关变更。

### 发现的问题

新增测试先失败：

```text
git_status honors a path filter instead of only using it to locate the worktree
```

失败现象：

- 传入 `path: "src"`。
- `git_status` 仍返回了根目录 `README.md` 的变更。
- 说明 `path` 只用于寻找 worktree，没有传给 `git status -- <path>`。

修第一刀后又暴露第二个问题：

- Git 对未跟踪目录只返回 `src/`。
- 模型需要的是文件级事实，例如 `src/app.ts`。

### 代码改动

- `readGitStatusSnapshot()` 将 `path` 传给 `git status --porcelain -z -- <path>`。
- 未跟踪目录会展开为文件级状态。
- `git_status` 的 `path` 语义与 `git_diff` 对齐：都是真实局部过滤。

### 验证

```powershell
npm.cmd run typecheck
npx.cmd tsx tests\tools\tools-convergence.test.ts
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npm.cmd run build
```

结果：

- 全部通过。

### Kitty 侧复测

自由 prompt：

```text
只测试基础工具里的 Git 对账，不改文件。请完成：1. 用 git_status 查看 src/capabilities/tools/packages/git 这个路径的状态，include_untracked=true。2. 用 git_diff 查看同一路径的 diff，stat=true。3. 不要使用 run_shell。最后中文简短总结：path 过滤是否只聚焦 Git 工具相关文件。
```

Session：

- `.kitty\sessions\20260504051352-e1ffc196.json`

结果：

- `git_status` 和 `git_diff` 都只返回 `src/capabilities/tools/packages/git/gitShared.ts`。
- 没有混入无关文件。

当前判断：

- Git 对账工具更符合“diff 对账”的基础工具哲学。
- 局部路径过滤已经从接口承诺变成真实行为。

## Round 6 - 已完成：编辑失败恢复提示去噪

### 任务设计

本轮测试 `patch_file` / `edit_file` 的真实编辑手感。

目标不是让 patch 永不失败，而是：

- patch 失败时错误短、准、可恢复。
- 模型不要盲目卡住。
- 成功编辑后仍然用 `git_diff` 对账。

### Kitty 侧第一次运行

自由 prompt：

```text
只测试基础编辑工具，可以在 .tmp-smoke-foundation-edit 下创建和修改临时文件。请完成：1. 用 write_file 创建 .tmp-smoke-foundation-edit/sample.txt，内容三行 alpha beta gamma。2. 用 patch_file 把 beta 改成 BETA。3. 用 read_file fresh 读取 sample.txt。4. 用 edit_file 基于 fresh identity/anchors 把 gamma 改成 GAMMA。5. 用 git_diff 查看 .tmp-smoke-foundation-edit 的 diff，stat=true。6. 不要使用 run_shell。最后中文简短总结 patch_file/edit_file 是否顺手。
```

Session：

- `.kitty\sessions\20260504051513-442f4637.json`

观察：

- `write_file` 成功创建临时文件。
- `patch_file` 第一次因为 unified diff hunk 行数不匹配失败。
- 模型能修正为合法 unified diff 并成功。
- `read_file` fresh 后，`edit_file` 使用 identity / anchor 成功。
- `git_diff` 对账成功。

问题：

- 失败 hint 里仍有泛化噪音：`The error payload is the available runtime evidence.`
- 这句话不能指导下一步，只增加噪音。

### 代码改动

- `patch_file` 失败 hint 改为：
  - 修正 unified diff。
  - 如果上下文可能陈旧，fresh `read_file` 目标区域。
  - 再重试 `patch_file` 或切换 `edit_file`。
- `edit_file` 失败 hint 改为：
  - fresh `read_file` identity / anchors 后再试。
- 通用失败 hint 不再说 `runtime evidence`，只说用错误事实选择下一次工具调用。

### 测试

新增：

- `patch_file failure hints stay actionable without generic runtime-evidence noise`

验证：

```powershell
npm.cmd run typecheck
npx.cmd tsx tests\tools\tools-convergence.test.ts
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npm.cmd run build
```

结果：

- 全部通过。

### Kitty 侧复测

自由 prompt：

```text
只测试 patch_file 失败恢复，可以在 .tmp-smoke-foundation-edit 下创建临时文件。请完成：1. 用 write_file 创建 .tmp-smoke-foundation-edit/retry.txt，内容 alpha beta gamma 三行。2. 故意先用一个缺少 hunk 行号的 patch_file 尝试把 beta 改成 BETA，让它失败。3. 根据失败信息重新用合法 patch_file 成功修改。4. 用 git_diff 查看 .tmp-smoke-foundation-edit/retry.txt，include_untracked=true。5. 不要使用 run_shell。最后中文简短总结失败提示是否短且可恢复。
```

Session：

- `.kitty\sessions\20260504051751-29260106.json`

结果：

- 故意失败的 `patch_file` 返回短 hint。
- 模型直接用合法 patch 恢复成功。
- 没有再出现 `runtime evidence` 噪音。
- 临时目录已清理。

当前判断：

- `patch_file` 仍比 `edit_file` 更依赖模型写对 unified diff。
- 失败恢复路径已经更干净。
- `edit_file` 的 fresh identity / anchor 路径稳定。

## Round 7 - 已完成：基础组合链路与 patch 协议收紧

### 任务设计

本轮不用固定 harness，只用构建产物跑真实 GPT CLI。

测试目标：

- `find_files -> read_file -> write_file -> patch_file -> read_file -> edit_file -> git_diff -> run_shell`
- 观察组合链路是否顺手。
- 观察 `patch_file` 是否还会因为格式说明不够清楚而第一次失败。
- 观察模型是否把验证命令跑得太早，破坏“编辑 -> diff -> 验证”的节奏。

### Kitty 侧第一次运行

自由 prompt：

```text
只测试基础工具组合能力，可以在 .tmp-foundation-loop 下创建临时文件。请完成：1. 用 find_files 定位 package.json。2. 用 read_file 只读 package.json 前 20 行。3. 用 write_file 创建 .tmp-foundation-loop/cycle.txt，内容三行 alpha、beta、gamma。4. 用 patch_file 把 beta 改成 BETA。5. fresh read_file 读取 cycle.txt。6. 用 edit_file 基于 fresh identity/anchors 把 gamma 改成 GAMMA。7. 用 git_diff 查看 .tmp-foundation-loop/cycle.txt 的 diff。8. 用 run_shell 只运行一个跨平台安全的命令确认 node 版本。不要使用 run_shell 读文件，不要写报告。最后中文简短总结：工具链是否顺手、哪里有噪音、有没有失败恢复。
```

Session：

- `.kitty\sessions\20260504064930-c8d37810.json`

观察：

- `find_files` 正确用于文件名定位。
- `read_file` 先给内容，再给 identity / anchors。
- `write_file` 成功。
- `patch_file` 第一次失败，原因是模型写了裸 `@@`，没有显式 hunk range。
- 失败 hint 短且可恢复，模型第二次写出 `@@ -1,3 +1,3 @@` 并成功。
- `edit_file` 使用 fresh identity / anchors 成功。
- `git_diff` 和 `run_shell` 成功。
- 无 externalized tool result。

### 差距判断

这不是特殊样本问题，而是 `patch_file` 协议说明不够硬：

- 模型知道要写 unified diff。
- 但 schema 只说 `@@ hunks`，没有强提醒标准 hunk range。
- 强模型能恢复，但第一次失败会带来噪音和额外 turn。

同时看到一个模型层节奏问题：

- 第二轮复测里模型把 `run_shell` 提前并行跑了一次，最后又跑了一次。
- 这不是 runtime 自动回归，也不是硬失败。
- 但它偏离了 `编辑 -> diff -> 验证` 的速度节奏。

### 代码改动

- `patch_file` 工具描述明确要求：
  - 每个 hunk 必须带显式范围，例如 `@@ -1,3 +1,3 @@`。
  - `patch` 参数说明写成 `explicit @@ -oldStart,oldCount +newStart,newCount @@ hunk ranges`。
- `patch_file` 失败 hint 增加显式 hunk range 示例。
- `edit_file` 模型可见 schema 移除旧 `anchor.path` 字段，避免 legacy 噪音。
  - 运行时仍能处理机器层旧证据，不把旧口子暴露给模型。
- 系统提示补充原则：
  - 编辑任务里，除非命令本身用于定位事实，否则不要在 edit/diff loop 之前跑验证 shell 命令。

### 复测

自由 prompt：

```text
只测试基础编辑工具，可以在 .tmp-foundation-loop 下创建临时文件。请完成：1. 用 write_file 创建 .tmp-foundation-loop/range.txt，内容四行 one、two、three、four。2. 用 patch_file 把 two 改成 TWO，把 three 改成 THREE。3. fresh read_file 读取 range.txt。4. 用 git_diff 查看 .tmp-foundation-loop/range.txt，include_untracked=true。5. 用 run_shell 执行 node -e 打印 process.platform。不要使用 run_shell 读文件，不要写报告。最后中文简短总结 patch_file 是否一次成功、输出噪音如何。
```

Session：

- `.kitty\sessions\20260504065330-5957c9e8.json`

结果：

- `patch_file` 一次成功。
- 模型直接写出 `@@ -1,4 +1,4 @@`。
- 工具结果低噪音。
- 仍观察到模型提前跑了一次 `run_shell`，因此补了原则级提示，避免把验证命令提前到编辑和 diff 前面。

### 测试

新增：

- `patch_file schema teaches explicit hunk ranges instead of bare @@ hunks`
- `edit_file schema accepts current read_file anchors without legacy path noise`
- 系统提示测试覆盖验证命令节奏原则。

验证：

```powershell
npx.cmd tsx tests\tools\tools-convergence.test.ts
npx.cmd tsx tests\tools\machine-harness.part2.test.ts
npm.cmd run build
```

结果：

- 全部通过。

当前判断：

- `patch_file` 快通道更接近 Codex 的直接改代码手感。
- Kitty 仍保留 `edit_file` 的 fresh identity / anchor 稳通道。
- 机器层证据继续保留，模型层噪音继续压低。
