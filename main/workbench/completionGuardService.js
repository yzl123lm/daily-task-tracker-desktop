const fs = require("fs");
const path = require("path");
const { getTaskSpec, SPEC_STATUS, updateAcceptanceStatus, saveTaskSpec } = require("./taskSpecService.js");
const { listStagedPatches, PATCH_STATUS } = require("./patchStagingService.js");
const { getFixLoopState } = require("./fixLoopStateService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getProject } = require("./projectService.js");

function completionGuardEnabled() {
  return String(process.env.WB_AGENT_COMPLETION_GUARD || "1") !== "0";
}

/** BL-003: 禁止将 skipped 视为验收通过 */
function banSkipCompletion() {
  return String(process.env.WB_AGENT_BAN_VERIFY_SKIP || "1") !== "0";
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

function hasUsableEvidence(evidence) {
  if (!evidence) return false;
  if (Array.isArray(evidence)) return evidence.length > 0;
  if (typeof evidence === "object") {
    return Boolean(evidence.type || evidence.profileId || evidence.at || evidence.path);
  }
  return false;
}

function buildVerifyEvidence(verifyResult) {
  if (!verifyResult || verifyResult.skipped || verifyResult.ok !== true) return null;
  if (Array.isArray(verifyResult.evidence) && verifyResult.evidence.length) {
    return {
      type: "verification_run",
      profileId: verifyResult.profileId || verifyResult.scriptName || null,
      at: new Date().toISOString(),
      items: verifyResult.evidence,
      message: verifyResult.message || "verification ok",
    };
  }
  return {
    type: "verification_run",
    profileId: verifyResult.profileId || verifyResult.scriptName || null,
    command: verifyResult.command || null,
    exitCode: verifyResult.exitCode,
    at: new Date().toISOString(),
    message: verifyResult.message || "verification ok",
  };
}

/**
 * Persist PASS + evidence onto TaskSpec must ACs after a real verify success.
 */
function syncAcceptanceEvidenceFromVerify(
  getUserDataPath,
  userId,
  projectId,
  taskId,
  verifyResult
) {
  const evidence = buildVerifyEvidence(verifyResult);
  if (!evidence) return null;
  const spec = getTaskSpec(getUserDataPath, userId, projectId, taskId);
  if (!spec) return null;
  let next = spec;
  for (const c of spec.acceptanceCriteria || []) {
    if (!c.must) continue;
    if (c.status === "WAIVED" || c.status === "PASS") continue;
    if (c.method === "auto_verify" || c.method === "manual_or_verify") {
      next = updateAcceptanceStatus(next, c.id, "PASS", evidence);
    }
  }
  if (next !== spec) {
    return saveTaskSpec(getUserDataPath, userId, projectId, taskId, next);
  }
  return next;
}

function evaluateCompletion(
  getUserDataPath,
  userId,
  { projectId, taskId, verifyResult, getDefaultProjectRoot } = {}
) {
  if (!completionGuardEnabled()) {
    return { ok: true, bypassed: true, reasons: [], blockers: [], acceptanceEvidence: [] };
  }
  const blockers = [];
  const reasons = [];
  const acceptanceEvidence = [];
  const spec = getTaskSpec(getUserDataPath, userId, projectId, taskId);
  const banSkip = banSkipCompletion();

  // BL-003: skipped 永远不能当作完成证据
  if (banSkip && verifyResult && verifyResult.skipped) {
    blockers.push({
      code: "VERIFY_SKIPPED",
      message:
        verifyResult.message ||
        "验证被跳过，禁止据此标记任务完成；请运行真实验证 profile 或显式 WAIVE 验收项",
    });
  }

  // Legacy tasks without TaskSpec
  if (!spec) {
    if (!verifyResult || verifyResult.ok !== true || verifyResult.skipped) {
      if (!blockers.some((b) => b.code === "VERIFY_SKIPPED")) {
        blockers.push({
          code: "VERIFY_REQUIRED",
          message: "无 TaskSpec 时必须提供未跳过且成功的验证结果才能完成",
        });
      }
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
      acceptanceEvidence,
      specVersion: null,
      checkedAt: new Date().toISOString(),
    };
  }

  if (spec.status !== SPEC_STATUS.APPROVED) {
    blockers.push({
      code: "SPEC_NOT_APPROVED",
      message: `规格未批准（当前 ${spec.status}），禁止标记完成`,
    });
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

  const verifyEvidence = buildVerifyEvidence(verifyResult);
  let incomplete = [];

  for (const c of must) {
    if (c.status === "WAIVED") {
      if (!c.waiverReason && !spec.waivers?.[c.id]) {
        blockers.push({
          code: "WAIVER_MISSING_REASON",
          message: `验收项 ${c.id} 已 WAIVE 但缺少理由`,
          criterionId: c.id,
        });
      } else {
        acceptanceEvidence.push({
          criterionId: c.id,
          status: "WAIVED",
          evidence: c.evidence || { type: "waiver", reason: c.waiverReason || spec.waivers?.[c.id] },
        });
      }
      continue;
    }

    if (c.status === "PASS" && hasUsableEvidence(c.evidence)) {
      acceptanceEvidence.push({
        criterionId: c.id,
        status: "PASS",
        evidence: c.evidence,
      });
      continue;
    }

    if (c.method === "heuristic") {
      const waivedTodos = Boolean(spec.waivers?.incompleteMarkers);
      if (waivedTodos) {
        acceptanceEvidence.push({
          criterionId: c.id,
          status: "WAIVED",
          evidence: { type: "waiver", reason: "incompleteMarkers" },
        });
        continue;
      }
      try {
        const project = getProject(getUserDataPath, userId, projectId);
        const root = resolveProjectRoot(project, getDefaultProjectRoot);
        const applied = listStagedPatches(getUserDataPath, userId, projectId, taskId).filter(
          (p) => p.status === "APPLIED"
        );
        incomplete = [];
        if (applied.length && root) {
          for (const p of applied.slice(0, 20)) {
            const full = path.join(root, p.filePath);
            try {
              const text = fs.readFileSync(full, "utf8");
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
          criterionId: c.id,
        });
      } else {
        acceptanceEvidence.push({
          criterionId: c.id,
          status: "PASS",
          evidence: {
            type: "completion_heuristics",
            at: new Date().toISOString(),
            message: "未发现 TODO/FIXME/占位",
          },
        });
      }
      continue;
    }

    if (c.method === "auto_verify" || c.method === "manual_or_verify") {
      if (banSkip && verifyResult?.skipped) {
        blockers.push({
          code: "CRITERION_NOT_PASS",
          message: `Must 验收项 ${c.id} 不能依赖 skipped 验证`,
          criterionId: c.id,
        });
        continue;
      }
      if (verifyEvidence) {
        acceptanceEvidence.push({
          criterionId: c.id,
          status: "PASS",
          evidence: verifyEvidence,
        });
        continue;
      }
      blockers.push({
        code: "CRITERION_NOT_PASS",
        message: `Must 验收项未通过或缺少证据: ${c.id} (${c.status || "NOT_RUN"})`,
        criterionId: c.id,
      });
      continue;
    }

    // Unknown method: require explicit PASS + evidence
    if (c.status === "PASS" && hasUsableEvidence(c.evidence)) {
      acceptanceEvidence.push({
        criterionId: c.id,
        status: "PASS",
        evidence: c.evidence,
      });
    } else {
      blockers.push({
        code: "CRITERION_NOT_PASS",
        message: `Must 验收项未通过: ${c.id} (${c.status || "NOT_RUN"})`,
        criterionId: c.id,
      });
    }
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
      message: verifyResult.parsed?.summary || verifyResult.message || "最近一次验证失败",
    });
  }

  // BL-003: every must AC must appear in acceptanceEvidence when ok
  if (blockers.length === 0 && must.length) {
    const covered = new Set(acceptanceEvidence.map((e) => e.criterionId));
    for (const c of must) {
      if (!covered.has(c.id)) {
        blockers.push({
          code: "AC_EVIDENCE_MISSING",
          message: `Must 验收项缺少绑定证据: ${c.id}`,
          criterionId: c.id,
        });
      }
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    reasons,
    incompleteMarkers: incomplete,
    acceptanceEvidence,
    specVersion: spec.version || null,
    checkedAt: new Date().toISOString(),
  };
}

module.exports = {
  completionGuardEnabled,
  banSkipCompletion,
  evaluateCompletion,
  scanIncompleteMarkers,
  syncAcceptanceEvidenceFromVerify,
  buildVerifyEvidence,
};
