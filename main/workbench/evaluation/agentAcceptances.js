/**
 * Post-agent E3 acceptances — validate real agent run + evidence, not pre-seeded fixtures.
 */
const { buildEvidencePackage } = require("../agentTraceExport.js");
const { evaluateCompletion } = require("../completionGuardService.js");
const { getLatestRunForTask, getAgentRun } = require("../agentRunStore.js");
const { runStaticSmokeVerification } = require("../staticSmokeVerification.js");
const { runVerification } = require("../verificationService.js");

function ok(message, detail) {
  return { ok: true, message, detail: detail || null };
}
function fail(message, detail) {
  return { ok: false, message, detail: detail || null };
}

async function agent_evidence_e3(ctx) {
  const pkg = buildEvidencePackage(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    verifyResult: ctx.verifyResult || null,
    persist: true,
  });
  const hasRun = Boolean(pkg.agentRun?.id);
  const traceLen = Array.isArray(pkg.agentRun?.toolTrace)
    ? pkg.agentRun.toolTrace.length
    : Array.isArray(pkg.toolOperations)
      ? pkg.toolOperations.length
      : 0;
  const checklist = pkg.completeness || {};
  const hasRunOrTools =
    checklist.has_run_or_tools?.ok === true || hasRun || traceLen > 0;
  if (!pkg.version || pkg.version < 2) {
    return fail("evidence package version < 2", pkg);
  }
  if (!pkg.integrity?.hash) {
    return fail("missing integrity.hash", pkg);
  }
  if (!hasRunOrTools) {
    return fail("E3 要求 Agent Run 或工具审计", { hasRun, traceLen, checklist });
  }
  if (!pkg.savedPath) {
    return fail("evidence not persisted", pkg);
  }
  return ok("E3 evidence package ok", {
    agentRunId: pkg.agentRun?.id || null,
    toolTraceLen: traceLen,
    hash: pkg.integrity.hash,
    savedPath: pkg.savedPath,
  });
}

async function agent_run_present(ctx) {
  const run =
    (ctx.agentRunId &&
      getAgentRun(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, ctx.agentRunId)) ||
    getLatestRunForTask(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId);
  if (!run?.id) {
    return fail("no agent run for task");
  }
  const trace = Array.isArray(run.toolTrace) ? run.toolTrace : [];
  if (!trace.length && !ctx.allowEmptyTrace) {
    return fail("agent run has empty toolTrace", { runId: run.id });
  }
  return ok("agent run present", { runId: run.id, status: run.status, toolTraceLen: trace.length });
}

async function agent_completion_guard(ctx) {
  const guard = evaluateCompletion(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    verifyResult: ctx.verifyResult || null,
    getDefaultProjectRoot: () => ctx.workspaceRoot,
  });
  return guard.ok
    ? ok("completion guard passed", guard)
    : fail(guard.blockers?.[0]?.message || "completion guard blocked", guard);
}

async function agent_static_smoke(ctx) {
  const r = runStaticSmokeVerification(ctx.workspaceRoot);
  return r.ok && !r.skipped ? ok(r.message, r.evidence) : fail(r.message || "static smoke failed", r);
}

async function agent_npm_build(ctx) {
  const r = await runVerification(
    ctx.getUserDataPath,
    ctx.userId,
    {
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      scriptName: "build",
      userApproved: true,
    },
    { getDefaultProjectRoot: () => ctx.workspaceRoot }
  );
  return r.ok && !r.skipped ? ok("npm build ok", r) : fail(r.message || "build failed", r);
}

async function agent_no_false_completion(ctx) {
  if (ctx.falseCompletion) {
    return fail("false completion recorded");
  }
  const guard = evaluateCompletion(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    verifyResult: ctx.verifyResult || { ok: false, skipped: true },
    getDefaultProjectRoot: () => ctx.workspaceRoot,
  });
  // Skipping verify must not pass as success when ban-skip is on
  if (ctx.verifyResult?.skipped && guard.ok) {
    return fail("skipped verify treated as completion", guard);
  }
  return ok("no false completion signal");
}

const AGENT_PROBES = {
  agent_evidence_e3,
  agent_run_present,
  agent_completion_guard,
  agent_static_smoke,
  agent_npm_build,
  agent_no_false_completion,
};

async function runAgentAcceptance(name, ctx) {
  const fn = AGENT_PROBES[name];
  if (!fn) {
    return fail(`unknown agent acceptance: ${name}`);
  }
  try {
    return await fn(ctx);
  } catch (err) {
    return fail(err?.message || String(err), { code: err?.code });
  }
}

module.exports = {
  AGENT_PROBES,
  runAgentAcceptance,
  agent_evidence_e3,
  agent_run_present,
  agent_completion_guard,
};
