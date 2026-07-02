const fs = require("fs");
const path = require("path");

const TASKS_FILE = "tasks-v1.json";
const TASKS_BACKUP_FILE = "tasks-v1.backup.json";
const LEGACY_EXPORT_NAMES = ["daily_task_tracker_v1.json", "tasks-export.json"];

function tasksFilePath(userDataPath) {
  return path.join(userDataPath, TASKS_FILE);
}

function tasksBackupPath(userDataPath) {
  return path.join(userDataPath, TASKS_BACKUP_FILE);
}

function normalizeTaskArray(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }
  if (raw && Array.isArray(raw.tasks)) {
    return raw.tasks;
  }
  return null;
}

function readJsonFileSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readTasksFromFile(userDataPath) {
  const primary = normalizeTaskArray(readJsonFileSafe(tasksFilePath(userDataPath)));
  if (primary && primary.length) {
    return primary;
  }
  const backup = normalizeTaskArray(readJsonFileSafe(tasksBackupPath(userDataPath)));
  if (backup && backup.length) {
    return backup;
  }
  for (const name of LEGACY_EXPORT_NAMES) {
    const legacy = normalizeTaskArray(readJsonFileSafe(path.join(userDataPath, name)));
    if (legacy && legacy.length) {
      return legacy;
    }
  }
  return [];
}

function writeTasksToFile(userDataPath, tasks) {
  const fp = tasksFilePath(userDataPath);
  const tmp = `${fp}.tmp`;
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    tasks: Array.isArray(tasks) ? tasks : [],
  };
  fs.mkdirSync(userDataPath, { recursive: true });
  if (fs.existsSync(fp)) {
    try {
      fs.copyFileSync(fp, tasksBackupPath(userDataPath));
    } catch {
      /* ignore backup failure */
    }
  }
  fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tmp, fp);
  return payload;
}

module.exports = {
  readTasksFromFile,
  writeTasksToFile,
  tasksFilePath,
};
