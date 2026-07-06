const { assertSafeId } = require("../../utils/ipcValidate.js");
const projectService = require("./projectService.js");
const chatService = require("./chatService.js");
const contextMemoryService = require("./contextMemoryService.js");
const agentOrchestrator = require("./agentOrchestrator.js");
const { assertNoCrossScopeRead, NAMESPACE_FORBIDDEN } = require("./namespace.js");

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
}

module.exports = { registerWorkbenchHandlers };
