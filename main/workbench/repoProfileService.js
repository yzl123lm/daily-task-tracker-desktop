/**
 * BL-009 / CTX-001: RepoProfile — language, package manager, frameworks, verify, containers.
 */
const fs = require("fs");
const path = require("path");

function exists(root, rel) {
  try {
    return fs.existsSync(path.join(root, rel));
  } catch {
    return false;
  }
}

function readJson(root, rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
  } catch {
    return null;
  }
}

function detectPackageManager(root) {
  const evidence = [];
  if (exists(root, "pnpm-lock.yaml")) {
    evidence.push({ path: "pnpm-lock.yaml", kind: "lockfile" });
    return { id: "pnpm", confidence: 0.95, evidence };
  }
  if (exists(root, "yarn.lock")) {
    evidence.push({ path: "yarn.lock", kind: "lockfile" });
    return { id: "yarn", confidence: 0.95, evidence };
  }
  if (exists(root, "bun.lockb") || exists(root, "bun.lock")) {
    evidence.push({ path: exists(root, "bun.lockb") ? "bun.lockb" : "bun.lock", kind: "lockfile" });
    return { id: "bun", confidence: 0.9, evidence };
  }
  if (exists(root, "package-lock.json")) {
    evidence.push({ path: "package-lock.json", kind: "lockfile" });
    return { id: "npm", confidence: 0.9, evidence };
  }
  if (exists(root, "package.json")) {
    evidence.push({ path: "package.json", kind: "manifest" });
    return { id: "npm", confidence: 0.55, evidence };
  }
  return { id: null, confidence: 0, evidence: [] };
}

function detectPython(root) {
  const files = ["requirements.txt", "pyproject.toml", "Pipfile", "setup.py", "environment.yml"];
  const found = files.filter((f) => exists(root, f));
  if (!found.length) return null;
  return {
    id: "python",
    confidence: found.includes("pyproject.toml") ? 0.9 : 0.75,
    evidence: found.map((path) => ({ path, kind: "manifest" })),
    venvHint: exists(root, ".venv") ? ".venv" : exists(root, "venv") ? "venv" : null,
  };
}

function detectFrameworks(pkg, root) {
  const deps = {
    ...(pkg?.dependencies || {}),
    ...(pkg?.devDependencies || {}),
  };
  const frameworks = [];
  const push = (id, confidence, evidence) => frameworks.push({ id, confidence, evidence });
  if (deps.react || deps["react-dom"]) push("react", 0.9, ["package.json#dependencies.react"]);
  if (deps.vue) push("vue", 0.9, ["package.json#dependencies.vue"]);
  if (deps.next) push("next", 0.95, ["package.json#dependencies.next"]);
  if (deps.express) push("express", 0.85, ["package.json#dependencies.express"]);
  if (deps.electron) push("electron", 0.95, ["package.json#dependencies.electron"]);
  if (exists(root, "index.html") || exists(root, "public/index.html")) {
    push("static-web", 0.8, [exists(root, "index.html") ? "index.html" : "public/index.html"]);
  }
  return frameworks;
}

function detectCompose(root) {
  const candidates = [
    "docker-compose.yml",
    "docker-compose.yaml",
    "compose.yml",
    "compose.yaml",
  ];
  const found = candidates.filter((f) => exists(root, f));
  return {
    hasCompose: found.length > 0,
    files: found,
    hasDockerfile: exists(root, "Dockerfile") || exists(root, "dockerfile"),
    evidence: found.map((path) => ({ path, kind: "compose" })),
  };
}

function detectEntryPoints(root, pkg) {
  const candidates = [
    "index.html",
    "public/index.html",
    "src/index.html",
    "main.js",
    "app.js",
    "src/index.js",
    "src/main.js",
    "src/index.ts",
    "src/main.ts",
  ];
  const found = candidates.filter((f) => exists(root, f));
  if (pkg?.main && exists(root, pkg.main)) found.push(pkg.main);
  return [...new Set(found)];
}

function detectVerifyCandidates(pkg, packageManager) {
  const scripts = pkg?.scripts || {};
  const preferred = ["build", "test", "lint", "typecheck", "type-check", "check"];
  const pm = packageManager || "npm";
  return preferred
    .filter((n) => scripts[n])
    .map((n) => ({
      scriptName: n,
      profileId: n === "type-check" ? "typecheck" : n,
      command:
        pm === "pnpm"
          ? `pnpm run ${n}`
          : pm === "yarn"
            ? `yarn ${n}`
            : pm === "bun"
              ? `bun run ${n}`
              : `npm run ${n}`,
    }));
}

