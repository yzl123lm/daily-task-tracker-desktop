/**
 * Static-web smoke verification (BL-003): real evidence instead of "skipped = pass".
 * Checks that the project root has loadable entry artifacts.
 */
const fs = require("fs");
const path = require("path");

const ENTRY_CANDIDATES = [
  "index.html",
  "src/index.html",
  "public/index.html",
  "app.html",
  "main.js",
  "src/main.js",
  "index.js",
  "src/index.js",
  "app.js",
  "src/app.js",
];

function fileExists(root, rel) {
  try {
    return fs.existsSync(path.join(root, rel)) && fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

function runStaticSmokeVerification(root) {
  if (!root || !fs.existsSync(root)) {
    return {
      ok: false,
      skipped: false,
      profileId: "static-smoke",
      scriptName: "static-smoke",
      message: "项目目录不存在，无法执行静态冒烟",
      evidence: [],
    };
  }
  const found = ENTRY_CANDIDATES.filter((rel) => fileExists(root, rel));
  const evidence = found.map((rel) => ({
    type: "file_exists",
    path: rel,
    at: new Date().toISOString(),
  }));
  if (!found.length) {
    // Soft scan: any .html under root (depth 2)
    const htmlFiles = [];
    try {
      for (const name of fs.readdirSync(root)) {
        if (name.startsWith(".") || name === "node_modules") continue;
        const full = path.join(root, name);
        let st;
        try {
          st = fs.statSync(full);
        } catch {
          continue;
        }
        if (st.isFile() && /\.html?$/i.test(name)) {
          htmlFiles.push(name);
        } else if (st.isDirectory()) {
          try {
            for (const child of fs.readdirSync(full).slice(0, 40)) {
              if (/\.html?$/i.test(child) && fs.statSync(path.join(full, child)).isFile()) {
                htmlFiles.push(`${name}/${child}`);
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
    if (htmlFiles.length) {
      return {
        ok: true,
        skipped: false,
        profileId: "static-smoke",
        scriptName: "static-smoke",
        message: `静态冒烟通过：发现 ${htmlFiles.length} 个 HTML 入口`,
        evidence: htmlFiles.slice(0, 10).map((rel) => ({
          type: "file_exists",
          path: rel,
          at: new Date().toISOString(),
        })),
      };
    }
    return {
      ok: false,
      skipped: false,
      profileId: "static-smoke",
      scriptName: "static-smoke",
      message: "无 npm 验证脚本，且未发现可验收的入口文件（index.html / main.js 等）",
      evidence: [],
    };
  }
  return {
    ok: true,
    skipped: false,
    profileId: "static-smoke",
    scriptName: "static-smoke",
    message: `静态冒烟通过：${found.join(", ")}`,
    evidence,
  };
}

module.exports = {
  runStaticSmokeVerification,
  ENTRY_CANDIDATES,
};
