const WB_CHAT_MODULE_STATE_KEY = "wb_chat_module_state_v1";

const chatModuleState = {
  activeSessionId: null,
  sessions: {},
  sessionOrder: [],
};

let composeRequestSessionId = null;

function sessionModel() {
  return window.__wbChatSessionModel || {};
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function generateLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(raw, sessionId) {
  const normalize = sessionModel().normalizeChatMessage;
  if (normalize) {
    return normalize(raw, sessionId);
  }
  return {
    id: raw.id || generateLocalId("msg"),
    sessionId,
    role: raw.role === "assistant" ? "assistant" : "user",
    content: String(raw.content || ""),
    createdAt: raw.createdAt || Date.now(),
    status: raw.status || "success",
  };
}

function normalizeSession(raw, messages = null) {
  const normalize = sessionModel().normalizeChatSession;
  if (normalize) {
    return normalize(raw, { messages: messages || raw?.messages || [] });
  }
  const id = String(raw?.id || "").trim();
  return {
    id,
    title: raw?.title || "新对话",
    createdAt: raw?.createdAt || Date.now(),
    updatedAt: raw?.updatedAt || Date.now(),
    messages: (messages || raw?.messages || []).map((m) => normalizeMessage(m, id)),
    summary: raw?.summary || "",
  };
}

function persistToStorage() {
  writeJson(WB_CHAT_MODULE_STATE_KEY, {
    activeSessionId: chatModuleState.activeSessionId,
    sessionOrder: chatModuleState.sessionOrder,
    sessions: chatModuleState.sessions,
  });
}

function loadFromStorage() {
  const saved = readJson(WB_CHAT_MODULE_STATE_KEY, null);
  if (!saved || typeof saved !== "object") {
    return;
  }
  chatModuleState.activeSessionId = saved.activeSessionId || null;
  chatModuleState.sessionOrder = Array.isArray(saved.sessionOrder) ? saved.sessionOrder : [];
  chatModuleState.sessions =
    saved.sessions && typeof saved.sessions === "object" ? saved.sessions : {};
}

function setActiveSessionId(sessionId) {
  const id = sessionId ? String(sessionId).trim() : null;
  chatModuleState.activeSessionId = id;
  if (id && !chatModuleState.sessionOrder.includes(id)) {
    chatModuleState.sessionOrder.unshift(id);
  }
  const cur = window.__wbStore?.getState?.().selectedChatId;
  if (id && cur !== id && window.__wbStore?.selectChat) {
    window.__wbStore.selectChat(id);
  }
  persistToStorage();
}

function getActiveSessionId() {
  return chatModuleState.activeSessionId || window.__wbStore?.getState?.().selectedChatId || null;
}

function getSession(sessionId) {
  const id = String(sessionId || "").trim();
  return id ? chatModuleState.sessions[id] || null : null;
}

function getSessionMessages(sessionId) {
  return getSession(sessionId)?.messages || [];
}

function getOrderedSessions() {
  const ordered = chatModuleState.sessionOrder
    .map((id) => chatModuleState.sessions[id])
    .filter((s) => s && !s.deleted);
  const orphan = Object.values(chatModuleState.sessions).filter(
    (s) => s && !s.deleted && !chatModuleState.sessionOrder.includes(s.id)
  );
  const list = [...ordered, ...orphan];
  if (list.length) {
    return list;
  }
  const storeChats = window.__wbStore?.getState?.().chats || [];
  return storeChats.map((c) => normalizeSession(c, getSession(c.id)?.messages || []));
}

function upsertSessionRecord(session) {
  if (!session?.id) {
    return null;
  }
  const id = String(session.id);
  const existing = chatModuleState.sessions[id];
  chatModuleState.sessions[id] = existing
    ? { ...existing, ...session, messages: session.messages || existing.messages || [] }
    : normalizeSession(session);
  if (!chatModuleState.sessionOrder.includes(id)) {
    chatModuleState.sessionOrder.unshift(id);
  }
  persistToStorage();
  window.__wbStore?.upsertChat?.({
    id,
    title: chatModuleState.sessions[id].title,
    createdAt: chatModuleState.sessions[id].createdAt,
    updatedAt: chatModuleState.sessions[id].updatedAt,
    summary: chatModuleState.sessions[id].summary || "",
  });
  return chatModuleState.sessions[id];
}

function appendMessage(sessionId, message) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return null;
  }
  const session = chatModuleState.sessions[id] || normalizeSession({ id, title: "新对话", messages: [] });
  const msg = normalizeMessage(message, id);
  session.messages = [...(session.messages || []), msg];
  session.updatedAt = Date.now();
  chatModuleState.sessions[id] = session;
  if (!chatModuleState.sessionOrder.includes(id)) {
    chatModuleState.sessionOrder.unshift(id);
  }
  persistToStorage();
  return msg;
}

