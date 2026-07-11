/**
 * Independent Eval Harness (BL-004 / EVAL-001~004)
 * CLI / CI entry — does not depend on Electron UI.
 *
 * Usage:
 *   node scripts/wb-eval-harness.js
 *   node scripts/wb-eval-harness.js --only B01-static-web,B10-security-redteam
 *   node scripts/wb-eval-harness.js --repeats 1 --out ./eval-out
 */
const fs = require("fs");
const path = require("path");
const {
  resolveEvalConfigDir,
  loadSuite,
  loadMetrics,
  loadBenchmark,
  runBenchmark,
  aggregateSuite,
} = require("../main/workbench/evaluation/benchmarkRunner.js");

function parseArgs(argv) {
  const args = {
    only: null,
    repeats: null,
    out: null,
    config: null,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--only") args.only = String(argv[++i] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    else if (a === "--repeats") args.repeats = Number(argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`wb-eval-harness — 鲸落AI Project Agent 内部评测

Options:
  --only id1,id2   只跑指定基准
  --repeats N      覆盖默认重复次数（默认各基准 JSON 内 repeats，通常为 3）
  --out DIR        写入汇总报告目录
  --config DIR     指定 config/wb-eval 目录
  --json           向 stdout 打印 JSON 汇总
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const configDir = resolveEvalConfigDir(args.config);
  const suite = loadSuite(configDir);
  const metricsDef = loadMetrics(configDir);
  const ids = args.only?.length ? args.only : suite.benchmarks;

  const started = Date.now();
  const summaries = [];
  const cleanup = [];

  console.log(`Eval Harness suite=${suite.id} mode=${suite.mode} benchmarks=${ids.length}`);

  for (const id of ids) {
    const bench = loadBenchmark(configDir, id);
    process.stdout.write(`  ▶ ${bench.id} … `);
    const { summary, cleanupRoots } = await runBenchmark(bench, {
      configDir,
      repeats: args.repeats || bench.repeats || suite.defaultRepeats || 3,
    });
    summaries.push(summary);
    cleanup.push(...(cleanupRoots || []));
    const mark = summary.passCount === summary.repeats ? "PASS" : "FAIL";
    console.log(
      `${mark} (${summary.passCount}/${summary.repeats}, rate=${(summary.finalPassRate * 100).toFixed(0)}%)`
    );
    if (summary.passCount < summary.repeats) {
      const failed = summary.runs.find((r) => !r.passed);
      const firstFail = failed?.acceptanceResults?.find((a) => !a.ok);
      if (firstFail) {
        console.log(`      └─ ${firstFail.name}: ${firstFail.message}`);
      }
    }
  }

  const agg = aggregateSuite(summaries, metricsDef);
  const report = {
    version: 1,
    kind: "wb_eval_harness_report",
    suiteId: suite.id,
    suiteVersion: suite.version,
    metricsVersion: metricsDef.version,
    mode: suite.mode,
    generatedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    ...agg,
    benchmarks: summaries,
  };

  const outDir =
    args.out ||
    path.join(process.cwd(), "eval-out", `run-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "harness-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  // Human-readable summary
  const md = [
    `# Eval Harness Report`,
    ``,
    `- Suite: ${suite.id} v${suite.version}`,
    `- Mode: ${suite.mode}`,
    `- Generated: ${report.generatedAt}`,
    `- Final pass rate: ${(agg.metrics.final_pass_rate * 100).toFixed(1)}%`,
    `- False completions: ${agg.metrics.false_completion_count}`,
    `- L4 harness ready (probe): ${agg.l4HarnessReady ? "YES" : "NO"}`,
    ``,
    `## Gates`,
    ...agg.gates.map(
      (g) => `- [${g.pass ? "x" : " "}] ${g.name}: value=${g.value} gate=${g.l4Gate}`
    ),
    ``,
    `## Benchmarks`,
    ...summaries.map(
      (s) =>
        `- ${s.benchmarkId}: ${s.passCount}/${s.repeats} (${(s.finalPassRate * 100).toFixed(0)}%) [${s.category}]`
    ),
    ``,
    `> Note: capability_probe 验证 Harness/隐藏验收/现有门禁可复现；完整 LLM Agent E3 需后续 agent 模式。`,
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "harness-report.md"), md, "utf8");

  console.log("");
  console.log(`Report: ${reportPath}`);
  console.log(
    `final_pass_rate=${(agg.metrics.final_pass_rate * 100).toFixed(1)}% false_completion=${agg.metrics.false_completion_count} l4HarnessReady=${agg.l4HarnessReady}`
  );

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  // Best-effort cleanup of temp dirs (report already written)
  for (const root of cleanup) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows sqlite locks */
    }
  }

  if (!agg.l4HarnessReady || agg.metrics.final_pass_rate < 1) {
    // For CI: require all probe runs green in capability_probe phase
    process.exitCode = agg.metrics.final_pass_rate < 1 ? 1 : 0;
  }
}

module.exports = { main, parseArgs };

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
