const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "graphify-out"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css"]);

const PATTERNS = [
  { kind: "function", re: /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g },
  { kind: "ipc", re: /ipcMain\.(?:handle|on)\(\s*["']([^"']+)["']/g },
  { kind: "ipc_renderer", re: /ipcRenderer\.(?:invoke|send)\(\s*["']([^"']+)["']/g },
  { kind: "electron_api", re: /window\.electronAPI\.([A-Za-z_$][\w$]*)/g },
  { kind: "dom", re: /document\.(?:getElementById|querySelector(?:All)?)\(\s*["']([^"']+)["']/g },
  { kind: "css_class", re: /\.([A-Za-z_-][\w-]*)\s*\{/g },
  { kind: "storage", re: /localStorage\.(?:getItem|setItem|removeItem)\(\s*["']([^"']+)["']/g },
];

const indexCache = new Map();

function cacheEnabled() {
  return String(process.env.WB_SYMBOL_INDEX_CACHE || "1") !== "0";
}

function walkFiles(rootDir, relDir, out, depth = 0) {
  if (out.length >= 400 || depth > 6) {
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
        walkFiles(rootDir, rel, out, depth + 1);
      }
    } else if (ent.isFile() && TEXT_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push(rel.replace(/\\/g, "/"));
    }
  }
}

function fileFingerprint(rootDir, files) {
  let sum = 0;
  for (const rel of files) {
    try {
      const st = fs.statSync(path.join(rootDir, rel));
      sum += st.mtimeMs + st.size;
    } catch {
      sum += 1;
    }
  }
  return String(sum);
}

function indexFile(rootDir, relPath) {
  const abs = path.join(rootDir, relPath);
  let content = "";
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const symbols = [];
  const lines = content.split(/\r?\n/);
  for (const pat of PATTERNS) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      pat.re.lastIndex = 0;
      let m;
      while ((m = pat.re.exec(line)) !== null) {
        const name = m[1] || m[2] || m[0];
        symbols.push({
          name: String(name),
          kind: pat.kind,
          path: relPath,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return symbols;
}

function buildIndex(rootDir) {
  const files = [];
  walkFiles(rootDir, "", files);
  const all = [];
  for (const f of files) {
    all.push(...indexFile(rootDir, f));
  }
  return { files, all, fingerprint: fileFingerprint(rootDir, files) };
}

function getCachedIndex(rootDir) {
  const key = path.resolve(rootDir);
  if (!cacheEnabled()) {
    return buildIndex(key);
  }
  const files = [];
  walkFiles(key, "", files);
  const fp = fileFingerprint(key, files);
  const cached = indexCache.get(key);
  if (cached && cached.fingerprint === fp) {
    return cached;
  }
  const built = buildIndex(key);
  indexCache.set(key, built);
  return built;
}

function invalidateCache(rootDir) {
  indexCache.delete(path.resolve(rootDir));
}

function levenshtein(a, b) {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const dp = Array.from({ length: s.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= t.length; j += 1) {
    dp[0][j] = j;
  }
  for (let i = 1; i <= s.length; i += 1) {
    for (let j = 1; j <= t.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[s.length][t.length];
}

function fuzzyScore(query, symbol) {
  const q = query.toLowerCase();
  const name = symbol.name.toLowerCase();
  const file = symbol.path.toLowerCase();
  if (name.includes(q) || file.includes(q)) {
    return 100 - Math.min(name.indexOf(q), 20);
  }
  const fileBase = path.basename(file, path.extname(file));
  if (fileBase.includes(q)) {
    return 80;
  }
  const dist = levenshtein(q, name);
  return Math.max(0, 40 - dist);
}

function findSymbols(rootDir, query, { kind, limit = 40 } = {}) {
  const q = String(query || "").trim();
  if (!q) {
    return [];
  }
  const { all } = getCachedIndex(rootDir);
  return all
    .map((s) => ({ ...s, score: fuzzyScore(q, s) }))
    .filter((s) => {
      if (kind && s.kind !== kind) {
        return false;
      }
      return s.score > 0;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  buildIndex,
  findSymbols,
  invalidateCache,
  getCachedIndex,
};
