const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const SCHEMA_VERSION = 6;
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
      fix_loop_json TEXT,
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
    CREATE TABLE IF NOT EXISTS context_snapshots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      validation_status TEXT NOT NULL DEFAULT 'PENDING',
      risk_level TEXT NOT NULL DEFAULT 'LOW',
      is_latest INTEGER NOT NULL DEFAULT 0,
      tokens_before INTEGER,
      tokens_after INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_context_snapshots_revision ON context_snapshots(namespace, revision);
    CREATE INDEX IF NOT EXISTS idx_context_snapshots_latest ON context_snapshots(namespace, is_latest, created_at DESC);
    CREATE TABLE IF NOT EXISTS compression_events (
      id TEXT PRIMARY KEY,
      snapshot_id TEXT,
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      reason TEXT NOT NULL,
      mode TEXT NOT NULL,
      tokens_before INTEGER NOT NULL,
      tokens_after INTEGER NOT NULL,
      blocks_kept INTEGER DEFAULT 0,
      blocks_summarized INTEGER DEFAULT 0,
      blocks_dropped INTEGER DEFAULT 0,
      validation_result_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS raw_context_fragments (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      namespace TEXT NOT NULL,
      fragment_type TEXT NOT NULL,
      content_ref TEXT,
      summary TEXT,
      token_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
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
    CREATE TABLE IF NOT EXISTS tool_operations (
      id TEXT PRIMARY KEY,
      agent_run_id TEXT,
      user_id TEXT NOT NULL,
      project_id TEXT,
      task_id TEXT,
      tool_name TEXT NOT NULL,
      args_json TEXT,
      result_text TEXT,
      risk_level TEXT NOT NULL DEFAULT 'LOW',
      approved_by_user INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tool_operations_task ON tool_operations(project_id, task_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS file_write_backups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      task_id TEXT,
      rel_path TEXT NOT NULL,
      backup_path TEXT NOT NULL,
      had_original INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_file_write_backups_task ON file_write_backups(project_id, task_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS staged_patches (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      agent_run_id TEXT,
      file_path TEXT NOT NULL,
      original_content TEXT,
      proposed_content TEXT NOT NULL,
      unified_diff TEXT,
      summary TEXT,
      status TEXT NOT NULL DEFAULT 'STAGED',
      patch_edits_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_staged_patches_task ON staged_patches(project_id, task_id, status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS agent_run_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      input_text TEXT,
      output_json TEXT,
      tool_trace_json TEXT,
      error_message TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_run_sessions_task ON agent_run_sessions(project_id, task_id, status, updated_at DESC);
  `);
  const row = db.prepare("SELECT value FROM wb_meta WHERE key = 'schema_version'").get();
  const current = Number(row?.value) || 0;
  if (!row) {
    db.prepare("INSERT INTO wb_meta(key, value) VALUES('schema_version', ?)").run(String(SCHEMA_VERSION));
  } else if (current < SCHEMA_VERSION) {
    migrateSchema(db, current);
    db.prepare("UPDATE wb_meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
  }
  ensureColumnMigrations(db);
}

function ensureColumnMigrations(db) {
  try {
    const cols = db.prepare("PRAGMA table_info(project_tasks)").all();
    const hasFixLoop = cols.some((c) => c.name === "fix_loop_json");
    if (!hasFixLoop) {
      db.exec("ALTER TABLE project_tasks ADD COLUMN fix_loop_json TEXT DEFAULT NULL");
    }
  } catch {
    /* column may already exist */
  }
}

function migrateSchema(db, fromVersion) {
  if (fromVersion < 6) {
    ensureColumnMigrations(db);
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
  let fixLoopState = null;
  if (row.fix_loop_json) {
    try {
      fixLoopState = JSON.parse(row.fix_loop_json);
    } catch {
      fixLoopState = null;
    }
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
    fixLoopState,
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
