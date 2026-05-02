import { readCapabilityEcologySpec } from "../readme-capabilities/core.ts";

export interface LiveEcologyToolSwitch {
  name: string;
  enabled: boolean;
  skipReason?: string;
}

export interface LiveEcologyGroup {
  id: string;
  title: string;
  tools: LiveEcologyToolSwitch[];
  promptLines: string[];
}

export interface LiveEcologyInventoryFinding {
  kind: "missing-from-inventory" | "unknown-in-runtime" | "duplicate-in-inventory" | "disabled-without-reason";
  tool: string;
}

const LIVE_GROUP_TITLES: Record<string, string> = {
  "files-code": "file and code tools",
  documents: "document tools",
  "network-api": "network and API tools",
  "history-trace": "history and trace tools",
  "execution-ecology": "task, worktree, background, dreaming, workflow, subagent, team, and package ecology",
};

const LIVE_GROUP_PROMPTS: Record<string, string[]> = {
  "files-code": [
    "请做一次真实 API 文件与代码工具体检。",
    "硬约束：只能在 __RUN_DIR__ 内写入、编辑、patch、undo 或生成证据；绝对不要删除 __RUN_DIR__；绝对不要修改项目源码、package.json、src、spec、tests、ref、README 或配置文件。",
    "先用 todo_write 记录体检步骤。",
    "必须实际调用 list_files、find_files、search_files、read_file 来定位并读取 package.json 和 README.md 的少量内容。",
    "必须在 __RUN_DIR__ 内用 write_file 创建 utf8-sample.txt、bom-sample.txt、crlf-sample.txt 和 patch-target.txt。",
    "必须对 utf8-sample.txt 连续调用两次 edit_file；必须对 crlf-sample.txt 调用 edit_file；必须对 patch-target.txt 调用 apply_patch。",
    "必须调用 undo_last_change 一次，只撤销刚才在 __RUN_DIR__ 内制造的一个测试变更。",
    "必须调用 code_symbols、code_references、code_pattern 做最小只读代码观察。",
    "必须调用 run_shell 做只读检查：node --version 和 git status --short。",
    "每个工具都要把成功/失败、失败原文摘要、证据路径写进 __RUN_DIR__/files-code-report.md。",
    "最后确认 __RUN_DIR__ 仍然存在，真实源码没有被修改。",
  ],
  documents: [
    "请做一次真实 API 文档工具体检。",
    "硬约束：只能在 __RUN_DIR__ 内写入文档证据；绝对不要删除 __RUN_DIR__；绝对不要修改项目源码、package.json、src、spec、tests、ref、README 或配置文件。",
    "disabled 工具只写 skipped，不要调用。",
    "必须实际调用 write_docx、read_docx、edit_docx，并在 __RUN_DIR__ 留下 docx 证据。",
    "必须创建一个最小 xlsx 或 csv 证据并调用 read_spreadsheet。",
    "每个工具都要把成功/失败、失败原文摘要、证据路径写进 __RUN_DIR__/documents-report.md。",
    "最后确认 __RUN_DIR__ 仍然存在，真实源码没有被修改。",
  ],
  "network-api": [
    "请做一次真实 API 网络与 OpenAPI 工具体检。",
    "硬约束：只能在 __RUN_DIR__ 内写入或下载证据；绝对不要删除 __RUN_DIR__；绝对不要修改项目源码、package.json、src、spec、tests、ref、README 或配置文件。",
    "必须实际调用 http_probe、http_request、http_session、http_suite，目标优先使用 https://example.com 或其它公开只读 endpoint。",
    "必须实际调用 network_trace 记录网络证据，调用 openapi_inspect 和 openapi_lint 检查 __RUN_DIR__ 内的最小 OpenAPI JSON，调用 download_url 把公开只读页面下载到 __RUN_DIR__。",
    "每个工具都要把成功/失败、失败原文摘要、证据路径写进 __RUN_DIR__/network-api-report.md。",
    "最后确认 __RUN_DIR__ 仍然存在，真实源码没有被修改。",
  ],
  "history-trace": [
    "请做一次真实 API 历史与 trace 工具体检。",
    "硬约束：只能在 __RUN_DIR__ 内写入证据；绝对不要删除 __RUN_DIR__；绝对不要修改项目源码、package.json、src、spec、tests、ref、README 或配置文件。",
    "必须实际调用 session_list、session_read、session_search、session_final_output、runtime_event_search、change_record_read、tool_artifact_read、agent_trace_list、agent_trace_read。",
    "如果某个读取工具没有可读 id，要明确记录 no available record，而不是伪造成功。",
    "每个工具都要把成功/失败、失败原文摘要、证据路径写进 __RUN_DIR__/history-trace-report.md。",
    "最后确认 __RUN_DIR__ 仍然存在，真实源码没有被修改。",
  ],
  "execution-ecology": [
    "请做一次真实 API 执行生态体检。",
    "硬约束：只能在 __RUN_DIR__ 内写入证据；绝对不要删除 __RUN_DIR__；绝对不要修改项目源码、package.json、src、spec、tests、ref、README 或配置文件；disabled 工具只写 skipped，不要调用。",
    "必须实际调用 dreaming_start 做 30 秒以内 no-op：只读观察，进入 Mirror World 后尽快 closeout，不合并 Real World。",
    "必须实际调用 dreaming_loop_start、dreaming_loop_next、dreaming_loop_status，只跑一轮最小 no-op。",
    "必须实际调用 task_create、task_get、task_list、task_update、claim_task；claim_task 只绑定测试任务。",
    "必须实际调用 worktree_list、worktree_create、worktree_get、worktree_events、worktree_keep；不要调用 disabled 工具。",
    "必须实际调用 background_run 启动一个很短的只读命令，再调用 background_check 和 background_terminate。",
    "必须实际调用 load_skill 加载 test-guardrails 或 spec-alignment。",
    "必须实际调用 task 派一个最小只读 subagent，让它只观察 __RUN_DIR__ 是否存在并 closeout。",
    "必须实际调用 coordination_policy、spawn_teammate、list_teammates、send_message、read_inbox、broadcast、shutdown_request、shutdown_response、plan_approval、idle；队友任务必须是只读、短任务、尽快 closeout。",
    "必须通过 run_shell 运行 kitty capability package 的 CLI：在 __RUN_DIR__ 内创建一个最小外部 manifest，做 install/list/doctor/test 证据。",
    "每个工具都要把成功/失败、失败原文摘要、证据路径写进 __RUN_DIR__/execution-ecology-report.md。",
    "最后确认 __RUN_DIR__ 仍然存在，真实源码没有被修改。",
  ],
};

