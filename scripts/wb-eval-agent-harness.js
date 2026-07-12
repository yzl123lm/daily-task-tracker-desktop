/**
 * Eval Agent-mode E3 harness (EVAL / 真端到端)
 *
 * Usage:
 *   npm run wb:eval:agent
 *   npm run wb:eval:agent -- --only B01-static-web
 *   WB_EVAL_AGENT_MODE=live npm run wb:eval:agent
 *
 * Default mode=harness: deterministic agent-like pipeline with real agent_run + Evidence Package.
 * live: requires AI profile credentials; skips (exit 0) if unavailable unless WB_EVAL_AGENT_FAIL_IF_NO_LLM=1.
 */
const fs = require("fs");
const path = require("path");
const {
  resolveEvalConfigDir,
  loadBenchmark,
  loadMetrics,
} = require("../main/workbench/evaluation/benchmarkRunner.js");
const {
  agentMode,
  checkLlmAvailable,
  runAgentBenchmark,
  aggregateAgentSuite,
} = require("../main/workbench/evaluation/agentBenchmarkRunner.js");

function parseArgs(argv) {
  const args = { only: null, repeats: 1, out: null, config: null, json: false, mode: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--only") args.only = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--repeats") args.repeats = Number(argv[++i]) || 1;
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--config") args.config = argv[++i];
    else if (a === "--mode") args.mode = String(argv[++i] || "").toLowerCase();
    else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function loadAgentSuite(configDir) {
  const file = path.join(configDir, "suite.agent.v1.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function printHelp() {
  console.log(`wb-eval-agent-harness — Project Agent E3 评测

Options:
  --only id1,id2   只跑指定基准（默认 suite.agent.v1.json）
  --repeats N      重复次数（默认 1）
  --mode harness|live
  --out DIR        写入汇总报告
  --config DIR     config/wb-eval 目录
  --json           stdout JSON

Env:
  WB_EVAL_AGENT_MODE=harness|live
  WB_EVAL_AGENT_SKIP_IF_NO_LLM=1
  WB_EVAL_AGENT_FAIL_IF_NO_LLM=1
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  process.env.WB_EVAL_AGENT = "1";
  if (args.mode) process.env.WB_EVAL_AGENT_MODE = args.mode;

  const configDir = resolveEvalConfigDir(args.config);
  const suite = loadAgentSuite(configDir);
  const mode = agentMode();
  const llm = checkLlmAvailable();
  const ids = args.only?.length ? args.only : suite.benchmarks;

  console.log(
    `Eval Agent E3 suite=${suite.id} mode=${mode} llm=${llm.available ? "yes" : `no(${llm.reason})`} benchmarks=${ids.length}`
  );

  const summaries = [];
  const cleanup = [];
  for (const id of ids) {
    const bench = loadBenchmark(configDir, id);
    bench.agentFixture = bench.agentFixture || suite.agentDefaults?.fixture || "empty";
    process.stdout.write(`  ▶ ${bench.id} [${mode}] … `);
    const { summary, cleanupRoots } = await runAgentBenchmark(bench, {
      configDir,
      repeats: args.repeats || suite.defaultRepeats || 1,
      mode,
    });
    cleanup.push(...cleanupRoots);
    summaries.push(summary);
    const mark = summary.skipCount === summary.repeats ? "SKIP" : summary.failCount ? "FAIL" : "PASS";
    console.log(
      `${mark} pass=${summary.passCount}/${summary.repeats - summary.skipCount} skip=${summary.skipCount} ${summary.avgDurationMs}ms`
    );
  }

  const agg = aggregateAgentSuite(summaries);
  const outDir =
    args.out ||
    path.join(osTmp(), `wb-eval-agent-out-${Date.now()}`);
  fs.mkdirSync(outDir, { recursive: true });
  const report = {
    suite: suite.id,
    mode: "agent",
    agentMode: mode,
    llm,
    generatedAt: new Date().toISOString(),
    summaries,
    ...agg,
  };
  fs.writeFileSync(path.join(outDir, "harness-report.json"), JSON.stringify(report, null, 2));
  const md = [
    `# Eval Agent E3 Report`,
    ``,
    `- mode: **${mode}**`,
    `- llm: ${llm.available ? `${llm.model || "ok"}` : `unavailable (${llm.reason})`}`,
    `- E3 cases: **${agg.metrics.e3_case_count}**`,
    `- pass_at_1: ${agg.metrics.pass_at_1 == null ? "n/a" : (agg.metrics.pass_at_1 * 100).toFixed(1) + "%"}`,
    `- false_completion: ${agg.metrics.false_completion_count}`,
    `- l4AgentReady: ${agg.l4AgentReady}`,
    ``,
    `## Gates`,
    ...agg.gates.map((g) => `- ${g.pass ? "PASS" : "FAIL"} ${g.name}: ${g.value} (gate ${g.l4Gate})`),
    ``,
    `## E3 Cases`,
    ...(agg.e3Cases.length
      ? agg.e3Cases.map((c) => `- ${c.benchmarkId} run=${c.agentRunId} hash=${c.evidenceHash} path=${c.agentPath}`)
      : ["- (none)"]),
    ``,
  ].join("\n");
  fs.writeFileSync(path.join(outDir, "harness-report.md"), md, "utf8");
  console.log(`\nReport: ${outDir}`);
  console.log(md);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  // Cleanup temp workspaces (best effort)
  for (const root of cleanup) {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  const allSkipped = summaries.every((s) => s.skipCount === s.repeats);
  if (allSkipped) {
    console.log("wb-eval-agent-harness: SKIPPED (no LLM) — exit 0");
    return;
  }
  if (!agg.l4AgentReady || summaries.some((s) => s.failCount > 0)) {
    console.error("wb-eval-agent-harness: FAILED");
    process.exit(1);
  }
  console.log("wb-eval-agent-harness: OK");
}

function osTmp() {
  return require("os").tmpdir();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
