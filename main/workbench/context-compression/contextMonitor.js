const { parseNamespace } = require("../namespace.js");
const { searchMemories } = require("../contextMemoryService.js");
const { getChat } = require("../chatService.js");
const { resolveUserId } = require("../projectService.js");
const { estimateMessagesTokens, estimateTokens } = require("./types.js");
const contextStore = require("./contextStore.js");
const { listToolOperations } = require("../toolPermissionService.js");

function collectChatMessages(getUserDataPath, userId, chatId) {
  const chat = getChat(getUserDataPath, userId, chatId, { includeMessages: true });
  return chat?.messages || [];
}

function collectPhase4Extras(getUserDataPath, uid, parsed) {
  if (parsed.type !== "task" || !parsed.projectId || !parsed.taskId) {
    return {
      relevantFiles: [],
      changesMade: [],
      testsAndCommands: [],
      currentErrors: [],
    };
  }
  const ops = listToolOperations(getUserDataPath, uid, parsed.projectId, parsed.taskId, {
    limit: 40,
  });
  const relevantFiles = [];
  const changesMade = [];
  const testsAndCommands = [];
  const currentErrors = [];
  for (const op of ops) {
    if (op.toolName === "read_project_file" && op.args?.path) {
      relevantFiles.push({
        path: op.args.path,
        summary: `已读取（${op.createdAt || ""}）`,
      });
    }
    if (op.toolName === "preview_diff" && op.args?.filePath) {
      changesMade.push({
        file: op.args.filePath,
        summary: op.resultText || "补丁预览（未写入）",
        writeApplied: false,
      });
    }
    if (op.toolName === "write_project_file" && op.args?.path) {
      changesMade.push({
        file: op.args.path,
        summary: op.resultText || "已写入",
        writeApplied: true,
        approved: Boolean(op.approvedByUser),
      });
    }
    if (op.toolName === "run_tests" || op.toolName === "run_shell_command") {
      const success = /success:\s*true/i.test(op.resultText || "");
      testsAndCommands.push({
        command: op.args?.command || op.toolName,
        summary: op.resultText?.slice(0, 160) || "",
        success,
        shell: op.toolName === "run_shell_command",
      });
      if (!success) {
        currentErrors.push({
          message: op.resultText?.slice(0, 240) || "测试失败",
          source: op.id,
        });
      }
    }
  }
  return {
    relevantFiles: relevantFiles.slice(0, 8),
    changesMade: changesMade.slice(0, 8),
    testsAndCommands: testsAndCommands.slice(0, 8),
    currentErrors: currentErrors.slice(0, 6),
  };
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
  const phase4 = collectPhase4Extras(getUserDataPath, uid, parsed);
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
    ...phase4,
  };
}

module.exports = {
  collectChatMessages,
  collectRuntimeState,
};
