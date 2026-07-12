const { assertSafeId } = require("../../utils/ipcValidate.js");
const {
  getDb,
  nowIso,
  newId,
  rowToProject,
  rowToTask,
} = require("./db.js");
const { buildProjectNamespace } = require("./namespace.js");
const { normalizePermissionMode } = require("./projectPolicyService.js");

const LOCAL_USER_ID = "local-user";

function resolveUserId(userId) {
  return String(userId || LOCAL_USER_ID).trim() || LOCAL_USER_ID;
}

function listProjects(getUserDataPath, userId, { includeArchived = false } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const sql = includeArchived
    ? "SELECT * FROM projects WHERE user_id = ? AND status != 'DELETED' ORDER BY updated_at DESC"
    : "SELECT * FROM projects WHERE user_id = ? AND status = 'ACTIVE' ORDER BY updated_at DESC";
  const rows = db.prepare(sql).all(uid);
  return rows.map(rowToProject);
}

function getProject(getUserDataPath, userId, projectId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  const row = db.prepare("SELECT * FROM projects WHERE id = ? AND user_id = ?").get(pid, uid);
  return rowToProject(row);
}

function createProject(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const name = String(payload?.name || "").trim();
  if (!name) {
    throw new Error("项目名称不能为空");
  }
  if (name.length > 120) {
    throw new Error("项目名称过长");
  }
  const id = newId("proj");
  const ts = nowIso();
  const techStack = Array.isArray(payload?.techStack) ? payload.techStack : [];
  db.prepare(
    `INSERT INTO projects (
      id, user_id, name, description, project_type, tech_stack, repo_url, local_path,
      permission_mode, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)`
  ).run(
    id,
    uid,
    name,
    String(payload?.description || "").trim(),
    String(payload?.projectType || "").trim(),
    JSON.stringify(techStack),
    payload?.repoUrl ? String(payload.repoUrl).trim() : null,
    payload?.localPath ? String(payload.localPath).trim() : null,
    normalizePermissionMode(payload?.permissionMode),
    ts,
    ts
  );
  db.prepare(
    `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
     VALUES (?, ?, 'project', ?, 'project.create', ?, ?)`
  ).run(newId("audit"), uid, id, JSON.stringify({ name }), ts);
  return getProject(getUserDataPath, uid, id);
}

function updateProject(getUserDataPath, userId, projectId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  const existing = getProject(getUserDataPath, uid, pid);
  if (!existing) {
    throw new Error("项目不存在");
  }
  const name =
    typeof payload?.name === "string" && payload.name.trim()
      ? payload.name.trim()
      : existing.name;
  const ts = nowIso();
  const techStack = Array.isArray(payload?.techStack) ? payload.techStack : existing.techStack;
  db.prepare(
    `UPDATE projects SET
      name = ?, description = ?, project_type = ?, tech_stack = ?,
      repo_url = ?, local_path = ?, permission_mode = ?, status = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    name,
    typeof payload?.description === "string" ? payload.description.trim() : existing.description,
    typeof payload?.projectType === "string" ? payload.projectType.trim() : existing.projectType,
    JSON.stringify(techStack),
    payload?.repoUrl !== undefined ? payload.repoUrl : existing.repoUrl,
    payload?.localPath !== undefined ? payload.localPath : existing.localPath,
    typeof payload?.permissionMode === "string"
      ? normalizePermissionMode(payload.permissionMode)
      : existing.permissionMode,
    typeof payload?.status === "string" ? payload.status : existing.status,
    ts,
    pid,
    uid
  );
  if (typeof payload?.status === "string" && payload.status !== existing.status) {
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
       VALUES (?, ?, 'project', ?, 'project.status_change', ?, ?)`
    ).run(newId("audit"), uid, pid, JSON.stringify({ from: existing.status, to: payload.status }), ts);
  }
  return getProject(getUserDataPath, uid, pid);
}

function archiveProject(getUserDataPath, userId, projectId) {
  return updateProject(getUserDataPath, userId, projectId, { status: "ARCHIVED" });
}

function deleteProject(getUserDataPath, userId, projectId) {
  return updateProject(getUserDataPath, userId, projectId, { status: "DELETED" });
}

function listTasks(getUserDataPath, userId, projectId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  if (!getProject(getUserDataPath, uid, pid)) {
    throw new Error("项目不存在");
  }
  const rows = db
    .prepare("SELECT * FROM project_tasks WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC")
    .all(pid, uid);
  return rows.map(rowToTask);
}

function createTask(getUserDataPath, userId, projectId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  if (!getProject(getUserDataPath, uid, pid)) {
    throw new Error("项目不存在");
  }
  const title = String(payload?.title || "").trim();
  if (!title) {
    throw new Error("任务标题不能为空");
  }
  const id = newId("task");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO project_tasks (
      id, project_id, user_id, title, description, status, priority, current_step, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?)`
  ).run(
    id,
    pid,
    uid,
    title,
    String(payload?.description || "").trim(),
    Number(payload?.priority) || 3,
    String(payload?.currentStep || "").trim(),
    ts,
    ts
  );
  return rowToTask(db.prepare("SELECT * FROM project_tasks WHERE id = ?").get(id));
}

function getTask(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  const tid = assertSafeId(taskId, "taskId");
  const row = db
    .prepare("SELECT * FROM project_tasks WHERE id = ? AND project_id = ? AND user_id = ?")
    .get(tid, pid, uid);
  return rowToTask(row);
}

function updateTask(getUserDataPath, userId, projectId, taskId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  const tid = assertSafeId(taskId, "taskId");
  const existing = getTask(getUserDataPath, uid, pid, tid);
  if (!existing) {
    throw new Error("任务不存在");
  }
  const ts = nowIso();
  db.prepare(
    `UPDATE project_tasks SET
      title = ?, description = ?, status = ?, priority = ?, current_step = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(
    typeof payload?.title === "string" && payload.title.trim() ? payload.title.trim() : existing.title,
    typeof payload?.description === "string" ? payload.description.trim() : existing.description,
    typeof payload?.status === "string" && payload.status.trim() ? payload.status.trim() : existing.status,
    Number(payload?.priority) || existing.priority,
    typeof payload?.currentStep === "string" ? payload.currentStep.trim() : existing.currentStep,
    ts,
    tid,
    pid,
    uid
  );
  return getTask(getUserDataPath, uid, pid, tid);
}

module.exports = {
  LOCAL_USER_ID,
  resolveUserId,
  listProjects,
  getProject,
  createProject,
  updateProject,
  archiveProject,
  deleteProject,
  listTasks,
  createTask,
  getTask,
  updateTask,
  buildProjectNamespace,
};
