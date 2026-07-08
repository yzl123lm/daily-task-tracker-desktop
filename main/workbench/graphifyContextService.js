const fs = require("fs");
const path = require("path");
const { NativeGraphifyAdapter } = require("../mcp/nativeGraphifyAdapter.js");

const DEFAULT_BUDGET_CHARS = 4800;
const GRAPHIFY_TIMEOUT_MS = 3000;

function graphifyEnabled() {
  return String(process.env.WB_GRAPHIFY_CONTEXT || "1") !== "0";
}

function truncate(text, maxChars) {
  const s = String(text || "");
  if (s.length <= maxChars) {
    return s;
  }
  return `${s.slice(0, maxChars)}\n…[truncated]`;
}

function readReportSummary(appRoot, maxChars = 1200) {
  const reportPath = path.join(appRoot, "graphify-out", "GRAPH_REPORT.md");
  if (!fs.existsSync(reportPath)) {
    return null;
  }
  const raw = fs.readFileSync(reportPath, "utf8");
  const lines = raw.split(/\r?\n/);
  const picked = [];
  for (const line of lines) {
    if (/^## Summary|^## Community|^-\s+\[\[_COMMUNITY_/i.test(line) || /^-\s+\d+ nodes/.test(line)) {
      picked.push(line);
    }
    if (picked.length >= 24) {
      break;
    }
  }
  return truncate(picked.join("\n") || lines.slice(0, 20).join("\n"), maxChars);
}

async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("graphify timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function buildGraphifySummary({ appRoot, message, tokenBudget = DEFAULT_BUDGET_CHARS }) {
  if (!graphifyEnabled() || !appRoot) {
    return { available: false, reason: "disabled" };
  }
  const adapter = new NativeGraphifyAdapter(() => path.join(appRoot, "graphify-out"));
  if (!adapter.isAvailable()) {
    return { available: false, reason: "graphify-out missing" };
  }
  let budgetUsed = 0;
  const reportSummary = readReportSummary(appRoot, Math.min(1200, tokenBudget));
  budgetUsed += (reportSummary || "").length;
  let godNodes = [];
  let taskRelevantNotes = [];
  try {
    const godResult = await withTimeout(
      Promise.resolve(adapter.callTool("graphify_god_nodes", { limit: 12 })),
      GRAPHIFY_TIMEOUT_MS
    );
    if (godResult?.ok && Array.isArray(godResult.godNodes)) {
      godNodes = godResult.godNodes.slice(0, 12).map((n) => n.label || n.id || n.source_file || String(n));
      budgetUsed += godNodes.join(", ").length;
    }
  } catch {
    /* graceful */
  }
  const q = String(message || "").trim();
  if (q && budgetUsed < tokenBudget) {
    try {
      const queryResult = await withTimeout(
        Promise.resolve(adapter.callTool("graphify_query_graph", { question: q, budget: 1500 })),
        GRAPHIFY_TIMEOUT_MS
      );
      if (queryResult?.ok && queryResult.summary) {
        taskRelevantNotes.push(truncate(queryResult.summary, 1500));
        budgetUsed += taskRelevantNotes[0].length;
      }
    } catch {
      /* graceful */
    }
  }
  return {
    available: true,
    budgetUsed,
    reportSummary,
    godNodes,
    relatedCommunities: [],
    taskRelevantNotes,
  };
}

function formatGraphifySection(summary) {
  if (!summary?.available) {
    return "";
  }
  const parts = [];
  if (summary.reportSummary) {
    parts.push(`【Graph 报告摘要】\n${summary.reportSummary}`);
  }
  if (summary.godNodes?.length) {
    parts.push(`【God Nodes】${summary.godNodes.join("；")}`);
  }
  if (summary.taskRelevantNotes?.length) {
    parts.push(`【任务相关图谱】\n${summary.taskRelevantNotes.join("\n")}`);
  }
  return parts.join("\n\n");
}

module.exports = {
  graphifyEnabled,
  buildGraphifySummary,
  formatGraphifySection,
};
