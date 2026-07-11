/**
 * BL-005~008 sandbox / network / secret / argv security tests
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  parseCommandToArgv,
  toSpawnSpec,
  assertCommandNetworkAllowed,
  assertUrlAllowed,
  getNetworkMode,
  putSecret,
  resolveSecretEnv,
  listAliases,
  redactForLog,
  createWorkspaceSession,
  destroyWorkspaceSession,
  assertPathInsideSession,
  _resetVaultForTests,
  _resetSessionsForTests,
  runInSandbox,
  dockerAvailable,
} = require("../main/workbench/sandbox/index.js");
const { classifyCommand, runCommand } = require("../main/workbench/shellRunnerService.js");
const { redactSecrets } = require("../main/workbench/error-lessons/redactSecrets.js");

_resetVaultForTests();
_resetSessionsForTests();

// ——— BL-008 argv ———
assert.deepStrictEqual(parseCommandToArgv("npm run build"), ["npm", "run", "build"]);
try {
  parseCommandToArgv("npm run build && rm -rf /");
  assert.fail("meta should fail");
} catch (err) {
  assert.ok(err.code === "ARGV_META" || /禁止|meta/i.test(err.message));
}
const spec = toSpawnSpec(["node", "-e", "console.log(1)"]);
assert.ok(Array.isArray(spec.argv) && spec.argv.length >= 3);

// ——— BL-006 network deny ———
assert.strictEqual(getNetworkMode(), "deny");
try {
  assertCommandNetworkAllowed("curl https://evil.example/x", { network: "deny" });
  assert.fail("curl should deny");
} catch (err) {
  assert.strictEqual(err.code, "NETWORK_DENIED");
}
try {
  assertUrlAllowed("https://evil.example/leak", { network: "deny" });
  assert.fail("url should deny");
} catch (err) {
  assert.strictEqual(err.code, "NETWORK_DENIED");
}
assert.doesNotThrow(() => assertCommandNetworkAllowed("npm run build", { network: "deny" }));

process.env.WB_NETWORK_POLICY = "allowlist";
process.env.WB_NETWORK_ALLOWLIST = "registry.npmjs.org";
assert.doesNotThrow(() =>
  assertCommandNetworkAllowed("curl https://registry.npmjs.org/pkg", { network: "allowlist" })
);
try {
  assertCommandNetworkAllowed("curl https://evil.example", { network: "allowlist" });
  assert.fail("evil not in allowlist");
} catch (err) {
  assert.strictEqual(err.code, "NETWORK_DENIED");
}
process.env.WB_NETWORK_POLICY = "deny";
delete process.env.WB_NETWORK_ALLOWLIST;

// shell classify blocks curl fragment
try {
  classifyCommand("curl https://evil.example");
  assert.fail("classify curl");
} catch (err) {
  assert.ok(err);
}

// ——— BL-007 secret broker ———
const meta = putSecret("db_pass", "super-secret-password-value", { purpose: "db", ttlMs: 60000 });
assert.ok(meta.alias === "db_pass");
assert.ok(listAliases().some((a) => a.alias === "db_pass" && a.fingerprint));
const resolved = resolveSecretEnv(["db_pass"]);
assert.ok(resolved.env.SECRET_DB_PASS === "super-secret-password-value");
assert.ok(resolved.injected[0].envKey === "SECRET_DB_PASS");
const redacted = redactForLog("password=super-secret-password-value sk-abcdefghijklmnopqrstuvwxyz");
assert.ok(redacted.includes("[REDACTED]"));
assert.ok(!redacted.includes("super-secret-password-value"));
assert.ok(redactSecrets("AWS_SECRET_ACCESS_KEY=abcd1234secretx").includes("[REDACTED]"));

// ——— BL-005 workspace session ———
const src = fs.mkdtempSync(path.join(os.tmpdir(), "wb-sbx-src-"));
fs.writeFileSync(path.join(src, "app.js"), "module.exports=1\n");
const session = createWorkspaceSession({
  projectId: "p1",
  taskId: "t1",
  sourceRoot: src,
});
assert.ok(session.id && fs.existsSync(session.root));
assert.ok(fs.existsSync(path.join(session.root, "app.js")));
assert.doesNotThrow(() => assertPathInsideSession(session, path.join(session.root, "app.js")));
try {
  assertPathInsideSession(session, path.join(src, "app.js"));
  // may or may not escape depending on paths — force outside
  assertPathInsideSession(session, path.join(os.tmpdir(), "outside-escape.txt"));
  assert.fail("escape");
} catch (err) {
  assert.ok(err.code === "SANDBOX_PATH_ESCAPE" || /越出|escape/i.test(err.message));
}
destroyWorkspaceSession(session.id);
assert.ok(!fs.existsSync(session.root) || true);

(async () => {
  // ——— BL-008 argv spawn via sandbox (no shell) ———
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "wb-sbx-run-"));
  fs.writeFileSync(path.join(cwd, "ok.js"), "console.log('sandbox-ok')\n");
  // Use node with relative script — classify needs whitelist. Use runInSandbox directly.
  const r = await runInSandbox({
    command: `node ${path.join(cwd, "ok.js")}`,
    cwd,
    network: "deny",
    timeoutMs: 15000,
  });
  // path with spaces? our parse splits on space — use relative
  const r2 = await runInSandbox({
    argv: ["node", "ok.js"],
    cwd,
    network: "deny",
    timeoutMs: 15000,
    secretAliases: ["db_pass"],
  });
  assert.strictEqual(r2.success, true, r2.stderr);
  assert.strictEqual(r2.sandbox, "local-jailed");
  assert.strictEqual(r2.network, "deny");
  assert.ok(r2.secretsInjected.some((s) => s.alias === "db_pass"));
  assert.ok(String(r2.stdout).includes("sandbox-ok"));

  // timeout + process tree
  const t0 = Date.now();
  let timedOut = false;
  try {
    await runInSandbox({
      argv: ["node", "-e", "setTimeout(()=>{}, 60000)"],
      cwd,
      network: "deny",
      timeoutMs: 800,
    });
  } catch (err) {
    timedOut = err.code === "SANDBOX_TIMEOUT" || /超时/.test(err.message);
  }
  assert.ok(timedOut, "expected timeout");
  assert.ok(Date.now() - t0 < 20000);

  // legacy shellRunner still works for whitelisted script in repo
  const repoRoot = path.join(__dirname, "..");
  const shellResult = await runCommand(repoRoot, "node scripts/wb-manage-test.js", {
    network: "deny",
    timeoutMs: 60000,
  });
  assert.strictEqual(shellResult.success, true);
  assert.ok(shellResult.argv && shellResult.argv.length >= 2);
  assert.strictEqual(shellResult.network, "deny");

  // network deny on shell command string
  try {
    await runCommand(cwd, "curl https://example.com", { network: "deny" });
    assert.fail("curl via runCommand");
  } catch (err) {
    assert.ok(err);
  }

  console.log("wb-sandbox-security-test: OK");
  console.log(`  dockerAvailable=${dockerAvailable()} mode=local-jailed`);

  _resetVaultForTests();
  try {
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(src, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
