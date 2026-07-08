/**
 * Normalize tool calls from OpenAI / Ollama / JSON-action fallback formats.
 */

function parseToolArguments(raw) {
  if (raw == null || raw === "") {
    return {};
  }
  if (typeof raw === "object") {
    return raw;
  }
  try {
    return JSON.parse(String(raw));
  } catch {
    return { _raw: String(raw) };
  }
}

function extractOpenAiToolCalls(message) {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) {
    return [];
  }
  return calls.map((tc, idx) => ({
    id: tc.id || `call_${idx}`,
    name: tc.function?.name || tc.name || "",
    arguments: parseToolArguments(tc.function?.arguments ?? tc.arguments),
    source: "openai-tools",
  }));
}

function extractOllamaToolCalls(message) {
  const calls = message?.tool_calls;
  if (!Array.isArray(calls) || !calls.length) {
    return [];
  }
  return calls.map((tc, idx) => ({
    id: tc.id || `call_${idx}`,
    name: tc.function?.name || tc.name || "",
    arguments: parseToolArguments(tc.function?.arguments ?? tc.arguments),
    source: "ollama-tools",
  }));
}

function extractJsonActionToolCalls(content) {
  const text = String(content || "").trim();
  if (!text) {
    return [];
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  let parsed;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    const actionMatch = candidate.match(/\{[\s\S]*"action"\s*:[\s\S]*\}/);
    if (!actionMatch) {
      return [];
    }
    try {
      parsed = JSON.parse(actionMatch[0]);
    } catch {
      return [];
    }
  }
  const actions = Array.isArray(parsed) ? parsed : [parsed];
  return actions
    .filter((a) => a && (a.action || a.tool || a.name))
    .map((a, idx) => ({
      id: a.id || `json_${idx}`,
      name: String(a.action || a.tool || a.name || ""),
      arguments: a.arguments || a.args || a.input || {},
      source: "json-action",
    }));
}

function extractToolCallsFromResponse(response) {
  const message = response?.message || response?.raw?.choices?.[0]?.message || {};
  const fromOpenAi = extractOpenAiToolCalls(message);
  if (fromOpenAi.length) {
    return fromOpenAi;
  }
  const fromOllama = extractOllamaToolCalls(message);
  if (fromOllama.length) {
    return fromOllama;
  }
  return extractJsonActionToolCalls(message.content ?? response?.content);
}

function buildToolResultMessage(toolCallId, toolName, resultText) {
  return {
    role: "tool",
    tool_call_id: toolCallId,
    name: toolName,
    content: String(resultText ?? ""),
  };
}

function buildAssistantToolCallMessage(toolCalls) {
  return {
    role: "assistant",
    content: "",
    tool_calls: toolCalls.map((tc, idx) => ({
      id: tc.id || `call_${idx}`,
      type: "function",
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments || {}),
      },
    })),
  };
}

module.exports = {
  parseToolArguments,
  extractOpenAiToolCalls,
  extractOllamaToolCalls,
  extractJsonActionToolCalls,
  extractToolCallsFromResponse,
  buildToolResultMessage,
  buildAssistantToolCallMessage,
};
