/**
 * @typedef {"user"|"assistant"|"system"} ChatMessageRole
 */

/**
 * @typedef {Object} ChatMessage
 * @property {string} id
 * @property {string} sessionId
 * @property {ChatMessageRole} role
 * @property {string} content
 * @property {string|number} createdAt
 * @property {"sending"|"success"|"error"} [status]
 */

/**
 * @typedef {Object} ChatSession
 * @property {string} id
 * @property {string} title
 * @property {string|number} createdAt
 * @property {string|number} updatedAt
 * @property {ChatMessage[]} messages
 * @property {string} [summary]
 * @property {string} [contextSnapshot]
 */

function toEpoch(value) {
  if (value == null || value === "") {
    return Date.now();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function normalizeChatMessage(raw, sessionId) {
  const sid = String(sessionId || raw?.chatId || raw?.sessionId || "").trim();
  const roleRaw = String(raw?.role || "user").trim().toLowerCase();
  const role =
    roleRaw === "assistant" || roleRaw === "system" ? roleRaw : "user";
  const content = String(raw?.content || "").trim();
  return {
    id: String(raw?.id || "").trim() || `msg-${sid}-${role}-${content.slice(0, 12)}`,
    sessionId: sid,
    role,
    content,
    createdAt: raw?.createdAt || Date.now(),
    status: raw?.status || "success",
  };
}

function normalizeChatSession(raw, { messages = null, summary = "", contextSnapshot = "" } = {}) {
  const id = String(raw?.id || "").trim();
  const msgList = Array.isArray(messages)
    ? messages
    : Array.isArray(raw?.messages)
      ? raw.messages
      : [];
  return {
    id,
    title: String(raw?.title || "未命名对话").trim() || "未命名对话",
    createdAt: toEpoch(raw?.createdAt),
    updatedAt: toEpoch(raw?.updatedAt),
    messages: msgList
      .map((m) => normalizeChatMessage(m, id))
      .filter((m) => m.content),
    summary: String(summary || raw?.summary || "").trim(),
    contextSnapshot: String(contextSnapshot || raw?.contextSnapshot || "").trim(),
  };
}

function turnsFromMessages(messages) {
  return (Array.isArray(messages) ? messages : []).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: m.content,
  }));
}

window.__wbChatSessionModel = {
  normalizeChatMessage,
  normalizeChatSession,
  turnsFromMessages,
};
