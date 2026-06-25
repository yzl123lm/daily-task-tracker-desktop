const path = require("path");
const crypto = require("crypto");
const { app, safeStorage } = require("electron");
const { writeJsonFile } = require("../utils/settingsStore.js");
const {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  normalizeModelNameForMiniMax,
  normalizeOpenAiChatBaseUrl,
  normalizeApiKey,
  allowsChatWithoutApiKey,
} = require("./apiNormalize.js");

function defaultProfileId() {
  return "default";
}

function settingsPath() {
  return path.join(app.getPath("userData"), "ai-settings.json");
}

function decryptKeyB64(encryptedKeyB64) {
  if (!encryptedKeyB64 || !safeStorage.isEncryptionAvailable()) {
    return "";
  }
  try {
    return safeStorage.decryptString(Buffer.from(encryptedKeyB64, "base64"));
  } catch {
    return "";
  }
}

function encryptKeyToB64(plain) {
  if (!plain || !safeStorage.isEncryptionAvailable()) {
    return "";
  }
  try {
    return Buffer.from(safeStorage.encryptString(plain)).toString("base64");
  } catch {
    return "";
  }
}

function migrateV1Raw(old) {
  if (old && old.version === 2 && Array.isArray(old.profiles) && old.profiles.length > 0) {
    return old;
  }
  const baseUrl = (old?.baseUrl || DEFAULT_AI_BASE).replace(/\/$/, "");
  const model = normalizeModelNameForMiniMax(old?.model || DEFAULT_AI_MODEL, baseUrl);
  const enc = old?.encryptedKeyB64 ?? "";
  const explicitWeb =
    old && Object.prototype.hasOwnProperty.call(old, "webSearch") && typeof old.webSearch === "boolean";
  return {
    version: 2,
    webSearch: explicitWeb ? old.webSearch === true : true,
    activeProfileId: defaultProfileId(),
    profiles: [
      {
        id: defaultProfileId(),
        label: "默认模型",
        purpose: "",
        baseUrl,
        model,
        encryptedKeyB64: enc,
      },
    ],
  };
}

function writeAISession(sess) {
  sess.version = 2;
  writeJsonFile(settingsPath(), sess);
}

function readAISession() {
  const fs = require("fs");
  const p = settingsPath();
  if (!fs.existsSync(p)) {
    const s = migrateV1Raw({});
    writeAISession(s);
    return s;
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    const s = migrateV1Raw({});
    writeAISession(s);
    return s;
  }
  if (raw.version !== 2 || !Array.isArray(raw.profiles) || raw.profiles.length === 0) {
    const s = migrateV1Raw(raw);
    writeAISession(s);
    return s;
  }
  if (!raw.profiles.some((pr) => pr.id === raw.activeProfileId)) {
    raw.activeProfileId = raw.profiles[0].id;
    writeAISession(raw);
  }
  if (typeof raw.webSearch !== "boolean") {
    raw.webSearch = true;
    writeAISession(raw);
  }
  return raw;
}

function getActiveProfile(sess) {
  const p = sess.profiles.find((x) => x.id === sess.activeProfileId);
  return p || sess.profiles[0];
}

function getActiveProfileCredentials() {
  const sess = readAISession();
  const p = getActiveProfile(sess);
  const bu = normalizeOpenAiChatBaseUrl(p.baseUrl || DEFAULT_AI_BASE);
  return {
    apiKey: normalizeApiKey(decryptKeyB64(p.encryptedKeyB64)),
    baseUrl: bu,
    model: normalizeModelNameForMiniMax(p.model || DEFAULT_AI_MODEL, bu),
    label: (p.label && String(p.label).trim()) || p.model || "模型",
    profileId: p.id,
  };
}

module.exports = {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  defaultProfileId,
  decryptKeyB64,
  encryptKeyToB64,
  readAISession,
  writeAISession,
  getActiveProfile,
  getActiveProfileCredentials,
  normalizeApiKey,
  normalizeOpenAiChatBaseUrl,
  normalizeModelNameForMiniMax,
  allowsChatWithoutApiKey,
};
