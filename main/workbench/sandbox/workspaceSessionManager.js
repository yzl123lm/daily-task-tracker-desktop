/**
 * Ephemeral workspace sessions — isolate task execution from host extras.
 * BL-005 / SEC-001
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

/** @type {Map<string, object>} */
const sessions = new Map();

function sandboxMode() {
  const m = String(process.env.WB_SANDBOX_MODE || "local-jailed").toLowerCase();
  if (m === "off" || m === "host") return "host";
  if (m === "docker") return "docker";
  return "local-jailed";
}

function createWorkspaceSession({
  projectId,
  taskId,
  sourceRoot,
  getUserDataPath,
} = {}) {
  const id = `ws_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  const base =
    typeof getUserDataPath === "function"
      ? path.join(getUserDataPath(), "sandbox-workspaces")
      : path.join(os.tmpdir(), "wb-sandbox-workspaces");
  fs.mkdirSync(base, { recursive: true });
  const root = path.join(base, id);
  fs.mkdirSync(root, { recursive: true });

  let importMode = "empty";
  if (sourceRoot && fs.existsSync(sourceRoot)) {
    // Shallow copy without node_modules/.git for isolation (link strategy for speed)
    importMode = copyTreeShallow(sourceRoot, root);
  }

  const session = {
    id,
    projectId: projectId || null,
    taskId: taskId || null,
    root,
    sourceRoot: sourceRoot || null,
    importMode,
    mode: sandboxMode(),
    createdAt: new Date().toISOString(),
    destroyed: false,
  };
  sessions.set(id, session);
  return { ...session };
}

function copyTreeShallow(src, dest, { depth = 0, maxDepth = 6 } = {}) {
  const skip = new Set(["node_modules", ".git", "dist", "最新客户端", "graphify-out", ".venv"]);
  let files = 0;
  function walk(from, to, d) {
    if (d > maxDepth) return;
    fs.mkdirSync(to, { recursive: true });
    let entries = [];
    try {
      entries = fs.readdirSync(from, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skip.has(ent.name) || ent.name.startsWith(".asar")) continue;
      const a = path.join(from, ent.name);
      const b = path.join(to, ent.name);
      if (ent.isDirectory()) {
        walk(a, b, d + 1);
      } else if (ent.isFile()) {
        try {
          const st = fs.statSync(a);
          if (st.size > 2_000_000) continue;
          fs.copyFileSync(a, b);
          files += 1;
        } catch {
          /* skip */
        }
      }
    }
  }
  walk(src, dest, depth);
  return files > 0 ? "copy" : "empty";
}

function getWorkspaceSession(id) {
  const s = sessions.get(String(id || ""));
  if (!s || s.destroyed) return null;
  return { ...s };
}

function destroyWorkspaceSession(id) {
  const s = sessions.get(String(id || ""));
  if (!s) return { ok: false };
  s.destroyed = true;
  sessions.delete(s.id);
  try {
    fs.rmSync(s.root, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  return { ok: true, id: s.id };
}

function assertPathInsideSession(session, targetPath) {
  const root = path.resolve(session.root);
  const target = path.resolve(targetPath);
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("路径越出沙箱工作区");
    err.code = "SANDBOX_PATH_ESCAPE";
    throw err;
  }
  return target;
}

function _resetSessionsForTests() {
  for (const id of [...sessions.keys()]) {
    destroyWorkspaceSession(id);
  }
}

module.exports = {
  sandboxMode,
  createWorkspaceSession,
  getWorkspaceSession,
  destroyWorkspaceSession,
  assertPathInsideSession,
  copyTreeShallow,
  _resetSessionsForTests,
};
