const { assertSafeId } = require("../../utils/ipcValidate.js");
const projectService = require("./projectService.js");
const chatService = require("./chatService.js");
const contextMemoryService = require("./contextMemoryService.js");
const agentOrchestrator = require("./agentOrchestrator.js");
const agentRunService = require("./agentRunService.js");
const chatSummaryService = require("./chatSummaryService.js");
const compressionManager = require("./context-compression/contextCompressionManager.js");
const contextStore = require("./context-compression/contextStore.js");
const { parseNamespace, assertNoCrossScopeRead, NAMESPACE_FORBIDDEN } = require("./namespace.js");

function registerWorkbenchHandlers(ipcMain, { getUserDataPath }) {
  if (!ipcMain || typeof getUserDataPath !== "function") {
    throw new Error("registerWorkbenchHandlers 缺少参数");
  }

  ipcMain.handle("wb-projects-list", (_event, payload) => {
    return projectService.listProjects(getUserDataPath, payload?.userId);
  });

  ipcMain.handle("wb-project-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    return project;
  });

  ipcMain.handle("wb-project-create", (_event, payload) => {
    const project = projectService.createProject(getUserDataPath, payload?.userId, payload || {});
    contextMemoryService.initProjectMemory(getUserDataPath, payload?.userId, project);
    return project;
  });

  ipcMain.handle("wb-project-update", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.updateProject(getUserDataPath, payload?.userId, projectId, payload || {});
  });

  ipcMain.handle("wb-project-tasks-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.listTasks(getUserDataPath, payload?.userId, projectId);
  });

  ipcMain.handle("wb-project-task-create", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.createTask(getUserDataPath, payload?.userId, projectId, payload || {});
  });

  ipcMain.handle("wb-project-task-update", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return projectService.updateTask(getUserDataPath, payload?.userId, projectId, taskId, payload || {});
  });

  ipcMain.handle("wb-project-agent-runs-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return agentRunService.listAgentRunsForTask(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-agent-run", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return agentOrchestrator.runProjectAgent(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      message: payload?.message,
      mode: payload?.mode || "PLAN_ONLY",
    });
  });

  ipcMain.handle("wb-chats-list", (_event, payload) => {
    if (payload?.withSummary) {
      return chatSummaryService.listChatsEnriched(getUserDataPath, payload?.userId);
    }
    return chatService.listChats(getUserDataPath, payload?.userId);
  });

  ipcMain.handle("wb-chat-get", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const chat = chatService.getChat(getUserDataPath, payload?.userId, chatId, {
      includeMessages: Boolean(payload?.includeMessages),
    });
    if (!chat) {
      throw new Error("会话不存在");
    }
    return chat;
  });

  ipcMain.handle("wb-chat-create", (_event, payload) => {
    return chatService.createChat(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-chat-update", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.updateChat(getUserDataPath, payload?.userId, chatId, payload || {});
  });

  ipcMain.handle("wb-chat-send-message", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    if (payload?.toolName) {
      agentOrchestrator.assertChatAgentTool(payload.toolName);
    }
    return agentOrchestrator.runChatAgent(getUserDataPath, payload?.userId, {
      chatId,
      message: payload?.message,
      toolName: payload?.toolName,
    });
  });

  ipcMain.handle("wb-chat-append-message", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const msg = chatService.appendMessage(getUserDataPath, payload?.userId, chatId, {
      role: payload?.role,
      content: payload?.content,
    });
    const summaryResult = chatSummaryService.maybeUpdateChatSummary(
      getUserDataPath,
      payload?.userId,
      chatId
    );
    return { message: msg, summaryUpdate: summaryResult };
  });

  ipcMain.handle("wb-chat-maybe-summarize", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatSummaryService.maybeUpdateChatSummary(getUserDataPath, payload?.userId, chatId);
  });

  ipcMain.handle("wb-chat-agent-context", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const chat = chatService.getChat(getUserDataPath, payload?.userId, chatId, {
      includeMessages: true,
    });
    if (!chat) {
      throw new Error("会话不存在");
    }
    const messages = (chat.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return compressionManager.prepareContextForAgent(getUserDataPath, payload?.userId, {
      namespace: `chat:${chatId}`,
      messages,
    });
  });

  ipcMain.handle("wb-memory-search", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    const callerNamespace = String(payload?.callerNamespace || namespace).trim();
    assertNoCrossScopeRead(callerNamespace, namespace);
    if (payload?.projectId) {
      const projectId = assertSafeId(payload.projectId, "projectId");
      const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
      return contextMemoryService.searchWithProjectGuard(
        getUserDataPath,
        payload?.userId,
        projectId,
        taskId,
        payload
      );
    }
    return contextMemoryService.searchMemories(getUserDataPath, payload?.userId, payload);
  });

  ipcMain.handle("wb-memory-write", (_event, payload) => {
    return contextMemoryService.writeMemory(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-namespace-probe", (_event, payload) => {
    try {
      assertNoCrossScopeRead(payload?.fromNamespace, payload?.toNamespace);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: err.code || NAMESPACE_FORBIDDEN,
        message: err.message,
      };
    }
  });

  ipcMain.handle("wb-context-health", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return compressionManager.getContextHealth(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-context-compress", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return compressionManager.applyCompression(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-context-snapshots-list", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return contextStore.listSnapshots(getUserDataPath, payload?.userId, namespace, {
      limit: payload?.limit,
    });
  });

  ipcMain.handle("wb-context-snapshot-get", (_event, payload) => {
    const snapshotId = assertSafeId(payload?.snapshotId, "snapshotId");
    const snap = contextStore.getSnapshotById(getUserDataPath, payload?.userId, snapshotId);
    if (!snap) {
      throw new Error("快照不存在");
    }
    return snap;
  });

  ipcMain.handle("wb-context-snapshot-restore", (_event, payload) => {
    const snapshotId = assertSafeId(payload?.snapshotId, "snapshotId");
    return contextStore.restoreSnapshot(getUserDataPath, payload?.userId, snapshotId);
  });
}

module.exports = { registerWorkbenchHandlers };
