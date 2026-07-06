const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 1;
let dbInstance = null;
let dbPathUsed = "";

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wb_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      project_type TEXT,
      tech_stack TEXT,
      repo_url TEXT,
      local_path TEXT,
      permission_mode TEXT NOT NULL DEFAULT 'ASSISTED_DEV',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user_updated ON projects(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS project_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      priority INTEGER NOT NULL DEFAULT 3,
      current_step TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_project_tasks_project ON project_tasks(project_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id, updated_at DESC);
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      token_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(chat_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, created_at ASC);
    CREATE TABLE IF NOT EXISTS context_memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      memory_type TEXT NOT NULL,
      content TEXT NOT NULL,
      source TEXT NOT NULL,
      importance INTEGER NOT NULL DEFAULT 3,
      is_pinned INTEGER NOT NULL DEFAULT 0,
      is_deletable INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_context_memories_ns ON context_memories(namespace, importance DESC, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agent_runs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      project_id TEXT,
      task_id TEXT,
      chat_id TEXT,
      input_text TEXT NOT NULL,
      output_text TEXT,
      status TEXT NOT NULL DEFAULT 'RUNNING',
      error_message TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      action TEXT NOT NULL,
      detail_json TEXT,
      created_at TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT value FROM wb_meta WHERE key = 'schema_version'").get();
  if (!row) {
    db.prepare("INSERT INTO wb_meta(key, value) VALUES('schema_version', ?)").run(String(SCHEMA_VERSION));
  }
}

function getDb(getUserDataPath) {
  if (typeof getUserDataPath !== "function") {
    throw new Error("缺少 getUserDataPath");
  }
  const userData = getUserDataPath();
  const targetPath = path.join(String(userData || ""), "workbench.sqlite");
  if (dbInstance && dbPathUsed === targetPath) {
    return dbInstance;
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  dbInstance = new DatabaseSync(targetPath);
  dbInstance.exec("PRAGMA foreign_keys = ON;");
  dbPathUsed = targetPath;
  ensureSchema(dbInstance);
  return dbInstance;
}

function rowToProject(row) {
  if (!row) {
    return null;
  }
  let techStack = [];
  try {
    techStack = row.tech_stack ? JSON.parse(row.tech_stack) : [];
  } catch {
    techStack = [];
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: row.description || "",
    projectType: row.project_type || "",
    techStack,
    repoUrl: row.repo_url || null,
    localPath: row.local_path || null,
    permissionMode: row.permission_mode,
    status: row.status,
    namespace: `project:${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToTask(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    title: row.title,
    description: row.description || "",
    status: row.status,
    priority: row.priority,
    currentStep: row.current_step || "",
    namespace: `task:${row.project_id}:${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToChat(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    status: row.status,
    namespace: `chat:${row.id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  getDb,
  nowIso,
  newId,
  rowToProject,
  rowToTask,
  rowToChat,
};
