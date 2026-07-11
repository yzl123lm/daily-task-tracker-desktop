/**
 * Network policy — default deny, optional domain allowlist.
 * BL-006 / SEC-002 / TOOL-009
 *
 * Local-jailed backend enforces policy at command + env layer.
 * Docker backend uses --network none when deny.
 */
const DEFAULT_ALLOWLIST = []; // empty = full deny for outbound tooling

function networkPolicyEnabled() {
  return String(process.env.WB_NETWORK_POLICY || "deny").toLowerCase() !== "off";
}

function getNetworkMode(explicit) {
  if (explicit === "allow" || explicit === "allowlist" || explicit === "deny") {
    return explicit;
  }
  const env = String(process.env.WB_NETWORK_POLICY || "deny").toLowerCase();
  if (env === "off" || env === "allow") return "allow";
  if (env === "allowlist") return "allowlist";
  return "deny";
}

function getAllowlist() {
  const raw = process.env.WB_NETWORK_ALLOWLIST || "";
  const fromEnv = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : [...DEFAULT_ALLOWLIST];
}

const NETWORK_CLI_RE =
  /\b(curl|wget|fetch|Invoke-WebRequest|Invoke-RestMethod|bitsadmin|certutil\s+-urlcache)\b/i;
const NETWORK_URL_RE = /https?:\/\/|ftp:\/\//i;

function assertCommandNetworkAllowed(command, { network } = {}) {
  const mode = getNetworkMode(network);
  if (mode === "allow" || !networkPolicyEnabled()) {
    return { ok: true, mode };
  }
  const cmd = String(command || "");
  if (NETWORK_CLI_RE.test(cmd) || NETWORK_URL_RE.test(cmd)) {
    if (mode === "allowlist") {
      const list = getAllowlist();
      const hosts = [...cmd.matchAll(/https?:\/\/([^/\s:]+)/gi)].map((m) => m[1].toLowerCase());
      const blocked = hosts.filter((h) => !list.some((a) => h === a || h.endsWith(`.${a}`)));
      if (!hosts.length || blocked.length) {
        const err = new Error(
          `网络策略拒绝：命令含外连且域名不在 allowlist（${blocked.join(", ") || "未知主机"}）`
        );
        err.code = "NETWORK_DENIED";
        throw err;
      }
      return { ok: true, mode, hosts };
    }
    const err = new Error("网络策略默认拒绝：禁止 curl/wget/URL 外连");
    err.code = "NETWORK_DENIED";
    throw err;
  }
  return { ok: true, mode };
}

function assertUrlAllowed(url, { network } = {}) {
  const mode = getNetworkMode(network);
  if (mode === "allow" || !networkPolicyEnabled()) {
    return { ok: true, mode };
  }
  let host = "";
  try {
    host = new URL(String(url)).hostname.toLowerCase();
  } catch {
    const err = new Error("无效 URL");
    err.code = "NETWORK_DENIED";
    throw err;
  }
  if (mode === "deny") {
    const err = new Error(`网络策略默认拒绝：${host}`);
    err.code = "NETWORK_DENIED";
    throw err;
  }
  const list = getAllowlist();
  if (!list.some((a) => host === a || host.endsWith(`.${a}`))) {
    const err = new Error(`域名不在 allowlist：${host}`);
    err.code = "NETWORK_DENIED";
    throw err;
  }
  return { ok: true, mode, host };
}

/** Env scrub for deny mode — remove common proxy / cloud creds from child env */
function scrubNetworkEnv(baseEnv, { network } = {}) {
  const mode = getNetworkMode(network);
  const env = { ...baseEnv };
  if (mode === "allow") return env;
  const drop = [
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "NO_PROXY",
    "no_proxy",
    "FTP_PROXY",
    "SOCKS_PROXY",
  ];
  for (const k of drop) delete env[k];
  env.WB_NETWORK_POLICY = mode;
  // Discourage Node auto-fetch tooling in deny mode
  if (mode === "deny") {
    env.WB_SANDBOX_NETWORK = "deny";
  }
  return env;
}

function dockerNetworkArgs(network) {
  const mode = getNetworkMode(network);
  if (mode === "deny") return ["--network", "none"];
  if (mode === "allowlist") return ["--network", "bridge"]; // finer filter left to app layer
  return [];
}

module.exports = {
  networkPolicyEnabled,
  getNetworkMode,
  getAllowlist,
  assertCommandNetworkAllowed,
  assertUrlAllowed,
  scrubNetworkEnv,
  dockerNetworkArgs,
};