interface LiveEcologySpecTool {
  name: string;
  live?: {
    group?: string;
    enabled?: boolean;
    skipReason?: string;
  };
}

export async function loadLiveEcologyGroups(root: string): Promise<LiveEcologyGroup[]> {
  const spec = await readCapabilityEcologySpec(root);
  const grouped = new Map<string, LiveEcologyToolSwitch[]>();

  for (const category of spec.toolCategories) {
    for (const tool of category.tools ?? []) {
      const live = (tool as LiveEcologySpecTool).live;
      const groupId = live?.group;
      if (!groupId) {
        continue;
      }

      const tools = grouped.get(groupId) ?? [];
      tools.push({
        name: tool.name,
        enabled: live.enabled === true,
        skipReason: live.skipReason,
      });
      grouped.set(groupId, tools);
    }
  }

  return [...grouped.entries()]
    .map(([id, tools]) => ({
      id,
      title: LIVE_GROUP_TITLES[id] ?? id,
      tools,
      promptLines: LIVE_GROUP_PROMPTS[id] ?? [],
    }))
    .sort((left, right) => Object.keys(LIVE_GROUP_TITLES).indexOf(left.id) - Object.keys(LIVE_GROUP_TITLES).indexOf(right.id));
}

export function getEnabledTools(group: LiveEcologyGroup): string[] {
  return group.tools.filter((tool) => tool.enabled).map((tool) => tool.name).sort();
}

export function getDisabledTools(group: LiveEcologyGroup): string[] {
  return group.tools.filter((tool) => !tool.enabled).map((tool) => tool.name).sort();
}

export function getDisabledToolReasons(group: LiveEcologyGroup): Record<string, string> {
  return Object.fromEntries(
    group.tools
      .filter((tool) => !tool.enabled)
      .map((tool) => [tool.name, tool.skipReason ?? "disabled in live ecology inventory"]),
  );
}

export function getInventoryToolNames(groups: readonly LiveEcologyGroup[]): string[] {
  return groups.flatMap((group) => group.tools.map((tool) => tool.name)).sort();
}

export function diagnoseLiveEcologyInventory(
  registeredTools: readonly string[],
  groups: readonly LiveEcologyGroup[],
): LiveEcologyInventoryFinding[] {
  const findings: LiveEcologyInventoryFinding[] = [];
  const registered = new Set(registeredTools);
  const inventoryCounts = new Map<string, number>();

  for (const group of groups) {
    for (const tool of group.tools) {
      inventoryCounts.set(tool.name, (inventoryCounts.get(tool.name) ?? 0) + 1);
      if (!registered.has(tool.name)) {
        findings.push({ kind: "unknown-in-runtime", tool: tool.name });
      }
      if (!tool.enabled && !tool.skipReason?.trim()) {
        findings.push({ kind: "disabled-without-reason", tool: tool.name });
      }
    }
  }

  for (const tool of registeredTools) {
    if (!inventoryCounts.has(tool)) {
      findings.push({ kind: "missing-from-inventory", tool });
    }
  }

  for (const [tool, count] of inventoryCounts) {
    if (count > 1) {
      findings.push({ kind: "duplicate-in-inventory", tool });
    }
  }

  return findings.sort((left, right) => left.tool.localeCompare(right.tool) || left.kind.localeCompare(right.kind));
}
