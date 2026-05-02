import {
  getDisabledToolReasons,
  getDisabledTools,
  getEnabledTools,
  type LiveEcologyGroup,
} from "./groups.ts";

export function buildLiveEcologyPrompt(group: LiveEcologyGroup, groupDir: string, toolNames: string[]): string {
  const skipped = getSkippedTools(group);
  const activeTools = toolNames.filter((name) => !skipped.includes(name));
  const expected = getExpectedTools(group);
  const skipReasons = getDisabledToolReasons(group);

  return [
    `本轮是 ${group.title} 的真实 API 生态体检。`,
    `测试目录是 ${groupDir}。`,
    `当前注册工具清单：${toolNames.join(", ")}。`,
    `本组必须覆盖工具：${expected.join(", ")}。`,
    skipped.length > 0 ? `本组明确跳过工具：${skipped.join(", ")}。` : "",
    Object.keys(skipReasons).length > 0 ? `跳过原因：${Object.entries(skipReasons).map(([tool, reason]) => `${tool}=${reason}`).join("; ")}。` : "",
    `除明确跳过外，请只从这些已注册工具里调用：${activeTools.join(", ")}。`,
    group.promptLines.join(" ").replaceAll("__RUN_DIR__", groupDir),
    "请区分两类失败：模型自己调用错、工具本身执行失败。不要把未调用的工具写成已通过。",
  ].filter(Boolean).join(" ");
}

export function getExpectedTools(group: LiveEcologyGroup): string[] {
  return [...new Set(getEnabledTools(group))].sort();
}

export function getSkippedTools(group: LiveEcologyGroup): string[] {
  return [...new Set(getDisabledTools(group))].sort();
}
