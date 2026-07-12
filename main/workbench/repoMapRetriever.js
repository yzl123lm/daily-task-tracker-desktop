/**
 * BL-016 / CTX-002~004: Repo Map + hybrid retrieval (symbol + keyword + path + refs).
 */
const fs = require("fs");
const path = require("path");
const symbolIndexService = require("./symbolIndexService.js");
const projectCodeService = require("./projectCodeService.js");
const { detectRepoProfile } = require("./repoProfileService.js");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "graphify-out",
  ".next",
  "out",
]);
const GENERATED_HINTS = [/dist\//i, /build\//i, /\.min\./i, /vendor\//i, /generated\//i];
const FORBIDDEN_HINTS = [
  /^\.env/i,
  /secrets?\./i,
  /credentials/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
];

function walkDirs(root, rel, out, depth = 0) {
  if (depth > 4 || out.length >= 80) return;
  const abs = path.join(root, rel);
  let entries = [];
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return;
  }
  const files = [];
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.name !== ".cursor" && ent.name !== ".github") continue;
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      out.push({ path: child.replace(/\\/g, "/"), kind: "dir" });
      walkDirs(root, child, out, depth + 1);
    } else if (ent.isFile()) {
      files.push(ent.name);
    }
  }
  if (rel && files.length) {
    const dir = out.find((d) => d.path === rel.replace(/\\/g, "/"));
    if (dir) dir.sampleFiles = files.slice(0, 8);
  }
}

function inferDirRole(dirPath) {
  const p = String(dirPath || "").toLowerCase();
  if (!p || p === ".") return "root";
  if (/^src(\/|$)/.test(p) || /\/src(\/|$)/.test(p)) return "source";
  if (/^test|tests|__tests__|spec/.test(p)) return "tests";
  if (/^docs?(\/|$)/.test(p)) return "docs";
  if (/^scripts?(\/|$)/.test(p)) return "scripts";
  if (/^config(\/|$)/.test(p)) return "config";
  if (/^app(\/|$)/.test(p)) return "app";
  if (/^main(\/|$)/.test(p)) return "main";
  if (/^public(\/|$)/.test(p) || /^assets(\/|$)/.test(p)) return "static";
  return "module";
}