function updateMessage(sessionId, messageId, patch) {
  const id = String(sessionId || "").trim();
  const msgId = String(messageId || "").trim();
  const session = chatModuleState.sessions[id];
  if (!session?.messages?.length) {
    return null;
  }
  const idx = session.messages.findIndex((m) => m.id === msgId);
  if (idx < 0) {
    return null;
  }
  const prev = session.messages[idx];
  const nextContent =
    typeof patch?.content === "function"
      ? patch.content(prev.content || "")
      : patch?.content != null
        ? patch.content
        : prev.content;
  session.messages[idx] = {
    ...prev,
    ...patch,
    content: nextContent,
  };
  session.updatedAt = Date.now();
  chatModuleState.sessions[id] = session;
  persistToStorage();
  return session.messages[idx];
}

function updateSessionMeta(sessionId, patch = {}) {
  const id = String(sessionId || "").trim();
  const session = chatModuleState.sessions[id];
  if (!session) {
    return;
  }
  Object.assign(session, patch, { updatedAt: Date.now() });
  chatModuleState.sessions[id] = session;
  window.__wbStore?.upsertChat?.({
    id,
    title: session.title,
    updatedAt: session.updatedAt,
    summary: session.summary || getLastMessageSummary(session),
  });
  persistToStorage();
  window.__wbRenderChats?.();
}

