const WB_REVIEW_EVENT = "wb:code-review-change";

const REVIEW_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  REVISION: "revision",
};

const byTask = new Map();

function taskKey(projectId, taskId) {
  return `${projectId || ""}:${taskId || ""}`;
}

function emptyState() {
  return {
    changes: [],
    viewMode: "unified",
    selectedChangeId: null,
    source: null,
  };
}

function getTaskState(projectId, taskId) {
  const key = taskKey(projectId, taskId);
  if (!byTask.has(key)) {
    byTask.set(key, emptyState());
  }
  return byTask.get(key);
}

function emitChange(projectId, taskId) {
  window.dispatchEvent(
    new CustomEvent(WB_REVIEW_EVENT, {
      detail: { projectId, taskId, state: getTaskState(projectId, taskId) },
    })
  );
}

function normalizeChange(preview, index, taskId) {
  const path = preview.filePath || preview.path || `file-${index}`;
  const diff = preview.unifiedDiff || "";
  const additions = preview.linesAdded ?? (diff.match(/^\+[^+]/gm) || []).length;
  const deletions = preview.linesRemoved ?? (diff.match(/^-[^-]/gm) || []).length;
  let changeType = "modify";
  if (additions > 0 && deletions === 0) {
    changeType = "add";
  } else if (deletions > 0 && additions === 0) {
    changeType = "delete";
  }
  const stagedPatchId = preview.stagedPatchId || preview.raw?.stagedPatchId || null;
  return {
    id: stagedPatchId || `chg_${taskId || "t"}_${index}_${path.replace(/[^\w.-]/g, "_")}`,
    stagedPatchId,
    taskId,
    path,
    changeType,
    additions,
    deletions,
    diff,
    summary: preview.summary || "",
    reviewStatus: REVIEW_STATUS.PENDING,
    proposedContent: preview.proposedContent || "",
    originalContent: preview.originalContent || "",
    raw: preview,
  };
}

async function syncFromStagedPatches(projectId, taskId) {
  const api = window.electronAPI || {};
  if (!projectId || !taskId || typeof api.wbProjectPatchesList !== "function") {
    return [];
  }
  try {
    const previews = await api.wbProjectPatchesList({ projectId, taskId });
    return setFromDiffPreviews(projectId, taskId, previews, "staging");
  } catch {
    return [];
  }
}

function setFromDiffPreviews(projectId, taskId, diffPreviews, source = "plan") {
  const state = getTaskState(projectId, taskId);
  state.changes = (diffPreviews || []).map((d, i) => normalizeChange(d, i, taskId));
  state.selectedChangeId = state.changes[0]?.id || null;
  state.source = source;
  emitChange(projectId, taskId);
  return state.changes;
}

function setReviewStatus(projectId, taskId, changeId, status) {
  const state = getTaskState(projectId, taskId);
  const item = state.changes.find((c) => c.id === changeId);
  if (item) {
    item.reviewStatus = status;
    emitChange(projectId, taskId);
  }
}

function setSelectedChange(projectId, taskId, changeId) {
  const state = getTaskState(projectId, taskId);
  state.selectedChangeId = changeId;
  emitChange(projectId, taskId);
}

function setViewMode(projectId, taskId, mode) {
  const state = getTaskState(projectId, taskId);
  state.viewMode = mode === "split" ? "split" : "unified";
  emitChange(projectId, taskId);
}

function acceptAll(projectId, taskId) {
  const state = getTaskState(projectId, taskId);
  state.changes.forEach((c) => {
    if (c.reviewStatus === REVIEW_STATUS.PENDING || c.reviewStatus === REVIEW_STATUS.REVISION) {
      c.reviewStatus = REVIEW_STATUS.ACCEPTED;
    }
  });
  emitChange(projectId, taskId);
}

function rejectAll(projectId, taskId) {
  const state = getTaskState(projectId, taskId);
  state.changes.forEach((c) => {
    c.reviewStatus = REVIEW_STATUS.REJECTED;
  });
  emitChange(projectId, taskId);
}

function requestRevision(projectId, taskId, changeId, feedback = "") {
  setReviewStatus(projectId, taskId, changeId, REVIEW_STATUS.REVISION);
  return { changeId, feedback: String(feedback || "").trim() };
}

async function requestRevisionWithFeedback(projectId, taskId, changeId, feedback) {
  const change = getChanges(projectId, taskId).find((c) => c.id === changeId);
  const result = requestRevision(projectId, taskId, changeId, feedback);
  const api = window.electronAPI || {};
  if (change?.stagedPatchId && typeof api.wbProjectPatchStatus === "function") {
    try {
      await api.wbProjectPatchStatus({
        projectId,
        taskId,
        patchId: change.stagedPatchId,
        status: "REVISION_REQUESTED",
      });
    } catch {
      /* UI state already updated */
    }
  }
  return { ...result, change, feedback: result.feedback };
}

function getChanges(projectId, taskId) {
  return getTaskState(projectId, taskId).changes;
}

function getAcceptedChanges(projectId, taskId) {
  return getChanges(projectId, taskId).filter((c) => c.reviewStatus === REVIEW_STATUS.ACCEPTED);
}

function getPendingChanges(projectId, taskId) {
  return getChanges(projectId, taskId).filter(
    (c) => c.reviewStatus === REVIEW_STATUS.PENDING || c.reviewStatus === REVIEW_STATUS.REVISION
  );
}

function clearChanges(projectId, taskId) {
  byTask.delete(taskKey(projectId, taskId));
  emitChange(projectId, taskId);
}

function getState(projectId, taskId) {
  const state = getTaskState(projectId, taskId);
  return {
    changes: [...state.changes],
    viewMode: state.viewMode,
    selectedChangeId: state.selectedChangeId,
    source: state.source,
  };
}

window.__wbCodeReviewStore = {
  WB_REVIEW_EVENT,
  REVIEW_STATUS,
  setFromDiffPreviews,
  syncFromStagedPatches,
  setReviewStatus,
  setSelectedChange,
  setViewMode,
  acceptAll,
  rejectAll,
  requestRevision,
  requestRevisionWithFeedback,
  getChanges,
  getAcceptedChanges,
  getPendingChanges,
  clearChanges,
  getState,
};
