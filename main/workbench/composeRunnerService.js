/**
 * BL-012 / TOOL-005: Docker Compose up/down with task-scoped project name and cleanup.
 */
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { dockerAvailable, runInSandbox } = require("./sandbox/index.js");
const { detectRepoProfile } = require("./repoProfileService.js");

const _sessions = new Map(); // key: taskId -> { projectName, cwd, composeFile, startedAt }

function composeFileFor(root) {
  const profile = detectRepoProfile(root);
  const file = profile.containers?.composeFiles?.[0] || null;
  return file;
}

function sanitizeProjectName(taskId) {
  const raw = String(taskId || "task")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
  return `wb${raw || "task"}`;
}

function resolveComposeArgv(root, { file, projectName, action, extraArgs = [] }) {
  const composeFile = file || composeFileFor(root);
  if (!composeFile) {
    const err = new Error("未找到 docker-compose / compose 文件");
    err.code = "COMPOSE_NOT_FOUND";
    throw err;
  }
  const base = ["docker", "compose", "-p", projectName, "-f", composeFile];
  if (action === "up") {
    return [...base, "up", "-d", "--remove-orphans", ...extraArgs];
  }
  if (action === "down") {
    return [...base, "down", "--remove-orphans", ...extraArgs];
  }
  if (action === "ps") {
    return [...base, "ps"];
  }
  const err = new Error(`未知 compose action: ${action}`);
  err.code = "COMPOSE_ACTION";
  throw err;
}

async function composeUp(root, { taskId, userApproved = false, timeoutMs = 300000, file } = {}) {
  if (!userApproved) {
    const err = new Error("Compose up 需要用户授权");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  if (!dockerAvailable()) {
    return {
      ok: false,
      skipped: true,
      code: "DOCKER_UNAVAILABLE",
      message: "本机未检测到 Docker，已跳过 compose up",
    };
  }
  const projectName = sanitizeProjectName(taskId);
  const argv = resolveComposeArgv(root, { file, projectName, action: "up" });
  // Compose needs network to pull images when missing — use allowlist-friendly allow for docker CLI host
  const result = await runInSandbox({
    argv,
    cwd: root,
    network: "allow",
    timeoutMs,
  });
  const ok = result.exitCode === 0;
  if (ok) {
    _sessions.set(String(taskId || projectName), {
      projectName,
      cwd: path.resolve(root),
      composeFile: file || composeFileFor(root),
      startedAt: new Date().toISOString(),
    });
  }
  return {
    ok,
    skipped: false,
    projectName,
    argv,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    message: ok ? `Compose 已启动（project=${projectName}）` : `Compose up 失败 exit=${result.exitCode}`,
    evidence: [
      {
        type: "compose_up",
        projectName,
        exitCode: result.exitCode,
        at: new Date().toISOString(),
      },
    ],
  };
}

async function composeDown(root, { taskId, userApproved = true, timeoutMs = 120000, file, volumes = false } = {}) {
  if (!dockerAvailable()) {
    _sessions.delete(String(taskId || ""));
    return { ok: true, skipped: true, message: "Docker 不可用，跳过 compose down" };
  }
  const session = _sessions.get(String(taskId || ""));
  const projectName = session?.projectName || sanitizeProjectName(taskId);
  const cwd = root || session?.cwd;
  if (!cwd || !fs.existsSync(cwd)) {
    _sessions.delete(String(taskId || ""));
    return { ok: true, skipped: true, message: "无工作区，跳过 compose down" };
  }
  const extra = volumes ? ["-v"] : [];
  const argv = resolveComposeArgv(cwd, {
    file: file || session?.composeFile,
    projectName,
    action: "down",
    extraArgs: extra,
  });
  const result = await runInSandbox({
    argv,
    cwd,
    network: "allow",
    timeoutMs,
  });
  _sessions.delete(String(taskId || ""));
  return {
    ok: result.exitCode === 0,
    skipped: false,
    projectName,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.exitCode === 0 ? `Compose 已清理（project=${projectName}）` : `Compose down 失败`,
    evidence: [
      {
        type: "compose_down",
        projectName,
        exitCode: result.exitCode,
        at: new Date().toISOString(),
      },
    ],
  };
}

async function cleanupTaskCompose(taskId) {
  const session = _sessions.get(String(taskId || ""));
  if (!session) return { ok: true, skipped: true, message: "无 compose 会话" };
  return composeDown(session.cwd, { taskId, userApproved: true, file: session.composeFile });
}

function listComposeSessions() {
  return [..._sessions.entries()].map(([taskId, s]) => ({ taskId, ...s }));
}

function _resetComposeSessionsForTests() {
  _sessions.clear();
}

/**
 * Lightweight docker build with resource hints (no host sensitive mounts beyond cwd).
 */
async function dockerBuild(root, { tag = "wb-task:local", userApproved = false, timeoutMs = 600000 } = {}) {
  if (!userApproved) {
    const err = new Error("docker build 需要用户授权");
    err.code = "USER_APPROVAL_REQUIRED";
    throw err;
  }
  if (!dockerAvailable()) {
    return { ok: false, skipped: true, code: "DOCKER_UNAVAILABLE", message: "Docker 不可用" };
  }
  if (!fs.existsSync(path.join(root, "Dockerfile")) && !fs.existsSync(path.join(root, "dockerfile"))) {
    return { ok: false, skipped: false, code: "DOCKERFILE_MISSING", message: "缺少 Dockerfile" };
  }
  const argv = [
    "docker",
    "build",
    "--network",
    "default",
    "-t",
    tag,
    ".",
  ];
  const result = await runInSandbox({ argv, cwd: root, network: "allow", timeoutMs });
  return {
    ok: result.exitCode === 0,
    tag,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    message: result.exitCode === 0 ? `镜像已构建 ${tag}` : "docker build 失败",
  };
}

function probeDocker() {
  if (!dockerAvailable()) return { ok: false, available: false };
  const r = spawnSync("docker", ["info", "--format", "{{.ServerVersion}}"], {
    encoding: "utf8",
    timeout: 8000,
    windowsHide: true,
  });
  return { ok: r.status === 0, available: true, version: String(r.stdout || "").trim() };
}

module.exports = {
  composeFileFor,
  sanitizeProjectName,
  composeUp,
  composeDown,
  cleanupTaskCompose,
  listComposeSessions,
  dockerBuild,
  probeDocker,
  _resetComposeSessionsForTests,
};
