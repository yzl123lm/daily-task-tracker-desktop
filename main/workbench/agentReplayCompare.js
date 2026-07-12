/**
 * AGT-010: Pure compare helpers for offline replay reports.
 */
const { stripModelThinking } = require("../../utils/wbModelOutputSanitizer.js");
const { parseStructuredAction } = require("./modelGateway.js");

function stableStringify(value) {
  if (value == null) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
}

function normalizeToolCalls(toolCalls) {
  return (toolCalls || [])
    .map((tc) => ({
      name: String(tc.name || tc.function?.name || "").trim(),
      arguments:
        typeof tc.arguments === "string"
          ? (() => {
              try {
                return JSON.parse(tc.arguments);
              } catch {
                return { _raw: tc.arguments };
              }
            })()
          : tc.arguments || tc.function?.arguments || {},
    }))
    .sort((a, b) => a.name.localeCompare(b.name) || stableStringify(a.arguments).localeCompare(stableStringify(b.arguments)));
}

function contentSimilarity(a, b) {
  const sa = stripModelThinking(String(a || "")).replace(/\s+/g, " ").trim().toLowerCase();
  const sb = stripModelThinking(String(b || "")).replace(/\s+/g, " ").trim().toLowerCase();
  if (!sa && !sb) return 1;
  if (!sa || !sb) return 0;
  if (sa === sb) return 1;
  // token Jaccard
  const ta = new Set(sa.split(/\s+/).filter(Boolean));
  const tb = new Set(sb.split(/\s+/).filter(Boolean));
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}

function compareToolCallSets(baseline, candidate) {
  const a = normalizeToolCalls(baseline);
  const b = normalizeToolCalls(candidate);
  const aKeys = a.map((x) => `${x.name}:${stableStringify(x.arguments)}`);
  const bKeys = b.map((x) => `${x.name}:${stableStringify(x.arguments)}`);
  const sameOrder = aKeys.join("|") === bKeys.join("|");
  const aNames = a.map((x) => x.name).sort().join(",");
  const bNames = b.map((x) => x.name).sort().join(",");
  return {
    equal: sameOrder,
    sameNames: aNames === bNames,
    baselineCount: a.length,
    candidateCount: b.length,
    baseline: a,
    candidate: b,
  };
}

function estimateCostUsd(usage, pricing) {
  if (!pricing) return null;
  const promptRate = Number(pricing.promptPer1kUsd || 0);
  const completionRate = Number(pricing.completionPer1kUsd || 0);
  const p = Number(usage?.promptTokens || 0) / 1000;
  const c = Number(usage?.completionTokens || 0) / 1000;
  return Math.round((p * promptRate + c * completionRate) * 1e6) / 1e6;
}

function compareTurn(baselineTurn, candidateTurn, { pricing } = {}) {
  const contentSim = contentSimilarity(baselineTurn?.assistantContent, candidateTurn?.assistantContent);
  const tools = compareToolCallSets(baselineTurn?.toolCalls, candidateTurn?.toolCalls);
  const baseStruct = parseStructuredAction(baselineTurn?.assistantContent || "", { schemaHint: "action" });
  const candStruct = parseStructuredAction(candidateTurn?.assistantContent || "", { schemaHint: "action" });
  const structuredEqual =
    baseStruct.ok && candStruct.ok
      ? stableStringify(baseStruct.action) === stableStringify(candStruct.action)
      : baseStruct.ok === candStruct.ok && !baseStruct.ok;

  const baseUsage = baselineTurn?.usage || {};
  const candUsage = candidateTurn?.usage || {};
  const deltaTokens =
    (Number(candUsage.totalTokens) || 0) - (Number(baseUsage.totalTokens) || 0);
  const deltaMs = (Number(candUsage.durationMs) || 0) - (Number(baseUsage.durationMs) || 0);

  return {
    turnIndex: baselineTurn?.turnIndex ?? candidateTurn?.turnIndex ?? 0,
    contentSimilarity: Math.round(contentSim * 1000) / 1000,
    contentMatch: contentSim >= 0.92,
    toolCalls: tools,
    structuredEqual,
    usage: {
      baseline: baseUsage,
      candidate: candUsage,
      deltaTokens,
      deltaMs,
      baselineCostUsd: estimateCostUsd(baseUsage, pricing),
      candidateCostUsd: estimateCostUsd(candUsage, pricing),
    },
    matchScore: Math.round((contentSim * 0.5 + (tools.equal ? 0.4 : tools.sameNames ? 0.2 : 0) + (structuredEqual ? 0.1 : 0)) * 1000) / 1000,
  };
}

function aggregateCompareReport(turnReports, { baselineLabel, candidateLabel } = {}) {
  const n = turnReports.length || 1;
  const avgSim =
    turnReports.reduce((s, t) => s + (t.contentSimilarity || 0), 0) / (turnReports.length || 1);
  const toolExact = turnReports.filter((t) => t.toolCalls?.equal).length;
  const avgScore = turnReports.reduce((s, t) => s + (t.matchScore || 0), 0) / n;
  const deltaTokens = turnReports.reduce((s, t) => s + (t.usage?.deltaTokens || 0), 0);
  const deltaMs = turnReports.reduce((s, t) => s + (t.usage?.deltaMs || 0), 0);
  const baseCost = turnReports.reduce((s, t) => s + (t.usage?.baselineCostUsd || 0), 0);
  const candCost = turnReports.reduce((s, t) => s + (t.usage?.candidateCostUsd || 0), 0);
  return {
    baselineLabel: baselineLabel || "baseline",
    candidateLabel: candidateLabel || "candidate",
    turnsCompared: turnReports.length,
    avgContentSimilarity: Math.round(avgSim * 1000) / 1000,
    toolCallExactMatches: toolExact,
    toolCallExactRate: turnReports.length ? toolExact / turnReports.length : 0,
    avgMatchScore: Math.round(avgScore * 1000) / 1000,
    deltaTokens,
    deltaMs,
    costUsd: {
      baseline: Math.round(baseCost * 1e6) / 1e6,
      candidate: Math.round(candCost * 1e6) / 1e6,
      delta: Math.round((candCost - baseCost) * 1e6) / 1e6,
    },
    turns: turnReports,
  };
}

module.exports = {
  stableStringify,
  normalizeToolCalls,
  contentSimilarity,
  compareToolCallSets,
  compareTurn,
  aggregateCompareReport,
  estimateCostUsd,
};
