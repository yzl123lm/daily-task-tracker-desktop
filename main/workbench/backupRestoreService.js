const fs = require("fs");
const path = require("path");
const { getDb } = require("./db.js");
const { resolveUserId, getProject } = require("./projectService.js");
const { resolveProjectRoot, assertUnderRoot } = require("./projectCodeService.js");
const { writeProjectFile, assertWritablePath } = require("./projectWriteService.js");
const { backupRootDir } = require("./fileBackupService.js");
const { buildPatchPreview } = require("./diffPreviewService.js");
const { recordToolOperation } = require("./toolPermissionService.js");
const { writeMemory } = require("./contextMemoryService.js");

function assertBackupPathUnderRoot(getUserDataPath, backupPath) {
  const root = path.resolve(backupRootDir(getUserDataPath));
  const target = path.resolve(String(backupPath || ""));
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("备份路径无效");
  }
  return target;
}

function rowToBackup(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    projectId: row.project_id,
    taskId: row.task_id,
    relPath: row.rel_path,
    backupPath: row.backup_path,
    hadOriginal: Boolean(row.had_original),
    createdAt: row.created_at,
  };
}

function listFileBackups(getUserDataPath, userId, projectId, taskId, { limit = 20 } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const rows = db
    .prepare(
      `SELECT * FROM file_write_backups
       WHERE user_id = ? AND project_id = ? AND (task_id = ? OR (? IS NULL AND task_id IS NULL))
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(uid, projectId, taskId || null, taskId || null, Math.min(Math.max(limit, 1), 50));
  return rows.map((row) => {
    const item = rowToBackup(row);
    let backupExists = false;
    try {
      const abs = assertBackupPathUnderRoot(getUserDataPath, item.backupPath);
      backupExists = item.hadOriginal && fs.existsSync(abs);
    } catch {
      backupExists = false;
    }
    return {
      ...item,
      backupExists,
      canRestore: item.hadOriginal ? backupExists : true,
    };
  });
}

function getBackupById(getUserDataPath, userId, backupId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(`SELECT * FROM file_write_backups WHERE id = ? AND user_id = ?`)
    .get(backupId, uid);
  return rowToBackup(row);
}

function restoreFileFromBackup(
  getUserDataPath,
  userId,
  { projectId, taskId, backupId, userApproved },
  { getDefaultProjectRoot } = {}
) {
  if (!userApproved) {
    const err = new Error("还原备份需要用户明确确认");
    err.code = "USER_APPROVAL_REQUIRED";
    err.status = 403;
    throw err;
  }
  const uid = resolveUserId(userId);
  const backup = getBackupById(getUserDataPath, uid, backupId);
  if (!backup || backup.projectId !== projectId) {
    throw new Error("备份记录不存在");
  }
  if (taskId && backup.taskId && backup.taskId !== taskId) {
    throw new Error("备份与当前任务不匹配");
  }
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }
  const rel = assertWritablePath(backup.relPath);
  const targetAbs = assertUnderRoot(root, path.join(root, rel));

  if (backup.hadOriginal) {
    const backupAbs = assertBackupPathUnderRoot(getUserDataPath, backup.backupPath);
    if (!fs.existsSync(backupAbs)) {
      throw new Error("备份文件已丢失，无法还原");
    }
    const content = fs.readFileSync(backupAbs, "utf8");
    const writeResult = writeProjectFile(getUserDataPath, uid, root, rel, content, {
      projectId,
      taskId: taskId || backup.taskId,
      summary: `从备份 ${backupId} 还原`,
    });
    recordToolOperation(getUserDataPath, uid, {
      projectId,
      taskId: taskId || backup.taskId,
      toolName: "restore_file_backup",
      args: { backupId, path: rel },
      resultText: `已还原 ${rel} ← 备份 ${backupId}`,
      riskLevel: "HIGH",
      approvedByUser: true,
    });
    if (taskId || backup.taskId) {
      const tid = taskId || backup.taskId;
      writeMemory(getUserDataPath, uid, {
        namespace: `task:${projectId}:${tid}`,
        scopeType: "task",
        scopeId: tid,
        memoryType: "change_log",
        content: `已从备份还原 ${rel}（${backupId}）`,
        source: "BackupRestore",
        importance: 5,
      });
    }
    return {
      mode: "restored_content",
      backup,
      writeResult,
      patch: writeResult.patch,
    };
  }

  let removed = false;
  let preDeleteBackup = null;
  if (fs.existsSync(targetAbs)) {
    const { backupFileBeforeWrite, recordFileBackup } = require("./fileBackupService.js");
    preDeleteBackup = backupFileBeforeWrite(getUserDataPath, {
      projectId,
      taskId: taskId || backup.taskId,
      relPath: rel,
      absPath: targetAbs,
    });
    const db = getDb(getUserDataPath);
    recordFileBackup(getUserDataPath, uid, db, {
      ...preDeleteBackup,
      projectId,
      taskId: taskId || backup.taskId,
    });
    fs.unlinkSync(targetAbs);
    removed = true;
  }
  const patch = removed
    ? buildPatchPreview({
        filePath: rel,
        originalContent: "(文件已删除，还原为写入前不存在状态)",
        proposedContent: "",
        summary: "删除由受控写入创建的新文件",
      })
    : null;
  recordToolOperation(getUserDataPath, uid, {
    projectId,
    taskId: taskId || backup.taskId,
    toolName: "restore_file_backup",
    args: { backupId, path: rel, removedNewFile: true },
    resultText: removed ? `已删除新建文件 ${rel}` : `文件本不存在，无需删除`,
    riskLevel: "HIGH",
    approvedByUser: true,
  });
  return {
    mode: "removed_new_file",
    backup,
    removed,
    preDeleteBackup,
    patch: patch ? { ...patch, writeApplied: true } : null,
  };
}

module.exports = {
  listFileBackups,
  getBackupById,
  restoreFileFromBackup,
};
