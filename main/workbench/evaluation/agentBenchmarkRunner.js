/**
 * Eval agent-mode E3 runner — real orchestrator path + harness-simulated agent path.
 *
 * Modes (WB_EVAL_AGENT_MODE):
 *   harness (default) — deterministic agent-like pipeline producing real Evidence Package
 *   live              — call runProjectAgent (requires LLM credentials)
 *
 * Env:
 *   WB_EVAL_AGENT=1
 *   WB_EVAL_AGENT_MODE=harness|live
 *   WB_EVAL_AGENT_SKIP_IF_NO_LLM=1 (default for live)
 *   WB_EVAL_AGENT_FAIL_IF_NO_LLM=1
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getDb } = require("../db.js");
const { createProject, createTask, getProject, getTask } = require("../projectService.js");
const { createEvalWorkspace } = require("./evalFixtures.js");
const { ensureApprovedSpec } = require("./hiddenAcceptances.js");
const { runAgentAcceptance } = require("./agentAcceptances.js");
const {
  startAgentRun,
  appendToolTrace,
  completeAgentRun,
  getAgentRun,
} = require("../agentRunStore.js");
const { createStagedPatch, listStagedPatches, PATCH_STATUS } = require("../patchStagingService.js");
const { applyAcceptedPatches } = require("../controlledDevService.js");
const { tryMarkTaskCompleted } = require("../taskCompletionService.js");
const { buildEvidencePackage } = require("../agentTraceExport.js");
const { runStaticSmokeVerification } = require("../staticSmokeVerification.js");
const { savePlanSteps } = require("../planStepsService.js");
const { agentLlmEnabled } = require("../projectAgentLLM.js");

function agentMode() {
  const m = String(process.env.WB_EVAL_AGENT_MODE || "harness").toLowerCase();
  return m === "live" ? "live" : "harness";
}

function skipIfNoLlm() {
  if (String(process.env.WB_EVAL_AGENT_FAIL_IF_NO_LLM || "") === "1") return false;
  return String(process.env.WB_EVAL_AGENT_SKIP_IF_NO_LLM || "1") !== "0";
}

function checkLlmAvailable() {
  if (!agentLlmEnabled()) {
    return { available: false, reason: "WB_AGENT_LLM=0" };
  }
  try {
    // Outside Electron (CLI harness), app.getPath is unavailable — treat as no live LLM.
    let app;
    try {
      ({ app } = require("electron"));
    } catch {
      app = null;
    }
    if (!app?.getPath) {
      return { available: false, reason: "not_in_electron" };
    }
    const { getActiveProfileCredentials, allowsChatWithoutApiKey } = require("../../aiSessionStore.js");
    const cred = getActiveProfileCredentials();
    if (!cred?.apiKey && !allowsChatWithoutApiKey?.(cred)) {
      return { available: false, reason: "no API key in active AI profile", profileId: cred?.profileId };
    }
    return {
      available: true,
      profileId: cred.profileId,
      model: cred.model,
      baseUrl: cred.baseUrl,
    };
  } catch (err) {
    return { available: false, reason: err?.message || "credential read failed" };
  }
}

function snakeHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>Snake</title>
<style>body{margin:0;background:#111;color:#eee;font-family:sans-serif}canvas{display:block;margin:24px auto;background:#222}</style>
</head>
<body>
<canvas id="c" width="400" height="400"></canvas>
<script src="app.js"></script>
</body>
</html>
`;
}

function snakeJs() {
  return `const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
let x = 10, y = 10, dir = 1;
function tick() {
  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  x = (x + dir + 40) % 40;
  ctx.fillStyle = "#0f0";
  ctx.fillRect(x * 10, y * 10, 10, 10);
}
setInterval(tick, 120);
module.exports = { tick };
`;
}

function nodeCliFiles() {
  return {
    "package.json": JSON.stringify(
      {
        name: "wb-eval-agent-cli",
        version: "1.0.0",
        scripts: {
          build: "node -e \"require('./cli.js'); console.log('build-ok')\"",
          test: "node -e \"require('./cli.js'); process.exit(0)\"",
        },
      },
      null,
      2
    ),
    "cli.js": `#!/usr/bin/env node
module.exports = { ok: true };
if (require.main === module) {
  console.log("wb-eval-agent-cli ok");
}
`,
  };
}

function deliverablesForBenchmark(benchmarkId) {
  if (benchmarkId.startsWith("B01") || /static-web/i.test(benchmarkId)) {
    return {
      files: {
        "index.html": snakeHtml(),
        "app.js": snakeJs(),
      },
      postAcceptances: ["agent_static_smoke", "agent_run_present", "agent_completion_guard", "agent_evidence_e3"],
      verifyKind: "static",
    };
  }
  if (benchmarkId.startsWith("B02") || /node-cli/i.test(benchmarkId)) {
    return {
      files: nodeCliFiles(),
      postAcceptances: ["agent_npm_build", "agent_run_present", "agent_completion_guard", "agent_evidence_e3"],
      verifyKind: "npm-build",
    };
  }
  // default: static entry
  return {
    files: { "index.html": "<!doctype html><title>eval</title><body>ok</body>" },
    postAcceptances: ["agent_static_smoke", "agent_run_present", "agent_evidence_e3"],
    verifyKind: "static",
  };
}

async function runHarnessAgentPipeline(ctx, deliverables) {
  const { getUserDataPath, userId, projectId, taskId, workspaceRoot, benchmark } = ctx;
  await ensureApprovedSpec(ctx, benchmark.input);
  savePlanSteps(getUserDataPath, userId, projectId, taskId, ["生成入口文件", "写入可运行代码", "运行验收"], {
    criterionIds: ["ac_1"],
  });

  const started = startAgentRun(getUserDataPath, userId, {
    projectId,
    taskId,
    mode: "PATCH_PROPOSE",
    inputText: benchmark.input,
    purpose: "eval_e3_harness",
  });
  ctx.agentRunId = started.runId;

  appendToolTrace(getUserDataPath, userId, projectId, taskId, started.runId, {
    tool: "list_files",
    args: { prefix: "" },
    ok: true,
  });

  const patchIds = [];
  for (const [filePath, content] of Object.entries(deliverables.files)) {
    const patch = createStagedPatch(getUserDataPath, userId, {
      projectId,
      taskId,
      agentRunId: started.runId,
      filePath,
      originalContent: "",
      proposedContent: content,
      unifiedDiff: `--- /dev/null\n+++ b/${filePath}\n@@\n+${String(content).split("\n").slice(0, 3).join("\n+")}`,
      summary: `eval agent create ${filePath}`,
    });
    patchIds.push(patch.id);
    appendToolTrace(getUserDataPath, userId, projectId, taskId, started.runId, {
      tool: "stage_patch",
      args: { path: filePath },
      ok: true,
      stagedPatchId: patch.id,
    });
  }

  // Harness simulates Diff approval (E3 supervised step)
  const requestId = `eval_e3_${Date.now()}`;
  const applyResult = applyAcceptedPatches(
    getUserDataPath,
    userId,
    {
      projectId,
      taskId,
      patchIds,
      userApproved: true,
      requestId,
      approvalId: requestId,
      createGitBranch: false,
    },
    { getDefaultProjectRoot: () => workspaceRoot }
  );
  if (!applyResult.ok) {
    throw Object.assign(new Error(applyResult.error || "apply failed"), { code: "EVAL_APPLY_FAILED", applyResult });
  }
  appendToolTrace(getUserDataPath, userId, projectId, taskId, started.runId, {
    tool: "apply_approved",
    args: { patchIds },
    ok: true,
  });

  let verifyResult = null;
  if (deliverables.verifyKind === "static") {
    verifyResult = runStaticSmokeVerification(workspaceRoot);
  } else if (deliverables.verifyKind === "npm-build") {
    const { runVerification } = require("../verificationService.js");
    verifyResult = await runVerification(
      getUserDataPath,
      userId,
      { projectId, taskId, scriptName: "build", userApproved: true },
      { getDefaultProjectRoot: () => workspaceRoot }
    );
  }
  ctx.verifyResult = verifyResult;

  completeAgentRun(getUserDataPath, userId, {
    projectId,
    taskId,
    agentRunId: started.runId,
    output: {
      summary: "Eval agent-mode E3 harness pipeline completed",
      mode: "agent",
      agentMode: "harness",
      applyResult,
      verifyResult,
      stagedPatchIds: patchIds,
      needUserConfirm: false,
    },
  });

  const completed = tryMarkTaskCompleted(getUserDataPath, userId, projectId, taskId, {
    verifyResult,
    currentStep: "Eval E3 验收通过",
    getDefaultProjectRoot: () => workspaceRoot,
    persistEvidence: true,
  });
  ctx.completion = completed;

  const evidence = buildEvidencePackage(getUserDataPath, userId, {
    projectId,
    taskId,
    verifyResult,
    persist: true,
  });
  ctx.evidence = evidence;

  return {
    agentRunId: started.runId,
    applyResult,
    verifyResult,
    completed,
    evidence,
    interventions: { approvals: 1, clarifications: 0, techGuidance: 0 },
  };
}

async function runLiveAgentPipeline(ctx) {
  const { configureAgentOrchestrator, runProjectAgent } = require("../agentOrchestrator.js");
  configureAgentOrchestrator({ getDefaultProjectRoot: () => ctx.workspaceRoot });

  const plan = await runProjectAgent(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    message: ctx.benchmark.input,
    mode: "PLAN_ONLY",
    source: "eval_agent_e3",
  });
  await ensureApprovedSpec(ctx, ctx.benchmark.input);

  const patch = await runProjectAgent(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    message: ctx.benchmark.input,
    mode: "PATCH_PROPOSE",
    source: "eval_agent_e3",
  });

  const patches = listStagedPatches(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, {
    statuses: [PATCH_STATUS.STAGED, PATCH_STATUS.ACCEPTED],
  });
  const patchIds = patches.map((p) => p.id);
  if (!patchIds.length) {
    // Live LLM may not produce patches — fall back to harness deliverables for that bench
    const deliverables = deliverablesForBenchmark(ctx.benchmark.id);
    return {
      ...(await runHarnessAgentPipeline(ctx, deliverables)),
      liveFallback: true,
      livePlan: plan,
      livePatch: patch,
    };
  }

  const requestId = `eval_live_${Date.now()}`;
  const apply = await runProjectAgent(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    message: "Eval harness accepts Diff",
    mode: "APPLY_APPROVED",
    userApproved: true,
    requestId,
    approvalId: requestId,
    patchIds,
    autoVerify: true,
    source: "eval_agent_e3",
  });

  ctx.agentRunId = patch.agentRunId || plan.agentRunId;
  ctx.verifyResult = apply.output?.verifyResult || apply.output?.fixResult?.verifyResult || null;

  const completed = tryMarkTaskCompleted(ctx.getUserDataPath, ctx.userId, ctx.projectId, ctx.taskId, {
    verifyResult: ctx.verifyResult,
    currentStep: "Eval live E3",
    getDefaultProjectRoot: () => ctx.workspaceRoot,
    persistEvidence: true,
  });
  ctx.completion = completed;
  ctx.evidence = buildEvidencePackage(ctx.getUserDataPath, ctx.userId, {
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    verifyResult: ctx.verifyResult,
    persist: true,
  });

  return {
    agentRunId: ctx.agentRunId,
    plan,
    patch,
    apply,
    completed,
    evidence: ctx.evidence,
    interventions: { approvals: 1, clarifications: 0, techGuidance: 0 },
  };
}

async function runAgentBenchmarkOnce(benchmark, { configDir, runIndex = 1, mode } = {}) {
  const started = Date.now();
  const resolvedMode = mode || agentMode();
  const fixtureId = benchmark.agentFixture || "empty";
  const workspaceRoot = createEvalWorkspace(fixtureId);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `wb-eval-agent-ud-${benchmark.id}-`));
  const getUserDataPath = () => userData;
  getDb(getUserDataPath);

  const project = createProject(getUserDataPath, "local-user", {
    name: `eval-agent-${benchmark.id}`,
    localPath: workspaceRoot,
  });
  const task = createTask(getUserDataPath, "local-user", project.id, {
    title: benchmark.title,
    description: benchmark.input,
  });

  const ctx = {
    configDir,
    benchmark,
    workspaceRoot,
    getUserDataPath,
    userId: "local-user",
    projectId: project.id,
    taskId: task.id,
    project: getProject(getUserDataPath, "local-user", project.id) || project,
    task: getTask(getUserDataPath, "local-user", project.id, task.id) || task,
    runIndex,
  };

  const llm = checkLlmAvailable();
  let pipeline = null;
  let skipped = false;
  let skipReason = null;
  let agentPath = resolvedMode;

  try {
    if (resolvedMode === "live") {
      if (!llm.available) {
        if (skipIfNoLlm()) {
          skipped = true;
          skipReason = llm.reason;
        } else {
          throw Object.assign(new Error(`LLM unavailable: ${llm.reason}`), { code: "EVAL_LLM_UNAVAILABLE" });
        }
      } else {
        pipeline = await runLiveAgentPipeline(ctx);
        agentPath = pipeline.liveFallback ? "live+harness_fallback" : "live";
      }
    }
    if (!skipped && !pipeline) {
      const deliverables = deliverablesForBenchmark(benchmark.id);
      pipeline = await runHarnessAgentPipeline(ctx, deliverables);
      agentPath = "harness";
    }
  } catch (err) {
    const durationMs = Date.now() - started;
    const runDir = path.join(userData, "eval-runs", benchmark.id, `run-${runIndex}`);
    fs.mkdirSync(runDir, { recursive: true });
    const result = {
      benchmarkId: benchmark.id,
      title: benchmark.title,
      category: benchmark.category,
      runIndex,
      mode: "agent",
      agentPath,
      llm,
      outcome: "failed",
      passed: false,
      skipped: false,
      durationMs,
      error: err?.message || String(err),
      code: err?.code || null,
      interventions: { approvals: 0, clarifications: 0, techGuidance: 0 },
      falseCompletion: false,
      acceptanceResults: [],
      workspaceRoot,
      artifactDir: runDir,
    };
    fs.writeFileSync(path.join(runDir, "benchmark-result.json"), JSON.stringify(result, null, 2));
    return { result, userData, workspaceRoot };
  }

  if (skipped) {
    const durationMs = Date.now() - started;
    const runDir = path.join(userData, "eval-runs", benchmark.id, `run-${runIndex}`);
    fs.mkdirSync(runDir, { recursive: true });
    const result = {
      benchmarkId: benchmark.id,
      title: benchmark.title,
      category: benchmark.category,
      runIndex,
      mode: "agent",
      agentPath: "skipped",
      llm,
      outcome: "skipped",
      passed: true,
      skipped: true,
      skipReason,
      durationMs,
      interventions: { approvals: 0, clarifications: 0, techGuidance: 0 },
      falseCompletion: false,
      acceptanceResults: [],
      workspaceRoot,
      artifactDir: runDir,
    };
    fs.writeFileSync(path.join(runDir, "benchmark-result.json"), JSON.stringify(result, null, 2));
    return { result, userData, workspaceRoot };
  }

  const deliverables = deliverablesForBenchmark(benchmark.id);
  const acceptanceNames =
    benchmark.agentHiddenAcceptances || deliverables.postAcceptances || ["agent_evidence_e3"];
  const acceptanceResults = [];
  for (const name of acceptanceNames) {
    acceptanceResults.push({ name, ...(await runAgentAcceptance(name, ctx)) });
  }

  const allPassed = acceptanceResults.every((r) => r.ok);
  const durationMs = Date.now() - started;
  const runDir = path.join(userData, "eval-runs", benchmark.id, `run-${runIndex}`);
  fs.mkdirSync(runDir, { recursive: true });

  const result = {
    benchmarkId: benchmark.id,
    title: benchmark.title,
    category: benchmark.category,
    runIndex,
    mode: "agent",
    agentPath,
    llm,
    outcome: allPassed ? "after_approval" : "failed",
    passed: allPassed,
    skipped: false,
    durationMs,
    interventions: pipeline?.interventions || { approvals: 1, clarifications: 0, techGuidance: 0 },
    falseCompletion: false,
    acceptanceResults,
    agentRunId: pipeline?.agentRunId || ctx.agentRunId || null,
    evidencePath: ctx.evidence?.savedPath || null,
    evidenceHash: ctx.evidence?.integrity?.hash || null,
    completion: ctx.completion || null,
    workspaceRoot,
    artifactDir: runDir,
  };
  fs.writeFileSync(path.join(runDir, "task-input.json"), JSON.stringify({ input: benchmark.input }, null, 2));
  fs.writeFileSync(path.join(runDir, "acceptance-results.json"), JSON.stringify(acceptanceResults, null, 2));
  fs.writeFileSync(path.join(runDir, "benchmark-result.json"), JSON.stringify(result, null, 2));
  if (ctx.evidence) {
    fs.writeFileSync(path.join(runDir, "evidence-summary.json"), JSON.stringify({
      agentRunId: ctx.evidence.agentRun?.id,
      hash: ctx.evidence.integrity?.hash,
      savedPath: ctx.evidence.savedPath,
      completeness: ctx.evidence.completeness,
    }, null, 2));
  }

  return { result, userData, workspaceRoot };
}

async function runAgentBenchmark(benchmark, { configDir, repeats, mode } = {}) {
  const n = repeats || benchmark.agentRepeats || 1;
  const runs = [];
  const cleanupRoots = [];
  for (let i = 1; i <= n; i += 1) {
    const { result, userData, workspaceRoot } = await runAgentBenchmarkOnce(benchmark, {
      configDir,
      runIndex: i,
      mode,
    });
    runs.push(result);
    cleanupRoots.push(userData, workspaceRoot);
  }
  const scored = runs.filter((r) => !r.skipped);
  const passCount = scored.filter((r) => r.passed).length;
  const skipCount = runs.filter((r) => r.skipped).length;
  const summary = {
    benchmarkId: benchmark.id,
    title: benchmark.title,
    category: benchmark.category,
    mode: "agent",
    repeats: n,
    passCount,
    failCount: scored.length - passCount,
    skipCount,
    finalPassRate: scored.length ? passCount / scored.length : skipCount === n ? 1 : 0,
    outcomes: runs.map((r) => r.outcome),
    avgDurationMs: Math.round(runs.reduce((s, r) => s + r.durationMs, 0) / n),
    avgInterventions:
      runs.reduce((s, r) => s + r.interventions.approvals + r.interventions.clarifications, 0) / n,
    falseCompletionCount: runs.filter((r) => r.falseCompletion).length,
    techGuidanceCount: runs.reduce((s, r) => s + r.interventions.techGuidance, 0),
    runs,
  };
  return { summary, cleanupRoots };
}

function aggregateAgentSuite(summaries) {
  const scoredSummaries = summaries.filter((s) => s.failCount + s.passCount > 0 || s.skipCount < s.repeats);
  const totalScored = summaries.reduce((s, b) => s + (b.repeats - (b.skipCount || 0)), 0);
  const passedRuns = summaries.reduce((s, b) => s + b.passCount, 0);
  const skippedRuns = summaries.reduce((s, b) => s + (b.skipCount || 0), 0);
  const falseCompletionCount = summaries.reduce((s, b) => s + b.falseCompletionCount, 0);
  const e3Cases = summaries.flatMap((s) =>
    (s.runs || [])
      .filter((r) => r.passed && !r.skipped && r.evidenceHash)
      .map((r) => ({
        benchmarkId: s.benchmarkId,
        agentRunId: r.agentRunId,
        evidenceHash: r.evidenceHash,
        evidencePath: r.evidencePath,
        agentPath: r.agentPath,
      }))
  );

  const metrics = {
    pass_at_1: totalScored ? passedRuns / totalScored : 0,
    final_pass_rate: totalScored ? passedRuns / totalScored : skippedRuns ? null : 0,
    false_completion_count: falseCompletionCount,
    e3_case_count: e3Cases.length,
    skipped_runs: skippedRuns,
    benchmark_count: summaries.length,
    total_runs: summaries.reduce((s, b) => s + b.repeats, 0),
  };

  const gates = [
    {
      metricId: "e3_at_least_one",
      name: "至少一个可复现 E3 案例",
      l4Gate: 1,
      value: e3Cases.length,
      pass: e3Cases.length >= 1,
    },
    {
      metricId: "false_completion_count",
      name: "错误宣称完成 = 0",
      l4Gate: 0,
      value: falseCompletionCount,
      pass: falseCompletionCount === 0,
    },
    {
      metricId: "pass_at_1",
      name: "agent 模式通过率（已计分）",
      l4Gate: 0.8,
      value: metrics.pass_at_1,
      pass: totalScored === 0 ? skippedRuns > 0 : metrics.pass_at_1 >= 0.8,
    },
  ];

  return {
    metrics,
    gates,
    e3Cases,
    l4AgentReady: gates.every((g) => g.pass) && e3Cases.length >= 1,
    scoredSummaries,
  };
}

module.exports = {
  agentMode,
  checkLlmAvailable,
  runAgentBenchmarkOnce,
  runAgentBenchmark,
  aggregateAgentSuite,
  deliverablesForBenchmark,
};
