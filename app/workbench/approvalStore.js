const WB_APPROVAL_EVENT = "wb:approval-change";

const RISK_LABELS = {
  LOW: "低风险",
  MEDIUM: "中风险",
  HIGH: "高风险",
};

const ACTION_LABELS = {
  write_file: "写入文件",
  write_batch: "批量写入",
  shell: "受控 Shell",
  git_commit: "Git Commit",
  run_test: "运行测试",
  diff_review: "Diff 审阅通过",
};

let pending = null;
const history = [];

function emitChange() {
  window.dispatchEvent(new CustomEvent(WB_APPROVAL_EVENT, { detail: { pending } }));
}

function inferRiskLevel(actionType, details = {}) {
  if (actionType === "git_commit" || actionType === "shell") {
    return details.riskLevel || "HIGH";
  }
  if (actionType === "write_batch") {
    return "MEDIUM";
  }
  if (details.deleteFile || details.highImpact) {
    return "HIGH";
  }
  return details.riskLevel || "MEDIUM";
}

function requestApproval({
  taskId,
  projectId,
  actionType,
  title,
  summary,
  purpose,
  scope = [],
  details = {},
  riskLevel,
  riskReasons = [],
  rollbackHint,
  stagedPatchId,
  onApprove,
  onReject,
  autoApprove = false,
}) {
  if (pending) {
    // Diff 审阅已确认后的写入：若卡着同任务的写入审批，先清掉以免静默失败
    if (
      autoApprove &&
      pending.actionType === "write_batch" &&
      pending.taskId &&
      taskId &&
      String(pending.taskId) === String(taskId)
    ) {
      clearPending();
    } else if (!autoApprove) {
      return Promise.resolve(false);
    } else {
      return Promise.resolve(false);
    }
  }
  const id = `apr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const req = {
    id,
    taskId: taskId || null,
    projectId: projectId || null,
    actionType,
    title: title || ACTION_LABELS[actionType] || "操作审批",
    summary: summary || "",
    purpose: purpose || details.purpose || "",
    scope: Array.isArray(scope) ? scope : [],
    details,
    stagedPatchId: stagedPatchId || details.stagedPatchId || null,
    riskLevel: riskLevel || inferRiskLevel(actionType, details),
    riskReasons: Array.isArray(riskReasons)
      ? riskReasons
      : Array.isArray(details.riskReasons)
        ? details.riskReasons
        : [],
    rollbackHint: rollbackHint || "受控写入前会自动创建备份，可在备份面板还原。",
    status: autoApprove ? "approved" : "waiting",
    createdAt: new Date().toISOString(),
    onApprove,
    onReject,
    autoApproved: Boolean(autoApprove),
  };
  // Diff 已确认等场景：静默记入审批历史，不弹出二次审批卡
  if (autoApprove) {
    history.unshift(req);
    try {
      req.onApprove?.();
    } catch {
      /* ignore */
    }
    return Promise.resolve(true);
  }
  pending = req;
  emitChange();
  return new Promise((resolve) => {
    req._resolve = resolve;
  });
}

function approve(id, options = {}) {
  if (!pending || pending.id !== id) {
    return false;
  }
  const req = pending;
  pending = null;
  req.status = "approved";
  req.approvalScope = options.approvalScope || "once";
  history.unshift(req);
  emitChange();
  try {
    req.onApprove?.(req.approvalScope);
  } catch {
    /* ignore */
  }
  req._resolve?.(true);
  return true;
}

function reject(id, reason = "") {
  if (!pending || pending.id !== id) {
    return false;
  }
  const req = pending;
  pending = null;
  req.status = "rejected";
  req.rejectReason = reason;
  history.unshift(req);
  emitChange();
  try {
    req.onReject?.(reason);
  } catch {
    /* ignore */
  }
  req._resolve?.(false);
  return true;
}

function getPending() {
  return pending ? { ...pending, onApprove: undefined, onReject: undefined, _resolve: undefined } : null;
}

function getHistory(limit = 8) {
  return history.slice(0, limit).map((h) => ({
    ...h,
    onApprove: undefined,
    onReject: undefined,
    _resolve: undefined,
  }));
}

function clearPending() {
  if (pending) {
    pending._resolve?.(false);
  }
  pending = null;
  emitChange();
}

window.__wbApprovalStore = {
  WB_APPROVAL_EVENT,
  RISK_LABELS,
  ACTION_LABELS,
  requestApproval,
  approve,
  reject,
  getPending,
  getHistory,
  clearPending,
};

window.__wbRequestApproval = (opts) => window.__wbApprovalStore.requestApproval(opts);
