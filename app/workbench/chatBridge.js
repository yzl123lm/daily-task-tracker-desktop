const WB_CHAT_SNAPSHOTS_KEY = "wb_chat_snapshots_v1";
const WB_CHAT_CONTEXT_KEY = "wb_chat_context_snapshots_v1";
const WB_ACTIVE_CHAT_KEY = "wb_active_chat_id_v1";
const WB_CHAT_MIGRATED_KEY = "wb_chat_migrated_v1";
const AI_THREADS_STORAGE_KEY = "daily_task_tracker_ai_threads_v1";
const AI_THREAD_SNAPSHOTS_KEY = "daily_task_tracker_ai_thread_snapshots_v1";
const AI_ACTIVE_THREAD_KEY = "daily_task_tracker_ai_active_thread_v1";
const CONTEXT_SUMMARY_MAX = 2000;

const DEV_REQUEST_RE =
  /改代码|写文件|运行命令|执行命令|git\s*(commit|push)|提交代码|修改项目|部署上线|shell/i;

const sessionCache = new Map();
let chatSwitchGen = 0;

function wbApi() {
  return window.electronAPI || {};
}

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
  localStorage.setItem(key, JSON.stringify(value));
}

function readChatSnapshots() {
  return readJson(WB_CHAT_SNAPSHOTS_KEY, {});
}

function writeChatSnapshots(map) {
  writeJson(WB_CHAT_SNAPSHOTS_KEY, map || {});
}

function readChatContextSnapshots() {
  return readJson(WB_CHAT_CONTEXT_KEY, {});
}

function writeChatContextSnapshots(map) {
  writeJson(WB_CHAT_CONTEXT_KEY, map || {});
}

function getActiveChatId() {
  return window.__wbStore?.getState?.().selectedChatId || null;
}

function persistActiveChatId(chatId) {
  const id = String(chatId || "").trim();
  if (id) {
    localStorage.setItem(WB_ACTIVE_CHAT_KEY, id);
  }
}

function readStoredActiveChatId() {
  try {
    return String(localStorage.getItem(WB_ACTIVE_CHAT_KEY) || "").trim() || null;
  } catch {
    return null;
  }
}

function getChatContextSnapshot(chatId) {
  const id = String(chatId || "").trim();
  if (!id) {
    return "";
  }
  const cached = sessionCache.get(id);
  if (cached?.contextSnapshot) {
    return cached.contextSnapshot;
  }
  return String(readChatContextSnapshots()[id] || "").trim();
}

function updateChatContextSnapshot(chatId, userText, assistantText) {
  const id = String(chatId || "").trim();
  const u = String(userText || "").replace(/\s+/g, " ").trim().slice(0, 220);
  const a = String(assistantText || "").replace(/\s+/g, " ").trim().slice(0, 360);
  if (!id || (!u && !a)) {
    return;
  }
  const prev = getChatContextSnapshot(id);
  const line = `Q: ${u} → A: ${a}`;
  let next = prev ? `${prev}\n${line}` : line;
  if (next.length > CONTEXT_SUMMARY_MAX) {
    next = next.slice(next.length - CONTEXT_SUMMARY_MAX);
  }
  const map = readChatContextSnapshots();
  map[id] = next;
  writeChatContextSnapshots(map);
  const cached = sessionCache.get(id);
  if (cached) {
    cached.contextSnapshot = next;
    sessionCache.set(id, cached);
  }
}

function cacheSession(session) {
  if (!session?.id) {
    return session;
  }
  sessionCache.set(session.id, session);
  return session;
}

function getCachedSession(chatId) {
  return sessionCache.get(String(chatId || "").trim()) || null;
}

