const { parseNamespace } = require("../namespace.js");
const { searchMemories } = require("../contextMemoryService.js");
const { getChat } = require("../chatService.js");
const { resolveUserId } = require("../projectService.js");
const { estimateMessagesTokens, estimateTokens } = require("./types.js");
const contextStore = require("./contextStore.js");

function collectChatMessages(getUserDataPath, userId, chatId) {
  const chat = getChat(getUserDataPath, userId, chatId, { includeMessages: true });
  return chat?.messages || [];
}

function collectRuntimeState(getUserDataPath, userId, { namespace, messages, config }) {
  const uid = resolveUserId(userId);
  const parsed = parseNamespace(namespace);
  const msgList = Array.isArray(messages) ? messages : [];
  const messageTokens = estimateMessagesTokens(msgList);
  const memories = searchMemories(getUserDataPath, uid, {
    namespace,
    callerNamespace: namespace,
    limit: parsed.type === "chat" ? 12 : 20,
  });
  const memoryTokens = memories.reduce((sum, m) => sum + estimateTokens(m.content), 0);
  const latest = contextStore.getLatestValidSnapshot(getUserDataPath, uid, namespace);
  const snapshotTokens = latest?.snapshot
    ? estimateTokens(JSON.stringify(latest.snapshot))
    : 0;
  return {
    namespace,
    scopeType: parsed.type,
    messages: msgList,
    memories,
    latestSnapshot: latest,
    messageTokens,
    memoryTokens,
    snapshotTokens,
    config,
  };
}

module.exports = {
  collectChatMessages,
  collectRuntimeState,
};
