/**
 * BL-022 / AGT-009: Controlled sub-agents (explore / review / analyze_logs / generate_tests).
 * Sub-agents have READ-only tools; parent owns merge + final evidence.
 */
const {
  startAgentRun,
  completeAgentRun,
  failAgentRun,
  appendToolTrace,
  isRunCanceled,
  getRunAbortSignal,
} = require("./agentRunStore.js");
const { listToolSchemas, dispatchTool, normalizeToolName, getToolDef, PERMISSION } = require("./toolRegistry.js");
const { gatewayChatWithTools, PURPOSE } = require("./modelGateway.js");
const { sanitizeUntrustedToolPayload } = require("./instructionContextService.js");
const { runHooks } = require("./toolHookRegistry.js");
const { emitAgentEvent, PHASE, STATUS } = require("./agentEventEmitter.js");
const { buildToolResultMessage, buildAssistantToolCallMessage } = require("../ai/toolCallAdapter.js");

const SUBAGENT_PURPOSES = Object.freeze({
  explore: {
    label: "仓库探索",
    purpose: PURPOSE.PLANNER,
    maxRounds: 4,
    systemHint: "你是只读探索子 Agent。只使用读取类工具，输出结构化发现摘要，不要修改文件。",
  },
  review: {
    label: "代码审查",
    purpose: PURPOSE.REVIEWER,
    maxRounds: 4,
    systemHint: "你是只读审查子 Agent。指出风险与建议，不要 stage_patch 或写入。",
  },
  analyze_logs: {
    label: "日志分析",
    purpose: PURPOSE.DIAGNOSER,
    maxRounds: 3,
    systemHint: "你是日志分析子 Agent。基于可读文件与仓库信息总结错误线索。",
  },
  generate_tests: {
    label: "测试建议",
    purpose: PURPOSE.CODER,
    maxRounds: 3,
    systemHint: "你是测试建议子 Agent。只提出测试计划与用例草稿，不要写入磁盘。",
  },
});

function subAgentEnabled() {
  return String(process.env.WB_AGENT_SUBAGENT || "1") !== "0";
}

const READ_ONLY = new Set([
  "list_files",
  "read_file",
  "search_code",
  "find_symbols",
  "analyze_package",
  "get_repo_profile",
  "get_repo_map",
  "git_status",
  "write_task_memory",
]);

function listSubAgentTools(mode = "PLAN_ONLY") {
  const base = listToolSchemas(mode).filter((t) => READ_ONLY.has(t.function?.name));
  // MCP READ tools are already READ-scoped via gateway; include graphify when present
  try {
    const { listMcpToolSchemas, mcpAgentEnabled } = require("./mcpGatewayService.js");
    if (mcpAgentEnabled()) {
      // schemas need getUserDataPath — caller merges separately
    }
  } catch {
    /* optional */
  }
  return base;
}

function assertSubAgentTool(toolName) {
  const name = normalizeToolName(toolName);
  if (name.startsWith("graphify_")) return name;
  const def = getToolDef(name);
  if (!def || def.permission !== PERMISSION.READ) {
    if (!READ_ONLY.has(name)) {
      const err = new Error(`子 Agent 无越权：禁止 ${name}`);
      err.code = "SUBAGENT_TOOL_FORBIDDEN";
      throw err;
    }
  }
  return name;
}

/**
 * Run a controlled child agent under parentCtx.
 * @returns {{ ok: boolean, runId: string, purpose: string, summary: string, findings: any, toolTrace: any[] }}
 */
