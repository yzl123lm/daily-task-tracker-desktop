/** Renderer copy of task status constants (no Node require). */
const TASK_STATUS = {
  CREATED: "CREATED",
  DRAFT: "DRAFT",
  REQUIREMENT: "REQUIREMENT",
  CLARIFYING: "CLARIFYING",
  SPEC_REVIEW: "SPEC_REVIEW",
  PLANNING: "PLANNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  REVIEWING: "REVIEWING",
  DEVELOPING: "DEVELOPING",
  APPLYING: "APPLYING",
  TESTING: "TESTING",
  FIXING: "FIXING",
  BLOCKED: "BLOCKED",
  COMPLETED: "COMPLETED",
  DONE: "DONE",
  FAILED: "FAILED",
  PARTIAL_FAILED: "PARTIAL_FAILED",
  PAUSED: "PAUSED",
  CANCELED: "CANCELED",
  ARCHIVED: "ARCHIVED",
  RUNNING: "RUNNING",
};

const LEGACY_STATUS_MAP = {
  DRAFT: TASK_STATUS.CREATED,
  REVIEWING: TASK_STATUS.WAITING_APPROVAL,
  DEVELOPING: TASK_STATUS.APPLYING,
  DONE: TASK_STATUS.COMPLETED,
  WAIT_CONFIRM: TASK_STATUS.WAITING_APPROVAL,
};

const TASK_STATUS_LABELS = {
  CREATED: "已创建",
  DRAFT: "草稿",
  REQUIREMENT: "需求确认",
  CLARIFYING: "需求澄清中",
  SPEC_REVIEW: "规格待确认",
  PLANNING: "方案生成",
  WAITING_APPROVAL: "变更待审阅",
  REVIEWING: "变更待审阅",
  DEVELOPING: "开发中",
  APPLYING: "写入中",
  TESTING: "测试中",
  FIXING: "修复中",
  BLOCKED: "已阻塞",
  COMPLETED: "已完成",
  DONE: "已完成",
  FAILED: "失败",
  PARTIAL_FAILED: "部分失败",
  PAUSED: "已暂停",
  CANCELED: "已取消",
  ARCHIVED: "已归档",
  RUNNING: "运行中",
};

function normalizeTaskStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return LEGACY_STATUS_MAP[s] || s || TASK_STATUS.CREATED;
}

/**
 * Prefer currentStep when it clarifies WAITING_APPROVAL (Diff 审阅 vs 写入审批).
 */
function labelForTaskStatus(status, currentStep = "") {
  const normalized = normalizeTaskStatus(status);
  const step = String(currentStep || "");
  if (normalized === TASK_STATUS.WAITING_APPROVAL) {
    if (step.includes("写入") || step.includes("已接受")) {
      return "等待写入";
    }
    if (step.includes("变更待审阅") || step.includes("审阅") || !step) {
      return "变更待审阅";
    }
  }
  if (normalized === TASK_STATUS.PLANNING) {
    if (step.includes("方案待确认")) {
      return "方案待确认";
    }
    if (step.includes("未生成变更")) {
      return "未生成变更";
    }
  }
  return TASK_STATUS_LABELS[normalized] || TASK_STATUS_LABELS[status] || status;
}

function isActiveTaskStatus(status) {
  const s = normalizeTaskStatus(status);
  return [
    TASK_STATUS.CREATED,
    TASK_STATUS.CLARIFYING,
    TASK_STATUS.SPEC_REVIEW,
    TASK_STATUS.PLANNING,
    TASK_STATUS.WAITING_APPROVAL,
    TASK_STATUS.APPLYING,
    TASK_STATUS.TESTING,
    TASK_STATUS.FIXING,
    TASK_STATUS.RUNNING,
    TASK_STATUS.DEVELOPING,
    TASK_STATUS.BLOCKED,
  ].includes(s);
}

window.__wbTaskStatus = {
  TASK_STATUS,
  LEGACY_STATUS_MAP,
  TASK_STATUS_LABELS,
  normalizeTaskStatus,
  labelForTaskStatus,
  isActiveTaskStatus,
};
