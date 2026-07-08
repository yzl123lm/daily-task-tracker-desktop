const fs = require("fs");
const path = require("path");

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function analyzeProjectStructure(rootDir) {
  const root = String(rootDir || "");
  const pkgPath = path.join(root, "package.json");
  const pkg = fs.existsSync(pkgPath) ? safeReadJson(pkgPath) : null;
  const scripts = pkg?.scripts ? Object.keys(pkg.scripts) : [];
  const entries = [];
  for (const candidate of ["index.html", "main.js", "app.js", "src/index.js", "src/main.js"]) {
    if (fs.existsSync(path.join(root, candidate))) {
      entries.push(candidate);
    }
  }
  const workbenchDirs = [];
  for (const candidate of ["app/workbench", "main/workbench"]) {
    if (fs.existsSync(path.join(root, candidate))) {
      workbenchDirs.push(candidate);
    }
  }
  return {
    hasPackageJson: Boolean(pkg),
    name: pkg?.name || null,
    scripts,
    entryPoints: entries,
    workbenchDirs,
    projectType: pkg?.main ? "node" : entries.includes("index.html") ? "web" : "unknown",
  };
}

module.exports = {
  analyzeProjectStructure,
};
