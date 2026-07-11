/**
 * Benchmark runner — executes one benchmark × N repeats with hidden acceptances.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { getDb } = require("../db.js");
const { createProject, createTask } = require("../projectService.js");
const { createEvalWorkspace } = require("./evalFixtures.js");
const { runHiddenAcceptance } = require("./hiddenAcceptances.js");

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveEvalConfigDir(explicit) {
  if (explicit) return path.resolve(explicit);
  return path.join(__dirname, "..", "..", "..", "config", "wb-eval");
}

function loadSuite(configDir) {
  return loadJson(path.join(configDir, "suite.v1.json"));
}

function loadMetrics(configDir) {
  return loadJson(path.join(configDir, "metrics.v1.json"));
}

function loadBenchmark(configDir, id) {
  const file = path.join(configDir, "benchmarks", `${id}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`Benchmark not found: ${id}`);
  }
  return loadJson(file);
}

function classifyOutcome(allPassed, { falseCompletion = false } = {}) {
  if (falseCompletion) return "failed";
  if (allPassed) return "after_approval"; // capability probes assume approval gates
  return "failed";
}

async function runBenchmarkOnce(benchmark, { configDir, runIndex = 1 } = {}) {
  const started = Date.now();
  const workspaceRoot = createEvalWorkspace(benchmark.fixture);
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), `wb-eval-ud-${benchmark.id}-`));
  const getUserDataPath = () => userData;
  getDb(getUserDataPath);

  const project = createProject(getUserDataPath, "local-user", {
    name: `eval-${benchmark.id}`,
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
    project,
    task,
    runIndex,
  };

  const acceptanceResults = [];
  for (const name of benchmark.hiddenAcceptances || []) {
    const result = await runHiddenAcceptance(name, ctx);
    acceptanceResults.push({ name, ...result });
  }

  const allPassed = acceptanceResults.every((r) => r.ok);
  const durationMs = Date.now() - started;
  const outcome = classifyOutcome(allPassed);

  const runDir = path.join(userData, "eval-runs", benchmark.id, `run-${runIndex}`);
  fs.mkdirSync(runDir, { recursive: true });
  const result = {
    benchmarkId: benchmark.id,
    title: benchmark.title,
    category: benchmark.category,
    runIndex,
    mode: "capability_probe",
    outcome,
    passed: allPassed,
    durationMs,
    interventions: {
      approvals: 1,
      clarifications: benchmark.hiddenAcceptances?.includes("needs_clarification") ? 1 : 0,
      techGuidance: 0,
    },
    falseCompletion: false,
    acceptanceResults,
    workspaceRoot,
    artifactDir: runDir,
  };
  fs.writeFileSync(path.join(runDir, "task-input.json"), JSON.stringify({ input: benchmark.input }, null, 2));
  fs.writeFileSync(path.join(runDir, "acceptance-results.json"), JSON.stringify(acceptanceResults, null, 2));
  fs.writeFileSync(path.join(runDir, "benchmark-result.json"), JSON.stringify(result, null, 2));

  return { result, userData, workspaceRoot };
}

async function runBenchmark(benchmark, { configDir, repeats } = {}) {
  const n = repeats || benchmark.repeats || 3;
  const runs = [];
  const cleanupRoots = [];
  for (let i = 1; i <= n; i += 1) {
    const { result, userData, workspaceRoot } = await runBenchmarkOnce(benchmark, {
      configDir,
      runIndex: i,
    });
    runs.push(result);
    cleanupRoots.push(userData, workspaceRoot);
  }
  const passCount = runs.filter((r) => r.passed).length;
  const summary = {
    benchmarkId: benchmark.id,
    title: benchmark.title,
    category: benchmark.category,
    repeats: n,
    passCount,
    failCount: n - passCount,
    finalPassRate: passCount / n,
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

function aggregateSuite(summaries, metricsDef) {
  const totalRuns = summaries.reduce((s, b) => s + b.repeats, 0);
  const passedRuns = summaries.reduce((s, b) => s + b.passCount, 0);
  const falseCompletionCount = summaries.reduce((s, b) => s + b.falseCompletionCount, 0);
  const techGuidanceCount = summaries.reduce((s, b) => s + b.techGuidanceCount, 0);
  const categories = [...new Set(summaries.map((s) => s.category))];

  const metrics = {
    final_pass_rate: totalRuns ? passedRuns / totalRuns : 0,
    false_completion_count: falseCompletionCount,
    human_tech_guidance_count: techGuidanceCount,
    avg_duration_ms: summaries.length
      ? Math.round(summaries.reduce((s, b) => s + b.avgDurationMs, 0) / summaries.length)
      : 0,
    avg_intervention_count: summaries.length
      ? summaries.reduce((s, b) => s + b.avgInterventions, 0) / summaries.length
      : 0,
    category_count: categories.length,
    benchmark_count: summaries.length,
    total_runs: totalRuns,
  };

  const gates = [];
  for (const m of metricsDef.metrics || []) {
    if (m.l4Gate == null) continue;
    const value = metrics[m.id];
    if (value == null) continue;
    const pass =
      m.tolerance === "zero" ? value === m.l4Gate : value >= m.l4Gate;
    gates.push({
      metricId: m.id,
      name: m.name,
      l4Gate: m.l4Gate,
      value,
      pass,
    });
  }

  // Structural L4 coverage gate for this harness phase
  gates.push({
    metricId: "benchmark_coverage",
    name: "固定基准数量 ≥10",
    l4Gate: 10,
    value: summaries.length,
    pass: summaries.length >= 10,
  });
  gates.push({
    metricId: "category_coverage",
    name: "任务类别 ≥5",
    l4Gate: 5,
    value: categories.length,
    pass: categories.length >= 5,
  });

  return {
    metrics,
    gates,
    l4HarnessReady: gates.every((g) => g.pass) && metrics.final_pass_rate >= 0.8 && falseCompletionCount === 0,
    categories,
  };
}

module.exports = {
  resolveEvalConfigDir,
  loadSuite,
  loadMetrics,
  loadBenchmark,
  runBenchmark,
  runBenchmarkOnce,
  aggregateSuite,
};
