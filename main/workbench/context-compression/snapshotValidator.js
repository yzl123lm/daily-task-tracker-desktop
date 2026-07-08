function validateLessonRefs(lessonRefs, { scopeType = "chat", projectId = null, taskId = null } = {}) {
  const errors = [];
  if (!Array.isArray(lessonRefs)) {
    errors.push("lessonRefs 必须为数组");
    return errors;
  }
  for (const [idx, ref] of lessonRefs.entries()) {
    if (!ref || typeof ref !== "object") {
      errors.push(`lessonRefs[${idx}] 无效`);
      continue;
    }
    if (!ref.lessonId || !ref.fingerprint || !ref.status) {
      errors.push(`lessonRefs[${idx}] 缺少 lessonId/fingerprint/status`);
    }
    if (!("ruleText" in ref)) {
      errors.push(`lessonRefs[${idx}] 缺少 ruleText`);
    }
    if (ref.status && !["candidate", "verified", "rejected", "deprecated", "ignored"].includes(ref.status)) {
      errors.push(`lessonRefs[${idx}] status 无效: ${ref.status}`);
    }
  }
  if (scopeType === "task" && lessonRefs.length > 20) {
    errors.push("task snapshot lessonRefs 超过 20 条");
  }
  if (scopeType === "chat" && lessonRefs.length > 0) {
    errors.push("chat snapshot 不应包含 lessonRefs");
  }
  if (projectId && lessonRefs.some((ref) => ref.projectId && ref.projectId !== projectId)) {
    errors.push("lessonRefs 存在跨项目引用");
  }
  if (taskId && lessonRefs.some((ref) => ref.taskId && ref.taskId !== taskId)) {
    errors.push("lessonRefs 存在跨任务引用");
  }
  return errors;
}

function validateSnapshot(snapshot, { scopeType = "chat" } = {}) {
  const errors = [];
  const riskFlags = [];
  if (!snapshot || typeof snapshot !== "object") {
    return { valid: false, errors: ["snapshot 为空"], riskFlags: [] };
  }
  if (!snapshot.currentObjective?.text?.trim()) {
    errors.push("缺少 P0: currentObjective");
  }
  if (!Array.isArray(snapshot.nextActions) || snapshot.nextActions.length === 0) {
    errors.push("缺少 P0: nextActions");
  }
  if (!Array.isArray(snapshot.userConstraints)) {
    errors.push("缺少 userConstraints 数组");
  }
  if (!Array.isArray(snapshot.currentErrors)) {
    errors.push("缺少 currentErrors 数组");
  }
  if (!Array.isArray(snapshot.lessonRefs)) {
    errors.push("缺少 lessonRefs 数组");
  } else {
    errors.push(
      ...validateLessonRefs(snapshot.lessonRefs, {
        scopeType,
        projectId: snapshot.scope?.projectId,
        taskId: snapshot.scope?.taskId,
      })
    );
  }
  if (scopeType === "chat") {
    if (Array.isArray(snapshot.relevantFiles) && snapshot.relevantFiles.length > 0) {
      errors.push("chat snapshot 不得包含 relevantFiles");
    }
    if (Array.isArray(snapshot.changesMade) && snapshot.changesMade.length > 0) {
      errors.push("chat snapshot 不得包含 changesMade");
    }
  } else if (!Array.isArray(snapshot.relevantFiles)) {
    riskFlags.push({ code: "MISSING_RELEVANT_FILES", level: "low" });
  }
  if (!Array.isArray(snapshot.decisions) || snapshot.decisions.length === 0) {
    riskFlags.push({ code: "NO_DECISIONS", level: "medium" });
  }
  return {
    valid: errors.length === 0,
    errors,
    riskFlags: [...(snapshot.riskFlags || []), ...riskFlags],
  };
}

module.exports = {
  validateSnapshot,
  validateLessonRefs,
};
