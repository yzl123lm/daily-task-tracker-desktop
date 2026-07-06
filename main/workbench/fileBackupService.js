const fs = require("fs");
const path = require("path");
const { newId, nowIso } = require("./db.js");

function backupRootDir(getUserDataPath) {
  return path.join(String(getUserDataPath() || ""), "workbench-file-backups");
}

function backupFileBeforeWrite(getUserDataPath, { projectId, taskId, relPath, absPath }) {
  const root = backupRootDir(getUserDataPath);
  const stamp = nowIso().replace(/[:.]/g, "-");
  const safeRel = String(relPath || "").replace(/\\/g, "/").replace(/\.\./g, "");
  const backupAbs = path.join(root, projectId, taskId || "no-task", stamp, safeRel);
  fs.mkdirSync(path.dirname(backupAbs), { recursive: true });
  let hadOriginal = false;
  if (fs.existsSync(absPath)) {
    fs.copyFileSync(absPath, backupAbs);
    hadOriginal = true;
  }
  return {
    id: newId("fbk"),
    backupPath: backupAbs,
    relPath: safeRel,
    hadOriginal,
    createdAt: nowIso(),
  };
}

function recordFileBackup(getUserDataPath, userId, db, payload) {
  db.prepare(
    `INSERT INTO file_write_backups (
      id, user_id, project_id, task_id, rel_path, backup_path, had_original, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.id,
    userId,
    payload.projectId,
    payload.taskId || null,
    payload.relPath,
    payload.backupPath,
    payload.hadOriginal ? 1 : 0,
    payload.createdAt
  );
}

module.exports = {
  backupFileBeforeWrite,
  recordFileBackup,
  backupRootDir,
};
