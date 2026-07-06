const { assertSafeId } = require("../../utils/ipcValidate.js");
const { getDb, nowIso, newId } = require("./db.js");
const {
  assertNamespaceAllowed,
  assertNoCrossScopeRead,
  namespacesForProjectScope,
  parseNamespace,
} = require("./namespace.js");
const { resolveUserId } = require("./projectService.js");

function writeMemory(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  parseNamespace(namespace);
  const scopeType = String(payload?.scopeType || "").trim();
  const scopeId = assertSafeId(payload?.scopeId, "scopeId");
  const memoryType = String(payload?.memoryType || payload?.type || "note").trim();
  const content = String(payload?.content || "").trim();
  if (!content) {
    throw new Error("记忆内容不能为空");
  }
  const source = String(payload?.source || "system").trim();
  const id = newId("mem");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO context_memories (
      id, user_id, namespace, scope_type, scope_id, memory_type, content, source,
      importance, is_pinned, is_deletable, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, NULL, ?, ?)`
  ).run(
    id,
    uid,
    namespace,
    scopeType,
    scopeId,
    memoryType,
    content,
    source,
    Number(payload?.importance) || 3,
    ts,
    ts
  );
  return { id, namespace, memoryType, content, createdAt: ts };
}

function searchMemories(getUserDataPath, userId, payload) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  parseNamespace(namespace);
  const callerNamespace = String(payload?.callerNamespace || namespace).trim();
  assertNoCrossScopeRead(callerNamespace, namespace);
  if (payload?.allowedNamespaces) {
    assertNamespaceAllowed(namespace, payload.allowedNamespaces);
  }
  const query = String(payload?.query || "").trim().toLowerCase();
  const limit = Math.min(Math.max(Number(payload?.limit) || 20, 1), 100);
  const rows = db
    .prepare(
      `SELECT * FROM context_memories
       WHERE user_id = ? AND namespace = ?
       ORDER BY importance DESC, updated_at DESC
       LIMIT ?`
    )
    .all(uid, namespace, limit);
  const mapped = rows.map((row) => ({
    id: row.id,
    namespace: row.namespace,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    memoryType: row.memory_type,
    content: row.content,
    source: row.source,
    importance: row.importance,
    createdAt: row.created_at,
  }));
  if (!query) {
    return mapped;
  }
  return mapped.filter(
    (m) =>
      m.content.toLowerCase().includes(query) ||
      m.memoryType.toLowerCase().includes(query)
  );
}

function initProjectMemory(getUserDataPath, userId, project) {
  if (!project?.id) {
    return null;
  }
  const namespace = `project:${project.id}`;
  return writeMemory(getUserDataPath, userId, {
    namespace,
    scopeType: "project",
    scopeId: project.id,
    memoryType: "project_bootstrap",
    content: `项目「${project.name}」已创建，namespace=${namespace}`,
    source: "project.create",
    importance: 4,
  });
}

function searchWithProjectGuard(getUserDataPath, userId, projectId, taskId, payload) {
  const allowed = namespacesForProjectScope(projectId, taskId || null);
  return searchMemories(getUserDataPath, userId, {
    ...payload,
    allowedNamespaces: allowed,
    callerNamespace: payload?.callerNamespace || (taskId ? `task:${projectId}:${taskId}` : `project:${projectId}`),
  });
}

module.exports = {
  writeMemory,
  searchMemories,
  initProjectMemory,
  searchWithProjectGuard,
};