async function runSubAgent(parentCtx, { purpose = "explore", message, maxRounds } = {}) {
  if (!subAgentEnabled()) {
    return { ok: false, error: "子 Agent 已禁用 (WB_AGENT_SUBAGENT=0)" };
  }
  const spec = SUBAGENT_PURPOSES[purpose] || SUBAGENT_PURPOSES.explore;
  const rounds = Number(maxRounds) > 0 ? Number(maxRounds) : spec.maxRounds;
  const child = startAgentRun(parentCtx.getUserDataPath, parentCtx.userId, {
    projectId: parentCtx.projectId,
    taskId: parentCtx.taskId,
    mode: "PLAN_ONLY",
    inputText: `[subagent:${purpose}] ${String(message || "").slice(0, 500)}`,
    parentRunId: parentCtx.agentRunId,
    role: "subagent",
    purpose,
    timeoutMs: Number(process.env.WB_SUBAGENT_TIMEOUT_MS || 180000),
  });

  const ctx = {
    ...parentCtx,
    agentRunId: child.runId,
    mode: "PLAN_ONLY",
    subAgent: true,
    subAgentPurpose: purpose,
    parentRunId: parentCtx.agentRunId,
    signal: child.signal,
  };

  emitAgentEvent(parentCtx, {
    phase: PHASE.ANALYZING,
    status: STATUS.running,
    title: `子 Agent · ${spec.label}`,
    summary: String(message || "").slice(0, 120),
    stepKey: `subagent_${purpose}`,
    meta: { childRunId: child.runId, purpose },
  });

  const tools = listSubAgentTools("PLAN_ONLY");
  try {
    const { listMcpToolSchemas } = require("./mcpGatewayService.js");
    const mcp = listMcpToolSchemas(parentCtx.getUserDataPath) || [];
    for (const t of mcp) tools.push(t);
  } catch {
    /* optional */
  }

  const messages = [
    {
      role: "system",
      content: `${spec.systemHint}\n目的: ${purpose}\n父 Run: ${parentCtx.agentRunId}\n完成后给出简洁中文摘要与要点列表。`,
    },
    { role: "user", content: String(message || "请探索当前仓库并汇报关键发现") },
  ];
  const toolTrace = [];

  try {
    for (let round = 0; round < rounds; round += 1) {
      if (isRunCanceled(ctx.agentRunId) || isRunCanceled(parentCtx.agentRunId)) {
        throw Object.assign(new Error("子 Agent 已取消"), { code: "AGENT_CANCELED" });
      }
      const signal = getRunAbortSignal(ctx.agentRunId) || ctx.signal;
      const llmResult = await gatewayChatWithTools({
        messages,
        tools,
        mode: "PLAN_ONLY",
        purpose: spec.purpose,
        signal,
      });
      const toolCalls = llmResult.toolCalls || [];
      if (!toolCalls.length) {
        const summary = String(llmResult.message?.content || "").slice(0, 4000);
        const output = {
          summary,
          purpose,
          parentRunId: parentCtx.agentRunId,
          toolTrace,
          subAgent: true,
        };
        completeAgentRun(ctx.getUserDataPath, ctx.userId, {
          projectId: ctx.projectId,
          taskId: ctx.taskId,
          agentRunId: ctx.agentRunId,
          output,
        });
        await runHooks("agentStop", { ctx, reason: "subagent_complete", output });
        emitAgentEvent(parentCtx, {
          phase: PHASE.ANALYZING,
          status: STATUS.success,
          title: `子 Agent 完成 · ${spec.label}`,
          summary: summary.slice(0, 160),
          stepKey: `subagent_${purpose}_done`,
          meta: { childRunId: child.runId },
        });
        return {
          ok: true,
          runId: child.runId,
          purpose,
          summary,
          findings: output,
          toolTrace,
        };
      }

      messages.push(buildAssistantToolCallMessage(toolCalls));

      for (const tc of toolCalls) {
        let name;
        try {
          name = assertSubAgentTool(tc.name);
        } catch (err) {
          const denied = { ok: false, code: err.code, error: err.message };
          toolTrace.push({ tool: tc.name, result: denied });
          messages.push(buildToolResultMessage(tc.id, tc.name, JSON.stringify(denied)));
          continue;
        }
        const sanitized = sanitizeUntrustedToolPayload(name, tc.arguments || {});
        const result = await dispatchTool(ctx, name, sanitized.args);
        toolTrace.push({ tool: name, args: sanitized.args, result });
        appendToolTrace(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, ctx.agentRunId, {
          tool: name,
          ok: result?.ok !== false,
        });
        messages.push(buildToolResultMessage(tc.id, name, JSON.stringify(result).slice(0, 12000)));
      }
    }

    failAgentRun(ctx.getUserDataPath, ctx.userId, {
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      agentRunId: ctx.agentRunId,
      errorMessage: `子 Agent 超过最大轮次 ${rounds}`,
    });
    return { ok: false, runId: child.runId, purpose, error: `超过最大轮次 ${rounds}`, toolTrace };
  } catch (err) {
    try {
      failAgentRun(ctx.getUserDataPath, ctx.userId, {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        agentRunId: ctx.agentRunId,
        errorMessage: err?.message || "子 Agent 失败",
      });
    } catch {
      /* ignore */
    }
    await runHooks("agentStop", { ctx, reason: "subagent_error", error: err?.message });
    return {
      ok: false,
      runId: child.runId,
      purpose,
      error: err?.message || "子 Agent 失败",
      code: err?.code,
      toolTrace,
    };
  }
}

module.exports = {
  SUBAGENT_PURPOSES,
  subAgentEnabled,
  runSubAgent,
  listSubAgentTools,
  assertSubAgentTool,
  READ_ONLY,
};
