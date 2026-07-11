/**
 * Secret Broker — alias-based injection; models/logs never see plaintext.
 * BL-007 / SEC-004
 */
const crypto = require("crypto");
const { redactSecrets } = require("../error-lessons/redactSecrets.js");

/** @type {Map<string, { value: string, purpose: string, expiresAt: number, createdAt: string }>} */
const vault = new Map();

function brokerEnabled() {
  return String(process.env.WB_SECRET_BROKER || "1") !== "0";
}

function putSecret(alias, value, { purpose = "generic", ttlMs = 15 * 60 * 1000 } = {}) {
  const key = String(alias || "").trim();
  if (!key || !/^[a-zA-Z][a-zA-Z0-9_.-]{1,64}$/.test(key)) {
    const err = new Error("无效秘密别名");
    err.code = "SECRET_ALIAS_INVALID";
    throw err;
  }
  const now = Date.now();
  vault.set(key, {
    value: String(value ?? ""),
    purpose: String(purpose || "generic"),
    expiresAt: now + Math.max(1000, ttlMs),
    createdAt: new Date(now).toISOString(),
  });
  return { alias: key, purpose, expiresAt: new Date(now + Math.max(1000, ttlMs)).toISOString() };
}

function hasSecret(alias) {
  const row = vault.get(String(alias || ""));
  if (!row) return false;
  if (Date.now() > row.expiresAt) {
    vault.delete(String(alias));
    return false;
  }
  return true;
}

function revokeSecret(alias) {
  return vault.delete(String(alias || ""));
}

function listAliases() {
  const now = Date.now();
  const out = [];
  for (const [alias, row] of vault.entries()) {
    if (now > row.expiresAt) {
      vault.delete(alias);
      continue;
    }
    out.push({
      alias,
      purpose: row.purpose,
      expiresAt: new Date(row.expiresAt).toISOString(),
      fingerprint: crypto.createHash("sha256").update(row.value).digest("hex").slice(0, 12),
    });
  }
  return out;
}

/**
 * Build env injections for approved child process.
 * Never returns plaintext to callers except as env map for spawn.
 */
function resolveSecretEnv(aliases = []) {
  if (!brokerEnabled() || !aliases.length) return { env: {}, injected: [] };
  const env = {};
  const injected = [];
  for (const alias of aliases) {
    const row = vault.get(String(alias));
    if (!row || Date.now() > row.expiresAt) {
      const err = new Error(`秘密别名不可用或已过期: ${alias}`);
      err.code = "SECRET_NOT_FOUND";
      throw err;
    }
    // Convention: SECRET_<ALIAS> uppercase
    const envKey = `SECRET_${String(alias).replace(/[^a-zA-Z0-9]/g, "_").toUpperCase()}`;
    env[envKey] = row.value;
    injected.push({ alias: String(alias), envKey, purpose: row.purpose });
  }
  return { env, injected };
}

function redactForLog(text) {
  return redactSecrets(text);
}

function clearExpired() {
  const now = Date.now();
  for (const [k, row] of vault.entries()) {
    if (now > row.expiresAt) vault.delete(k);
  }
}

/** Test helper */
function _resetVaultForTests() {
  vault.clear();
}

module.exports = {
  brokerEnabled,
  putSecret,
  hasSecret,
  revokeSecret,
  listAliases,
  resolveSecretEnv,
  redactForLog,
  clearExpired,
  _resetVaultForTests,
};
