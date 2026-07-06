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
};
