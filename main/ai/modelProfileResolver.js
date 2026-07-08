const { getActiveProfileCredentials } = require("../aiSessionStore.js");
const { assertNotMiniMaxLoginJwtAsApiKey } = require("../apiNormalize.js");

function assertProfileSupportsChatCompletions(cred) {
  const mid = String(cred?.model || "").trim();
  if (/^speech-/i.test(mid) || /^tts-1/i.test(mid)) {
    throw new Error(
      `当前模型 ID「${mid}」为语音合成（TTS）模型，不能用于 Agent 对话。请切换为文本对话模型。`
    );
  }
  const bu = String(cred?.baseUrl || "").toLowerCase();
  if (/\/t2a/i.test(bu) || /text-to-audio/i.test(bu)) {
    throw new Error("当前 API Base URL 指向语音合成接口，不能用于 Agent 对话。");
  }
}

function resolveModelProfile(options = {}) {
  const cred = options.credentials || getActiveProfileCredentials();
  assertNotMiniMaxLoginJwtAsApiKey(cred.apiKey, cred.baseUrl);
  assertProfileSupportsChatCompletions(cred);
  return {
    apiKey: cred.apiKey,
    baseUrl: String(cred.baseUrl || "").replace(/\/$/, ""),
    model: cred.model,
    label: cred.label,
    profileId: cred.profileId,
  };
}

module.exports = {
  resolveModelProfile,
  assertProfileSupportsChatCompletions,
};
