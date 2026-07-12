/**
 * AGT-010: Offline replay — load frozen LLM turns, compare models / dry-run validate.
 */
const fs = require("fs");
const path = require("path");
const { validateReplayTrace } = require("./agentReplayCapture.js");
const { compareTurn, aggregateCompareReport } = require("./agentReplayCompare.js");
const { deepRedact } = require("./agentTraceExport.js");
const { stripModelThinking } = require("../../utils/wbModelOutputSanitizer.js");

function loadPricing(configDir) {
  try {
    const file = path.join(configDir || path.join(__dirname, "../../config/wb-replay"), "pricing.v1.json");
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function extractReplayTraceFromInput(input) {
  if (!input || typeof input !== "object") return null;
  if (input.kind === "agent_replay_trace") return input;
  if (input.replayTrace?.kind === "agent_replay_trace") return input.replayTrace;
  if (input.agentRun?.output?.replayTrace?.kind === "agent_replay_trace") {
    return input.agentRun.output.replayTrace;
  }
  if (input.output?.replayTrace?.kind === "agent_replay_trace") return input.output.replayTrace;
  // Synthesize minimal trace from toolTrace-only evidence (limited)
  if (Array.isArray(input.agentRun?.toolTrace) && input.agentRun.toolTrace.length) {
    return {
      schemaVersion: 1,
      kind: "agent_replay_trace",
      mode: input.agentRun.mode || null,
      toolNames: [],
      synthesized: true,
      turns: [
        {
          turnIndex: 0,
          purpose: null,
          modelUsed: input.agentRun.output?.modelGateway?.used || null,
          messages: [
            { role: "system", content: "(synthesized — full messages unavailable)" },
            { role: "user", content: String(input.agentRun.inputText || "") },
          ],
          assistantContent: String(input.agentRun.output?.answer || input.agentRun.output?.summary || ""),
          toolCalls: (input.agentRun.toolTrace || []).map((t, i) => ({
            id: `synth_${i}`,
            name: t.tool,
            arguments: t.args || {},
          })),
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 },
          toolResults: (input.agentRun.toolTrace || []).map((t, i) => ({
            toolCallId: `synth_${i}`,
            name: t.tool,
            ok: t.ok !== false,
            result: t.result || { ok: t.ok !== false },
          })),
        },
      ],
      totals: {
        turns: 1,
        toolCallCount: (input.agentRun.toolTrace || []).length,
        durationMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }
  return null;
}

function loadReplayInput(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const trace = extractReplayTraceFromInput(raw);
  return { raw, trace };
}

/**
 * Dry-run / structural offline replay:
 * - validates schema
 * - optionally compares against an alternate recorded candidate (fixture)
 * - does not call live LLM unless models provided with live=true
 */
async function runOfflineReplay({
  trace,
  candidateTrace = null,
  models = [],
  dryRun = true,
  live = false,
  pricing = null,
  llmInvoker = null,
} = {}) {
  const validation = validateReplayTrace(trace);
  if (!validation.ok) {
    return {
      ok: false,
      mode: "offline_replay",
      validation,
      error: validation.errors.join("; "),
    };
  }

  const report = {
    ok: true,
    mode: dryRun && !live ? "dry_run" : live ? "live_compare" : "offline_compare",
    schemaVersion: trace.schemaVersion,
    baseline: {
      mode: trace.mode,
      turns: trace.turns.length,
      totals: trace.totals,
      synthesized: Boolean(trace.synthesized),
      integrity: trace.integrity || null,
    },
    validation,
    comparisons: [],
    generatedAt: new Date().toISOString(),
  };

  // Self-consistency check (baseline vs baseline) — always
  const selfTurns = trace.turns.map((t) => compareTurn(t, t, { pricing }));
  report.selfCheck = aggregateCompareReport(selfTurns, {
    baselineLabel: "baseline",
    candidateLabel: "baseline",
  });
  report.selfCheck.pass = report.selfCheck.avgMatchScore >= 0.99;

  if (candidateTrace) {
    const candVal = validateReplayTrace(candidateTrace);
    if (!candVal.ok) {
      report.ok = false;
      report.error = `candidate invalid: ${candVal.errors.join("; ")}`;
      return report;
    }
    const n = Math.min(trace.turns.length, candidateTrace.turns.length);
    const turnReports = [];
    for (let i = 0; i < n; i += 1) {
      turnReports.push(compareTurn(trace.turns[i], candidateTrace.turns[i], { pricing }));
    }
    report.comparisons.push(
      aggregateCompareReport(turnReports, {
        baselineLabel: "baseline",
        candidateLabel: candidateTrace.label || "candidate",
      })
    );
  }

  if (live && models.length) {
    const invoker =
      llmInvoker ||
      (async (turn, modelSpec) => {
        const { gatewayChatWithTools } = require("./modelGateway.js");
        const { credentialsForProfileId } = require("./modelGateway.js");
        const creds =
          typeof credentialsForProfileId === "function"
            ? credentialsForProfileId(modelSpec.profileId || modelSpec.model)
            : null;
        const started = Date.now();
        const llmResult = await gatewayChatWithTools({
          messages: turn.messages,
          tools: [], // offline: compare free-form / prior tool schema not required for content A/B
          mode: trace.mode,
          credentials: modelSpec.credentials || creds || undefined,
        });
        return {
          assistantContent: stripModelThinking(llmResult.message?.content || ""),
          toolCalls: llmResult.toolCalls || [],
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            durationMs: Date.now() - started,
            provider: llmResult.response?.provider || null,
          },
          modelUsed: llmResult.gateway?.used || { model: modelSpec.model || modelSpec.label },
        };
      });

    for (const modelSpec of models) {
      const label = modelSpec.label || modelSpec.model || modelSpec.profileId || "model";
      const turnReports = [];
      for (const turn of trace.turns) {
        const cand = await invoker(turn, modelSpec);
        turnReports.push(
          compareTurn(
            turn,
            {
              turnIndex: turn.turnIndex,
              assistantContent: cand.assistantContent,
              toolCalls: cand.toolCalls,
              usage: cand.usage,
            },
            { pricing: pricing?.[label] || pricing?.default || pricing }
          )
        );
      }
      report.comparisons.push(
        aggregateCompareReport(turnReports, {
          baselineLabel: "recorded",
          candidateLabel: label,
        })
      );
    }
  }

  report.ok = Boolean(report.selfCheck?.pass) && !report.error;
  return deepRedact(report);
}

function formatReplayReportMarkdown(report) {
  const lines = [
    `# AGT-010 Offline Replay Report`,
    ``,
    `- mode: **${report.mode}**`,
    `- ok: ${report.ok}`,
    `- baseline turns: ${report.baseline?.turns ?? 0}`,
    `- synthesized: ${report.baseline?.synthesized ? "yes" : "no"}`,
    ``,
    `## Self-check`,
    `- matchScore: ${report.selfCheck?.avgMatchScore}`,
    `- pass: ${report.selfCheck?.pass}`,
    ``,
  ];
  if (report.comparisons?.length) {
    lines.push(`## Comparisons`);
    for (const c of report.comparisons) {
      lines.push(
        `- **${c.candidateLabel}** vs ${c.baselineLabel}: score=${c.avgMatchScore} content=${c.avgContentSimilarity} tools=${c.toolCallExactMatches}/${c.turnsCompared} Δtokens=${c.deltaTokens} ΔcostUsd=${c.costUsd?.delta ?? "n/a"}`
      );
    }
    lines.push(``);
  }
  if (report.error) {
    lines.push(`## Error`, report.error, ``);
  }
  return lines.join("\n");
}

module.exports = {
  loadPricing,
  loadReplayInput,
  extractReplayTraceFromInput,
  runOfflineReplay,
  formatReplayReportMarkdown,
};
