const { llmChatWithTools } = require("./llmClient.js");
const { stripModelThinking, sanitizeAgentOutputForUi } = require("../../utils/wbModelOutputSanitizer.js");
const { listToolSchemas, dispatchTool } = require("./toolRegistry.js");
const { buildContextPackAsync } = require("./contextPackBuilder.js");
const {
  appendToolTrace,
  completeAgentRun,
  failAgentRun,
  isRunCanceled,
  getRunAbortSignal,
} = require("./agentRunStore.js");
const { listStagedPatches, patchToDiffPreview } = require("./patchStagingService.js");
const { buildToolResultMessage, buildAssistantToolCallMessage } = require("../ai/toolCallAdapter.js");
const {
  emitAgentEvent,
  PHASE,
  STATUS,
  TOOL_PHASE_MAP,
  TOOL_TITLE_MAP,
  summarizeToolInput,
  summarizeToolOutput,
} = require("./agentEventEmitter.js");

const MAX_TOOL_ROUNDS = 12;

function agentLlmEnabled() {
  return String(process.env.WB_AGENT_LLM || "1") !== "0";
}

function buildSystemPrompt(mode, contextPack) {
  const base = `你是 Workbench 项目开发 Agent。当前模式: ${mode}。
- READ 工具可主动探索代码库。
- 禁止直接写入磁盘；补丁须通过 stage_patch 提议。
- 空项目目录是正常场景，可为新项目创建文件（如 index.html、style.css、game.js）。
- 非 Git 仓库时说明将使用备份保护，不要因此拒绝生成方案或补丁。
- 不要在输出中包含 <think>、内部推理或工具权限抱怨。
- 输出使用中文，结构清晰，面向用户展示。
- 若上下文包含 prevention_rules / 已知错误规避规则，生成方案与补丁前必须遵守。`;
  const prevention = (contextPack?.sections || []).find((s) => s.type === "prevention_rules");
  const otherSections = (contextPack?.sections || []).filter((s) => s.type !== "prevention_rules");
  const preventionBlock = prevention?.content
    ? `\n\n# 已知错误规避规则\n${prevention.content}\n`
    : "";
  const ctx = otherSections.map((s) => `## ${s.type}\n${s.content}`).join("\n\n");
  return `${base}${preventionBlock}\n\n# 项目上下文\n${ctx || "（无额外上下文）"}`;
}