function classifyProjectType({ pkg, entryPoints, compose, python }) {
  if (compose.hasCompose) return "fullstack";
  if (pkg?.dependencies?.electron || pkg?.devDependencies?.electron) return "electron";
  if (pkg && (pkg.dependencies?.express || pkg.dependencies?.next)) return "node-web";
  if (pkg) return "node";
  if (entryPoints.some((e) => /\.html?$/i.test(e))) return "static-web";
  if (python) return "python";
  return "unknown";
}

function detectConflicts({ packageManager, root }) {
  const locks = [
    exists(root, "package-lock.json") && "package-lock.json",
    exists(root, "pnpm-lock.yaml") && "pnpm-lock.yaml",
    exists(root, "yarn.lock") && "yarn.lock",
    (exists(root, "bun.lockb") || exists(root, "bun.lock")) && "bun.lock*",
  ].filter(Boolean);
  const conflicts = [];
  if (locks.length > 1) {
    conflicts.push({
      type: "multiple_lockfiles",
      message: `检测到多个锁文件（${locks.join(", ")}），已优先选用 ${packageManager.id}`,
      evidence: locks,
    });
  }
  return conflicts;
}

/**
 * @param {string} rootDir
 * @returns {object} RepoProfile
 */
function detectRepoProfile(rootDir) {
  const root = path.resolve(String(rootDir || ""));
  const detectedAt = new Date().toISOString();
  if (!root || !fs.existsSync(root)) {
    return {
      version: 1,
      root: root || null,
      ok: false,
      error: "仓库目录不存在",
      detectedAt,
    };
  }

  const pkg = exists(root, "package.json") ? readJson(root, "package.json") : null;
  const packageManager = detectPackageManager(root);
  const python = detectPython(root);
  const languages = [];
  if (pkg) languages.push({ id: "javascript", confidence: 0.9, evidence: [{ path: "package.json" }] });
  if (exists(root, "tsconfig.json")) {
    languages.push({ id: "typescript", confidence: 0.95, evidence: [{ path: "tsconfig.json" }] });
  }
  if (python) languages.push({ id: "python", confidence: python.confidence, evidence: python.evidence });

  const frameworks = detectFrameworks(pkg, root);
  const compose = detectCompose(root);
  const entryPoints = detectEntryPoints(root, pkg);
  const verifyCandidates = detectVerifyCandidates(pkg, packageManager.id);
  const conflicts = detectConflicts({ packageManager, root });
  const projectType = classifyProjectType({ pkg, entryPoints, compose, python });

  const recommendedProfiles = [];
  if (verifyCandidates.some((c) => c.profileId === "build")) recommendedProfiles.push("build");
  if (verifyCandidates.some((c) => c.profileId === "test")) recommendedProfiles.push("test");
  if (projectType === "static-web" || entryPoints.some((e) => /\.html?$/i.test(e))) {
    recommendedProfiles.push("web-http-smoke");
    recommendedProfiles.push("static-smoke");
  }
  if (compose.hasCompose) recommendedProfiles.push("fullstack-smoke");
  if (!recommendedProfiles.length) recommendedProfiles.push("static-smoke");

  return {
    version: 1,
    ok: true,
    root,
    detectedAt,
    projectType,
    languages,
    packageManager,
    python,
    frameworks,
    buildSystem: pkg ? { id: "npm-scripts", scripts: Object.keys(pkg.scripts || {}) } : null,
    verifyCandidates,
    recommendedProfiles: [...new Set(recommendedProfiles)],
    entryPoints,
    containers: {
      hasDockerfile: compose.hasDockerfile,
      hasCompose: compose.hasCompose,
      composeFiles: compose.files,
    },
    conflicts,
    confidence: packageManager.confidence || (python ? python.confidence : 0.4),
  };
}

function formatRepoProfileForContext(profile, maxChars = 2400) {
  if (!profile?.ok) return String(profile?.error || "RepoProfile unavailable");
  const slim = {
    projectType: profile.projectType,
    packageManager: profile.packageManager?.id,
    languages: (profile.languages || []).map((l) => l.id),
    frameworks: (profile.frameworks || []).map((f) => f.id),
    entryPoints: profile.entryPoints,
    verifyCandidates: (profile.verifyCandidates || []).map((v) => v.scriptName),
    recommendedProfiles: profile.recommendedProfiles,
    containers: profile.containers,
    conflicts: profile.conflicts,
    confidence: profile.confidence,
  };
  const text = JSON.stringify(slim, null, 2);
  return text.length <= maxChars ? text : `${text.slice(0, maxChars)}\n…[truncated]`;
}

module.exports = {
  detectRepoProfile,
  formatRepoProfileForContext,
  detectPackageManager,
};
