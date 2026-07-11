const { getDb, nowIso } = require("./db.js");
const { resolveUserId } = require("./projectService.js");
const { analyzeRequirement, taskSpecEnabled } = require("./clarificationPolicy.js");

const SPEC_STATUS = {
  DRAFT: "DRAFT",
  CLARIFYING: "CLARIFYING",
  PENDING_REVIEW: "PENDING_REVIEW",
  APPROVED: "APPROVED",
  SUPERSEDED: "SUPERSEDED",
};

function criterionId(i) {
  return `ac_${i + 1}`;
}

function buildAcceptanceFromMessage(message, plan = []) {
  const text = String(message || "").trim();
  const criteria = [];
  criteria.push({
    id: criterionId(0),
    storyId: "story_1",
    type: "functional",
    must: true,
    method: "manual_or_verify",
    description: `核心需求可演示：${text.slice(0, 120) || "用户描述的功能"}`,
    evidenceRequired: ["verification_run_or_manual_note"],
    status: "NOT_RUN",
  });
  if (plan.length) {
    criteria.push({
      id: criterionId(1),
      storyId: "story_1",
      type: "implementation",
      must: true,
      method: "auto_verify",
      description: "相关构建/测试 profile 通过（若项目提供脚本）",
      evidenceRequired: ["verification_run"],
      status: "NOT_RUN",
    });
  }
  criteria.push({
    id: criterionId(2),
    storyId: "story_1",
    type: "quality",
    must: true,
    method: "heuristic",
    description: "关键入口无未完成 TODO/FIXME/空实现占位",
    evidenceRequired: ["completion_heuristics"],
    status: "NOT_RUN",
  });
  return criteria;
}

function buildStories(message) {
  const goal = String(message || "").trim().slice(0, 200) || "未命名目标";
  return [
    {
      id: "story_1",
      title: goal.slice(0, 80),
      asA: "用户",
      want: goal,
      soThat: "完成所述开发目标",
      mvp: true,
    },
  ];
}

function buildNfr(message) {
  const text = String(message || "");
  return [
    {
      id: "nfr_security",
      category: "security",
      text: "写盘与危险命令须人工审批；不外传密钥",
      applicable: true,
    },
    {
      id: "nfr_maintain",
      category: "maintainability",
      text: "变更可审阅、可回滚（备份）",
      applicable: true,
    },
    {
      id: "nfr_perf",
      category: "performance",
      text: /性能|并发|高可用/i.test(text)
        ? "需满足用户提及的性能约束"
        : "本轮不适用严格性能指标（MVP）",
      applicable: /性能|并发|高可用/i.test(text),
      reasonIfN_A: "需求未提出性能指标",
    },
  ];
}

function createDraftSpec({ message, project, task, plan = [], answers = {} }) {
  const analysis = analyzeRequirement(message, { project });
  const answeredIds = new Set(Object.keys(answers || {}));
  const openQuestions = analysis.questions.filter((q) => !answeredIds.has(q.id));
  const resolvedAssumptions = analysis.assumptions.map((a) => ({
    ...a,
    status: answeredIds.has(a.id.replace(/^assume_/, "")) ? "confirmed" : a.status,
  }));
  for (const [qid, answer] of Object.entries(answers || {})) {
    resolvedAssumptions.push({
      id: `answer_${qid}`,
      text: String(answer),
      source: "user",
      risk: "low",
      status: "confirmed",
    });
  }
  const blockingOpen = openQuestions.filter((q) => q.blocking);
  const status =
    blockingOpen.length > 0 ? SPEC_STATUS.CLARIFYING : SPEC_STATUS.PENDING_REVIEW;
  return {
    specId: `spec_${Date.now().toString(36)}`,
    version: 1,
    status,
    goal: String(message || task?.title || "").trim().slice(0, 500),
    workspace: {
      projectId: project?.id || null,
      localPath: project?.localPath || null,
      techStack: project?.techStack || [],
    },
    scope: {
      inScope: [String(message || "").trim().slice(0, 300)],
      outOfScope: ["生产自动发布", "无人值守写盘", "任意网络访问"],
    },
    constraints: [],
    nonGoals: ["L5 无人值守", "取消写盘审批"],
    assumptions: resolvedAssumptions,
    openQuestions,
    conflicts: analysis.conflicts,
    stories: buildStories(message),
    nfr: buildNfr(message),
    acceptanceCriteria: buildAcceptanceFromMessage(message, plan),
    environment: {
      prerequisites: [],
    },
    approvedAt: null,
    approvedBy: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    executionReady: status === SPEC_STATUS.PENDING_REVIEW || status === SPEC_STATUS.APPROVED,
  };
}

