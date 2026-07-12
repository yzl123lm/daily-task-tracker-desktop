/**
 * AGT-010 Offline Replay CLI
 *
 * Usage:
 *   npm run wb:replay -- --input config/wb-replay/fixtures/min-trace.v1.json --dry-run
 *   npm run wb:replay -- --input baseline.json --candidate alt.json --out report.json
 */
const fs = require("fs");
const path = require("path");
const {
  loadReplayInput,
  loadPricing,
  runOfflineReplay,
  formatReplayReportMarkdown,
} = require("../main/workbench/agentOfflineReplay.js");

function parseArgs(argv) {
  const args = {
    input: null,
    candidate: null,
    out: null,
    dryRun: false,
    live: false,
    models: [],
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--input") args.input = argv[++i];
    else if (a === "--candidate") args.candidate = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--live") args.live = true;
    else if (a === "--models") {
      args.models = String(argv[++i] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((m) => ({ label: m, profileId: m, model: m }));
    } else if (a === "--json") args.json = true;
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printHelp() {
  console.log(`wb-agent-replay — AGT-010 Offline Replay

Options:
  --input PATH       Evidence package or replayTrace JSON
  --candidate PATH   Alternate recorded trace for offline compare
  --dry-run          Validate + self-check only
  --live --models a,b  Call live models (requires credentials)
  --out DIR|FILE     Write report JSON/MD
  --json             Print JSON to stdout
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.input) {
    printHelp();
    if (!args.input) process.exit(args.help ? 0 : 1);
    return;
  }

  const inputPath = path.resolve(args.input);
  const { trace } = loadReplayInput(inputPath);
  if (!trace) {
    console.error("No replayTrace found in input (need agent_replay_trace or evidence package with replayTrace)");
    process.exit(1);
  }

  let candidateTrace = null;
  if (args.candidate) {
    candidateTrace = loadReplayInput(path.resolve(args.candidate)).trace;
    if (candidateTrace) candidateTrace.label = candidateTrace.label || path.basename(args.candidate);
  }

  const pricingRoot = path.join(__dirname, "..", "config", "wb-replay");
  const pricingTable = loadPricing(pricingRoot);
  const pricing = pricingTable?.default || pricingTable;

  const report = await runOfflineReplay({
    trace,
    candidateTrace,
    models: args.models,
    dryRun: args.dryRun || (!args.live && !args.candidate),
    live: args.live,
    pricing,
  });

  const md = formatReplayReportMarkdown(report);
  console.log(md);

  if (args.out) {
    const outPath = path.resolve(args.out);
    const isDir = !/\.json$/i.test(outPath);
    const dir = isDir ? outPath : path.dirname(outPath);
    fs.mkdirSync(dir, { recursive: true });
    const jsonPath = isDir ? path.join(dir, "replay-report.json") : outPath;
    const mdPath = isDir ? path.join(dir, "replay-report.md") : outPath.replace(/\.json$/i, ".md");
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    fs.writeFileSync(mdPath, md, "utf8");
    console.log(`Wrote ${jsonPath}`);
  }

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  }

  if (!report.ok) {
    console.error("wb-agent-replay: FAILED");
    process.exit(1);
  }
  console.log("wb-agent-replay: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
