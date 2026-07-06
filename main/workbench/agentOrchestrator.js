const { getDb, nowIso, newId } = require("./db.js");
const {
  buildTaskNamespace,
  isDevToolName,
  namespacesForProjectScope,
} = require("./namespace.js");
const { getProject, getTask, updateTask } = require("./projectService.js");
const { appendMessage } = require("./chatService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { resolveUserId } = require("./projectService.js");
const { collectChatMessages } = require("./context-compression/contextMonitor.js");
const compressionManager = require("./context-compression/contextCompressionManager.js");
const { buildPlanOnlyOutput } = require("./planOnlyOutput.js");
const { maybeUpdateChatSummary } = require("./chatSummaryService.js");
const { analyzeProjectCode } = require("./projectCodeService.js");
const {
  assertProjectAgentTool,
  recordToolOperation,
} = require("./toolPermissionService.js");

let getDefaultProjectRootFn = null;

function configureAgentOrchestrator(options = {}) {
  if (typeof options.getDefaultProjectRoot === "function") {
    getDefaultProjectRootFn = options.getDefaultProjectRoot;
  }
}

function assertChatAgentTool(toolName) {
  if (isDevToolName(toolName)) {
    const err = new Error(`ChatAgent 禁止调用开发工具: ${toolName}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

function recordTaskMemories(getUserDataPath, userId, output) {
  const uid = resolveUserId(userId);
  const items = Array.isArray(output?.memoryToRecord) ? output.memoryToRecord : [];
  for (const item of items) {
    if (!item?.namespace || !item?.content) {
      continue;
    }
    const ns = String(item.namespace);
    const scopeType = ns.startsWith("task:")
      ? "task"
      : ns.startsWith("project:")
        ? "project"
        : "chat";
    const scopeId = ns.split(":").pop();
    writeMemory(getUserDataPath, uid, {
      namespace: ns,
      scopeType,
      scopeId,
      memoryType: String(item.type || "note"),
      content: String(item.content),
      source: "ProjectAgent",
      importance: item.type === "development_plan" ? 5 : 4,
    });
  }
}

function recordAgentRun(getUserDataPath, userId, fields) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = newId("run");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO agent_runs (
      id, user_id, agent_type, scope_type, project_id, task_id, chat_id,
      input_text, output_text, status, error_message, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    uid,
    fields.agentType,
    fields.scopeType,
    fields.projectId || null,
    fields.taskId || null,
    fields.chatId || null,
    fields.inputText,
    JSON.stringify(fields.output || {}),
    fields.status || "COMPLETED",
    ts,
    ts
  );
  return id;
}

function runProjectAgent(getUserDataPath, userId, { projectId, taskId, message, mode = "PLAN_ONLY" }) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  if (!task) {
    throw new Error("任务不存在");
  }
  if (String(mode).toUpperCase() !== "PLAN_ONLY") {
    throw new Error("Phase 3 仅支持 PLAN_ONLY 模式");
  }
  const taskNs = buildTaskNamespace(projectId, taskId);
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: "PLANNING",
    currentStep: "生成开发方案",
  });
  const messages = [{ role: "user", content: String(message || "") }];
  const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
    namespace: taskNs,
    messages,
  });
  const codeAnalysis = analyzeProjectCode(project, message, getDefaultProjectRootFn);
  const output = buildPlanOnlyOutput({
    message,
    project,
    task,
    projectId,
    taskId,
    promptContext: prepared.promptContext,
    codeAnalysis,
  });
  recordTaskMemories(getUserDataPath, uid, output);
  updateTask(getUserDataPath, uid, projectId, taskId, {
    status: "REVIEWING",
    currentStep: "等待用户确认方案",
  });
  const agentRunId = recordAgentRun(getUserDataPath, uid, {
    agentType: "ProjectAgent",
    scopeType: "task",
    projectId,
    taskId,
    inputText: String(message || ""),
    output,
    status: "COMPLETED",
  });
  if (codeAnalysis?.codeRoot) {
    assertProjectAgentTool("search_project_code");
    recordToolOperation(getUserDataPath, uid, {
      agentRunId,
      projectId,
      taskId,
      toolName: "search_project_code",
      args: { query: String(message || "").slice(0, 200) },
      resultText: `命中 ${(codeAnalysis.searchHits || []).length} 处，读取 ${(codeAnalysis.relevantFiles || []).length} 个文件`,
      riskLevel: "LOW",
    });
    for (const filePath of (codeAnalysis.relevantFiles || []).slice(0, 3)) {
      assertProjectAgentTool("read_project_file");
      recordToolOperation(getUserDataPath, uid, {
        agentRunId,
        projectId,
        taskId,
        toolName: "read_project_file",
        args: { path: filePath },
        resultText: `只读预览 ${filePath}`,
        riskLevel: "LOW",
      });
    }
    for (const preview of output.diffPreviews || []) {
      assertProjectAgentTool("preview_diff");
      recordToolOperation(getUserDataPath, uid, {
        agentRunId,
        projectId,
        taskId,
        toolName: "preview_diff",
        args: { filePath: preview.filePath },
        resultText: preview.summary,
        riskLevel: "LOW",
      });
    }
  }
  return {
    agentRunId,
    status: "COMPLETED",
    contextHealth: prepared.contextHealth,
    compressionResult: prepared.compressionResult,
    output,
    namespace: taskNs,
    allowedNamespaces: [...namespacesForProjectScope(projectId, taskId)],
  };
}

function buildChatAgentOutput(message, promptContext) {
  const text = String(message || "").trim();
  const ctxHint = promptContext?.sections?.hasSnapshot
    ? "已加载会话压缩快照与记忆。"
    : "当前会话上下文充足。";
  return {
    summary: "会话区问答回复（ChatAgent，无开发工具权限）。",
    answer: `收到您的问题：「${text.slice(0, 200)}」。\n\n${ctxHint}\n\n这是会话区的普通问答通道，我不会读取项目文件或执行开发操作。如需完整 AI 能力，请继续使用下方 AI 对话区；如需项目开发，请在左侧选择项目并创建任务。`,
    mode: "QA_ONLY",
  };
}

function runChatAgent(getUserDataPath, userId, { chatId, message, toolName }) {
  if (toolName) {
    assertChatAgentTool(toolName);
  }
  const uid = resolveUserId(userId);
  const chatNs = `chat:${chatId}`;
  const history = collectChatMessages(getUserDataPath, uid, chatId);
  const userMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "user",
    content: String(message || ""),
  });
  const messages = [...history, { role: "user", content: String(message || "") }];
  const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
    namespace: chatNs,
    messages,
  });
  const output = buildChatAgentOutput(message, prepared.promptContext);
  const assistantMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "assistant",
    content: output.answer,
  });
  const summaryResult = maybeUpdateChatSummary(getUserDataPath, uid, chatId);
  const agentRunId = recordAgentRun(getUserDataPath, uid, {
    agentType: "ChatAgent",
    scopeType: "chat",
    chatId,
    inputText: String(message || ""),
    output: { ...output, summaryUpdate: summaryResult },
    status: "COMPLETED",
  });
  return {
    agentRunId,
    status: "COMPLETED",
    contextHealth: prepared.contextHealth,
    compressionResult: prepared.compressionResult,
    output,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    namespace: chatNs,
    memoryUpdated: Boolean(summaryResult?.updated),
    summaryUpdate: summaryResult,
  };
}

module.exports = {
  assertChatAgentTool,
  configureAgentOrchestrator,
  runProjectAgent,
  runChatAgent,
};
