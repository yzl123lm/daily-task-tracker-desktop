/** Renderer copy of task status constants (no Node require). */
const TASK_STATUS = {
  CREATED: "CREATED",
  DRAFT: "DRAFT",
  REQUIREMENT: "REQUIREMENT",
  PLANNING: "PLANNING",
  WAITING_APPROVAL: "WAITING_APPROVAL",
  REVIEWING: "REVIEWING",
  DEVELOPING: "DEVELOPING",
  APPLYING: "APPLYING",
  TESTING: "TESTING",
  FIXING: "FIXING",
  COMPLETED: "COMPLETED",
  DONE: "DONE",
  FAILED: "FAILED",
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
  PLANNING: "方案生成",
  WAITING_APPROVAL: "待确认",
  REVIEWING: "待审阅",
  DEVELOPING: "开发中",
  APPLYING: "写入中",
  TESTING: "测试中",
  FIXING: "修复中",
  COMPLETED: "已完成",
  DONE: "已完成",
  FAILED: "失败",
  PAUSED: "已暂停",
  CANCELED: "已取消",
  ARCHIVED: "已归档",
  RUNNING: "运行中",
};

function normalizeTaskStatus(status) {
  const s = String(status || "").trim().toUpperCase();
  return LEGACY_STATUS_MAP[s] || s || TASK_STATUS.CREATED;
}

function labelForTaskStatus(status) {
  const normalized = normalizeTaskStatus(status);
  return TASK_STATUS_LABELS[normalized] || TASK_STATUS_LABELS[status] || status;
}

function isActiveTaskStatus(status) {
  const s = normalizeTaskStatus(status);
  return [
    TASK_STATUS.CREATED,
    TASK_STATUS.PLANNING,
    TASK_STATUS.WAITING_APPROVAL,
    TASK_STATUS.APPLYING,
    TASK_STATUS.TESTING,
    TASK_STATUS.FIXING,
    TASK_STATUS.RUNNING,
    TASK_STATUS.DEVELOPING,
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
