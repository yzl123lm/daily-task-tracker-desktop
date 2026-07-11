/**
 * Sandbox adapter — local-jailed (default) + optional docker.
 * BL-005 / BL-006 / BL-008
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { toSpawnSpec } = require("./argvParse.js");
const { killProcessTree } = require("./processTree.js");
const {
  assertCommandNetworkAllowed,
  scrubNetworkEnv,
  dockerNetworkArgs,
  getNetworkMode,
} = require("./networkPolicyService.js");
const { resolveSecretEnv, redactForLog } = require("./secretBrokerService.js");
const { sandboxMode } = require("./workspaceSessionManager.js");

const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_MAX_OUTPUT = 16000;
const DEFAULT_MAX_BUFFER = 2 * 1024 * 1024; // hard cap collected before truncate

function quotasFromEnv() {
  return {
    timeoutMs: Number(process.env.WB_SANDBOX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    maxOutputChars: Number(process.env.WB_SANDBOX_MAX_OUTPUT || DEFAULT_MAX_OUTPUT),
    maxBufferBytes: Number(process.env.WB_SANDBOX_MAX_BUFFER || DEFAULT_MAX_BUFFER),
  };
}

function dockerAvailable() {
  try {
    const r = spawnSync("docker", ["version", "--format", "{{.Server.Version}}"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 5000,
    });
    return r.status === 0;
  } catch {
    return false;
  }
}

function buildChildEnv({ network, secretAliases = [], extraEnv = {} } = {}) {
  const base = scrubNetworkEnv({ ...process.env, CI: "1", FORCE_COLOR: "0" }, { network });
  // Strip host secrets from child by default
  const stripKeys = Object.keys(base).filter((k) =>
    /^(AWS_|AZURE_|GOOGLE_|OPENAI_|ANTHROPIC_|GITHUB_TOKEN|NPM_TOKEN|SECRET_)/i.test(k)
  );
  for (const k of stripKeys) {
    // Keep only broker-injected SECRET_* below
    if (!k.startsWith("SECRET_")) delete base[k];
  }
  const { env: secretEnv, injected } = resolveSecretEnv(secretAliases);
  Object.assign(base, secretEnv, extraEnv);
  base.WB_SANDBOX_MODE = sandboxMode();
  return { env: base, secretsInjected: injected };
}

function runLocalJailed({
  command,
  argv,
  cwd,
  network = "deny",
  secretAliases = [],
  timeoutMs,
  maxOutputChars,
  maxBufferBytes,
  extraEnv = {},
}) {
  const displayCmd = Array.isArray(argv) ? argv.join(" ") : String(command || "");
  assertCommandNetworkAllowed(displayCmd, { network });

  const spec = toSpawnSpec(argv || command);
  const q = quotasFromEnv();
  const tMs = timeoutMs || q.timeoutMs;
  const maxOut = maxOutputChars || q.maxOutputChars;
  const maxBuf = maxBufferBytes || q.maxBufferBytes;

  if (!cwd || !fs.existsSync(cwd)) {
    const err = new Error("沙箱 cwd 不存在");
    err.code = "SANDBOX_CWD";
    throw err;
  }

  const { env, secretsInjected } = buildChildEnv({ network, secretAliases, extraEnv });

  return new Promise((resolve, reject) => {
    const useShell =
      process.platform === "win32" && /\.(cmd|bat)$/i.test(String(spec.file || ""));
    const child = spawn(spec.file, spec.args, {
      cwd: path.resolve(cwd),
      // Windows .cmd/.bat require shell:true; args remain pre-validated tokens (no interpolation).
      shell: useShell,
      windowsHide: true,
      env,
      detached: process.platform !== "win32",
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;
    let settled = false;

    const timer = setTimeout(() => {
      killProcessTree(child.pid);
      if (!settled) {
        settled = true;
        reject(Object.assign(new Error("命令执行超时"), { code: "SANDBOX_TIMEOUT", argv: spec.argv }));
      }
    }, tMs);

    const append = (which, buf) => {
      const chunk = String(buf);
      const cur = which === "out" ? stdout : stderr;
      if (Buffer.byteLength(cur, "utf8") + Buffer.byteLength(chunk, "utf8") > maxBuf) {
        truncated = true;
        return;
      }
      if (which === "out") stdout += chunk;
      else stderr += chunk;
    };

    child.stdout.on("data", (b) => append("out", b));
    child.stderr.on("data", (b) => append("err", b));
    child.on("error", (err) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({
        command: spec.display,
        argv: spec.argv,
        exitCode: code,
        stdout: redactForLog(stdout).slice(0, maxOut),
        stderr: redactForLog(stderr).slice(0, maxOut),
        success: code === 0,
        truncated,
        network: getNetworkMode(network),
        sandbox: "local-jailed",
        secretsInjected: secretsInjected.map((s) => ({ alias: s.alias, envKey: s.envKey })),
        observation: {
          status: code === 0 ? "ok" : "failed",
          exitCode: code,
          failureClass: code === 0 ? null : "command_exit",
        },
      });
    });
  });
}

function runDocker({
  command,
  argv,
  cwd,
  network = "deny",
  secretAliases = [],
  timeoutMs,
  maxOutputChars,
  image = process.env.WB_SANDBOX_DOCKER_IMAGE || "node:20-bookworm-slim",
}) {
  if (!dockerAvailable()) {
    const err = new Error("Docker 不可用，无法使用 docker 沙箱后端");
    err.code = "DOCKER_UNAVAILABLE";
    throw err;
  }
  const displayCmd = Array.isArray(argv) ? argv.join(" ") : String(command || "");
  assertCommandNetworkAllowed(displayCmd, { network });
  const spec = toSpawnSpec(argv || command);
  const q = quotasFromEnv();
  const work = path.resolve(cwd);
  const dockerArgv = [
    "run",
    "--rm",
    ...dockerNetworkArgs(network),
    "--workdir",
    "/workspace",
    "-v",
    `${work}:/workspace:rw`,
    image,
    ...spec.argv,
  ];
  // Re-enter local runner with docker argv, network allow for docker CLI itself
  return runLocalJailed({
    argv: ["docker", ...dockerArgv],
    cwd: work,
    network: "allow", // docker client talks to daemon; container network is none
    secretAliases,
    timeoutMs: timeoutMs || q.timeoutMs,
    maxOutputChars: maxOutputChars || q.maxOutputChars,
    extraEnv: {},
  }).then((r) => ({
    ...r,
    sandbox: "docker",
    network: getNetworkMode(network),
    containerImage: image,
    argv: spec.argv,
    command: spec.display,
  }));
}

/**
 * Unified entry used by shellRunnerService.
 */
async function runInSandbox(options = {}) {
  const mode = options.mode || sandboxMode();
  if (mode === "host") {
    // Still argv + redact + network command checks, but cwd may be host project
    return runLocalJailed({ ...options, network: options.network || "deny" });
  }
  if (mode === "docker") {
    try {
      return await runDocker(options);
    } catch (err) {
      if (err.code === "DOCKER_UNAVAILABLE") {
        return runLocalJailed(options);
      }
      throw err;
    }
  }
  return runLocalJailed(options);
}

module.exports = {
  runInSandbox,
  runLocalJailed,
  runDocker,
  dockerAvailable,
  quotasFromEnv,
  buildChildEnv,
};
