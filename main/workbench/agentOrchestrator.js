const { getDb, nowIso, newId } = require("./db.js");
const {
  buildTaskNamespace,
  namespacesForProjectScope,
} = require("./namespace.js");
const { getProject, getTask, updateTask } = require("./projectService.js");
const { resolveUserId } = require("./projectService.js");
const compressionManager = require("./context-compression/contextCompressionManager.js");
const { buildPlanOnlyOutput } = require("./planOnlyOutput.js");
const { analyzeProjectCode, resolveProjectRoot } = require("./projectCodeService.js");
const {
  startAgentRun,
  cancelAgentRun,
  completeAgentRun,
  failAgentRun,
  isRunCanceled,
  RUN_STATUS,
} = require("./agentRunStore.js");
const { runProjectAgentLLM, agentLlmEnabled } = require("./projectAgentLLM.js");
const { listStagedPatches, patchToDiffPreview, PATCH_STATUS } = require("./patchStagingService.js");
const { TASK_STATUS } = require("./taskStatus.js");
const { runFixLoop } = require("./fixLoopController.js");

let getDefaultProjectRootFn = null;

function configureAgentOrchestrator(options = {}) {
  if (typeof options.getDefaultProjectRoot === "function") {
    getDefaultProjectRootFn = options.getDefaultProjectRoot;
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
    const { writeMemory } = require("./contextMemoryService.js");
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

function recordLegacyAgentRun(getUserDataPath, userId, fields) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = fields.agentRunId || newId("run");
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

function taskStatusForMode(mode, phase) {
  const m = String(mode).toUpperCase();
  if (phase === "start") {
    if (m === "PLAN_ONLY") {
      return { status: TASK_STATUS.PLANNING, currentStep: "生成开发方案" };
    }
    if (m === "PATCH_PROPOSE") {
      return { status: TASK_STATUS.PLANNING, currentStep: "生成补丁提议" };
    }
    if (m === "VERIFY_FIX") {
      return { status: TASK_STATUS.FIXING, currentStep: "验证失败，生成修复补丁" };
    }
    if (m === "APPLY_APPROVED") {
      return { status: TASK_STATUS.APPLYING, currentStep: "用户已接受，准备写入" };
    }
  }
  if (phase === "done") {
    if (m === "PLAN_ONLY" || m === "PATCH_PROPOSE") {
      return { status: TASK_STATUS.WAITING_APPROVAL, currentStep: "等待用户确认" };
    }
  }
  return null;
}

async function runProjectAgent(getUserDataPath, userId, payload) {
  const uid = resolveUserId(userId);
  const projectId = payload.projectId;
  const taskId = payload.taskId;
  const message = String(payload.message || "");
  const mode = String(payload.mode || "PLAN_ONLY").toUpperCase();

  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  if (mode === "APPLY_APPROVED") {
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: TASK_STATUS.APPLYING,
      currentStep: "用户已接受补丁",
    });
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: TASK_STATUS.TESTING,
      currentStep: "等待验证",
    });
    return {
      agentRunId: null,
      status: RUN_STATUS.COMPLETED,
      mode,
      output: { summary: "已进入测试阶段", needUserConfirm: false },
    };
  }

  const startStatus = taskStatusForMode(mode, "start");
  if (startStatus) {
    updateTask(getUserDataPath, uid, projectId, taskId, startStatus);
  }

  const taskNs = buildTaskNamespace(projectId, taskId);
  const messages = [{ role: "user", content: message }];
  const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
    namespace: taskNs,
    messages,
  });
  const root = resolveProjectRoot(project, getDefaultProjectRootFn);
  const codeAnalysis = analyzeProjectCode(project, message, getDefaultProjectRootFn);

  let agentRunId = null;
  let output;
  let runStatus = RUN_STATUS.COMPLETED;
  try {
    const started = startAgentRun(getUserDataPath, uid, {
      projectId,
      taskId,
      mode,
      inputText: message,
    });
    agentRunId = started.runId;
    const ctx = {
      getUserDataPath,
      userId: uid,
      projectId,
      taskId,
      agentRunId,
      mode,
      root,
      project,
      task,
      promptContext: prepared.promptContext,
    };

    if (mode === "VERIFY_FIX" && payload.fixContext?.scriptName) {
      const fixResult = await runFixLoop(getUserDataPath, uid, ctx, {
        scriptName: payload.fixContext.scriptName,
        getDefaultProjectRoot: getDefaultProjectRootFn,
      });
      output = {
        summary: fixResult.ok ? "验证通过" : fixResult.message || "修复流程结束",
        fixResult,
        toolTrace: [],
        mode,
      };
      runStatus = fixResult.ok ? RUN_STATUS.COMPLETED : RUN_STATUS.WAITING_APPROVAL;
    } else if (agentLlmEnabled() && root) {
      output = await runProjectAgentLLM(ctx, { message, mode });
      runStatus =
        mode === "PATCH_PROPOSE" ? RUN_STATUS.WAITING_APPROVAL : RUN_STATUS.COMPLETED;
    } else {
      output = buildPlanOnlyOutput({
        message,
        project,
        task,
        projectId,
        taskId,
        promptContext: prepared.promptContext,
        codeAnalysis,
      });
      if (mode === "PATCH_PROPOSE") {
        output.diffPreviews = [];
        output.note = "LLM 不可用，PATCH_PROPOSE 需要配置模型";
      }
      completeAgentRun(getUserDataPath, uid, {
        projectId,
        taskId,
        agentRunId,
        output,
        status: runStatus,
      });
    }

    recordTaskMemories(getUserDataPath, uid, output);
    const doneStatus = taskStatusForMode(mode, "done");
    if (doneStatus) {
      updateTask(getUserDataPath, uid, projectId, taskId, doneStatus);
    }
  } catch (err) {
    if (agentRunId) {
      failAgentRun(getUserDataPath, uid, {
        projectId,
        taskId,
        agentRunId,
        errorMessage: err.message,
      });
    }
    if (agentLlmEnabled() && err.code !== "AGENT_RUN_MUTEX") {
      output = buildPlanOnlyOutput({
        message,
        project,
        task,
        projectId,
        taskId,
        promptContext: prepared.promptContext,
        codeAnalysis,
      });
      output.fallbackReason = err.message;
      recordTaskMemories(getUserDataPath, uid, output);
      updateTask(getUserDataPath, uid, projectId, taskId, {
        status: TASK_STATUS.WAITING_APPROVAL,
        currentStep: "规则 Agent 方案（LLM 失败回退）",
      });
      runStatus = RUN_STATUS.COMPLETED;
    } else {
      throw err;
    }
  }

  if (mode === "PATCH_PROPOSE" || mode === "VERIFY_FIX") {
    const patches = listStagedPatches(getUserDataPath, uid, projectId, taskId, {
      status: PATCH_STATUS.STAGED,
    });
    output = output || {};
    output.diffPreviews = patches.map(patchToDiffPreview).filter(Boolean);
  }

  recordLegacyAgentRun(getUserDataPath, uid, {
    agentRunId,
    agentType: "ProjectAgent",
    scopeType: "task",
    projectId,
    taskId,
    inputText: message,
    output,
    status: runStatus,
  });

  return {
    agentRunId,
    status: runStatus,
    mode,
    contextHealth: prepared.contextHealth,
    compressionResult: prepared.compressionResult,
    output,
    namespace: taskNs,
    allowedNamespaces: [...namespacesForProjectScope(projectId, taskId)],
  };
}

function cancelProjectAgent(getUserDataPath, userId, { projectId, taskId, agentRunId }) {
  return cancelAgentRun(getUserDataPath, userId, { projectId, taskId, agentRunId });
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
  const { collectChatMessages } = require("./context-compression/contextMonitor.js");
  const { appendMessage } = require("./chatService.js");
  const { maybeUpdateChatSummary } = require("./chatSummaryService.js");
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
  const agentRunId = recordLegacyAgentRun(getUserDataPath, uid, {
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

function assertChatAgentTool(toolName) {
  const { isDevToolName } = require("./namespace.js");
  if (isDevToolName(toolName)) {
    const err = new Error(`ChatAgent 禁止调用开发工具: ${toolName}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

module.exports = {
  assertChatAgentTool,
  configureAgentOrchestrator,
  runProjectAgent,
  cancelProjectAgent,
  runChatAgent,
};
