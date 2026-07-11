/**
 * Smoke test for Eval Harness (BL-004) — runs suite with repeats=1 for speed.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  resolveEvalConfigDir,
  loadSuite,
  loadMetrics,
  loadBenchmark,
  runBenchmark,
  aggregateSuite,
} = require("../main/workbench/evaluation/benchmarkRunner.js");

(async () => {
  const configDir = resolveEvalConfigDir();
  const suite = loadSuite(configDir);
  const metrics = loadMetrics(configDir);
  assert.strictEqual(suite.benchmarks.length, 10, "must define 10 fixed benchmarks");
  assert.ok(metrics.metrics.some((m) => m.id === "final_pass_rate"));
  assert.ok(metrics.metrics.some((m) => m.id === "false_completion_count"));

  for (const id of suite.benchmarks) {
    const b = loadBenchmark(configDir, id);
    assert.ok(b.hiddenAcceptances?.length, `${id} needs hidden acceptances`);
    assert.ok(b.fixture, `${id} needs fixture`);
  }

  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-eval-test-"));
  const summaries = [];
  for (const id of suite.benchmarks) {
    const bench = loadBenchmark(configDir, id);
    const { summary } = await runBenchmark(bench, { configDir, repeats: 1 });
    summaries.push(summary);
    assert.strictEqual(summary.passCount, 1, `${id} should pass: ${JSON.stringify(summary.runs[0]?.acceptanceResults)}`);
  }

  const agg = aggregateSuite(summaries, metrics);
  assert.ok(agg.metrics.final_pass_rate === 1);
  assert.strictEqual(agg.metrics.false_completion_count, 0);
  assert.ok(agg.l4HarnessReady);
  assert.ok(agg.categories.length >= 5);

  fs.writeFileSync(
    path.join(outDir, "harness-report.json"),
    JSON.stringify({ ...agg, benchmarks: summaries }, null, 2)
  );
  console.log("wb-eval-harness-test: OK");
  console.log(`  categories=${agg.categories.join(",")} pass_rate=100% report=${outDir}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