async function fetchChatSession(chatId, { force = false } = {}) {
  const id = String(chatId || "").trim();
  if (!id) {
    return null;
  }
  if (!force) {
    const cached = getCachedSession(id);
    if (cached?.messages?.length) {
      return cached;
    }
  }
  const api = wbApi();
  if (typeof api.wbChatGet !== "function") {
    return null;
  }
  try {
    const raw = await api.wbChatGet({ chatId: id, includeMessages: true });
    const normalize = sessionModel().normalizeChatSession;
    const session = normalize
      ? normalize(raw, {
          summary: raw?.summary || "",
          contextSnapshot: getChatContextSnapshot(id),
        })
      : {
          id,
          title: raw?.title || "未命名对话",
          createdAt: raw?.createdAt,
          updatedAt: raw?.updatedAt,
          messages: (raw?.messages || []).map((m) => ({
            id: m.id,
            sessionId: id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
          summary: raw?.summary || "",
          contextSnapshot: getChatContextSnapshot(id),
        };
    return cacheSession(session);
  } catch {
    return getCachedSession(id);
  }
}

async function backfillMessagesFromTurns(chatId, turns) {
  const id = String(chatId || "").trim();
  const api = wbApi();
  const list = Array.isArray(turns) ? turns : [];
  if (!id || !list.length || typeof api.wbChatAppendMessage !== "function") {
    return;
  }
  for (const turn of list) {
    const role = turn?.role === "assistant" ? "assistant" : "user";
    const content = String(turn?.content || "").trim();
    if (!content) {
      continue;
    }
    try {
      await api.wbChatAppendMessage({ chatId: id, role, content });
    } catch {
      /* ignore duplicate */
    }
  }
  sessionCache.delete(id);
}

function persistActiveChatSnapshot(html) {
  const chatId = getActiveChatId();
  if (!chatId) {
    return;
  }
  const content =
    typeof html === "string"
      ? html
      : typeof window.__aiGetChatLogHtml === "function"
        ? window.__aiGetChatLogHtml()
        : "";
  const snapshots = readChatSnapshots();
  snapshots[chatId] = content;
  writeChatSnapshots(snapshots);
}

async function saveCurrentChatState(chatId) {
  const id = String(chatId || "").trim();
  if (!id) {
    return;
  }
  persistActiveChatSnapshot();
  if (typeof window.__aiGetBoundChatId === "function" && window.__aiGetBoundChatId() !== id) {
    return;
  }
  const turns =
    typeof window.__aiGetChatTurns === "function" ? window.__aiGetChatTurns() : [];
  if (turns.length) {
    const cached = getCachedSession(id) || { id, messages: [] };
    const normalize = sessionModel().normalizeChatMessage;
    cached.messages = turns.map((t, index) =>
      normalize
        ? normalize(
            { id: `local-${id}-${index}`, role: t.role, content: t.content },
            id
          )
        : { id: `local-${id}-${index}`, sessionId: id, role: t.role, content: t.content }
    );
    cacheSession(cached);
  }
}

async function ensureActiveChatSession({ titleSeed, title } = {}) {
  const existing = getActiveChatId();
  if (existing) {
    return existing;
  }
  const api = wbApi();
  if (typeof api.wbChatCreate !== "function") {
    return null;
  }
  const seed = String(titleSeed || "").trim();
  const nextTitle =
    String(title || "").trim() ||
    (seed
      ? seed.slice(0, 24)
      : `对话 ${new Date().toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`);
  try {
    const chat = await api.wbChatCreate({ title: nextTitle });
    const chatId = chat.id;
    cacheSession(
      sessionModel().normalizeChatSession
        ? sessionModel().normalizeChatSession(chat, { messages: [] })
        : { ...chat, messages: [], contextSnapshot: "" }
    );
    window.__wbStore?.selectChat?.(chatId);
    persistActiveChatId(chatId);
    window.__wbHideProjectWorkspace?.();
    await window.__wbRefreshChats?.();
    window.__wbRenderChats?.();
    return chatId;
  } catch {
    return null;
  }
}

async function migrateLegacyChats() {
  const api = wbApi();
  if (typeof api.wbChatCreate !== "function") {
    return;
  }
  if (localStorage.getItem(WB_CHAT_MIGRATED_KEY) === "1") {
    return;
  }
  const legacyThreads = readJson(AI_THREADS_STORAGE_KEY, null);
  const legacySnapshots = readJson(AI_THREAD_SNAPSHOTS_KEY, {});
  const threads = Array.isArray(legacyThreads) && legacyThreads.length
    ? legacyThreads
    : [{ id: "default", title: "当前对话", updatedAt: Date.now() }];
  const newSnapshots = { ...readChatSnapshots() };
  let firstChatId = null;
  const activeLegacy = localStorage.getItem(AI_ACTIVE_THREAD_KEY) || threads[0]?.id;

  for (const thread of threads) {
    const title = String(thread?.title || "未命名对话").trim() || "未命名对话";
    const chat = await api.wbChatCreate({ title });
    if (!firstChatId) {
      firstChatId = chat.id;
    }
    const legacyHtml = legacySnapshots[thread.id];
    if (legacyHtml) {
      newSnapshots[chat.id] = String(legacyHtml);
    }
    if (thread.id === activeLegacy) {
      window.__wbStore?.selectChat?.(chat.id);
      persistActiveChatId(chat.id);
    }
  }

  writeChatSnapshots(newSnapshots);
  localStorage.setItem(WB_CHAT_MIGRATED_KEY, "1");
  if (!window.__wbStore?.getState?.().selectedChatId && firstChatId) {
    window.__wbStore?.selectChat?.(firstChatId);
    persistActiveChatId(firstChatId);
  }
}

async function loadChatIntoAi(chatId, { loadGen } = {}) {
  const id = String(chatId || "").trim();
  if (!id) {
    return;
  }
  const session = await fetchChatSession(id, { force: true });
  if (loadGen != null && loadGen !== chatSwitchGen) {
    return;
  }
  const turnsFromDb = sessionModel().turnsFromMessages
    ? sessionModel().turnsFromMessages(session?.messages || [])
    : (session?.messages || []).map((m) => ({ role: m.role, content: m.content }));

  if (turnsFromDb.length) {
    if (typeof window.__aiLoadChatTurns === "function") {
      window.__aiLoadChatTurns(turnsFromDb, { sessionId: id });
    }
    return;
  }

  const snapHtml = readChatSnapshots()[id];
  if (snapHtml && typeof window.__aiSetChatLogHtml === "function") {
    window.__aiSetChatLogHtml(snapHtml, { sessionId: id });
    if (loadGen != null && loadGen !== chatSwitchGen) {
      return;
    }
    const extracted =
      typeof window.__aiGetChatTurns === "function" ? window.__aiGetChatTurns() : [];
    if (extracted.length) {
      await backfillMessagesFromTurns(id, extracted);
    }
    return;
  }

  if (typeof window.__aiLoadChatTurns === "function") {
    window.__aiLoadChatTurns([], { sessionId: id });
    return;
  }
  if (typeof window.__aiClearChatLog === "function") {
    window.__aiClearChatLog({ sessionId: id });
  }
}

async function switchChat(chatId) {
  const nextId = String(chatId || "").trim();
  if (!nextId) {
    return;
  }
  const loadGen = ++chatSwitchGen;
  const prev = getActiveChatId();
  if (typeof window.__aiAbortActiveCompose === "function") {
    window.__aiAbortActiveCompose();
  }
  if (prev) {
    await saveCurrentChatState(prev);
  }
  if (typeof window.__wbShowChatView === "function") {
    window.__wbShowChatView();
  } else {
    window.__wbHideProjectWorkspace?.();
  }
  window.__wbStore?.selectChat?.(nextId);
  persistActiveChatId(nextId);
  await loadChatIntoAi(nextId, { loadGen });
  if (loadGen !== chatSwitchGen) {
    return;
  }
  if (typeof window.__wbShowChatView === "function") {
    window.__wbShowChatView();
  }
  window.__wbRenderChats?.();
  window.__wbRenderProjects?.();
  if (typeof window.activateRoute === "function") {
    window.activateRoute("ai", { syncHash: true, skipWorkbenchGuard: true });
  }
}

async function touchChatTitle(text) {
  const chatId = getActiveChatId();
  const title = String(text || "").trim().slice(0, 24);
  if (!chatId || !title) {
    return;
  }
  const api = wbApi();
  const chats = window.__wbStore?.getState?.().chats || [];
  const cur = chats.find((c) => c.id === chatId);
  if (!cur) {
    return;
  }
  if (cur.title !== "当前对话" && !/^对话 \d+$/.test(cur.title || "") && !/^新对话/.test(cur.title || "")) {
    return;
  }
  if (typeof api.wbChatUpdate === "function") {
    await api.wbChatUpdate({ chatId, title });
    await window.__wbRefreshChats?.();
  }
}

async function persistChatMessage(role, content) {
  const chatId = getActiveChatId();
  const api = wbApi();
  if (!chatId || typeof api.wbChatAppendMessage !== "function") {
    return;
  }
  const body = String(content || "").trim();
  if (!body) {
    return;
  }
  if (
    typeof window.__aiGetBoundChatId === "function" &&
    window.__aiGetBoundChatId() &&
    window.__aiGetBoundChatId() !== chatId
  ) {
    return;
  }
  try {
    const result = await api.wbChatAppendMessage({ chatId, role, content: body });
    sessionCache.delete(chatId);
    if (result?.summaryUpdate?.updated && typeof window.__wbRefreshChats === "function") {
      await window.__wbRefreshChats();
    }
  } catch {
    /* ignore duplicate or validation errors during sync */
  }
}

async function fetchChatAgentContextBlock() {
  const chatId = getActiveChatId();
  const api = wbApi();
  if (!chatId || typeof api.wbChatAgentContext !== "function") {
    return "";
  }
  try {
    const prepared = await api.wbChatAgentContext({ chatId });
    const text = prepared?.promptContext?.text || "";
    if (!text) {
      return "";
    }
    return (
      "【当前会话上下文（仅本会话 chat namespace，与项目区域隔离）】\n" +
      "当用户要求修改项目代码、执行命令或 Git 操作时，提示其切换到左侧项目区域。\n\n" +
      text
    );
  } catch {
    return "";
  }
}

function detectDevRequest(text) {
  return DEV_REQUEST_RE.test(String(text || ""));
}

function devRequestReply() {
  return (
    "这是会话区的普通问答通道（ChatAgent），我不能读取项目文件、修改代码或执行命令。\n\n" +
    "如需开发项目，请在左侧「项目区域」创建或选择项目，并在项目工作区中描述需求。"
  );
}

window.__wbMigrateLegacyChats = migrateLegacyChats;
window.__wbGetActiveChatId = getActiveChatId;
window.__wbGetBoundChatSessionId = () =>
  typeof window.__aiGetBoundChatId === "function" ? window.__aiGetBoundChatId() : null;
window.__wbPersistActiveChatId = persistActiveChatId;
window.__wbReadStoredActiveChatId = readStoredActiveChatId;
window.__wbEnsureActiveChatSession = ensureActiveChatSession;
window.__wbSwitchChat = switchChat;
window.__wbFetchChatSession = fetchChatSession;
window.__wbGetCachedChatSession = getCachedSession;
window.__wbPersistActiveChatSnapshot = persistActiveChatSnapshot;
window.__wbSaveChatSnapshot = persistActiveChatSnapshot;
window.__wbGetChatContextSnapshot = getChatContextSnapshot;
window.__wbUpdateChatContextSnapshot = updateChatContextSnapshot;
window.__wbTouchChatTitle = touchChatTitle;
window.__wbOnAiUserMessage = async (text) => {
  await ensureActiveChatSession({ titleSeed: text });
  await touchChatTitle(text);
  await persistChatMessage("user", text);
  await window.__wbRefreshChats?.();
};
window.__wbOnAiAssistantMessage = async (text) => {
  await ensureActiveChatSession({});
  await persistChatMessage("assistant", text);
  persistActiveChatSnapshot();
  await window.__wbRefreshChats?.();
};
window.__wbIsWorkbenchChatMode = () =>
  typeof wbApi().wbChatsList === "function" &&
  typeof window.__wbOnAiUserMessage === "function";
window.__wbFetchChatAgentContext = fetchChatAgentContextBlock;
window.__wbDetectDevRequest = detectDevRequest;
window.__wbDevRequestReply = devRequestReply;
