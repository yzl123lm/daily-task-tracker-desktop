const { getDb } = require("./db.js");
const { resolveUserId } = require("./projectService.js");
const { assertSafeId } = require("../../utils/ipcValidate.js");
const { getChat } = require("./chatService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { buildChatNamespace } = require("./namespace.js");

const SUMMARY_EVERY_N_MESSAGES = 7;

function summarizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const recent = list.slice(-SUMMARY_EVERY_N_MESSAGES);
  const topics = recent
    .filter((m) => m.role === "user")
    .map((m) => String(m.content || "").trim().slice(0, 80))
    .filter(Boolean);
  const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");
  const topicLine = topics.length ? topics.join("；") : "暂无明确主题";
  const answerHint = lastAssistant
    ? String(lastAssistant.content || "").trim().slice(0, 120)
    : "";
  return `本会话近期主题：${topicLine}${answerHint ? `。最近回答要点：${answerHint}` : ""}`;
}

function upsertChatSummaryMemory(getUserDataPath, userId, chatId, summaryText) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  const ns = buildChatNamespace(cid);
  db.prepare(
    `DELETE FROM context_memories
     WHERE user_id = ? AND namespace = ? AND memory_type = 'chat_summary'`
  ).run(uid, ns);
  return writeMemory(getUserDataPath, uid, {
    namespace: ns,
    scopeType: "chat",
    scopeId: cid,
    memoryType: "chat_summary",
    content: summaryText,
    source: "ChatAgent.auto_summary",
    importance: 4,
  });
}

function maybeUpdateChatSummary(getUserDataPath, userId, chatId) {
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  const chat = getChat(getUserDataPath, uid, cid, { includeMessages: true });
  if (!chat) {
    return { updated: false, reason: "chat_not_found" };
  }
  const messages = chat.messages || [];
  const count = messages.length;
  if (count < SUMMARY_EVERY_N_MESSAGES) {
    return { updated: false, reason: "below_threshold", messageCount: count };
  }
  if (count % SUMMARY_EVERY_N_MESSAGES !== 0) {
    return { updated: false, reason: "interval_skip", messageCount: count };
  }
  const summary = summarizeMessages(messages);
  const mem = upsertChatSummaryMemory(getUserDataPath, uid, cid, summary);
  return {
    updated: true,
    messageCount: count,
    summary,
    memoryId: mem.id,
  };
}

function getChatSummary(getUserDataPath, userId, chatId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  const ns = buildChatNamespace(cid);
  const row = db
    .prepare(
      `SELECT content, updated_at FROM context_memories
       WHERE user_id = ? AND namespace = ? AND memory_type = 'chat_summary'
       ORDER BY updated_at DESC LIMIT 1`
    )
    .get(uid, ns);
  return row ? { summary: row.content, updatedAt: row.updated_at } : null;
}

function listChatsEnriched(getUserDataPath, userId) {
  const { listChats } = require("./chatService.js");
  const chats = listChats(getUserDataPath, userId);
  return chats.map((chat) => {
    const summaryRow = getChatSummary(getUserDataPath, userId, chat.id);
    return {
      ...chat,
      summary: summaryRow?.summary ? String(summaryRow.summary).slice(0, 80) : "",
    };
  });
}

module.exports = {
  SUMMARY_EVERY_N_MESSAGES,
  maybeUpdateChatSummary,
  getChatSummary,
  summarizeMessages,
  listChatsEnriched,
};
