const fs = require("fs");
const path = require("path");
const { getTaskSpec, SPEC_STATUS } = require("./taskSpecService.js");
const { listStagedPatches, PATCH_STATUS } = require("./patchStagingService.js");
const { getFixLoopState } = require("./fixLoopStateService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getProject } = require("./projectService.js");

function completionGuardEnabled() {
  return String(process.env.WB_AGENT_COMPLETION_GUARD || "1") !== "0";
}

const TODO_RE = /\b(TODO|FIXME|XXX|HACK)\b/;
const STUB_RE = /throw new Error\(['"]not implemented['"]\)|return null;\s*\/\/\s*stub|pass\s*#\s*todo/i;

function scanIncompleteMarkers(root, { maxFiles = 40 } = {}) {
  const findings = [];
  if (!root || !fs.existsSync(root)) {
    return findings;
  }
  const skip = new Set(["node_modules", ".git", "dist", "最新客户端", "graphify-out"]);
  function walk(dir, depth = 0) {
    if (findings.length >= 20 || depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (skip.has(ent.name) || ent.name.startsWith(".")) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
        continue;
      }
      if (!/\.(js|ts|tsx|jsx|py|go|java|css|html|md)$/i.test(ent.name)) continue;
      let text = "";
      try {
        const st = fs.statSync(full);
        if (st.size > 200_000) continue;
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (TODO_RE.test(line) || STUB_RE.test(line)) {
          findings.push({
            file: path.relative(root, full).replace(/\\/g, "/"),
            line: i + 1,
            text: line.trim().slice(0, 160),
          });
        }
      });
      if (findings.length >= 20) return;
    }
  }
  walk(root);
  return findings.slice(0, maxFiles);
}

function evaluateCompletion(getUserDataPath, userId, { projectId, taskId, verifyResult, getDefaultProjectRoot } = {}) {
  if (!completionGuardEnabled()) {
    return { ok: true, bypassed: true, reasons: [], blockers: [] };
  }
  const blockers = [];
  const reasons = [];
  const spec = getTaskSpec(getUserDataPath, userId, projectId, taskId);

  // Legacy tasks without TaskSpec: verify result is enough (L4-S MVP additive path).
  if (!spec) {
    if (verifyResult && verifyResult.ok === false && !verifyResult.skipped) {
      blockers.push({
        code: "VERIFY_FAILED",
        message: verifyResult.parsed?.summary || "最近一次验证失败",
      });
    }
    const staged = listStagedPatches(getUserDataPath, userId, projectId, taskId, {
      status: PATCH_STATUS.STAGED,
    });
    if (staged.length) {
      blockers.push({
        code: "STAGED_PATCHES_PENDING",
        message: `仍有 ${staged.length} 个未审阅暂存补丁`,
      });
    }
    return {
      ok: blockers.length === 0,
      blockers,
      reasons: ["no_task_spec_legacy_path"],
      incompleteMarkers: [],
      specVersion: null,
      checkedAt: new Date().toISOString(),
    };
  }

  if (spec.status === SPEC_STATUS.CLARIFYING || (spec.openQuestions || []).some((q) => q.blocking)) {
    blockers.push({
      code: "OPEN_CLARIFICATION",
      message: "仍有未关闭的阻塞澄清问题",
    });
  }

  const must = (spec.acceptanceCriteria || []).filter((c) => c.must);
  if (!must.length) {
    blockers.push({ code: "NO_MUST_CRITERIA", message: "缺少 Must 验收项" });
  }
  for (const c of must) {
    if (c.status === "WAIVED" || c.status === "PASS") continue;
    if (c.method === "heuristic") {
      reasons.push(`验收项 ${c.id} 待启发式检查`);
      continue;
    }
    if (c.method === "auto_verify" && (verifyResult?.ok || verifyResult?.skipped)) {
      continue;
    }
    if (c.method === "manual_or_verify" && (verifyResult?.ok || verifyResult?.skipped)) {
      continue;
    }
    if (!verifyResult && (c.method === "auto_verify" || c.method === "manual_or_verify")) {
      // Allow completion when verification was skipped at orchestrator level for static projects
      reasons.push(`验收项 ${c.id} 无验证结果，待确认`);
      continue;
    }
    blockers.push({
      code: "CRITERION_NOT_PASS",
      message: `Must 验收项未通过: ${c.id} (${c.status || "NOT_RUN"})`,
      criterionId: c.id,
    });
  }

  const staged = listStagedPatches(getUserDataPath, userId, projectId, taskId, {
    status: PATCH_STATUS.STAGED,
  });
  if (staged.length) {
    blockers.push({
      code: "STAGED_PATCHES_PENDING",
      message: `仍有 ${staged.length} 个未审阅暂存补丁`,
    });
  }

  const fixState = getFixLoopState(getUserDataPath, userId, projectId, taskId);
  if (fixState?.active && fixState.phase !== "COMPLETED") {
    blockers.push({
      code: "FIX_LOOP_ACTIVE",
      message: "修复循环仍在进行中",
    });
  }

  if (verifyResult && verifyResult.ok === false && !verifyResult.skipped) {
    blockers.push({
      code: "VERIFY_FAILED",
      message: verifyResult.parsed?.summary || "最近一次验证失败",
    });
  }

  let incomplete = [];
  const needsHeuristic = must.some((c) => c.method === "heuristic" && c.status !== "WAIVED");
  const waivedTodos = Boolean(spec.waivers?.incompleteMarkers);
  if (needsHeuristic && !waivedTodos) {
    try {
      const project = getProject(getUserDataPath, userId, projectId);
      const root = resolveProjectRoot(project, getDefaultProjectRoot);
      const applied = listStagedPatches(getUserDataPath, userId, projectId, taskId).filter(
        (p) => p.status === "APPLIED"
      );
      if (applied.length && root) {
        for (const p of applied.slice(0, 20)) {
          const full = require("path").join(root, p.filePath);
          try {
            const text = require("fs").readFileSync(full, "utf8");
            text.split(/\r?\n/).forEach((line, i) => {
              if (TODO_RE.test(line) || STUB_RE.test(line)) {
                incomplete.push({
                  file: p.filePath,
                  line: i + 1,
                  text: line.trim().slice(0, 160),
                });
              }
            });
          } catch {
            /* missing file */
          }
        }
      } else {
        incomplete = scanIncompleteMarkers(root);
      }
    } catch {
      incomplete = [];
    }
    if (incomplete.length) {
      blockers.push({
        code: "INCOMPLETE_MARKERS",
        message: `发现 ${incomplete.length} 处 TODO/FIXME/占位实现`,
        samples: incomplete.slice(0, 5),
      });
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    reasons,
    incompleteMarkers: incomplete,
    specVersion: spec.version || null,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  completionGuardEnabled,
  evaluateCompletion,
  scanIncompleteMarkers,
};
