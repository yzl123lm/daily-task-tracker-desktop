const { llmChatWithTools } = require("./llmClient.js");
const { listToolSchemas, dispatchTool } = require("./toolRegistry.js");
const { buildContextPackAsync } = require("./contextPackBuilder.js");
const {
  appendToolTrace,
  completeAgentRun,
  failAgentRun,
  isRunCanceled,
} = require("./agentRunStore.js");
const { listStagedPatches, patchToDiffPreview } = require("./patchStagingService.js");
const { buildToolResultMessage, buildAssistantToolCallMessage } = require("../ai/toolCallAdapter.js");

const MAX_TOOL_ROUNDS = 12;

function agentLlmEnabled() {
  return String(process.env.WB_AGENT_LLM || "1") !== "0";
}

function buildSystemPrompt(mode, contextPack) {
  const base = `你是 Workbench 项目开发 Agent。当前模式: ${mode}。
- READ 工具可主动探索代码库。
- 禁止直接写入磁盘；补丁须通过 stage_patch 提议。
- 输出使用中文，结构清晰。`;
  const ctx = contextPack?.sections
    ?.map((s) => `## ${s.type}\n${s.content}`)
    .join("\n\n");
  return `${base}\n\n# 项目上下文\n${ctx || "（无额外上下文）"}`;
}

function parsePlanFromContent(content) {
  const text = String(content || "").trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const plan = [];
  let section = null;
  for (const line of lines) {
    if (/^#{1,3}\s/.test(line)) {
      section = line.replace(/^#{1,3}\s*/, "").trim();
      continue;
    }
    if (/^[-*\d.]+\s/.test(line) && (section?.includes("步骤") || section?.includes("计划") || !section)) {
      plan.push(line.replace(/^[-*\d.]+\s*/, "").trim());
    }
  }
  if (!plan.length && text) {
    plan.push(...lines.slice(0, 8));
  }
  return {
    summary: lines[0]?.slice(0, 120) || "Agent 方案",
    requirementUnderstanding: text.slice(0, 500),
    plan: plan.slice(0, 12),
    affectedFiles: [],
    risks: ["需用户审阅后才会写入"],
    testPlan: ["用户确认后运行项目测试脚本"],
    needUserConfirm: true,
    answer: text,
  };
}

async function runProjectAgentLLM(ctx, { message, mode = "PLAN_ONLY" }) {
  if (!agentLlmEnabled()) {
    const err = new Error("WB_AGENT_LLM=0");
    err.code = "LLM_DISABLED";
    throw err;
  }
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
  const tools = listToolSchemas(mode);
  const messages = [
    { role: "system", content: buildSystemPrompt(mode, contextPack) },
    { role: "user", content: String(message || "") },
  ];
  const toolTrace = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    if (isRunCanceled(ctx.agentRunId)) {
      throw new Error("Agent 运行已取消");
    }
    const { message: assistantMsg, toolCalls } = await llmChatWithTools({
      messages,
      tools,
      mode,
    });
    if (!toolCalls.length) {
      const output =
        mode === "PLAN_ONLY"
          ? parsePlanFromContent(assistantMsg.content)
          : {
              summary: "Agent 完成",
              answer: assistantMsg.content,
              needUserConfirm: true,
            };
      if (mode === "PATCH_PROPOSE" || mode === "VERIFY_FIX") {
        const patches = listStagedPatches(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId);
        output.diffPreviews = patches.map(patchToDiffPreview).filter(Boolean);
        output.stagedPatchIds = patches.map((p) => p.id);
      }
      output.toolTrace = toolTrace;
      output.mode = mode;
      completeAgentRun(ctx.getUserDataPath, ctx.userId, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        agentRunId: ctx.agentRunId,
        output,
        status: mode === "PATCH_PROPOSE" ? "WAITING_APPROVAL" : "COMPLETED",
      });
      return output;
    }

    messages.push(buildAssistantToolCallMessage(toolCalls));
    for (const tc of toolCalls) {
      const result = await dispatchTool(ctx, tc.name, tc.arguments);
      toolTrace.push({ tool: tc.name, args: tc.arguments, result, source: tc.source });
      appendToolTrace(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, ctx.agentRunId, {
        tool: tc.name,
        args: tc.arguments,
        ok: result?.ok !== false,
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
  throw new Error(`Agent 超过最大工具轮次 ${MAX_TOOL_ROUNDS}`);
}

module.exports = {
  MAX_TOOL_ROUNDS,
  agentLlmEnabled,
  runProjectAgentLLM,
  parsePlanFromContent,
};