function getLastMessageSummary(session) {
  const messages = session?.messages || [];
  const last = [...messages].reverse().find((m) => String(m.content || "").trim());
  if (!last) {
    return "";
  }
  const text = String(last.content).replace(/\s+/g, " ").trim();
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function syncSessionsFromApi(apiChats) {
  const list = Array.isArray(apiChats) ? apiChats : [];
  const order = [...chatModuleState.sessionOrder];
  list.forEach((chat) => {
    if (!chat?.id) {
      return;
    }
    const id = String(chat.id);
    if (!order.includes(id)) {
      order.push(id);
    }
    const cached = chatModuleState.sessions[id];
    const merged = normalizeSession(chat, cached?.messages || []);
    if (cached?.messages?.length) {
      merged.messages = cached.messages;
    }
    chatModuleState.sessions[id] = merged;
  });
  chatModuleState.sessionOrder = order
    .filter((id) => chatModuleState.sessions[id] && !chatModuleState.sessions[id].deleted)
    .sort((a, b) => {
      const sa = chatModuleState.sessions[a];
      const sb = chatModuleState.sessions[b];
      const ta = Date.parse(sa?.updatedAt || sa?.createdAt || 0) || 0;
      const tb = Date.parse(sb?.updatedAt || sb?.createdAt || 0) || 0;
      return tb - ta;
    });
  list.forEach((chat) => {
    const id = String(chat?.id || "");
    if (id && !chatModuleState.sessionOrder.includes(id)) {
      chatModuleState.sessionOrder.unshift(id);
    }
  });
  persistToStorage();
}

function bindComposeRequestSession(sessionId) {
  composeRequestSessionId = sessionId ? String(sessionId).trim() : null;
}

function getComposeRequestSessionId() {
  return composeRequestSessionId;
}

function clearComposeRequestSession() {
  composeRequestSessionId = null;
}

async function ensureActiveSession(firstUserMessage) {
  if (typeof window.__wbEnsureActiveChatSession === "function") {
    const seed = String(firstUserMessage || "").trim();
    const sessionId = await window.__wbEnsureActiveChatSession({ titleSeed: seed });
    if (!sessionId) {
      return null;
    }
    setActiveSessionId(sessionId);
    if (!chatModuleState.sessions[sessionId]) {
      const title =
        sessionModel().generateSessionTitle?.(seed) ||
        sessionModel().generateConversationTitle?.([{ role: "user", content: seed }]) ||
        "新对话";
      upsertSessionRecord({
        id: sessionId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      });
    }
    bindComposeRequestSession(sessionId);
    return sessionId;
  }
  return getActiveSessionId();
}

async function beginChatTurn(userContent) {
  const content = String(userContent || "").trim();
  if (!content) {
    return null;
  }
  const requestSessionId = await ensureActiveSession(content);
  if (!requestSessionId) {
    return null;
  }
  bindComposeRequestSession(requestSessionId);

  const userMessage = appendMessage(requestSessionId, {
    id: generateLocalId("msg"),
    role: "user",
    content,
    status: "success",
    createdAt: Date.now(),
  });
  const assistantMessage = appendMessage(requestSessionId, {
    id: generateLocalId("msg"),
    role: "assistant",
    content: "",
    status: "sending",
    createdAt: Date.now(),
  });

  const title =
    sessionModel().generateSessionTitle?.(content) ||
    sessionModel().generateConversationTitle?.([{ role: "user", content }]);
  updateSessionMeta(requestSessionId, { title });
  if (typeof window.__wbPersistChatMessageForSession === "function") {
    await window.__wbPersistChatMessageForSession(requestSessionId, "user", content);
  }
  if (typeof window.__wbTouchChatTitle === "function") {
    await window.__wbTouchChatTitle(content);
  }
  window.__wbRenderChats?.();

  return {
    requestSessionId,
    userMessageId: userMessage?.id,
    assistantMessageId: assistantMessage?.id,
  };
}

async function completeChatTurn(requestSessionId, assistantMessageId, content, { userText = "", status = "success" } = {}) {
  const sid = String(requestSessionId || composeRequestSessionId || "").trim();
  const msgId = String(assistantMessageId || "").trim();
  if (!sid) {
    return;
  }
  updateMessage(sid, msgId, { content: String(content || ""), status });
  updateSessionMeta(sid, { summary: getLastMessageSummary(chatModuleState.sessions[sid]) });
  if (typeof window.__wbPersistChatMessageForSession === "function") {
    await window.__wbPersistChatMessageForSession(sid, "assistant", content, { userText });
  }
  window.__wbRenderChats?.();
}

async function failChatTurn(requestSessionId, assistantMessageId, errorText) {
  const sid = String(requestSessionId || composeRequestSessionId || "").trim();
  const msgId = String(assistantMessageId || "").trim();
  if (!sid || !msgId) {
    return;
  }
  updateMessage(sid, msgId, {
    content: String(errorText || "请求失败"),
    status: "error",
  });
  updateSessionMeta(sid);
  window.__wbRenderChats?.();
}

function hydrateSessionMessages(sessionId, messages) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return;
  }
  const session = chatModuleState.sessions[id] || normalizeSession({ id, title: "新对话" });
  session.messages = (Array.isArray(messages) ? messages : []).map((m) => normalizeMessage(m, id));
  chatModuleState.sessions[id] = session;
  if (!chatModuleState.sessionOrder.includes(id)) {
    chatModuleState.sessionOrder.unshift(id);
  }
  persistToStorage();
}

function removeSession(sessionId) {
  const id = String(sessionId || "").trim();
  if (!id) {
    return;
  }
  if (chatModuleState.sessions[id]) {
    chatModuleState.sessions[id].deleted = true;
  }
  chatModuleState.sessionOrder = chatModuleState.sessionOrder.filter((x) => x !== id);
  if (chatModuleState.activeSessionId === id) {
    chatModuleState.activeSessionId = chatModuleState.sessionOrder[0] || null;
  }
  persistToStorage();
}

loadFromStorage();

window.__wbChatSessionStore = {
  getState: () => ({
    activeSessionId: chatModuleState.activeSessionId,
    sessions: { ...chatModuleState.sessions },
    sessionOrder: [...chatModuleState.sessionOrder],
  }),
  getActiveSessionId,
  setActiveSessionId,
  getSession,
  getSessionMessages,
  getOrderedSessions,
  getLastMessageSummary,
  upsertSessionRecord,
  appendMessage,
  updateMessage,
  updateSessionMeta,
  syncSessionsFromApi,
  ensureActiveSession,
  beginChatTurn,
  completeChatTurn,
  failChatTurn,
  hydrateSessionMessages,
  removeSession,
  bindComposeRequestSession,
  getComposeRequestSessionId,
  clearComposeRequestSession,
  persistToStorage,
  loadFromStorage,
};
