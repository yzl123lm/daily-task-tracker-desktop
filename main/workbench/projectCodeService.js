const path = require("path");
const fs = require("fs");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "dist_build_20260630-113341",
  "最新客户端",
  ".cursor",
  "graphify-out",
]);
const TEXT_EXT = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".html",
  ".css",
  ".md",
  ".json",
  ".sql",
  ".txt",
]);
const MAX_READ_BYTES = 512 * 1024;
const MAX_TREE_ENTRIES = 600;
const MAX_SEARCH_RESULTS = 40;

function normalizeRelPath(rel) {
  const p = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!p || p.includes("..")) {
    throw new Error("无效相对路径");
  }
  return p;
}

function resolveProjectRoot(project, getDefaultProjectRoot) {
  return getProjectCodeRoot(project, getDefaultProjectRoot).root;
}

function getProjectCodeRoot(project, getDefaultProjectRoot) {
  const local = String(project?.localPath || project?.local_path || "").trim();
  if (!local) {
    let fallbackRoot = null;
    if (typeof getDefaultProjectRoot === "function") {
      const fallback = getDefaultProjectRoot();
      if (fallback && fs.existsSync(fallback)) {
        fallbackRoot = path.resolve(fallback);
      }
    }
    const isAsar = Boolean(fallbackRoot && /app\.asar/i.test(fallbackRoot));
    return {
      root: fallbackRoot,
      localPath: null,
      source: "fallback",
      valid: false,
      isFallback: true,
      isAsar,
      reason: "PROJECT_PATH_MISSING",
    };
  }
  if (!fs.existsSync(local)) {
    return {
      root: null,
      localPath: local,
      source: "project.local_path",
      valid: false,
      isFallback: false,
      isAsar: false,
      reason: "PROJECT_PATH_NOT_FOUND",
    };
  }
  const root = path.resolve(local);
  const isAsar = /app\.asar/i.test(root);
  return {
    root: isAsar ? null : root,
    localPath: local,
    source: "project.local_path",
    valid: !isAsar,
    isFallback: false,
    isAsar,
    reason: isAsar ? "PROJECT_PATH_IS_APP_ASAR" : null,
  };
}

function assertUnderRoot(rootDir, targetPath) {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("路径超出项目根目录");
  }
  return target;
}

function listTreeEntries(rootDir, relDir = "", depth = 0, acc = []) {
  if (acc.length >= MAX_TREE_ENTRIES || depth > 5) {
    return acc;
  }
  const abs = path.join(rootDir, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return acc;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    if (acc.length >= MAX_TREE_ENTRIES) {
      break;
    }
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) {
        continue;
      }
      acc.push({ path: rel.replace(/\\/g, "/"), type: "dir" });
      listTreeEntries(rootDir, rel, depth + 1, acc);
    } else if (ent.isFile()) {
      acc.push({ path: rel.replace(/\\/g, "/"), type: "file" });
    }
  }
  return acc;
}

function readProjectFile(rootDir, relPath) {
  const rel = normalizeRelPath(relPath);
  const abs = assertUnderRoot(rootDir, path.join(rootDir, rel));
  const stat = fs.statSync(abs);
  if (!stat.isFile()) {
    throw new Error("不是文件");
  }
  if (stat.size > MAX_READ_BYTES) {
    throw new Error("文件过大，仅支持只读预览 512KB 以内");
  }
  const ext = path.extname(abs).toLowerCase();
  if (!TEXT_EXT.has(ext)) {
    throw new Error("仅支持文本类文件预览");
  }
  const content = fs.readFileSync(abs, "utf8");
  return {
    path: rel,
    content,
    size: stat.size,
    lines: content.split(/\r?\n/).length,
  };
}

function walkSearchFiles(rootDir, relDir, out) {
  if (out.length >= MAX_SEARCH_RESULTS * 3) {
    return;
  }
  const abs = path.join(rootDir, relDir);
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (!SKIP_DIRS.has(ent.name)) {
        walkSearchFiles(rootDir, rel, out);
      }
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (TEXT_EXT.has(ext)) {
        out.push(rel.replace(/\\/g, "/"));
      }
    }
  }
}

function searchProjectCode(rootDir, query) {
  const q = String(query || "").trim().toLowerCase();
  if (!q || q.length < 2) {
    return [];
  }
  const candidates = [];
  walkSearchFiles(rootDir, "", candidates);
  const results = [];
  for (const rel of candidates) {
    if (results.length >= MAX_SEARCH_RESULTS) {
      break;
    }
    try {
      const file = readProjectFile(rootDir, rel);
      const lower = file.content.toLowerCase();
      const idx = lower.indexOf(q);
      if (idx < 0) {
        continue;
      }
      const lineNo = file.content.slice(0, idx).split(/\r?\n/).length;
      const lines = file.content.split(/\r?\n/);
      const snippet = lines.slice(Math.max(0, lineNo - 2), lineNo + 2).join("\n");
      results.push({
        path: rel,
        line: lineNo,
        snippet: snippet.slice(0, 400),
      });
    } catch {
      /* skip unreadable */
    }
  }
  return results;
}

function extractSearchTerms(message) {
  const text = String(message || "");
  const terms = [];
  const quoted = text.match(/[`'"]([^`'"]{2,40})[`'"]/g);
  if (quoted) {
    quoted.forEach((q) => {
      const inner = q.replace(/^[`'"]|[`'"]$/g, "").trim();
      if (inner.length >= 2) {
        terms.push(inner);
      }
    });
  }
  const words = text.match(/[\u4e00-\u9fffA-Za-z_][\u4e00-\u9fffA-Za-z0-9_.-]{2,}/g) || [];
  words.forEach((w) => {
    if (!/^(the|and|for|with|实现|增加|优化)$/i.test(w)) {
      terms.push(w);
    }
  });
  return [...new Set(terms)].slice(0, 6);
}

function analyzeProjectCode(project, message, getDefaultProjectRoot) {
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    return {
      codeRoot: null,
      relevantFiles: [],
      codeSnippets: [],
      searchHits: [],
    };
  }
  const terms = extractSearchTerms(message);
  const searchHits = [];
  for (const term of terms) {
    const hits = searchProjectCode(root, term);
    hits.forEach((hit) => {
      if (!searchHits.some((h) => h.path === hit.path && h.line === hit.line)) {
        searchHits.push(hit);
      }
    });
    if (searchHits.length >= MAX_SEARCH_RESULTS) {
      break;
    }
  }
  const relevantFiles = [];
  const codeSnippets = [];
  for (const hit of searchHits.slice(0, 5)) {
    try {
      const file = readProjectFile(root, hit.path);
      relevantFiles.push(hit.path);
      codeSnippets.push({
        path: hit.path,
        line: hit.line,
        snippet: file.content.slice(0, 900),
        lines: file.lines,
      });
    } catch {
      /* skip */
    }
  }
  return {
    codeRoot: root,
    relevantFiles: [...new Set(relevantFiles)],
    codeSnippets,
    searchHits: searchHits.slice(0, MAX_SEARCH_RESULTS),
  };
}

module.exports = {
  resolveProjectRoot,
  getProjectCodeRoot,
  listTreeEntries,
  readProjectFile,
  searchProjectCode,
  analyzeProjectCode,
  extractSearchTerms,
  assertUnderRoot,
  normalizeRelPath,
  MAX_READ_BYTES,
};
