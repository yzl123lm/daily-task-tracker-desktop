const WB_GIT_CHANGE_EVENT = "wb:git-change-update";

let lastStatus = null;
let lastProjectId = null;

function parsePorcelainLine(line) {
  const raw = String(line || "");
  if (raw.length < 4) {
    return null;
  }
  const index = raw[0];
  const workTree = raw[1];
  const path = raw.slice(3).trim();
  let changeType = "modified";
  if (index === "?" || workTree === "?") {
    changeType = "untracked";
  } else if (index === "A" || workTree === "A") {
    changeType = "added";
  } else if (index === "D" || workTree === "D") {
    changeType = "deleted";
  } else if (index === "R" || workTree === "R") {
    changeType = "renamed";
  }
  const staged = index !== " " && index !== "?";
  const unstaged = workTree !== " " && workTree !== "?";
  return { path, changeType, staged, unstaged, raw };
}

function normalizeStatus(status, projectId) {
  if (!status) {
    return { isRepo: false, projectId, branch: null, clean: true, changes: [] };
  }
  const changes = (status.lines || []).map(parsePorcelainLine).filter(Boolean);
  return {
    isRepo: Boolean(status.isRepo),
    projectId,
    branch: status.branch || null,
    clean: Boolean(status.clean),
    changes,
    changeCount: changes.length,
    porcelain: status.porcelain || "",
  };
}

function setStatus(projectId, status) {
  lastProjectId = projectId;
  lastStatus = normalizeStatus(status, projectId);
  window.dispatchEvent(
    new CustomEvent(WB_GIT_CHANGE_EVENT, { detail: { projectId, status: lastStatus } })
  );
  return lastStatus;
}

function getStatus(projectId) {
  if (lastProjectId === projectId && lastStatus) {
    return lastStatus;
  }
  return normalizeStatus({ isRepo: false }, projectId);
}

window.__wbGitChangeStore = {
  WB_GIT_CHANGE_EVENT,
  setStatus,
  getStatus,
  parsePorcelainLine,
};
