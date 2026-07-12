/**
 * AGT-010 offline replay smoke tests (no live LLM).
 */
const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");
const {
  createReplayTrace,
  recordReplayTurn,
  finalizeReplayTrace,
  validateReplayTrace,
  extractUsageFromLlmResult,
} = require("../main/workbench/agentReplayCapture.js");
const { compareTurn, aggregateCompareReport, contentSimilarity } = require("../main/workbench/agentReplayCompare.js");
const {
  loadReplayInput,
  runOfflineReplay,
  extractReplayTraceFromInput,
} = require("../main/workbench/agentOfflineReplay.js");

const fixture = path.join(__dirname, "..", "config", "wb-replay", "fixtures", "min-trace.v1.json");
const alt = path.join(__dirname, "..", "config", "wb-replay", "fixtures", "alt-trace.v1.json");

// Capture helpers
const trace = createReplayTrace({ mode: "PLAN_ONLY", toolNames: ["list_files"], agentRunId: "r1" });
recordReplayTurn(trace, {
  messages: [
    { role: "system", content: "sys" },
    { role: "user", content: "hi" },
  ],
  assistantContent: "hello <think>secret</think> world",
  toolCalls: [{ id: "1", name: "list_files", arguments: { prefix: "" } }],
  gatewayMeta: { purpose: "planner", used: { model: "m1" } },
  usage: extractUsageFromLlmResult(
    { response: { raw: { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }, provider: "t" } },
    42
  ),
});
const finalized = finalizeReplayTrace(trace);
assert.strictEqual(finalized.kind, "agent_replay_trace");
assert.ok(finalized.turns[0].assistantContent.includes("hello"));
assert.ok(!finalized.turns[0].assistantContent.includes("<think>"));
assert.strictEqual(finalized.totals.totalTokens, 15);
assert.ok(validateReplayTrace(finalized).ok);

// Compare
assert.ok(contentSimilarity("a b c", "a b c") === 1);
const tcmp = compareTurn(finalized.turns[0], finalized.turns[0]);
assert.ok(tcmp.matchScore >= 0.99);
const agg = aggregateCompareReport([tcmp], { baselineLabel: "a", candidateLabel: "b" });
assert.strictEqual(agg.turnsCompared, 1);

// Load fixtures + offline compare
const { trace: base } = loadReplayInput(fixture);
const { trace: cand } = loadReplayInput(alt);
assert.ok(validateReplayTrace(base).ok);

(async () => {
  const dry = await runOfflineReplay({ trace: base, dryRun: true });
  assert.ok(dry.ok);
  assert.ok(dry.selfCheck.pass);

  const cmp = await runOfflineReplay({
    trace: base,
    candidateTrace: { ...cand, label: "alt" },
    dryRun: false,
    pricing: { promptPer1kUsd: 0.001, completionPer1kUsd: 0.002 },
  });
  assert.ok(cmp.ok);
  assert.ok(cmp.comparisons.length === 1);
  assert.ok(cmp.comparisons[0].deltaTokens !== 0);

  // Evidence-shaped extraction
  const fromEvp = extractReplayTraceFromInput({
    version: 2,
    kind: "evidence_package",
    agentRun: { output: { replayTrace: base } },
  });
  assert.strictEqual(fromEvp.kind, "agent_replay_trace");

  const r = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "wb-agent-replay.js"),
      "--input",
      fixture,
      "--candidate",
      alt,
      "--dry-run",
    ],
    { cwd: path.join(__dirname, ".."), encoding: "utf8", timeout: 30000 }
  );
  if (r.status !== 0) {
    console.error(r.stdout);
    console.error(r.stderr);
    process.exit(r.status || 1);
  }
  assert.ok(/wb-agent-replay: OK/.test(r.stdout));
  console.log("wb-agent-replay-test: OK");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
