/**
 * BL-018 / AGT-008 + CODE-003: Independent Patch Reviewer + unrelated-change gate.
 */
const path = require("path");

const UNRELATED_LINE_RATIO = Number(process.env.WB_PATCH_UNRELATED_RATIO || 0.45);

function normalizeRel(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

function collectAllowedPaths({ taskSpec, planSteps, message, affectedFiles } = {}) {
  const allowed = new Set();
  const add = (p) => {
    const n = normalizeRel(p);
    if (n) allowed.add(n);
  };

  for (const f of affectedFiles || []) add(f);
  for (const f of taskSpec?.affectedFiles || []) add(f);
  for (const f of taskSpec?.scope?.must || []) {
    if (typeof f === "string" && (f.includes("/") || /\.\w+$/.test(f))) add(f);
  }
  for (const step of planSteps || []) {
    for (const f of step.expectedFiles || step.outputs || []) add(f);
  }

  // Heuristic from message: paths like foo/bar.js
  const msg = String(message || "");
  const pathMatches = msg.match(/\b[\w./-]+\.(?:js|ts|tsx|jsx|css|html|json|md|py)\b/gi) || [];
  for (const m of pathMatches) add(m);

  return [...allowed];
}

function pathInAllowlist(filePath, allowed) {
  const rel = normalizeRel(filePath);
  if (!allowed.length) return true; // no scope yet → soft allow
  if (allowed.includes(rel)) return true;
  // allow if under an allowed directory prefix
  return allowed.some((a) => {
    if (a.endsWith("/")) return rel.startsWith(a);
    if (!/\.\w+$/.test(a)) return rel === a || rel.startsWith(`${a}/`);
    return rel === a;
  });
}

function countDiffStats(unifiedDiff) {
  const lines = String(unifiedDiff || "").split(/\r?\n/);
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (/^\+[^+]/.test(line)) added += 1;
    else if (/^-[^-]/.test(line)) removed += 1;
  }
  return { added, removed, changed: added + removed };
}

/**
 * Deterministic review (phase 1). Optional semantic notes for UI.
 */
function reviewPatchProposal({
  filePath,
  unifiedDiff,
  summary,
  patchQuality,
  taskSpec,
  planSteps,
  message,
  affectedFiles,
  allowUnscoped = true,
} = {}) {
  const findings = [];
  const allowed = collectAllowedPaths({ taskSpec, planSteps, message, affectedFiles });
  const rel = normalizeRel(filePath);
  const stats = countDiffStats(unifiedDiff);

  let unrelated = false;
  if (allowed.length && !pathInAllowlist(rel, allowed)) {
    unrelated = true;
    findings.push({
      code: "UNRELATED_FILE",
      severity: "high",
      message: `补丁文件 ${rel} 不在规格/计划允许范围内`,
      allowedSample: allowed.slice(0, 8),
    });
  }

  // CODE-003: large diff with weak summary → unrelated refactor risk
  if (stats.changed > 120 && String(summary || "").length < 20) {
    findings.push({
      code: "LARGE_UNDOCUMENTED_DIFF",
      severity: "medium",
      message: `变更行数 ${stats.changed} 且摘要过短，疑似无关重构`,
    });
  }

  if (patchQuality && patchQuality.applicable === false) {
    findings.push({
      code: "QUALITY_REJECT",
      severity: "high",
      message: `质量门禁未通过: ${(patchQuality.issues || []).join(", ")}`,
    });
  }

  // Forbidden paths
  if (/(^|\/)\.env(\.|$)/i.test(rel) || /secrets?\./i.test(rel) || /\.(pem|key)$/i.test(rel)) {
    findings.push({
      code: "SENSITIVE_PATH",
      severity: "critical",
      message: `禁止修改敏感路径: ${rel}`,
    });
  }

  const blockers = findings.filter((f) => f.severity === "high" || f.severity === "critical");
  const softUnrelatedRatio =
    unrelated && allowed.length
      ? 1
      : findings.some((f) => f.code === "LARGE_UNDOCUMENTED_DIFF")
        ? Math.min(1, stats.changed / 200)
        : 0;

  const verdict =
    blockers.some((f) => f.code === "SENSITIVE_PATH")
      ? "reject"
      : unrelated && !allowUnscoped
        ? "reject"
        : unrelated
          ? "needs_approval"
          : blockers.length
            ? "needs_approval"
            : "pass";

  return {
    ok: verdict === "pass",
    verdict,
    reviewer: "deterministic-v1",
    patchId: null,
    filePath: rel,
    findings,
    unrelatedFiles: unrelated ? [rel] : [],
    allowedPaths: allowed,
    diffStats: stats,
    unrelatedRatio: softUnrelatedRatio,
    threshold: UNRELATED_LINE_RATIO,
    at: new Date().toISOString(),
  };
}

function reviewStagedPatches({ patches, taskSpec, planSteps, message, affectedFiles, allowUnscoped = true } = {}) {
  const reviews = (patches || []).map((p) => {
    const r = reviewPatchProposal({
      filePath: p.filePath || p.path,
      unifiedDiff: p.unifiedDiff,
      summary: p.summary,
      patchQuality: p.patchQuality,
      taskSpec,
      planSteps,
      message,
      affectedFiles,
      allowUnscoped,
    });
    return { ...r, patchId: p.id || null };
  });
  const unrelatedFiles = [...new Set(reviews.flatMap((r) => r.unrelatedFiles || []))];
  const rejected = reviews.filter((r) => r.verdict === "reject");
  const needsApproval = reviews.filter((r) => r.verdict === "needs_approval");
  return {
    ok: rejected.length === 0,
    reviewerVerdict: rejected.length ? "reject" : needsApproval.length ? "needs_approval" : "pass",
    reviews,
    unrelatedFiles,
    blockers: reviews.flatMap((r) => r.findings.filter((f) => f.severity === "high" || f.severity === "critical")),
  };
}

/**
 * Gate for apply: reject if any patch is unrelated without override.
 */
function assertPatchesInScope(patches, scope, { userOverrideUnrelated = false } = {}) {
  const batch = reviewStagedPatches({
    patches,
    ...scope,
    allowUnscoped: false,
  });
  if (batch.reviewerVerdict === "reject" && !userOverrideUnrelated) {
    const err = new Error(
      `Patch Reviewer 拒绝：${batch.blockers[0]?.message || "存在无关/敏感变更"}`
    );
    err.code = "PATCH_REVIEW_REJECTED";
    err.review = batch;
    throw err;
  }
  if (batch.reviewerVerdict === "needs_approval" && !userOverrideUnrelated) {
    const err = new Error(
      `Patch Reviewer 要求确认无关变更：${(batch.unrelatedFiles || []).join(", ")}`
    );
    err.code = "PATCH_REVIEW_NEEDS_APPROVAL";
    err.review = batch;
    throw err;
  }
  return batch;
}

module.exports = {
  collectAllowedPaths,
  reviewPatchProposal,
  reviewStagedPatches,
  assertPatchesInScope,
  UNRELATED_LINE_RATIO,
};
