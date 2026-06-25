/** @type {object | null} */
let lastReport = null;

const ISSUE_ACTIONS = {
  environment: { type: "environment-wizard", label: "环境配置向导" },
  ollama: { type: "environment-wizard", label: "配置 Ollama" },
  embeddingModel: { type: "environment-wizard", label: "拉取 bge-m3" },
  cloudApi: { type: "chat-profiles", label: "配置对话模型" },
  knowledgeBase: { type: "knowledge-base", label: "打开知识库" },
  mainUi: { type: "reload", label: "重新加载" },
};

/**
 * @param {{
 *   skipped?: boolean,
 *   results?: object[],
 *   timedOut?: boolean,
 *   status?: string,
 *   message?: string,
 * }} input
 */
function buildStartupReport(input = {}) {
  if (input.skipped) {
    return {
      skipped: true,
      status: "skipped",
      message: "已跳过启动预热",
      finishedAt: Date.now(),
      timedOut: false,
      results: [],
      issues: [],
    };
  }

  const results = Array.isArray(input.results) ? input.results : [];
  const issues = results
    .filter((r) => r && (!r.ok || r.warning) && r.status !== "success")
    .map((r) => {
      const action = ISSUE_ACTIONS[r.id] || null;
      const severity = r.critical && !r.warning ? "error" : "warning";
      return {
        id: r.id,
        label: r.label || r.id,
        message: r.message || "",
        severity,
        status: r.status,
        critical: !!r.critical,
        action,
      };
    });

  const criticalFail = results.some((r) => r.critical && !r.ok && !r.warning);
  const hasWarnings = issues.some((i) => i.severity === "warning");
  let status = "success";
  if (criticalFail) {
    status = "error";
  } else if (hasWarnings || input.timedOut) {
    status = "warning";
  }

  const message =
    input.message ||
    (criticalFail
      ? "部分关键模块未能就绪，仍可尝试使用"
      : hasWarnings || input.timedOut
        ? "启动完成，部分能力需稍后在设置中检查"
        : "启动完成");

  return {
    skipped: false,
    status,
    message,
    finishedAt: Date.now(),
    timedOut: !!input.timedOut,
    results,
    issues,
  };
}

function setLastStartupReport(report) {
  lastReport = report && typeof report === "object" ? report : null;
}

function getLastStartupReport() {
  return lastReport;
}

module.exports = {
  buildStartupReport,
  setLastStartupReport,
  getLastStartupReport,
};
