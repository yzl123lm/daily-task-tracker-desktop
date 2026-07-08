const { dialog, BrowserWindow } = require("electron");
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
const projectCodeService = require("./projectCodeService.js");
const diffPreviewService = require("./diffPreviewService.js");
const testRunnerService = require("./testRunnerService.js");
const {
  assertProjectAgentTool,
  recordToolOperation,
  listToolOperations,
} = require("./toolPermissionService.js");
const controlledDevService = require("./controlledDevService.js");
const backupRestoreService = require("./backupRestoreService.js");
const patchStagingService = require("./patchStagingService.js");
const verificationService = require("./verificationService.js");

function registerWorkbenchHandlers(ipcMain, { getUserDataPath, getDefaultProjectRoot }) {
  if (!ipcMain || typeof getUserDataPath !== "function") {
    throw new Error("registerWorkbenchHandlers 缺少参数");
  }

  agentOrchestrator.configureAgentOrchestrator({
    getDefaultProjectRoot:
      typeof getDefaultProjectRoot === "function" ? getDefaultProjectRoot : null,
  });

  function resolveRootForProject(project) {
    return projectCodeService.resolveProjectRoot(project, getDefaultProjectRoot);
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

  ipcMain.handle("wb-project-archive", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.archiveProject(getUserDataPath, payload?.userId, projectId);
  });

  ipcMain.handle("wb-project-delete", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.deleteProject(getUserDataPath, payload?.userId, projectId);
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
      fixContext: payload?.fixContext,
      userApproved: payload?.userApproved,
      approvalId: payload?.approvalId,
      requestId: payload?.requestId,
      patchIds: payload?.patchIds,
      createGitBranch: payload?.createGitBranch,
      agentRunId: payload?.agentRunId,
    });
  });

  ipcMain.handle("wb-project-agent-cancel", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const agentRunId = assertSafeId(payload?.agentRunId, "agentRunId");
    return agentOrchestrator.cancelProjectAgent(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      agentRunId,
    });
  });

  ipcMain.handle("wb-project-patches-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const patches = patchStagingService.listStagedPatches(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { status: payload?.status }
    );
    return patches.map(patchStagingService.patchToDiffPreview);
  });

  ipcMain.handle("wb-project-patch-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const patchId = assertSafeId(payload?.patchId, "patchId");
    const patch = patchStagingService.getStagedPatch(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      patchId
    );
    if (!patch) {
      throw new Error("补丁不存在");
    }
    return patchStagingService.patchToDiffPreview(patch);
  });

  ipcMain.handle("wb-project-patch-status", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const patchId = assertSafeId(payload?.patchId, "patchId");
    const status = String(payload?.status || "").toUpperCase();
    return patchStagingService.updatePatchStatus(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      patchId,
      status
    );
  });

  ipcMain.handle("wb-project-verify-start", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return verificationService.runVerification(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        scriptName: payload?.scriptName || "build",
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-verify-scripts", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return verificationService.listAvailableVerifications(
      getUserDataPath,
      payload?.userId,
      projectId,
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-choose-root", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      properties: ["openDirectory"],
      title: "选择项目代码目录",
    });
    if (res.canceled || !res.filePaths?.length) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.handle("wb-project-code-root", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    return {
      projectId,
      localPath: project.localPath,
      codeRoot: root,
      isFallback: !project.localPath && Boolean(root),
    };
  });

  ipcMain.handle("wb-project-files-tree", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      return { entries: [], codeRoot: null };
    }
    assertProjectAgentTool("list_project_files");
    const entries = projectCodeService.listTreeEntries(root);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "list_project_files",
      args: { root },
      resultText: `列出 ${entries.length} 项`,
      riskLevel: "LOW",
    });
    return { entries, codeRoot: root };
  });

  ipcMain.handle("wb-project-file-read", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const relPath = String(payload?.path || "").trim();
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("read_project_file");
    const file = projectCodeService.readProjectFile(root, relPath);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "read_project_file",
      args: { path: relPath },
      resultText: `读取 ${relPath} (${file.lines} 行)`,
      riskLevel: "LOW",
    });
    return { ...file, codeRoot: root };
  });

  ipcMain.handle("wb-project-code-search", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      return { hits: [], codeRoot: null };
    }
    assertProjectAgentTool("search_project_code");
    const hits = projectCodeService.searchProjectCode(root, payload?.query);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "search_project_code",
      args: { query: payload?.query },
      resultText: `搜索命中 ${hits.length} 处`,
      riskLevel: "LOW",
    });
    return { hits, codeRoot: root };
  });

  ipcMain.handle("wb-project-diff-preview", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const relPath = String(payload?.path || "").trim();
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("preview_diff");
    const file = projectCodeService.readProjectFile(root, relPath);
    const preview = payload?.proposedContent
      ? diffPreviewService.buildPatchPreview({
          filePath: relPath,
          originalContent: file.content,
          proposedContent: payload.proposedContent,
          summary: payload?.summary,
        })
      : diffPreviewService.suggestPatchFromDescription(
          relPath,
          file.content,
          payload?.description || payload?.message || "规划建议"
        );
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "preview_diff",
      args: { filePath: relPath },
      resultText: preview.summary,
      riskLevel: "LOW",
    });
    return preview;
  });

  ipcMain.handle("wb-project-run-test", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("run_tests");
    const result = await testRunnerService.runWhitelistedCommand(root, payload?.command);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "run_tests",
      args: { command: payload?.command },
      resultText: `exit=${result.exitCode} success=${result.success}\n${result.stdout}\n${result.stderr}`,
      riskLevel: result.success ? "LOW" : "MEDIUM",
    });
    return { ...result, codeRoot: root };
  });

  ipcMain.handle("wb-project-tool-ops-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return listToolOperations(
      getUserDataPath,
      payload?.userId,
      projectId,
      payload?.taskId || null,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-test-commands", () => {
    return testRunnerService.WHITELIST_PATTERNS.map((re) => String(re.source));
  });

  ipcMain.handle("wb-project-apply-patch", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return controlledDevService.applyControlledPatch(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        path: payload?.path,
        content: payload?.content,
        userApproved: Boolean(payload?.userApproved),
        createGitBranch: Boolean(payload?.createGitBranch),
        stagedPatchId: payload?.stagedPatchId || null,
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-run-test-fix", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.runTestWithFixSuggestions(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        command: payload?.command,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-git-status", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return controlledDevService.getGitStatusForProject(
      getUserDataPath,
      payload?.userId,
      projectId,
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-git-commit", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.commitWithApproval(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        message: payload?.message,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-backups-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return backupRestoreService.listFileBackups(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-backup-restore", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const backupId = assertSafeId(payload?.backupId, "backupId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    assertProjectAgentTool("restore_file_backup", { userApproved: Boolean(payload?.userApproved) });
    return backupRestoreService.restoreFileFromBackup(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        backupId,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-shell-presets", () => {
    const shellRunnerService = require("./shellRunnerService.js");
    return {
      presets: shellRunnerService.SHELL_PRESETS,
      patterns: [
        ...shellRunnerService.TEST_WHITELIST_PATTERNS.map((re) => String(re.source)),
        ...shellRunnerService.CONTROLLED_SHELL_PATTERNS.map((re) => String(re.source)),
      ],
    };
  });

  ipcMain.handle("wb-project-run-shell", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.runControlledShell(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        command: payload?.command,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
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

  ipcMain.handle("wb-chat-archive", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.archiveChat(getUserDataPath, payload?.userId, chatId);
  });

  ipcMain.handle("wb-chat-delete", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.deleteChat(getUserDataPath, payload?.userId, chatId);
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