function getTaskSpec(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT task_spec_json FROM project_tasks
       WHERE id = ? AND project_id = ? AND user_id = ?`
    )
    .get(taskId, projectId, uid);
  if (!row?.task_spec_json) return null;
  try {
    return JSON.parse(row.task_spec_json);
  } catch {
    return null;
  }
}

function saveTaskSpec(getUserDataPath, userId, projectId, taskId, spec) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  const payload = { ...spec, updatedAt: ts };
  db.prepare(
    `UPDATE project_tasks SET task_spec_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify(payload), ts, taskId, projectId, uid);
  return payload;
}

function confirmTaskSpec(getUserDataPath, userId, projectId, taskId, { answers = {}, approver = "user" } = {}) {
  const existing = getTaskSpec(getUserDataPath, userId, projectId, taskId);
  if (!existing) {
    const err = new Error("任务规格不存在");
    err.code = "SPEC_NOT_FOUND";
    throw err;
  }
  const nextAnswers = { ...(existing.userAnswers || {}), ...answers };
  const mergedQuestions = (existing.openQuestions || []).filter((q) => !nextAnswers[q.id]);
  const next = {
    ...existing,
    version: Number(existing.version || 1) + (existing.status === SPEC_STATUS.APPROVED ? 1 : 0),
    openQuestions: mergedQuestions,
    userAnswers: nextAnswers,
    assumptions: [
      ...(existing.assumptions || []),
      ...Object.entries(answers).map(([id, text]) => ({
        id: `answer_${id}`,
        text: String(text),
        source: "user",
        risk: "low",
        status: "confirmed",
      })),
    ],
    status: mergedQuestions.some((q) => q.blocking) ? SPEC_STATUS.CLARIFYING : SPEC_STATUS.APPROVED,
    approvedAt: mergedQuestions.some((q) => q.blocking) ? null : nowIso(),
    approvedBy: mergedQuestions.some((q) => q.blocking) ? null : approver,
    executionReady: !mergedQuestions.some((q) => q.blocking),
    updatedAt: nowIso(),
  };
  if (next.status === SPEC_STATUS.APPROVED && existing.status === SPEC_STATUS.APPROVED) {
    // new immutable version marker
    next.specId = `${existing.specId}_v${next.version}`;
  }
  return saveTaskSpec(getUserDataPath, userId, projectId, taskId, next);
}

function assertSpecAllowsPatch(spec) {
  if (!taskSpecEnabled()) return { ok: true };
  if (!spec) {
    return { ok: false, code: "SPEC_REQUIRED", message: "缺少 TaskSpec，请先完成规划与规格确认" };
  }
  if (spec.status === SPEC_STATUS.CLARIFYING || (spec.openQuestions || []).some((q) => q.blocking)) {
    return {
      ok: false,
      code: "SPEC_CLARIFYING",
      message: "存在未回答的阻塞澄清问题，不得进入可执行补丁阶段",
      openQuestions: spec.openQuestions,
    };
  }
  if (spec.status !== SPEC_STATUS.APPROVED && spec.status !== SPEC_STATUS.PENDING_REVIEW) {
    return { ok: false, code: "SPEC_NOT_READY", message: `规格状态不可执行: ${spec.status}` };
  }
  const must = (spec.acceptanceCriteria || []).filter((c) => c.must);
  if (!must.length) {
    return { ok: false, code: "SPEC_NO_ACCEPTANCE", message: "缺少 Must 验收项" };
  }
  return { ok: true };
}

function updateAcceptanceStatus(spec, criterionId, status, evidence = null) {
  const criteria = (spec.acceptanceCriteria || []).map((c) => {
    if (c.id !== criterionId) return c;
    return {
      ...c,
      status,
      evidence,
      updatedAt: nowIso(),
    };
  });
  return { ...spec, acceptanceCriteria: criteria, updatedAt: nowIso() };
}

module.exports = {
  SPEC_STATUS,
  taskSpecEnabled,
  createDraftSpec,
  getTaskSpec,
  saveTaskSpec,
  confirmTaskSpec,
  assertSpecAllowsPatch,
  updateAcceptanceStatus,
  buildAcceptanceFromMessage,
};
