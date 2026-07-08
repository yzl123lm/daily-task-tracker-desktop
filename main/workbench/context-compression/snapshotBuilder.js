const { nowIso } = require("../db.js");
const { parseNamespace } = require("../namespace.js");
const { summarizeContent } = require("./compressionPlanner.js");

function extractConstraints(blocks) {
  return blocks
    .filter((b) => b.type === "constraint" || /必须|不要|禁止|务必/.test(b.content || ""))
    .map((b, idx) => ({
      id: `uc_${idx}`,
      text: summarizeContent(b.content, 240),
      source: b.role,
      hard: b.type === "constraint",
    }));
}

function extractErrors(blocks) {
  return blocks
    .filter((b) => b.type === "error")
    .map((b, idx) => ({
      id: `err_${idx}`,
      message: summarizeContent(b.content, 300),
      source: b.id,
    }));
}

function extractDecisions(blocks) {
  return blocks
    .filter((b) => b.type === "decision" || b.role === "assistant")
    .slice(-5)
    .map((b, idx) => ({
      id: `dec_${idx}`,
      summary: summarizeContent(b.content, 200),
      createdAt: nowIso(),
    }));
}

function extractNextActions(blocks, scopeType) {
  const lastUser = [...blocks].reverse().find((b) => b.role === "user");
  const objective = lastUser ? summarizeContent(lastUser.content, 200) : "继续当前任务";
  return [
    {
      id: "na_1",
      text: scopeType === "chat" ? "继续回答用户问题" : "确认方案并推进开发",
      priority: 1,
    },
    {
      id: "na_2",
      text: objective,
      priority: 2,
    },
  ];
}

function buildSnapshot({ namespace, plan, runtimeState, lessonRefs = [] }) {
  const parsed = parseNamespace(namespace);
  const scopeType = parsed.type === "task" ? "task" : parsed.type;
  const blocks = plan?.blocks || [];
  const lastUser = [...blocks].reverse().find((b) => b.role === "user" && b.content);
  const compressedHistory = blocks
    .filter((b) => b.action !== "drop")
    .slice(-12)
    .map((b, idx) => ({
      id: `hist_${idx}`,
      role: b.role,
      summary: summarizeContent(b.plannedContent || b.content, 180),
      action: b.action,
    }));

  const snapshot = {
    meta: {
      revision: null,
      createdAt: nowIso(),
      mode: runtimeState?.mode || "normal",
      reason: runtimeState?.reason || "threshold",
    },
    scope: {
      namespace,
      scopeType,
      projectId: parsed.projectId || undefined,
      taskId: parsed.taskId || undefined,
      chatId: parsed.chatId || undefined,
    },
    currentObjective: {
      text: lastUser ? summarizeContent(lastUser.content, 240) : "未指定目标",
      updatedAt: nowIso(),
    },
    userConstraints: extractConstraints(blocks),
    relevantFiles: scopeType === "chat"
      ? []
      : (runtimeState?.relevantFiles?.length
          ? runtimeState.relevantFiles
          : blocks
              .filter((b) => b.type === "code" && b.content)
              .slice(-5)
              .map((b, idx) => ({
                path: `(inferred-${idx + 1})`,
                summary: summarizeContent(b.content, 120),
              }))),
    codeEntities: [],
    decisions: extractDecisions(blocks),
    changesMade: runtimeState?.changesMade?.length ? runtimeState.changesMade : [],
    testsAndCommands: runtimeState?.testsAndCommands?.length
      ? runtimeState.testsAndCommands.map((item, idx) => ({
          id: `tc_${idx}`,
          summary: summarizeContent(
            `${item.command || ""} ${item.summary || ""}`.trim(),
            160
          ),
          success: item.success,
        }))
      : blocks
          .filter((b) => b.type === "test_result")
          .map((b, idx) => ({ id: `tc_${idx}`, summary: summarizeContent(b.content, 160) })),
    currentErrors: runtimeState?.currentErrors?.length
      ? runtimeState.currentErrors
      : extractErrors(blocks),
    openQuestions: [],
    nextActions: extractNextActions(blocks, scopeType),
    compressedHistory,
    lessonRefs: Array.isArray(lessonRefs)
      ? lessonRefs.map((ref) => ({
          lessonId: ref.lessonId,
          fingerprint: ref.fingerprint,
          status: ref.status,
          ruleText: String(ref.ruleText || "").slice(0, 300),
        }))
      : [],
    riskFlags: [],
  };
  return snapshot;
}

module.exports = {
  buildSnapshot,
};
