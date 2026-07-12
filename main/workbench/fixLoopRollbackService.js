/**
 * BL-013 / VER-009: Rollback Fix Loop round to file backups captured before apply.
 */
const { getFixLoopState, saveFixLoopState, appendFixLoopEvent, FIX_LOOP_PHASE } = require("./fixLoopStateService.js");
const { listFileBackups, restoreFileFromBackup } = require("./backupRestoreService.js");
const { resolveUserId } = require("./projectService.js");

function pickBackupsForAttempt(backups, attempt) {
  if (!attempt) return [];
  const ids = new Set(attempt.backupIds || []);
  if (ids.size) {
    return backups.filter((b) => ids.has(b.id));
  }
  // Fallback: backups created around attempt window (same task, after attempt start)
  const started = attempt.startedAt ? Date.parse(attempt.startedAt) : 0;
  const ended = attempt.endedAt ? Date.parse(attempt.endedAt) : Date.now();
  return backups.filter((b) => {
    const t = Date.parse(b.createdAt || 0);
    if (!Number.isFinite(t)) return false;
    if (started && t < started - 2000) return false;
    if (ended && t > ended + 60000) return false;
    return true;
  });
}

/**
 * Roll back files touched in the last (or specified) fix-loop apply round.
 */
async function rollbackFixLoopRound(
  getUserDataPath,
  userId,
  { projectId, taskId, round, userApproved = false, getDefaultProjectRoot } = {}
) {
  if (!userApproved) {
    const err = new Error("Fix Loop 回滚需要用户确认");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  const uid = resolveUserId(userId);
  const state = getFixLoopState(getUserDataPath, uid, projectId, taskId);
  if (!state) {
    const err = new Error("无 fixLoop 状态可回滚");
    err.code = "FIX_LOOP_INACTIVE";
    throw err;
  }
  const attempts = Array.isArray(state.attempts) ? state.attempts : [];
  const targetRound = round != null ? Number(round) : state.round;
  const attempt =
    attempts.find((a) => a.round === targetRound && (a.appliedPatchIds || []).length) ||
    attempts.filter((a) => a.round === targetRound).slice(-1)[0] ||
    attempts.slice(-1)[0];

  if (!attempt) {
    return {
      ok: false,
      code: "ROLLBACK_NO_ATTEMPT",
      message: "未找到可回滚的 Fix Loop 尝试记录",
    };
  }

  const backups = listFileBackups(getUserDataPath, uid, projectId, taskId, { limit: 50 });
  const targets = pickBackupsForAttempt(backups, attempt).filter((b) => b.canRestore);
  if (!targets.length) {
    return {
      ok: false,
      code: "ROLLBACK_NO_BACKUP",
      message: "未找到与该轮次关联的文件备份",
      attempt,
    };
  }

  const restored = [];
  const errors = [];
  for (const b of targets) {
    try {
      restoreFileFromBackup(
        getUserDataPath,
        uid,
        { projectId, taskId, backupId: b.id, userApproved: true },
        { getDefaultProjectRoot }
      );
      restored.push({ backupId: b.id, relPath: b.relPath });
    } catch (err) {
      errors.push({ backupId: b.id, relPath: b.relPath, error: err.message });
    }
  }

  const next = {
    ...state,
    phase: FIX_LOOP_PHASE.WAITING_APPLY,
    lastRollback: {
      at: new Date().toISOString(),
      round: attempt.round,
      restored,
      errors,
    },
    updatedAt: Date.now(),
  };
  saveFixLoopState(getUserDataPath, uid, projectId, taskId, next);
  appendFixLoopEvent(getUserDataPath, uid, projectId, taskId, {
    action: "fix_loop_rollback",
    phase: next.phase,
    round: attempt.round,
    message: `已回滚 ${restored.length} 个文件` + (errors.length ? `，失败 ${errors.length}` : ""),
    restored,
    errors,
  });

  return {
    ok: errors.length === 0 && restored.length > 0,
    round: attempt.round,
    restored,
    errors,
    message:
      restored.length > 0
        ? `已回滚第 ${attempt.round} 轮写入（${restored.length} 文件）`
        : "回滚未恢复任何文件",
  };
}

module.exports = {
  rollbackFixLoopRound,
  pickBackupsForAttempt,
};