function extractImportRefs(rootDir, limit = 200) {
  const index = symbolIndexService.getCachedIndex(rootDir);
  const refs = [];
  const re = /(?:require\(|from\s+|import\s+(?:[^'"]+\s+from\s+)?)['"]([^'"]+)['"]/g;
  for (const file of (index.files || []).slice(0, 120)) {
    let content = "";
    try {
      content = fs.readFileSync(path.join(rootDir, file), "utf8");
    } catch {
      continue;
    }
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) {
      const target = m[1];
      if (!target || target.startsWith("node:") || (!target.startsWith(".") && !target.startsWith("/"))) {
        // external package — still record lightly
        refs.push({ from: file, to: target, kind: "package" });
      } else {
        refs.push({ from: file, to: target, kind: "relative" });
      }
      if (refs.length >= limit) return refs;
    }
  }
  return refs;
}

/**
 * Build incremental-friendly Repo Map snapshot.
 */
function buildRepoMap(rootDir) {
  const root = path.resolve(String(rootDir || ""));
  if (!root || !fs.existsSync(root)) {
    return { ok: false, error: "root missing", version: 1 };
  }
  const profile = detectRepoProfile(root);
  const dirs = [];
  walkDirs(root, "", dirs);
  const directoryRoles = dirs
    .filter((d) => d.kind === "dir")
    .slice(0, 60)
    .map((d) => ({
      path: d.path,
      role: inferDirRole(d.path),
      sampleFiles: d.sampleFiles || [],
    }));

  const index = symbolIndexService.getCachedIndex(root);
  const keyModules = (index.all || [])
    .filter((s) => s.kind === "function" || s.kind === "ipc")
    .slice(0, 40)
    .map((s) => ({ name: s.name, kind: s.kind, path: s.path, line: s.line }));

  const generatedFiles = (index.files || []).filter((f) => GENERATED_HINTS.some((re) => re.test(f)));
  const forbiddenEdit = (index.files || []).filter((f) => FORBIDDEN_HINTS.some((re) => re.test(f)));

  const refs = extractImportRefs(root);
  const callEdges = refs.filter((r) => r.kind === "relative").slice(0, 80);

  return {
    ok: true,
    version: 1,
    root,
    projectType: profile.projectType,
    entryPoints: profile.entryPoints || [],
    directories: directoryRoles,
    keyModules,
    configFiles: (index.files || []).filter((f) =>
      /(^|\/)(package\.json|tsconfig|webpack|vite\.config|docker-compose|\.env\.example)/i.test(f)
    ),
    generatedFiles: generatedFiles.slice(0, 40),
    forbiddenEditRegions: forbiddenEdit.slice(0, 40),
    referenceEdges: callEdges,
    symbolCount: (index.all || []).length,
    fileCount: (index.files || []).length,
    builtAt: new Date().toISOString(),
  };
}

function scoreHit({ source, baseScore, pathBoost, reason }) {
  return {
    score: baseScore + pathBoost,
    source,
    reason,
  };
}

/**
 * Hybrid retrieval: keyword search + symbols + path match + import refs.
 */
function retrieveRepoContext({ root, message, limit = 12 } = {}) {
  const q = String(message || "").trim();
  const hits = new Map(); // path -> aggregate

  const bump = (filePath, meta) => {
    const key = String(filePath || "").replace(/\\/g, "/");
    if (!key) return;
    const prev = hits.get(key) || { path: key, score: 0, reasons: [], lines: [] };
    prev.score += meta.score;
    prev.reasons.push(meta.reason);
    if (meta.line) prev.lines.push(meta.line);
    hits.set(key, prev);
  };

  // symbols
  const symbols = symbolIndexService.findSymbols(root, q, { limit: 20 });
  for (const s of symbols) {
    bump(s.path, scoreHit({ source: "symbol", baseScore: s.score || 5, pathBoost: 2, reason: `symbol:${s.kind}:${s.name}` }));
    if (s.line) hits.get(s.path).lines.push(s.line);
  }

  // keyword search
  const searchHits = projectCodeService.searchProjectCode(root, q).slice(0, 20);
  for (let i = 0; i < searchHits.length; i += 1) {
    const h = searchHits[i];
    bump(h.path, scoreHit({
      source: "keyword",
      baseScore: Math.max(1, 15 - i),
      pathBoost: 0,
      reason: `keyword:L${h.line || "?"}`,
    }));
  }

  // path basename match
  try {
    const index = symbolIndexService.getCachedIndex(root);
    const tokens = q.toLowerCase().split(/[^\w.-]+/).filter((t) => t.length > 2);
    for (const f of index.files || []) {
      const base = f.split("/").pop().toLowerCase();
      if (tokens.some((t) => base.includes(t))) {
        bump(f, scoreHit({ source: "path", baseScore: 8, pathBoost: 3, reason: `path:${base}` }));
      }
    }
  } catch {
    /* ignore */
  }

  // import refs involving query tokens
  try {
    const refs = extractImportRefs(root, 100);
    const tokens = q.toLowerCase().split(/[^\w.-]+/).filter((t) => t.length > 2);
    for (const r of refs) {
      if (tokens.some((t) => r.to.toLowerCase().includes(t) || r.from.toLowerCase().includes(t))) {
        bump(r.from, scoreHit({ source: "ref", baseScore: 4, pathBoost: 1, reason: `import→${r.to}` }));
      }
    }
  } catch {
    /* ignore */
  }

  const ranked = [...hits.values()]
    .map((h) => ({
      ...h,
      lines: [...new Set(h.lines)].slice(0, 5),
      reasons: [...new Set(h.reasons)].slice(0, 6),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return {
    ok: true,
    query: q,
    hits: ranked,
    sources: ["symbol", "keyword", "path", "ref"],
  };
}

function formatRepoMapForContext(repoMap, maxChars = 2200) {
  if (!repoMap?.ok) return "";
  const slim = {
    projectType: repoMap.projectType,
    entryPoints: repoMap.entryPoints,
    directories: (repoMap.directories || []).slice(0, 20).map((d) => `${d.path}:${d.role}`),
    keyModules: (repoMap.keyModules || []).slice(0, 15),
    forbiddenEditRegions: repoMap.forbiddenEditRegions,
    generatedFiles: (repoMap.generatedFiles || []).slice(0, 10),
    referenceEdges: (repoMap.referenceEdges || []).slice(0, 15),
  };
  const text = JSON.stringify(slim, null, 2);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated]`;
}

module.exports = {
  buildRepoMap,
  retrieveRepoContext,
  formatRepoMapForContext,
  extractImportRefs,
  inferDirRole,
};
