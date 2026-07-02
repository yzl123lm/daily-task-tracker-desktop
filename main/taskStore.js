const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { scanAttachmentTaskMarkers } = require("./taskAttachments");

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

function markerToRecoveredTask(marker) {
  const createdAtIsoDate = String(marker?.createdAtIsoDate || "").trim();
  const createdAt = createdAtIsoDate
    ? `${createdAtIsoDate.replace(/-/g, "/")} 00:00:00`
    : new Date().toLocaleString("zh-CN", { hour12: false });
  return {
    id: crypto.randomUUID(),
    taskId: String(marker?.taskId || "").trim(),
    issueType: String(marker?.issueType || "").trim(),
    content: "（从附件目录恢复，请补充跟进事物内容）",
    reporter: "",
    handler: "",
    createdAt,
    createdAtIsoDate: /^\d{4}-\d{2}-\d{2}$/.test(createdAtIsoDate) ? createdAtIsoDate : "",
    status: "待处理",
    priority: "中",
    deadline: "",
    remarks: [],
    completedAt: "",
    updatedAt: String(marker?.updatedAt || createdAt),
    attachmentDir: String(marker?.attachmentDir || "").trim(),
    recoveredFromAttachment: true,
  };
}

function mergeTasksByTaskId(primary, secondary) {
  const out = [];
  const seen = new Set();
  [...primary, ...secondary].forEach((raw) => {
    if (!raw || typeof raw !== "object") {
      return;
    }
    const taskId = String(raw.taskId || "").trim();
    const key = taskId || String(raw.id || "");
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    out.push(raw);
  });
  return out;
}

function recoverTasksFromAttachmentMarkers(userDataPath, existingTasks = []) {
  const markers = scanAttachmentTaskMarkers(userDataPath);
  if (!markers.length) {
    return { tasks: existingTasks, recoveredCount: 0 };
  }
  const existingIds = new Set(
    (Array.isArray(existingTasks) ? existingTasks : [])
      .map((task) => String(task?.taskId || "").trim())
      .filter(Boolean)
  );
  const recovered = markers
    .filter((marker) => marker.taskId && !existingIds.has(marker.taskId))
    .map(markerToRecoveredTask);
  if (!recovered.length) {
    return { tasks: existingTasks, recoveredCount: 0 };
  }
  return {
    tasks: mergeTasksByTaskId(Array.isArray(existingTasks) ? existingTasks : [], recovered),
    recoveredCount: recovered.length,
  };
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

function loadTasksWithRecovery(userDataPath) {
  const tasks = readTasksFromFile(userDataPath);
  const { tasks: merged, recoveredCount } = recoverTasksFromAttachmentMarkers(userDataPath, tasks);
  if (recoveredCount > 0) {
    writeTasksToFile(userDataPath, merged);
  }
  return { tasks: merged, recoveredCount };
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
  loadTasksWithRecovery,
  writeTasksToFile,
  tasksFilePath,
  recoverTasksFromAttachmentMarkers,
  mergeTasksByTaskId,
};
