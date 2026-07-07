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

const DEFAULT_CHAT_TITLE_RE =
  /^(当前对话|新对话|未命名对话|对话\s*\d+)$/;

function isDefaultChatTitle(title) {
  const t = String(title || "").trim();
  return !t || DEFAULT_CHAT_TITLE_RE.test(t);
}

function generateConversationTitle(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const firstUserMessage = list.find(
    (m) => m?.role === "user" && String(m?.content || "").trim()
  );
  if (!firstUserMessage) {
    return "新对话";
  }
  let title = String(firstUserMessage.content || "")
    .replace(/^请问/, "")
    .replace(/^帮我/, "")
    .replace(/^我想/, "")
    .replace(/^我需要/, "")
    .replace(/^你能不能/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length > 18) {
    title = `${title.slice(0, 18)}…`;
  }
  return title || "新对话";
}

window.__wbChatSessionModel = {
  normalizeChatMessage,
  normalizeChatSession,
  turnsFromMessages,
  isDefaultChatTitle,
  generateConversationTitle,
};
