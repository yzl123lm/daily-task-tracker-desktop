const fs = require("fs");
const path = require("path");

const SETTINGS_FILENAME = "task-attachment-settings.json";
const MARKER_FILENAME = ".jingluo-task.json";
const DEFAULT_ROOT_DIR = "D:\\本地知识库\\鲸落AI-知识库\\libraries\\每日任务";

function getSettingsPath(userDataPath) {
  return path.join(String(userDataPath || ""), SETTINGS_FILENAME);
}

function readSettings(userDataPath) {
  const p = getSettingsPath(userDataPath);
  if (!fs.existsSync(p)) {
    return {
      rootDir: DEFAULT_ROOT_DIR,
      configuredAt: "",
    };
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      rootDir: String(j.rootDir || DEFAULT_ROOT_DIR).trim() || DEFAULT_ROOT_DIR,
      configuredAt: String(j.configuredAt || "").trim(),
    };
  } catch {
    return {
      rootDir: DEFAULT_ROOT_DIR,
      configuredAt: "",
    };
  }
}

function writeSettings(userDataPath, rootDir) {
  const normalized = path.normalize(String(rootDir || "").trim());
  if (!normalized) {
    throw new Error("存储根目录不能为空");
  }
  if (!path.isAbsolute(normalized)) {
    throw new Error("存储根目录必须是绝对路径");
  }
  fs.mkdirSync(normalized, { recursive: true });
  const payload = {
    rootDir: normalized,
    configuredAt: new Date().toISOString(),
  };
  const p = getSettingsPath(userDataPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function sanitizeFolderSegment(name) {
  const t = String(name || "")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return t || "未命名";
}

function formatDateKey(createdAtIsoDate) {
  const raw = String(createdAtIsoDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.replace(/-/g, "");
  }
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function buildFolderBaseName(issueType, createdAtIsoDate) {
  return `${sanitizeFolderSegment(issueType)}+${formatDateKey(createdAtIsoDate)}`;
}

function readMarker(dir) {
  const markerPath = path.join(dir, MARKER_FILENAME);
  if (!fs.existsSync(markerPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(markerPath, "utf8"));
  } catch {
    return null;
  }
}

function writeMarker(dir, meta) {
  const markerPath = path.join(dir, MARKER_FILENAME);
  fs.writeFileSync(markerPath, JSON.stringify(meta, null, 2), "utf8");
}

function resolveTaskAttachmentDir(userDataPath, { issueType, createdAtIsoDate, taskId, attachmentDir }) {
  const saved = String(attachmentDir || "").trim();
  if (saved && fs.existsSync(saved)) {
    return saved;
  }
  const settings = readSettings(userDataPath);
  const rootDir = settings.rootDir;
  if (!rootDir || !fs.existsSync(rootDir)) {
    return "";
  }
  const baseName = buildFolderBaseName(issueType, createdAtIsoDate);
  const direct = path.join(rootDir, baseName);
  if (fs.existsSync(direct)) {
    const marker = readMarker(direct);
    if (!marker || !taskId || marker.taskId === taskId) {
      return direct;
    }
  }
  let n = 2;
  while (n < 100) {
    const candidate = path.join(rootDir, `${baseName}-${n}`);
    if (!fs.existsSync(candidate)) {
      break;
    }
    const marker = readMarker(candidate);
    if (!marker || !taskId || marker.taskId === taskId) {
      return candidate;
    }
    n += 1;
  }
  return direct;
}

function prepareTaskAttachmentDir(userDataPath, { issueType, createdAtIsoDate, taskId }) {
  const settings = readSettings(userDataPath);
  if (!settings.configuredAt) {
    return { ok: false, needConfigure: true, defaultRootDir: settings.rootDir || DEFAULT_ROOT_DIR };
  }
  const rootDir = settings.rootDir;
  fs.mkdirSync(rootDir, { recursive: true });
  const baseName = buildFolderBaseName(issueType, createdAtIsoDate);
  let dir = path.join(rootDir, baseName);
  if (fs.existsSync(dir)) {
    const marker = readMarker(dir);
    if (marker && marker.taskId && marker.taskId !== taskId) {
      let n = 2;
      while (n < 100) {
        const candidate = path.join(rootDir, `${baseName}-${n}`);
        if (!fs.existsSync(candidate)) {
          dir = candidate;
          break;
        }
        const m2 = readMarker(candidate);
        if (!m2?.taskId || m2.taskId === taskId) {
          dir = candidate;
          break;
        }
        n += 1;
      }
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  writeMarker(dir, {
    taskId: String(taskId || "").trim(),
    issueType: String(issueType || "").trim(),
    createdAtIsoDate: String(createdAtIsoDate || "").trim(),
    updatedAt: new Date().toISOString(),
  });
  return { ok: true, dir, rootDir, folderName: path.basename(dir) };
}

function isImageFileName(name) {
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|heic|heif)$/i.test(String(name || ""));
}

function uniqueDestPath(dir, fileName) {
  const base = path.basename(String(fileName || "file").trim()) || "file";
  let dest = path.join(dir, base);
  if (!fs.existsSync(dest)) {
    return dest;
  }
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let n = 2;
  while (n < 1000) {
    dest = path.join(dir, `${stem} (${n})${ext}`);
    if (!fs.existsSync(dest)) {
      return dest;
    }
    n += 1;
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function saveBufferFiles(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const item of files || []) {
    const name = String(item?.name || "file").trim();
    const data = item?.data;
    if (!name || !data) {
      continue;
    }
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!buf.length) {
      continue;
    }
    const dest = uniqueDestPath(dir, name);
    fs.writeFileSync(dest, buf);
    saved.push({
      name: path.basename(dest),
      path: dest,
      isImage: isImageFileName(dest),
      size: buf.length,
    });
  }
  return saved;
}

function copySourceFiles(dir, sourcePaths) {
  fs.mkdirSync(dir, { recursive: true });
  const saved = [];
  for (const srcRaw of sourcePaths || []) {
    const src = path.normalize(String(srcRaw || "").trim());
    if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) {
      continue;
    }
    const dest = uniqueDestPath(dir, path.basename(src));
    fs.copyFileSync(src, dest);
    const stat = fs.statSync(dest);
    saved.push({
      name: path.basename(dest),
      path: dest,
      isImage: isImageFileName(dest),
      size: stat.size,
    });
  }
  return saved;
}

function listAttachmentFiles(dir) {
  const normalized = path.normalize(String(dir || "").trim());
  if (!normalized || !fs.existsSync(normalized)) {
    return [];
  }
  let entries = [];
  try {
    entries = fs.readdirSync(normalized, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const ent of entries) {
    if (!ent.isFile() || ent.name === MARKER_FILENAME) {
      continue;
    }
    const full = path.join(normalized, ent.name);
    try {
      const stat = fs.statSync(full);
      out.push({
        name: ent.name,
        path: full,
        isImage: isImageFileName(ent.name),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
      });
    } catch {
      /* ignore broken file */
    }
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  return out;
}

function fileToDataUrl(filePath) {
  const p = path.normalize(String(filePath || "").trim());
  if (!p || !fs.existsSync(p) || !isImageFileName(p)) {
    return "";
  }
  try {
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).slice(1).toLowerCase() || "png";
    const mime = ext === "jpg" ? "jpeg" : ext;
    return `data:image/${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

function isPathUnderRoot(targetPath, rootDir) {
  const target = path.normalize(path.resolve(String(targetPath || "")));
  const root = path.normalize(path.resolve(String(rootDir || "")));
  if (!target || !root) {
    return false;
  }
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function findTaskAttachmentDirForDelete(userDataPath, task) {
  const taskId = String(task?.taskId || "").trim();
  const settings = readSettings(userDataPath);
  const rootDir = settings.rootDir;
  if (!rootDir) {
    return "";
  }
  const saved = path.normalize(String(task?.attachmentDir || "").trim());
  if (saved && fs.existsSync(saved) && isPathUnderRoot(saved, rootDir)) {
    const marker = readMarker(saved);
    if (!marker?.taskId || !taskId || marker.taskId === taskId) {
      return saved;
    }
  }
  if (!fs.existsSync(rootDir)) {
    return "";
  }
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    const dir = path.join(rootDir, ent.name);
    const marker = readMarker(dir);
    if (taskId && marker?.taskId === taskId) {
      return dir;
    }
  }
  return "";
}

function scanAttachmentTaskMarkers(userDataPath) {
  const settings = readSettings(userDataPath);
  const rootDir = String(settings.rootDir || "").trim();
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }
  const out = [];
  let entries = [];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const ent of entries) {
    if (!ent.isDirectory()) {
      continue;
    }
    const dir = path.join(rootDir, ent.name);
    const marker = readMarker(dir);
    if (!marker?.taskId) {
      continue;
    }
    out.push({
      taskId: String(marker.taskId || "").trim(),
      issueType: String(marker.issueType || "").trim(),
      createdAtIsoDate: String(marker.createdAtIsoDate || "").trim(),
      updatedAt: String(marker.updatedAt || "").trim(),
      attachmentDir: dir,
    });
  }
  return out;
}

function deleteTaskAttachmentDirectory(userDataPath, task) {
  const settings = readSettings(userDataPath);
  const rootDir = settings.rootDir;
  const dir = findTaskAttachmentDirForDelete(userDataPath, task);
  if (!dir) {
    return { ok: true, skipped: true, reason: "not_found" };
  }
  if (!rootDir || !isPathUnderRoot(dir, rootDir)) {
    return { ok: false, error: "附件目录不在允许的存储根路径下，已跳过删除" };
  }
  const marker = readMarker(dir);
  const taskId = String(task?.taskId || "").trim();
  if (marker?.taskId && taskId && marker.taskId !== taskId) {
    return { ok: false, error: "附件目录归属校验失败，已跳过删除" };
  }
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, deletedDir: dir };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
}

module.exports = {
  DEFAULT_ROOT_DIR,
  SETTINGS_FILENAME,
  readSettings,
  writeSettings,
  prepareTaskAttachmentDir,
  resolveTaskAttachmentDir,
  findTaskAttachmentDirForDelete,
  deleteTaskAttachmentDirectory,
  saveBufferFiles,
  copySourceFiles,
  listAttachmentFiles,
  fileToDataUrl,
  isImageFileName,
  buildFolderBaseName,
  scanAttachmentTaskMarkers,
};
