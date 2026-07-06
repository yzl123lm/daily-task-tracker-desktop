const { getDb, nowIso, newId } = require("./db.js");
const {
  buildTaskNamespace,
  isDevToolName,
  namespacesForProjectScope,
} = require("./namespace.js");
const { getProject, getTask } = require("./projectService.js");
const { appendMessage } = require("./chatService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { resolveUserId } = require("./projectService.js");

function assertChatAgentTool(toolName) {
  if (isDevToolName(toolName)) {
    const err = new Error(`ChatAgent 禁止调用开发工具: ${toolName}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

function buildPlanOnlyOutput(message, project, task) {
  const req = String(message || "").trim();
  const lines = req
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const headline = lines[0] || "未指定需求";
  return {
    summary: "已生成开发方案，尚未修改文件（PLAN_ONLY）。",
    requirementUnderstanding: headline,
    plan: [
      "梳理需求与现有工作台结构",
      "设计 UI 组件与状态切换（项目/会话互斥）",
      "实现 IPC 与 namespace 隔离校验",
      "补充单元测试与集成验证",
      "等待用户确认后再进入开发阶段",
    ],
    affectedFiles: [
      "app/workbench/projectArea.js",
      "app/workbench/projectWorkspace.js",
      "main/workbench/registerHandlers.js",
      "index.html",
    ],
    risks: ["需确认与现有 AI 会话 UI 的集成边界"],
    testPlan: ["项目 CRUD 测试", "namespace 403 测试", "项目/会话互斥测试"],
    needUserConfirm: true,
    mode: "PLAN_ONLY",
    projectName: project.name,
    taskTitle: task.title,
  };
}

function buildChatAgentOutput(message) {
  const text = String(message || "").trim();
  return {
    summary: "会话区问答回复（ChatAgent，无开发工具权限）。",
    answer: `收到您的问题：「${text.slice(0, 200)}」。\n\n这是会话区的普通问答通道，我不会读取项目文件或执行开发操作。如需完整 AI 能力，请继续使用下方 AI 对话区；如需项目开发，请在左侧选择项目并创建任务。`,
    mode: "QA_ONLY",
  };
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
    throw new Error("Phase 1 仅支持 PLAN_ONLY 模式");
  }
  const output = buildPlanOnlyOutput(message, project, task);
  const taskNs = buildTaskNamespace(projectId, taskId);
  writeMemory(getUserDataPath, uid, {
    namespace: taskNs,
    scopeType: "task",
    scopeId: taskId,
    memoryType: "development_plan",
    content: output.summary,
    source: "ProjectAgent",
    importance: 5,
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
  return {
    agentRunId,
    status: "COMPLETED",
    contextHealth: { usedRatio: 0.2, compressionAction: "none" },
    output,
    namespace: taskNs,
    allowedNamespaces: [...namespacesForProjectScope(projectId, taskId)],
  };
}

function runChatAgent(getUserDataPath, userId, { chatId, message, toolName }) {
  if (toolName) {
    assertChatAgentTool(toolName);
  }
  const uid = resolveUserId(userId);
  const userMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "user",
    content: String(message || ""),
  });
  const output = buildChatAgentOutput(message);
  const assistantMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "assistant",
    content: output.answer,
  });
  const agentRunId = recordAgentRun(getUserDataPath, uid, {
    agentType: "ChatAgent",
    scopeType: "chat",
    chatId,
    inputText: String(message || ""),
    output,
    status: "COMPLETED",
  });
  return {
    agentRunId,
    status: "COMPLETED",
    output,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    namespace: `chat:${chatId}`,
  };
}

module.exports = {
  assertChatAgentTool,
  runProjectAgent,
  runChatAgent,
};
