const path = require("path");
const fs = require("fs");

const SAFE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KB_LIBRARY_ID_RE = /^[\w\u4e00-\u9fa5][\w\u4e00-\u9fa5.-]{0,127}$/;

function assertHttpUrl(raw, label = "URL") {
  const url = String(raw || "").trim();
  if (!url) {
    throw new Error(`无效 ${label}`);
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`无效 ${label}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`仅允许 http/https ${label}`);
  }
  return url;
}

function assertNoNullByte(raw, label = "值") {
  const s = String(raw || "");
  if (s.includes("\0")) {
    throw new Error(`无效 ${label}`);
  }
  return s;
}

function assertSafeId(raw, label = "id") {
  const id = String(raw || "").trim();
  if (!id || !SAFE_ID_RE.test(id)) {
    throw new Error(`无效 ${label}`);
  }
  return id;
}

function assertUuid(raw, label = "id") {
  const id = String(raw || "").trim();
  if (!UUID_RE.test(id)) {
    throw new Error(`无效 ${label}`);
  }
  return id;
}

function assertKbLibraryId(raw, label = "知识库 id") {
  const id = assertNoNullByte(String(raw || "").trim(), label);
  if (!id || !KB_LIBRARY_ID_RE.test(id)) {
    throw new Error(`无效 ${label}`);
  }
  return id;
}

function assertAbsolutePath(raw, { mustExist = false, label = "路径" } = {}) {
  const p = assertNoNullByte(String(raw || "").trim(), label);
  if (!p) {
    throw new Error(`缺少 ${label}`);
  }
  if (!path.isAbsolute(p)) {
    throw new Error(`${label}必须是绝对路径`);
  }
  const normalized = path.normalize(p);
  if (normalized.includes("..")) {
    throw new Error(`无效 ${label}`);
  }
  if (mustExist && !fs.existsSync(normalized)) {
    throw new Error(`${label}不存在`);
  }
  if (mustExist) {
    try {
      const resolved = fs.realpathSync.native ? fs.realpathSync.native(normalized) : fs.realpathSync(normalized);
      return resolved;
    } catch {
      throw new Error(`无效 ${label}`);
    }
  }
  return normalized;
}

function assertPathUnderRoots(resolvedPath, allowedRoots, label = "路径") {
  const target = path.resolve(String(resolvedPath || ""));
  const roots = (Array.isArray(allowedRoots) ? allowedRoots : [])
    .map((r) => String(r || "").trim())
    .filter(Boolean);
  if (!roots.length) {
    return target;
  }
  const allowed = roots.some((root) => {
    let rootResolved = path.resolve(root);
    try {
      rootResolved = fs.realpathSync.native ? fs.realpathSync.native(rootResolved) : fs.realpathSync(rootResolved);
    } catch {
      /* use unresolved root */
    }
    const rel = path.relative(rootResolved, target);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  });
  if (!allowed) {
    throw new Error(`${label}不在允许访问的目录范围内`);
  }
  return target;
}

function assertAccessibleFilePath(raw, { allowedRoots, mustExist = true, label = "文件路径" } = {}) {
  const p = assertAbsolutePath(raw, { mustExist, label });
  return assertPathUnderRoots(p, allowedRoots, label);
}

function assertMaxBase64Size(base64, maxBytes, label = "文件内容") {
  const cleaned = String(base64 || "").replace(/\s/g, "");
  if (!cleaned) {
    throw new Error(`缺少 ${label}`);
  }
  const max = Number(maxBytes) || 0;
  if (max > 0) {
    const approxBytes = Math.floor((cleaned.length * 3) / 4);
    if (approxBytes > max) {
      throw new Error(`${label}过大（上限约 ${Math.round(max / (1024 * 1024))} MB）`);
    }
  }
  return cleaned;
}

function assertSafeExportBaseName(raw) {
  const name = String(raw || "").trim().slice(0, 120);
  if (!name || /[\\/:*?"<>|]/.test(name) || name.includes("..")) {
    throw new Error("无效导出文件名");
  }
  return name;
}

module.exports = {
  assertHttpUrl,
  assertSafeId,
  assertUuid,
  assertKbLibraryId,
  assertAbsolutePath,
  assertPathUnderRoots,
  assertAccessibleFilePath,
  assertMaxBase64Size,
  assertSafeExportBaseName,
};
