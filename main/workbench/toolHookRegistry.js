/**
 * BL-021 / SEC-012: Strategy hooks — preToolUse, postToolUse, permissionRequest, agentStop.
 * Timeout / exception → fail-closed (deny). Decisions recorded for trace.
 */
const HOOK_PHASES = Object.freeze([
  "preToolUse",
  "postToolUse",
  "permissionRequest",
  "agentStop",
]);

const DEFAULT_TIMEOUT_MS = Number(process.env.WB_HOOK_TIMEOUT_MS || 2000);

/** @type {Map<string, Array<{ id: string, version: string, fn: Function, source: string }>>} */
const hooksByPhase = new Map(HOOK_PHASES.map((p) => [p, []]));

function hooksEnabled() {
  return String(process.env.WB_AGENT_HOOKS || "1") !== "0";
}

function registerHook(phase, fn, { id, version = "1", source = "builtin" } = {}) {
  if (!HOOK_PHASES.includes(phase)) {
    throw new Error(`未知 Hook 阶段: ${phase}`);
  }
  if (typeof fn !== "function") {
    throw new Error("Hook 必须是函数");
  }
  const list = hooksByPhase.get(phase);
  const hookId = id || `hook_${phase}_${list.length + 1}`;
  list.push({ id: hookId, version: String(version), fn, source });
  return hookId;
}

function clearHooks(phase) {
  if (phase) {
    hooksByPhase.set(phase, []);
  } else {
    for (const p of HOOK_PHASES) hooksByPhase.set(p, []);
  }
}

function listHooks() {
  const out = {};
  for (const p of HOOK_PHASES) {
    out[p] = (hooksByPhase.get(p) || []).map((h) => ({
      id: h.id,
      version: h.version,
      source: h.source,
    }));
  }
  return out;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`Hook 超时 (${ms}ms)`);
        err.code = "HOOK_TIMEOUT";
        reject(err);
      }, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * @returns {{ allowed: boolean, decisions: object[], error?: string }}
 */
async function runHooks(phase, payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!hooksEnabled()) {
    return { allowed: true, decisions: [], skipped: true };
  }
  if (!HOOK_PHASES.includes(phase)) {
    return { allowed: false, decisions: [], error: `未知阶段 ${phase}` };
  }
  const decisions = [];
  const list = hooksByPhase.get(phase) || [];
  for (const hook of list) {
    const started = Date.now();
    try {
      const result = await withTimeout(
        Promise.resolve(hook.fn({ ...payload, phase })),
        timeoutMs
      );
      const decision = {
        hookId: hook.id,
        version: hook.version,
        source: hook.source,
        phase,
        allowed: result?.allowed !== false,
        reason: result?.reason || null,
        meta: result?.meta || null,
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
      };
      decisions.push(decision);
      if (decision.allowed === false) {
        return { allowed: false, decisions, error: decision.reason || "Hook 拒绝" };
      }
    } catch (err) {
      const decision = {
        hookId: hook.id,
        version: hook.version,
        source: hook.source,
        phase,
        allowed: false,
        reason: err?.message || "Hook 异常",
        code: err?.code || "HOOK_ERROR",
        durationMs: Date.now() - started,
        at: new Date().toISOString(),
        failClosed: true,
      };
      decisions.push(decision);
      return { allowed: false, decisions, error: decision.reason };
    }
  }
  return { allowed: true, decisions };
}

/** Built-in audit-friendly defaults (always allow unless payload.deny). */
function installBuiltinHooks() {
  clearHooks();
  registerHook(
    "preToolUse",
    ({ toolName, ctx }) => {
      if (ctx?.subAgent && ["stage_patch", "preview_diff", "run_verification"].includes(toolName)) {
        return { allowed: false, reason: `子 Agent 禁止调用 ${toolName}` };
      }
      return { allowed: true };
    },
    { id: "builtin_pre_subagent_guard", version: "1", source: "system" }
  );
  registerHook(
    "permissionRequest",
    ({ toolName, userApproved }) => {
      const needs = ["run_shell_command", "write_project_file", "git_commit"];
      if (needs.includes(toolName) && !userApproved) {
        return { allowed: false, reason: `工具 ${toolName} 需要用户批准` };
      }
      return { allowed: true };
    },
    { id: "builtin_permission_gate", version: "1", source: "system" }
  );
  registerHook(
    "postToolUse",
    () => ({ allowed: true }),
    { id: "builtin_post_noop", version: "1", source: "system" }
  );
  registerHook(
    "agentStop",
    () => ({ allowed: true }),
    { id: "builtin_agent_stop", version: "1", source: "system" }
  );
}

installBuiltinHooks();

module.exports = {
  HOOK_PHASES,
  hooksEnabled,
  registerHook,
  clearHooks,
  listHooks,
  runHooks,
  installBuiltinHooks,
};
