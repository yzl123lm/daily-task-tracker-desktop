const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "graphify-out"]);
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".html", ".css"]);

const PATTERNS = [
  { kind: "function", re: /(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g },
  { kind: "ipc", re: /ipcMain\.handle\(\s*["']([^"']+)["']/g },
  { kind: "dom", re: /document\.(?:getElementById|querySelector)\(\s*["']([^"']+)["']/g },
  { kind: "storage", re: /localStorage\.(?:getItem|setItem)\(\s*["']([^"']+)["']/g },
];

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
  return all;
}

function findSymbols(rootDir, query, { kind, limit = 40 } = {}) {
  const q = String(query || "").trim().toLowerCase();
  if (!q) {
    return [];
  }
  const index = buildIndex(rootDir);
  return index
    .filter((s) => {
      if (kind && s.kind !== kind) {
        return false;
      }
      return s.name.toLowerCase().includes(q) || s.path.toLowerCase().includes(q);
    })
    .slice(0, limit);
}

module.exports = {
  buildIndex,
  findSymbols,
};
