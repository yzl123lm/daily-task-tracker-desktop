const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const VALID_ARCHIVE_POLICIES = new Set(["always", "ask", "never", "watch-ref-only"]);

function normalizeArchivePolicy(value) {
  const p = String(value || "ask").trim().toLowerCase();
  return VALID_ARCHIVE_POLICIES.has(p) ? p : "ask";
}

function shouldArchiveOnIngest(archivePolicy, options = {}) {
  const policy = normalizeArchivePolicy(archivePolicy);
  if (policy === "never") {
    return false;
  }
  if (policy === "watch-ref-only" && options.fromWatch) {
    return false;
  }
  if (policy === "ask" && options.fromWatch) {
    return false;
  }
  return true;
}

function archiveDirForDoc(libraryDir, docId) {
  return path.join(String(libraryDir || ""), "archives", String(docId || ""));
}

function archiveFilePath(libraryDir, docId, sourcePath) {
  const ext = path.extname(String(sourcePath || "")).toLowerCase() || ".bin";
  return path.join(archiveDirForDoc(libraryDir, docId), `original${ext}`);
}

function sharedArchiveByMd5Path(libraryDir, fileMd5, sourcePath) {
  const ext = path.extname(String(sourcePath || "")).toLowerCase() || ".bin";
  return path.join(String(libraryDir || ""), "archives", "_by-md5", `${String(fileMd5 || "").slice(0, 32)}${ext}`);
}

function copyFileSafe(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function findExistingArchiveByMd5(documents, fileMd5, excludeDocId = "") {
  const md5 = String(fileMd5 || "").trim();
  if (!md5) {
    return null;
  }
  return (documents || []).find(
    (d) =>
      String(d?.id || "") !== String(excludeDocId || "") &&
      String(d?.archiveMd5 || d?.fileMd5 || "") === md5 &&
      String(d?.archivedPath || "").trim() &&
      fs.existsSync(String(d.archivedPath))
  );
}

function archiveSourceFile(libraryDir, docId, sourcePath, fileMd5, existingDocuments = []) {
  const fp = String(sourcePath || "").trim();
  if (!fp || !fs.existsSync(fp)) {
    return { ok: false, error: "源文件不存在，无法归档" };
  }
  const md5 = String(fileMd5 || "").trim();
  const reused = findExistingArchiveByMd5(existingDocuments, md5, docId);
  if (reused?.archivedPath) {
    return {
      ok: true,
      archivedPath: reused.archivedPath,
      archiveMd5: md5,
      archiveStatus: "dedup",
      reusedFromDocId: reused.id,
    };
  }
  const sharedPath = sharedArchiveByMd5Path(libraryDir, md5, fp);
  let archivedPath = sharedPath;
  if (!fs.existsSync(sharedPath)) {
    try {
      copyFileSafe(fp, sharedPath);
    } catch (err) {
      archivedPath = archiveFilePath(libraryDir, docId, fp);
      copyFileSafe(fp, archivedPath);
    }
  }
  return {
    ok: true,
    archivedPath,
    archiveMd5: md5,
    archiveStatus: "archived",
  };
}

function resolveReadableDocumentPath(doc) {
  const source = String(doc?.sourcePath || "").trim();
  if (source && source !== "ai://" && fs.existsSync(source)) {
    return { path: source, kind: "source" };
  }
  const archived = String(doc?.archivedPath || "").trim();
  if (archived && fs.existsSync(archived)) {
    return { path: archived, kind: "archive" };
  }
  const relink = String(doc?.relinkPath || "").trim();
  if (relink && fs.existsSync(relink)) {
    return { path: relink, kind: "relink" };
  }
  return { path: "", kind: "missing" };
}

function listArchiveStorageSummary(libraryDir) {
  const root = path.join(String(libraryDir || ""), "archives");
  if (!fs.existsSync(root)) {
    return { bytes: 0, files: 0 };
  }
  let bytes = 0;
  let files = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const fp = path.join(dir, name);
      const st = fs.statSync(fp);
      if (st.isDirectory()) {
        walk(fp);
      } else {
        files += 1;
        bytes += st.size;
      }
    }
  };
  walk(root);
  return { bytes, files };
}

module.exports = {
  VALID_ARCHIVE_POLICIES,
  normalizeArchivePolicy,
  shouldArchiveOnIngest,
  archiveDirForDoc,
  archiveFilePath,
  archiveSourceFile,
  resolveReadableDocumentPath,
  listArchiveStorageSummary,
};
