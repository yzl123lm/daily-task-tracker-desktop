function buildFixSuggestions(testResult) {
  const suggestions = [];
  const combined = `${testResult?.stdout || ""}\n${testResult?.stderr || ""}`;
  const exitCode = Number(testResult?.exitCode);
  if (testResult?.success) {
    return {
      success: true,
      suggestions: [{ id: "ok", text: "测试通过，可继续下一任务或提交 Git。" }],
    };
  }
  suggestions.push({
    id: "retry",
    text: "检查最近写入的文件是否与测试断言一致，必要时在代码面板查看 Diff 并回滚备份。",
    priority: 1,
  });
  suggestions.push({
    id: "shell",
    text: "Shell 命令失败：检查命令是否在白名单内，避免使用 &&、| 等链式操作。",
    priority: 2,
  });
  if (/AssertionError|assert\.(strictEqual|ok|fail)/i.test(combined)) {
    suggestions.push({
      id: "assert",
      text: "存在断言失败：对照测试文件中的 expected/actual，确认 Phase 5 写入未破坏接口契约。",
      priority: 2,
    });
  }
  if (/SyntaxError|Unexpected token/i.test(combined)) {
    suggestions.push({
      id: "syntax",
      text: "语法错误：检查刚写入文件的括号、引号与 import/require 是否完整。",
      priority: 2,
    });
  }
  if (/MODULE_NOT_FOUND|Cannot find module/i.test(combined)) {
    suggestions.push({
      id: "module",
      text: "模块未找到：确认相对路径与 package.json 依赖，避免写入错误路径。",
      priority: 2,
    });
  }
  if (/TOOL_FORBIDDEN|403/i.test(combined)) {
    suggestions.push({
      id: "perm",
      text: "权限/工具拒绝：确认操作在项目工作区且已用户确认，ChatAgent 不可执行开发工具。",
      priority: 3,
    });
  }
  if (exitCode === 1 && !suggestions.length) {
    suggestions.push({
      id: "generic",
      text: "测试退出码非 0：查看 stdout/stderr 末尾 20 行，定位首个 error 行并回到 PLAN_ONLY 方案调整。",
      priority: 3,
    });
  }
  return {
    success: false,
    exitCode,
    suggestions: suggestions.sort((a, b) => a.priority - b.priority),
    excerpt: combined.split(/\r?\n/).slice(-24).join("\n"),
  };
}

module.exports = {
  buildFixSuggestions,
};
