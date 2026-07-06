const { assertSafeId } = require("../../utils/ipcValidate.js");
const {
  getDb,
  nowIso,
  newId,
  rowToChat,
} = require("./db.js");
const { buildChatNamespace } = require("./namespace.js");
const { resolveUserId } = require("./projectService.js");

function listChats(getUserDataPath, userId, { includeArchived = false } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const sql = includeArchived
    ? "SELECT * FROM chat_sessions WHERE user_id = ? AND status != 'DELETED' ORDER BY updated_at DESC"
    : "SELECT * FROM chat_sessions WHERE user_id = ? AND status = 'ACTIVE' ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(uid);
  return rows.map(rowToChat);
}

function getChat(getUserDataPath, userId, chatId, { includeMessages = false } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  const row = db
    .prepare("SELECT * FROM chat_sessions WHERE id = ? AND user_id = ? AND status != 'DELETED'")
    .get(cid, uid);
  const chat = rowToChat(row);
  if (!chat) {
    return null;
  }
  if (includeMessages) {
    const messages = db
      .prepare("SELECT * FROM chat_messages WHERE chat_id = ? AND user_id = ? ORDER BY created_at ASC")
      .all(cid, uid)
      .map((m) => ({
        id: m.id,
        chatId: m.chat_id,
        role: m.role,
        content: m.content,
        tokenCount: m.token_count,
        createdAt: m.created_at,
      }));
    chat.messages = messages;
  }
  return chat;
}

function createChat(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const title = String(payload?.title || "").trim() || "新对话";
  const id = newId("chat");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO chat_sessions (id, user_id, title, status, created_at, updated_at)
     VALUES (?, ?, ?, 'ACTIVE', ?, ?)`
  ).run(id, uid, title, ts, ts);
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
     VALUES (?, ?, 'chat', ?, 'chat.create', ?, ?)`
  ).run(newId("audit"), uid, id, JSON.stringify({ title }), ts);
  return getChat(getUserDataPath, uid, id);
}

function updateChat(getUserDataPath, userId, chatId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  const existing = getChat(getUserDataPath, uid, cid);
  if (!existing) {
    throw new Error("会话不存在");
  }
  const ts = nowIso();
  const title =
    typeof payload?.title === "string" && payload.title.trim()
      ? payload.title.trim()
      : existing.title;
  const status =
    typeof payload?.status === "string" && payload.status.trim()
      ? payload.status.trim()
      : existing.status;
  db.prepare("UPDATE chat_sessions SET title = ?, status = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(
    title,
    status,
    ts,
    cid,
    uid
  );
  if (status !== existing.status) {
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
       VALUES (?, ?, 'chat', ?, 'chat.status_change', ?, ?)`
    ).run(newId("audit"), uid, cid, JSON.stringify({ from: existing.status, to: status }), ts);
  }
  return getChat(getUserDataPath, uid, cid);
}

function archiveChat(getUserDataPath, userId, chatId) {
  return updateChat(getUserDataPath, userId, chatId, { status: "ARCHIVED" });
}

function deleteChat(getUserDataPath, userId, chatId) {
  return updateChat(getUserDataPath, userId, chatId, { status: "DELETED" });
}

function appendMessage(getUserDataPath, userId, chatId, { role, content }) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const cid = assertSafeId(chatId, "chatId");
  if (!getChat(getUserDataPath, uid, cid)) {
    throw new Error("会话不存在");
  }
  const msgRole = String(role || "").trim();
  if (!msgRole) {
    throw new Error("缺少消息 role");
  }
  const msgContent = String(content || "").trim();
  if (!msgContent) {
    throw new Error("消息内容不能为空");
  }
  const id = newId("msg");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO chat_messages (id, chat_id, user_id, role, content, token_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, cid, uid, msgRole, msgContent, Math.ceil(msgContent.length / 4), ts);
  db.prepare("UPDATE chat_sessions SET updated_at = ? WHERE id = ?").run(ts, cid);
  return {
    id,
    chatId: cid,
    role: msgRole,
    content: msgContent,
    createdAt: ts,
    namespace: buildChatNamespace(cid),
  };
}

module.exports = {
  listChats,
  getChat,
  createChat,
  updateChat,
  archiveChat,
  deleteChat,
  appendMessage,
  buildChatNamespace,
};
