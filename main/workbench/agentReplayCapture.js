/**
 * AGT-010: Replay trace capture helpers (LLM turns + usage for offline compare).
 */
const crypto = require("crypto");
const { deepRedact } = require("./agentTraceExport.js");
const { stripModelThinking } = require("../../utils/wbModelOutputSanitizer.js");

const REPLAY_SCHEMA_VERSION = 1;
const MAX_CONTENT_CHARS = Number(process.env.WB_REPLAY_MAX_CONTENT || 12000);
const MAX_TOOL_RESULT_CHARS = Number(process.env.WB_REPLAY_MAX_TOOL_RESULT || 4000);

function replayCaptureEnabled() {
  return String(process.env.WB_AGENT_REPLAY_CAPTURE || "1") !== "0";
}

function truncateText(text, max = MAX_CONTENT_CHARS) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n…[truncated ${s.length - max} chars]`;
}

function hashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function extractUsageFromLlmResult(llmResult, durationMs) {
  const raw = llmResult?.response?.raw || llmResult?.raw || null;
  const ollama = llmResult?.response?.ollamaUsage || llmResult?.ollamaUsage || null;
  const usage = raw?.usage || {};
  const promptTokens =
    Number(usage.prompt_tokens ?? usage.promptTokens ?? ollama?.prompt_eval_count ?? 0) || 0;
  const completionTokens =
    Number(usage.completion_tokens ?? usage.completionTokens ?? ollama?.eval_count ?? 0) || 0;
  const totalTokens =
    Number(usage.total_tokens ?? usage.totalTokens ?? promptTokens + completionTokens) ||
    promptTokens + completionTokens;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    durationMs: Number(durationMs) || 0,
    provider: llmResult?.response?.provider || llmResult?.provider || null,
  };
}

function slimMessages(messages) {
  return (messages || []).map((m) => {
    const role = m.role;
    if (role === "tool") {
      return {
        role,
        tool_call_id: m.tool_call_id || m.toolCallId || null,
        name: m.name || null,
        content: truncateText(m.content, MAX_TOOL_RESULT_CHARS),
      };
    }
    const out = { role, content: truncateText(m.content) };
    if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
      out.tool_calls = m.tool_calls.map((tc) => ({
        id: tc.id,
        type: tc.type || "function",
        function: {
          name: tc.function?.name || tc.name,
          arguments:
            typeof tc.function?.arguments === "string"
              ? truncateText(tc.function.arguments, 4000)
              : JSON.stringify(tc.function?.arguments || tc.arguments || {}).slice(0, 4000),
        },
      }));
    }
    return out;
  });
}

function slimToolCalls(toolCalls) {
  return (toolCalls || []).map((tc) => ({
    id: tc.id || null,
    name: tc.name || tc.function?.name || "",
    arguments: tc.arguments || {},
    source: tc.source || null,
  }));
}

function createReplayTrace({ mode, toolNames = [], agentRunId = null } = {}) {
  return {
    schemaVersion: REPLAY_SCHEMA_VERSION,
    kind: "agent_replay_trace",
    agentRunId,
    mode: mode || null,
    toolNames: Array.isArray(toolNames) ? toolNames.slice(0, 64) : [],
    capturedAt: new Date().toISOString(),
    turns: [],
    totals: {
      turns: 0,
      toolCallCount: 0,
      durationMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
  };
}

function recordReplayTurn(trace, {
  messages,
  assistantContent,
  toolCalls,
  gatewayMeta,
  usage,
  purpose,
} = {}) {
  if (!trace || !replayCaptureEnabled()) return null;
  const slim = slimMessages(messages);
  const turn = {
    turnIndex: trace.turns.length,
    purpose: purpose || gatewayMeta?.purpose || null,
    modelUsed: gatewayMeta?.used || null,
    messagesHash: hashPayload(slim),
    messages: deepRedact(slim),
    assistantContent: truncateText(stripModelThinking(assistantContent || "")),
    toolCalls: deepRedact(slimToolCalls(toolCalls)),
    usage: usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0, durationMs: 0 },
    toolResults: [],
  };
  trace.turns.push(turn);
  trace.totals.turns = trace.turns.length;
  trace.totals.toolCallCount += turn.toolCalls.length;
  trace.totals.durationMs += Number(turn.usage.durationMs) || 0;
  trace.totals.promptTokens += Number(turn.usage.promptTokens) || 0;
  trace.totals.completionTokens += Number(turn.usage.completionTokens) || 0;
  trace.totals.totalTokens += Number(turn.usage.totalTokens) || 0;
  return turn;
}

function attachTurnToolResults(turn, executed = []) {
  if (!turn) return;
  turn.toolResults = (executed || []).map(({ tc, result }) => {
    let slimResult = result;
    try {
      const raw = typeof result === "string" ? result : JSON.stringify(result ?? {});
      const truncated = truncateText(raw, MAX_TOOL_RESULT_CHARS);
      try {
        slimResult = JSON.parse(truncated);
      } catch {
        slimResult = { _truncated: truncated };
      }
    } catch {
      slimResult = { ok: result?.ok !== false };
    }
    return {
      toolCallId: tc?.id || null,
      name: tc?.name || "",
      ok: result?.ok !== false,
      result: deepRedact(slimResult),
    };
  });
}

function finalizeReplayTrace(trace) {
  if (!trace) return null;
  const redacted = deepRedact(trace);
  redacted.integrity = {
    algorithm: "sha256",
    hash: hashPayload({
      schemaVersion: redacted.schemaVersion,
      mode: redacted.mode,
      turns: redacted.turns,
      totals: redacted.totals,
    }),
  };
  return redacted;
}

function validateReplayTrace(trace) {
  const errors = [];
  if (!trace || typeof trace !== "object") {
    return { ok: false, errors: ["trace missing"] };
  }
  if (trace.kind !== "agent_replay_trace") errors.push("kind must be agent_replay_trace");
  if (Number(trace.schemaVersion) < 1) errors.push("schemaVersion < 1");
  if (!Array.isArray(trace.turns)) errors.push("turns must be array");
  else {
    trace.turns.forEach((t, i) => {
      if (!Array.isArray(t.messages)) errors.push(`turn[${i}].messages missing`);
      if (typeof t.assistantContent !== "string" && t.assistantContent != null) {
        errors.push(`turn[${i}].assistantContent invalid`);
      }
    });
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  REPLAY_SCHEMA_VERSION,
  replayCaptureEnabled,
  createReplayTrace,
  recordReplayTurn,
  attachTurnToolResults,
  finalizeReplayTrace,
  validateReplayTrace,
  extractUsageFromLlmResult,
  slimMessages,
  slimToolCalls,
  truncateText,
  hashPayload,
};