function parsePlanFromContent(content) {
  const text = stripModelThinking(content);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const plan = [];
  let section = null;
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      section = line.replace(/^#{1,3}\s*/, "").trim();
      continue;
    }
    if (/^[-*\d.]+\s/.test(line) && (section?.includes("步骤") || section?.includes("计划") || section?.includes("方案") || !section)) {
      plan.push(line.replace(/^[-*\d.]+\s*/, "").trim());
    }
  }
  if (!plan.length && text) {
    plan.push(...lines.slice(0, 8).map((l) => l.replace(/^[-*\d.]+\s*/, "").trim()));
  }
  const headline = lines.find((l) => !/^[-*#]/.test(l)) || lines[0] || "开发方案";
  return {
    summary: stripModelThinking(lines[0]?.slice(0, 120) || "Agent 方案"),
    requirementUnderstanding: stripModelThinking(headline).slice(0, 500),
    plan: plan.slice(0, 12),
    affectedFiles: [],
    risks: ["写入前会展示 Diff 并等待你确认"],
    testPlan: ["确认方案后点击「生成代码变更」，审阅 Diff 后再写入"],
    needUserConfirm: true,
    nextAction: "生成代码变更",
    answer: text,
  };
}

function toolStepKey(toolName) {
  const map = {
    list_files: "analyze_structure",
    search_code: "search_files",
    read_file: "read_code",
    get_symbols: "read_code",
    stage_patch: "generate_patch",
  };
  return map[toolName] || TOOL_PHASE_MAP[toolName] || toolName;
}

async function runProjectAgentLLM(ctx, { message, mode = "PLAN_ONLY" }) {
  if (!agentLlmEnabled()) {
    const err = new Error("WB_AGENT_LLM=0");
    err.code = "LLM_DISABLED";
    throw err;
  }
  emitAgentEvent(ctx, {
    phase: PHASE.SCANNING,
    status: STATUS.running,
    title: "扫描项目结构",
    summary: "正在准备项目上下文",
    stepKey: "analyze_structure",
  });
  const contextPack = await buildContextPackAsync({
    root: ctx.root,
    message,
    promptContext: ctx.promptContext,
    appRoot: ctx.appRoot,
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    userId: ctx.userId,
    getUserDataPath: ctx.getUserDataPath,
  });
  emitAgentEvent(ctx, {
    phase: PHASE.SCANNING,
    status: STATUS.success,
    title: "扫描项目结构",
    summary: "项目上下文已就绪",
    stepKey: "analyze_structure",
  });

  const tools = listToolSchemas(mode);
  const messages = [
    { role: "system", content: buildSystemPrompt(mode, contextPack) },
    { role: "user", content: String(message || "") },
  ];
  const toolTrace = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (isRunCanceled(ctx.agentRunId)) {
      emitAgentEvent(ctx, {
        phase: PHASE.CANCELED,
        status: STATUS.canceled,
        title: "已取消",
        summary: "用户停止了任务",
        stepKey: "canceled",
      });
      const err = new Error("Agent 运行已取消");
      err.code = "AGENT_CANCELED";
      throw err;
    }
    const signal = getRunAbortSignal(ctx.agentRunId) || ctx.signal;
    let assistantMsg;
    let toolCalls;
    try {
      ({ message: assistantMsg, toolCalls } = await llmChatWithTools({
        messages,
        tools,
        mode,
        signal,
      }));
    } catch (llmErr) {
      if (isRunCanceled(ctx.agentRunId) || llmErr?.name === "AbortError" || signal?.aborted) {
        emitAgentEvent(ctx, {
          phase: PHASE.CANCELED,
          status: STATUS.canceled,
          title: "已取消",
          summary: "LLM 请求已中断",
          stepKey: "canceled",
        });
        const err = new Error("Agent 运行已取消");
        err.code = "AGENT_CANCELED";
        err.wasLLMAborted = true;
        throw err;
      }
      throw llmErr;
    }
    if (isRunCanceled(ctx.agentRunId)) {
      const err = new Error("Agent 运行已取消");
      err.code = "AGENT_CANCELED";
      throw err;
    }
    if (!toolCalls.length) {
      let output =
        mode === "PLAN_ONLY"
          ? parsePlanFromContent(assistantMsg.content)
          : {
              summary: "Agent 完成",
              answer: stripModelThinking(assistantMsg.content),
              needUserConfirm: true,
            };
      output = sanitizeAgentOutputForUi(output);
      if (mode === "PATCH_PROPOSE" || mode === "VERIFY_FIX") {
        const patches = listStagedPatches(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId);
        output.diffPreviews = patches.map(patchToDiffPreview).filter(Boolean);
        output.stagedPatchIds = patches.map((p) => p.id);
      }
      output.toolTrace = toolTrace;
      output.mode = mode;
      // Mark COMPLETED so task mutex is released; user review is tracked on the task status.
      completeAgentRun(ctx.getUserDataPath, ctx.userId, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        agentRunId: ctx.agentRunId,
        output,
        status: "COMPLETED",
      });
      return output;
    }

    messages.push(buildAssistantToolCallMessage(toolCalls));
    for (const tc of toolCalls) {
      const toolName = tc.name;
      const phase = TOOL_PHASE_MAP[toolName] || PHASE.ANALYZING;
      const title = TOOL_TITLE_MAP[toolName] || `调用 ${toolName}`;
      const inputSummary = summarizeToolInput(toolName, tc.arguments);
      const startedAt = Date.now();
      emitAgentEvent(ctx, {
        phase,
        status: STATUS.running,
        title,
        summary: inputSummary || "工具执行中",
        toolName,
        toolInputSummary: inputSummary,
        stepKey: toolStepKey(toolName),
        startedAt,
      });
      const result = await dispatchTool(ctx, tc.name, tc.arguments);
      const outputSummary = summarizeToolOutput(toolName, result);
      const ok = result?.ok !== false;
      toolTrace.push({ tool: tc.name, args: tc.arguments, result, source: tc.source });
      appendToolTrace(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, ctx.agentRunId, {
        tool: tc.name,
        args: tc.arguments,
        ok,
      });
      emitAgentEvent(ctx, {
        phase,
        status: ok ? STATUS.success : STATUS.failed,
        title,
        summary: outputSummary || (ok ? "完成" : "失败"),
        toolName,
        toolInputSummary: inputSummary,
        toolOutputSummary: outputSummary,
        stepKey: toolStepKey(toolName),
        startedAt,
        endedAt: Date.now(),
        error: ok ? null : result?.error || "工具执行失败",
      });
      messages.push(buildToolResultMessage(tc.id, tc.name, JSON.stringify(result)));
    }
  }

  failAgentRun(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    agentRunId: ctx.agentRunId,
    errorMessage: `超过最大工具轮次 ${MAX_TOOL_ROUNDS}`,
  });
  emitAgentEvent(ctx, {
    phase: PHASE.FAILED,
    status: STATUS.failed,
    title: "执行失败",
    summary: `超过最大工具轮次 ${MAX_TOOL_ROUNDS}`,
    stepKey: "failed",
    error: `超过最大工具轮次 ${MAX_TOOL_ROUNDS}`,
  });
  throw new Error(`Agent 超过最大工具轮次 ${MAX_TOOL_ROUNDS}`);
}

module.exports = {
  MAX_TOOL_ROUNDS,
  agentLlmEnabled,
  buildSystemPrompt,
  runProjectAgentLLM,
  parsePlanFromContent,
};
