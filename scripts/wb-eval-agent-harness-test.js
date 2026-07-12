/**
 * Smoke test for Eval Agent E3 (harness mode — no LLM required).
 */
const assert = require("assert");
const path = require("path");
const { spawnSync } = require("child_process");

const r = spawnSync(
  process.execPath,
  [
    path.join(__dirname, "wb-eval-agent-harness.js"),
    "--mode",
    "harness",
    "--only",
    "B01-static-web,B02-node-cli",
    "--repeats",
    "1",
  ],
  {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    env: { ...process.env, WB_EVAL_AGENT: "1", WB_EVAL_AGENT_MODE: "harness" },
    timeout: 120000,
  }
);

if (r.status !== 0) {
  console.error(r.stdout);
  console.error(r.stderr);
  process.exit(r.status || 1);
}
assert.ok(/E3 cases:\s*\*\*\s*[1-9]/m.test(r.stdout) || /e3_case_count.: [1-9]/.test(r.stdout) || /E3 cases: \*\*[1-9]/.test(r.stdout) || /agent_run|Evidence|wb-eval-agent-harness: OK/.test(r.stdout));
assert.ok(/wb-eval-agent-harness: OK/.test(r.stdout));
console.log("wb-eval-agent-harness-test: OK");
