const fs = require("fs");
const path = require("path");
const { assertUnderRoot, normalizeRelPath, MAX_READ_BYTES } = require("./projectCodeService.js");
const { buildPatchPreview } = require("./diffPreviewService.js");
const { backupFileBeforeWrite, recordFileBackup } = require("./fileBackupService.js");
const { getDb } = require("./db.js");
const { resolveUserId } = require("./projectService.js");

const BLOCKED_WRITE_PATHS = [
  /^\.env/i,
  /^\.git\//,
  /credentials\.json$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
];

function assertWritablePath(relPath) {
  const rel = normalizeRelPath(relPath);
  if (BLOCKED_WRITE_PATHS.some((re) => re.test(rel))) {
    throw new Error(`禁止写入敏感路径: ${rel}`);
  }
  return rel;
}

function writeProjectFile(getUserDataPath, userId, rootDir, relPath, content, meta = {}) {
  const uid = resolveUserId(userId);
  const rel = assertWritablePath(relPath);
  const abs = assertUnderRoot(rootDir, path.join(rootDir, rel));
  const nextContent = String(content ?? "");
  if (Buffer.byteLength(nextContent, "utf8") > MAX_READ_BYTES) {
    throw new Error("写入内容过大（512KB 上限）");
  }
  let originalContent = "";
  if (fs.existsSync(abs)) {
    originalContent = fs.readFileSync(abs, "utf8");
  }
  const backup = backupFileBeforeWrite(getUserDataPath, {
    projectId: meta.projectId,
    taskId: meta.taskId,
    relPath: rel,
    absPath: abs,
  });
  const db = getDb(getUserDataPath);
  recordFileBackup(getUserDataPath, uid, db, {
    ...backup,
    projectId: meta.projectId,
    taskId: meta.taskId,
  });
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, nextContent, "utf8");
  const patch = buildPatchPreview({
    filePath: rel,
    originalContent,
    proposedContent: nextContent,
    summary: meta.summary || "用户确认后写入",
  });
  return {
    path: rel,
    backup,
    patch: { ...patch, writeApplied: true },
    bytesWritten: Buffer.byteLength(nextContent, "utf8"),
  };
}

module.exports = {
  writeProjectFile,
  assertWritablePath,
  BLOCKED_WRITE_PATHS,
};
