/** Unified task status constants (main process). */
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
  [TASK_STATUS.CREATED]: "已创建",
  [TASK_STATUS.DRAFT]: "草稿",
  [TASK_STATUS.REQUIREMENT]: "需求确认",
  [TASK_STATUS.PLANNING]: "方案生成",
  [TASK_STATUS.WAITING_APPROVAL]: "等待写入审批",
  [TASK_STATUS.REVIEWING]: "变更待审阅",
  [TASK_STATUS.DEVELOPING]: "开发中",
  [TASK_STATUS.APPLYING]: "写入中",
  [TASK_STATUS.TESTING]: "测试中",
  [TASK_STATUS.FIXING]: "修复中",
  [TASK_STATUS.COMPLETED]: "已完成",
  [TASK_STATUS.DONE]: "已完成",
  [TASK_STATUS.FAILED]: "失败",
  [TASK_STATUS.PARTIAL_FAILED]: "部分失败",
  [TASK_STATUS.PAUSED]: "已暂停",
  [TASK_STATUS.CANCELED]: "已取消",
  [TASK_STATUS.ARCHIVED]: "已归档",
  [TASK_STATUS.RUNNING]: "运行中",
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

module.exports = {
  TASK_STATUS,
  LEGACY_STATUS_MAP,
  TASK_STATUS_LABELS,
  normalizeTaskStatus,
  labelForTaskStatus,
  isActiveTaskStatus,
};
