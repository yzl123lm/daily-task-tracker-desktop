const DEFAULT_AI_BASE = "https://api.minimax.io/v1";
const DEFAULT_AI_MODEL = "MiniMax-M2";

const MINIMAX_MODEL_ALIASES = {
  "minimax m3": "MiniMax-M3",
  "minimax m2.7": "MiniMax-M2.7",
  "minimax m2.7 highspeed": "MiniMax-M2.7-highspeed",
  "minimax m2.5": "MiniMax-M2.5",
  "minimax m2.5 highspeed": "MiniMax-M2.5-highspeed",
  "minimax m2.1": "MiniMax-M2.1",
  "minimax m2.1 highspeed": "MiniMax-M2.1-highspeed",
  "minimax m2": "MiniMax-M2",
  "m2 her": "M2-her",
};

function normalizeModelNameForMiniMax(model, baseUrl) {
  if (typeof model !== "string") {
    return DEFAULT_AI_MODEL;
  }
  const raw = model.trim();
  if (!raw) {
    return DEFAULT_AI_MODEL;
  }
  const bu = (baseUrl || "").toLowerCase();
  if (!/minimax|minimaxi/.test(bu)) {
    return raw;
  }
  const key = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (MINIMAX_MODEL_ALIASES[key]) {
    return MINIMAX_MODEL_ALIASES[key];
  }
  return raw;
}

function normalizeOpenAiChatBaseUrl(raw) {
  let u = typeof raw === "string" ? raw.trim() : "";
  if (!u) {
    return DEFAULT_AI_BASE;
  }
  u = u.replace(/\/+$/, "");
  const re = /\/chat\/completions$/i;
  while (re.test(u)) {
    u = u.replace(re, "").replace(/\/+$/, "");
  }
  return u || DEFAULT_AI_BASE;
}

function normalizeApiKey(key) {
  if (typeof key !== "string") {
    return "";
  }
  let k = key.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
  if (/^bearer\s+/i.test(k)) {
    k = k.replace(/^bearer\s+/i, "").trim();
  }
  return k;
}

function assertNotMiniMaxLoginJwtAsApiKey(baseUrl, apiKeyRaw) {
  const bu = String(baseUrl || "").toLowerCase();
  if (!/minimax|minimaxi/.test(bu)) {
    return;
  }
  const k = normalizeApiKey(apiKeyRaw);
  if (!k) {
    return;
  }
  const parts = k.split(".");
  if (parts.length >= 3 && /^eyJ/i.test(k)) {
    throw new Error(
      "检测到疑似登录用 JWT（常以 eyJ 开头、多段点号分隔），不能作为 MiniMax 的 API Key。请到 https://platform.minimax.io 的「API 密钥」创建并复制 sk- 开头的密钥后重试。"
    );
  }
}

function allowsChatWithoutApiKey(baseUrl) {
  const bu = String(baseUrl || "").trim().toLowerCase();
  if (!bu) {
    return false;
  }
  if (/\bollama\b/.test(bu)) {
    return true;
  }
  if (/:11434(\/|$|\?)/.test(bu)) {
    return true;
  }
  return false;
}

function isLocalChatInferenceBaseUrl(baseUrl) {
  return allowsChatWithoutApiKey(baseUrl);
}

module.exports = {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  normalizeModelNameForMiniMax,
  normalizeOpenAiChatBaseUrl,
  normalizeApiKey,
  assertNotMiniMaxLoginJwtAsApiKey,
  allowsChatWithoutApiKey,
  isLocalChatInferenceBaseUrl,
};
