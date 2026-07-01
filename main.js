const { app, BrowserWindow, ipcMain, safeStorage, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { execFile } = require("child_process");
let toSimplifiedChinese = (text) => String(text || "");
try {
  const { Converter } = require("opencc-js");
  const t2s = Converter({ from: "tw", to: "cn" });
  toSimplifiedChinese = (text) => t2s(String(text || ""));
} catch {
  /* opencc-js optional fallback */
}
const { registerKnowledgeBaseHandlers } = require("./knowledgeBaseMain.js");
const {
  DEFAULT_SOURCE_RULES,
  sourceName,
  mergeSourceRules,
  extractCoreKeywords,
  inferQueryIntent,
  expandQueries,
  retrieveMultiSource,
  probeSearchSourceStatus,
  processContent,
  buildWebSearchSummaryBlock,
  buildFallbackGeneratedAnswer,
} = require("./searchPipeline.js");

const {
  bootstrapApplication,
  registerStartupIpc,
} = require("./main/startup/bootstrapApplication.js");
const { registerExtractedIpcHandlers } = require("./main/ipc/registerExtracted.js");
const { registerWindowChromeHandlers } = require("./main/ipc/windowChromeHandlers.js");
const { registerWorkbenchWindowIpc } = require("./main/workbenchWindow.js");
const { assertMaxBase64Size } = require("./utils/ipcValidate.js");
const {
  readOllamaSettings,
  normalizeOllamaHost,
  buildOllamaNativeOptions,
  extractOllamaNativeChatUsage,
  resolveLocalQwen3AsrModelId,
  transcribeWithLocalQwen3Asr,
  runVoiceStep,
  parseLastJsonLine,
  stripOpenAiV1BaseSuffix,
  isLikelyOllamaOpenAiBase,
} = require("./main/ollamaRuntime.js");
const {
  readASRSettings,
  readTTSSettings,
  readImageSettings,
  readCapabilitySettings,
} = require("./main/credentialSettings.js");

const {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  normalizeModelNameForMiniMax,
  normalizeOpenAiChatBaseUrl,
  normalizeApiKey,
  assertNotMiniMaxLoginJwtAsApiKey,
  allowsChatWithoutApiKey,
  isLocalChatInferenceBaseUrl,
} = require("./main/apiNormalize.js");
const {
  readAISession,
  getActiveProfileCredentials,
  decryptKeyB64,
  encryptKeyToB64,
} = require("./main/aiSessionStore.js");
const { appendMiniMaxErrorHints } = require("./main/miniMaxHints.js");
const DEFAULT_ASR_BASE = "https://api.openai.com/v1";
const DEFAULT_ASR_MODEL = "whisper-1";
const DEFAULT_TTS_BASE = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = "tts-1";
const DEFAULT_TTS_VOICE = "alloy";
/** MiniMax t2a_v2 仅支持 speech-* 系列，与 OpenAI 的 tts-1 不同 */
const DEFAULT_MINIMAX_SPEECH_MODEL = "speech-2.8-turbo";
const DEFAULT_IMAGE_BASE = "https://api.openai.com/v1";
const DEFAULT_IMAGE_GEN_MODEL = "dall-e-3";
const DEFAULT_IMAGE_VISION_MODEL = "gpt-4o";
const DEFAULT_IMAGE_SIZE = "1024x1024";

function normalizeAsrDisplayText(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }
  try {
    return String(toSimplifiedChinese(raw) || "").trim();
  } catch {
    return raw;
  }
}

/**
 * 将「MiniMax M2.7」等常见写法映射为官方 API 要求的模型 ID（含连字符），避免 2013 unknown model。
 * 文档：https://platform.minimax.io/docs/api-reference/text-openai-api
 */

const IMAGE_MODEL_ALIASES_BY_PROVIDER = {
  minimax: {
    "minimax image 01": "MiniMax-Image-01",
    "minimax image-01": "MiniMax-Image-01",
    /** OpenAI 兼容 /v1/chat/completions 不承载多模态；原生 /v1/text/chatcompletion_v2 示例为 MiniMax-Text-01 */
    "minimax vision 01": "MiniMax-Text-01",
    "minimax vl 01": "MiniMax-Text-01",
 },
  qwen: {
    "qwen vl max": "qwen-vl-max-latest",
    "qwen vl plus": "qwen-vl-plus",
    "qwen2.5 vl 72b": "qwen2.5-vl-72b-instruct",
    "qvq max": "qvq-max",
  },
  zhipu: {
    "glm 4v": "glm-4v-plus",
    "glm 4v plus": "glm-4v-plus",
    "glm 4.1v thinking": "glm-4.1v-thinking-flashx",
    cogview: "cogview-3-plus",
  },
  baidu: {
    "ernie 4.0 vision": "ernie-4.0-vision",
    irag: "irag-1.0",
  },
  hunyuan: {
    "hunyuan vision": "hunyuan-vision",
  },
};

function inferProviderFromBaseUrl(baseUrl) {
  const bu = String(baseUrl || "").toLowerCase();
  if (/minimax|minimaxi/.test(bu)) return "minimax";
  if (/dashscope|aliyuncs/.test(bu)) return "qwen";
  if (/bigmodel|zhipu/.test(bu)) return "zhipu";
  if (/qianfan|baidubce/.test(bu)) return "baidu";
  if (/hunyuan|tencentcloud/.test(bu)) return "hunyuan";
  return "";
}

function normalizeImageModelByProvider(model, baseUrl) {
  const raw = String(model || "").trim();
  if (!raw) {
    return raw;
  }
  const provider = inferProviderFromBaseUrl(baseUrl);
  if (!provider || !IMAGE_MODEL_ALIASES_BY_PROVIDER[provider]) {
    return raw;
  }
  const key = raw.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  const mapped = IMAGE_MODEL_ALIASES_BY_PROVIDER[provider][key];
  if (mapped) {
    return mapped;
  }
  if (provider === "minimax" && /^minimax-vl-01$/i.test(raw)) {
    return "MiniMax-Text-01";
  }
  return raw;
}




function isModularRouting() {
  return readCapabilitySettings().routingMode === "modular";
}

function resolveAsrCredentials() {
  const asr = readASRSettings();
  const lang =
    typeof asr.language === "string" ? asr.language.trim() : "zh";
  if (isModularRouting()) {
    return {
      baseUrl: (asr.baseUrl || DEFAULT_ASR_BASE).replace(/\/$/, ""),
      apiKey: normalizeApiKey(decryptKeyB64(asr.encryptedKeyB64)),
      model: String(asr.model || DEFAULT_ASR_MODEL),
      language: lang,
      prompt: String(asr.prompt || ""),
    };
  }
  const c = getActiveProfileCredentials();
  return {
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: String(asr.model || DEFAULT_ASR_MODEL),
    language: lang,
    prompt: String(asr.prompt || ""),
  };
}

function resolveTTSCredentials() {
  const t = readTTSSettings();
  const provider = String(t.provider || "cloud").toLowerCase() === "local" ? "local" : "cloud";
  if (provider === "local") {
    return {
      provider: "local",
      baseUrl: (t.baseUrl || DEFAULT_TTS_BASE).replace(/\/$/, ""),
      apiKey: "",
      model: String(t.model || "local:qwen3-tts"),
      voice: String(t.voice || DEFAULT_TTS_VOICE),
    };
  }
  if (isModularRouting()) {
    return {
      provider: "cloud",
      baseUrl: (t.baseUrl || DEFAULT_TTS_BASE).replace(/\/$/, ""),
      apiKey: normalizeApiKey(decryptKeyB64(t.encryptedKeyB64)),
      model: String(t.model || DEFAULT_TTS_MODEL),
      voice: String(t.voice || DEFAULT_TTS_VOICE),
    };
  }
  const c = getActiveProfileCredentials();
  return {
    provider: "cloud",
    baseUrl: c.baseUrl,
    apiKey: c.apiKey,
    model: String(t.model || DEFAULT_TTS_MODEL),
    voice: String(t.voice || DEFAULT_TTS_VOICE),
  };
}

function resolveImageCredentials() {
  const img = readImageSettings();
  if (isModularRouting()) {
    const baseUrl = (img.baseUrl || DEFAULT_IMAGE_BASE).replace(/\/$/, "");
    return {
      baseUrl,
      apiKey: normalizeApiKey(decryptKeyB64(img.encryptedKeyB64)),
      genModel: normalizeImageModelByProvider(String(img.genModel || DEFAULT_IMAGE_GEN_MODEL), baseUrl),
      visionModel: normalizeImageModelByProvider(String(img.visionModel || DEFAULT_IMAGE_VISION_MODEL), baseUrl),
      size: String(img.size || DEFAULT_IMAGE_SIZE),
    };
  }
  const c = getActiveProfileCredentials();
  const baseUrl = c.baseUrl;
  return {
    baseUrl,
    apiKey: c.apiKey,
    genModel: normalizeImageModelByProvider(String(img.genModel || DEFAULT_IMAGE_GEN_MODEL), baseUrl),
    visionModel: normalizeImageModelByProvider(String(img.visionModel || DEFAULT_IMAGE_VISION_MODEL), baseUrl),
    size: String(img.size || DEFAULT_IMAGE_SIZE),
  };
}




function wrapSearchApiOk(data, requestId) {
  return {
    code: 0,
    message: "success",
    data: data || {},
    requestId:
      String(requestId || "").trim() ||
      (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `search-${Date.now()}`),
  };
}

function wrapSearchApiError(code, message, requestId) {
  return {
    code: Number(code) || 5000,
    message: String(message || "internal error"),
    data: {},
    requestId:
      String(requestId || "").trim() ||
      (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `search-${Date.now()}`),
  };
}

ipcMain.handle("search-query-process", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  const originalQuery = String(p.originalQuery || "").trim();
  if (!originalQuery) {
    return wrapSearchApiError(1001, "originalQuery 不能为空", p.requestId);
  }
  const out = buildSearchQueryProcessData(originalQuery, p.needExpand !== false);
  return wrapSearchApiOk(out, p.requestId);
});

ipcMain.handle("search-multi-source-retrieve", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  const queries = Array.isArray(p.queries) ? p.queries : [];
  if (!queries.length) {
    return wrapSearchApiError(1001, "queries 不能为空", p.requestId);
  }
  try {
    const cfg = readSearchRuleConfig();
    const t0 = Date.now();
    const out = await retrieveMultiSource(
      {
        queries,
        queryIntent: p.queryIntent || "COMMON",
        sourceTypes: p.sourceTypes,
        pageSize: p.pageSize || cfg.pageSize,
        timeout: p.timeout || cfg.timeout,
      },
      getWebSourceAdapters(),
      {
        sourceRules: cfg.sourceRules,
        sourceStateMap: webSearchSourceState,
      }
    );
    out.retrieveTime = Date.now() - t0;
    return wrapSearchApiOk(out, p.requestId);
  } catch (err) {
    return wrapSearchApiError(1002, `检索源调用失败：${err?.message || err}`, p.requestId);
  }
});

ipcMain.handle("search-content-process", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  if (!Array.isArray(p.sourceResults) || p.sourceResults.length === 0) {
    return wrapSearchApiError(1001, "sourceResults 不能为空", p.requestId);
  }
  try {
    const cfg = readSearchRuleConfig();
    const t0 = Date.now();
    const out = processContent(
      {
        sourceResults: p.sourceResults,
        coreKeywords: Array.isArray(p.coreKeywords) ? p.coreKeywords : [],
        topN: p.topN || cfg.topN,
      },
      {
        sourceRules: cfg.sourceRules,
        preferFreshness: p.preferFreshness != null ? p.preferFreshness === true : cfg.preferFreshness !== false,
        conflictDetection: p.conflictDetection != null ? p.conflictDetection === true : cfg.conflictDetection !== false,
      }
    );
    out.processTime = Date.now() - t0;
    return wrapSearchApiOk(out, p.requestId);
  } catch (err) {
    return wrapSearchApiError(1003, `内容处理失败：${err?.message || err}`, p.requestId);
  }
});

ipcMain.handle("search-result-generate", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  const originalQuery = String(p.originalQuery || "").trim();
  const highQualityContents = Array.isArray(p.highQualityContents) ? p.highQualityContents : [];
  if (!originalQuery || highQualityContents.length === 0) {
    return wrapSearchApiError(1001, "originalQuery 与 highQualityContents 为必填", p.requestId);
  }
  const showSource = p.showSource === true;
  const data = buildFallbackGeneratedAnswer(originalQuery, highQualityContents, showSource);
  return wrapSearchApiOk(
    {
      generateTime: 0,
      finalAnswer: data.finalAnswer,
      sourceList: data.sourceList,
      conflictTips: Array.isArray(p.conflictTips) ? p.conflictTips : data.conflictTips,
    },
    p.requestId
  );
});

ipcMain.handle("search-source-status", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  const cfg = readSearchRuleConfig();
  const sourceRules = mergeSourceRules(cfg.sourceRules);
  if (p.probe === true) {
    try {
      await probeSearchSourceStatus(getWebSourceAdapters(), {
        sourceRules: cfg.sourceRules,
        sourceStateMap: webSearchSourceState,
      });
    } catch (err) {
      return wrapSearchApiError(1004, `数据源探测失败：${err?.message || err}`, p.requestId);
    }
  }
  const list = Object.keys(sourceRules).map((sourceType) => {
    const st = webSearchSourceState.get(sourceType);
    const probed = Boolean(st?.updatedAt);
    return {
      sourceType,
      sourceName: sourceName(sourceType),
      online: probed ? st.online === true : null,
      probed,
      quota: null,
      errorMsg: st?.lastError || (sourceRules[sourceType].enabled ? (probed ? "" : "待检测") : "已禁用"),
      weight: sourceRules[sourceType].weight,
      enabled: sourceRules[sourceType].enabled !== false,
      latencyMs: probed ? (st?.latencyMs ?? null) : null,
      updatedAt: st?.updatedAt || "",
    };
  });
  return wrapSearchApiOk(list, p.requestId);
});

ipcMain.handle("search-rule-config-get", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  return wrapSearchApiOk(readSearchRuleConfig(), p.requestId);
});

ipcMain.handle("search-rule-config-set", async (_event, payload) => {
  const p = payload && typeof payload === "object" ? payload : {};
  try {
    const incomingRaw = p.configContent && typeof p.configContent === "object" ? p.configContent : p;
    const incoming = { ...(incomingRaw || {}) };
    if (String(p.ruleType || "").trim() === "sourceRules" && p.configContent && typeof p.configContent === "object") {
      incoming.sourceRules = p.configContent;
    }
    const saved = writeSearchRuleConfig(incoming || {});
    return wrapSearchApiOk(
      {
        configId: "default-search-rule-config",
        success: true,
        updateTime: new Date().toISOString(),
        config: saved,
      },
      p.requestId
    );
  } catch (err) {
    return wrapSearchApiError(5000, `规则配置保存失败：${err?.message || err}`, p.requestId);
  }
});



ipcMain.handle("asr-transcribe", async (_event, payload) => {
  const cred = resolveAsrCredentials();
  const audioBase64 = typeof payload?.audioBase64 === "string" ? payload.audioBase64 : "";
  if (!audioBase64) {
    throw new Error("缺少音频数据");
  }
  const cleanedAudio = assertMaxBase64Size(audioBase64, 25 * 1024 * 1024, "音频数据");
  const mimeType = String(payload?.mimeType || "audio/webm");
  const localQwen3AsrModelId = resolveLocalQwen3AsrModelId(cred.model);
  if (localQwen3AsrModelId) {
    return transcribeWithLocalQwen3Asr({
      audioBase64: cleanedAudio,
      mimeType,
      language: cred.language,
      prompt: cred.prompt,
      modelId: localQwen3AsrModelId,
    });
  }
  if (!cred.apiKey) {
    throw new Error(
      isModularRouting()
        ? "请先在 ASR 设置中填写 API Key。"
        : "请先在「模型配置」中填写 API Key（统一路由下 ASR 与对话共用同一密钥）。"
    );
  }
  const base = cred.baseUrl.replace(/\/$/, "");
  const url = `${base}/audio/transcriptions`;

  const form = new FormData();
  const bin = Buffer.from(cleanedAudio, "base64");
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("wav") ? "wav" : "webm";
  const blob = new Blob([bin], { type: mimeType });
  form.append("file", blob, `chunk.${ext}`);
  form.append("model", cred.model);
  if (cred.language) {
    form.append("language", String(cred.language));
  }
  if (cred.prompt) {
    form.append("prompt", String(cred.prompt));
  }
  form.append("response_format", "json");

  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${cred.apiKey}` },
    body: form,
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error?.message || data.message)) || raw || `HTTP ${res.status}`;
    throw new Error(`ASR 调用失败：${msg}`);
  }
  const text = (data && (data.text || data.result || data.transcript)) || "";
  return { text: normalizeAsrDisplayText(text), raw: data };
});


/** MiniMax 语音合成走 /v1/t2a_v2，与 OpenAI 的 /v1/audio/speech 不同 */
function isMiniMaxTtsHost(baseUrl) {
  return /minimax|minimaxi/i.test(String(baseUrl || ""));
}

function buildMiniMaxT2aV2Url(baseRaw) {
  let b = String(baseRaw || "").trim().replace(/\/+$/, "");
  if (!b) {
    return "https://api.minimax.io/v1/t2a_v2";
  }
  b = b.replace(/\/chat\/completions$/i, "").replace(/\/audio\/speech$/i, "").replace(/\/+$/, "");
  if (/\/t2a_v2$/i.test(b)) {
    return b;
  }
  if (/\/v1$/i.test(b)) {
    return `${b}/t2a_v2`;
  }
  if (/api\.minimax\.io$/i.test(b) || /api\.minimaxi\.com$/i.test(b)) {
    return `${b}/v1/t2a_v2`;
  }
  return `${b}/t2a_v2`;
}

/** 多模态文本（含 image_url）走官方 V2，而非 OpenAI 兼容的 /v1/chat/completions */
function buildMiniMaxChatCompletionV2Url(baseRaw) {
  let b = String(baseRaw || "").trim().replace(/\/+$/, "");
  if (!b) {
    return "https://api.minimax.io/v1/text/chatcompletion_v2";
  }
  b = b.replace(/\/chat\/completions$/i, "").replace(/\/audio\/speech$/i, "").replace(/\/+$/, "");
  if (/\/chatcompletion_v2$/i.test(b)) {
    return b;
  }
  if (/\/text$/i.test(b)) {
    return `${b}/chatcompletion_v2`;
  }
  if (/\/v1$/i.test(b)) {
    return `${b}/text/chatcompletion_v2`;
  }
  if (/api\.minimax\.io$/i.test(b) || /api\.minimaxi\.com$/i.test(b)) {
    return `${b}/v1/text/chatcompletion_v2`;
  }
  return `${b}/text/chatcompletion_v2`;
}

function mapTtsModelToMiniMaxSpeechModel(model) {
  const m = String(model || "").trim();
  if (!m) {
    return DEFAULT_MINIMAX_SPEECH_MODEL;
  }
  if (/^speech-/i.test(m) || /^speech-0[12]/i.test(m)) {
    return m;
  }
  if (/^tts-/i.test(m) || /mini.*tts/i.test(m) || /^gpt-.*tts/i.test(m)) {
    return DEFAULT_MINIMAX_SPEECH_MODEL;
  }
  return DEFAULT_MINIMAX_SPEECH_MODEL;
}

function mapTtsVoiceToMiniMaxVoiceId(voice) {
  const v = String(voice || "").trim();
  if (!v) {
    return "Chinese (Mandarin)_Lyrical_Voice";
  }
  if (/\(Mandarin\)|moss_audio_|^female-|^male-|Chinese \(/.test(v)) {
    return v;
  }
  const m = {
    alloy: "Chinese (Mandarin)_Lyrical_Voice",
    echo: "Chinese (Mandarin)_Lyrical_Voice",
    fable: "Chinese (Mandarin)_HK_Flight_Attendant",
    onyx: "Chinese (Mandarin)_Lyrical_Voice",
    nova: "Chinese (Mandarin)_Lyrical_Voice",
    shimmer: "Chinese (Mandarin)_Lyrical_Voice",
  };
  return m[v.toLowerCase()] || "Chinese (Mandarin)_Lyrical_Voice";
}

function appendMiniMaxTtsPlanHint(msg) {
  const s = String(msg || "");
  if (/plan not support|not support model|token plan|套餐|权益/i.test(s)) {
    return (
      s +
      " 【说明】当前 API Key 对应套餐可能未开通语音合成，或不含所选 speech 模型。请到 MiniMax 开放平台核对计费与模型权限；或在「AI能力」里将「TTS 语音模型」改为您账号支持的型号（如文档中的其他 speech-*）。"
    );
  }
  return s;
}

async function ttsSpeakMiniMaxT2a(cred, text) {
  const url = buildMiniMaxT2aV2Url(cred.baseUrl);
  const voiceId = mapTtsVoiceToMiniMaxVoiceId(cred.voice);
  const speechModel = mapTtsModelToMiniMaxSpeechModel(cred.model);
  const bodyPayload = {
    model: speechModel,
    text,
    stream: false,
    language_boost: "Chinese",
    output_format: "hex",
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      format: "mp3",
      sample_rate: 32000,
      bitrate: 128000,
      channel: 1,
    },
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && (data.base_resp?.status_msg || data.message || data.error?.message)) ||
      raw ||
      res.statusText;
    throw new Error(`TTS 调用失败：${appendMiniMaxTtsPlanHint(String(msg).slice(0, 800))}`);
  }
  const code = data?.base_resp?.status_code;
  if (code !== undefined && code !== 0) {
    const rawMsg = data?.base_resp?.status_msg || `错误码 ${code}`;
    throw new Error(`TTS 调用失败：${appendMiniMaxTtsPlanHint(rawMsg)}`);
  }
  const hexAudio = data?.data?.audio;
  if (!hexAudio || typeof hexAudio !== "string") {
    throw new Error("TTS 调用失败：MiniMax 未返回音频数据");
  }
  let audioBuf;
  try {
    audioBuf = Buffer.from(String(hexAudio).replace(/\s+/g, ""), "hex");
  } catch {
    throw new Error("TTS 调用失败：音频数据解析失败");
  }
  if (!audioBuf.length) {
    throw new Error("TTS 调用失败：音频为空");
  }
  return { audioBase64: audioBuf.toString("base64"), mimeType: "audio/mpeg" };
}

async function ttsSpeakCloudByCredential(cred, text) {
  if (!cred.apiKey) {
    throw new Error(
      isModularRouting()
        ? "请先在 TTS 设置中填写 API Key。"
        : "请先在「模型配置」中填写 API Key（统一路由下与对话共用）。"
    );
  }
  const base = cred.baseUrl.replace(/\/$/, "");
  if (isMiniMaxTtsHost(base)) {
    const mm = await ttsSpeakMiniMaxT2a({ ...cred, baseUrl: base }, text);
    return { ...mm, provider: "cloud" };
  }
  const url = `${base}/audio/speech`;
  const body = JSON.stringify({
    model: cred.model,
    voice: cred.voice,
    input: text,
    response_format: "mp3",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body,
  });
  const buf = Buffer.from(await res.arrayBuffer());
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const j = JSON.parse(buf.toString("utf8"));
      msg = j.error?.message || j.message || msg;
    } catch {
      msg = buf.toString("utf8").slice(0, 500) || msg;
    }
    throw new Error(`TTS 调用失败：${msg}`);
  }
  return { audioBase64: buf.toString("base64"), mimeType: "audio/mpeg", provider: "cloud" };
}

function resolveLocalQwen3TtsModelId(modelName) {
  const m = String(modelName || "").trim().toLowerCase();
  if (!m || !m.startsWith("local:qwen3-tts")) {
    return "";
  }
  return "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice";
}

async function ttsSpeakLocalByCredential(cred, text) {
  const modelId = resolveLocalQwen3TtsModelId(cred.model);
  if (!modelId) {
    throw new Error("当前本地 TTS 模型暂不支持，请在 AI能力组合 选择 local:qwen3-tts。");
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qwen3-tts-local-"));
  const inFile = path.join(tmpDir, "input.json");
  const pyFile = path.join(tmpDir, "run_local_qwen3_tts.py");
  const outFile = path.join(tmpDir, "tts.wav");
  fs.writeFileSync(
    inFile,
    JSON.stringify({
      model_id: modelId,
      text: String(text || ""),
      out_file: outFile,
    }),
    "utf8"
  );
  const pyCode = [
    "import json, sys, traceback",
    "import torch",
    "import soundfile as sf",
    "from qwen_tts import Qwen3TTSModel",
    "",
    "def main():",
    "    with open(sys.argv[1], 'r', encoding='utf-8') as f:",
    "        payload = json.load(f)",
    "    model_id = payload.get('model_id') or 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice'",
    "    text = str(payload.get('text') or '').strip()",
    "    out_file = payload.get('out_file') or 'tts.wav'",
    "    if not text:",
    "        print(json.dumps({'error': 'empty text'}, ensure_ascii=True))",
    "        return",
    "    use_cuda = torch.cuda.is_available()",
    "    dtype = torch.bfloat16 if use_cuda else torch.float32",
    "    device_map = 'cuda:0' if use_cuda else 'cpu'",
    "    model = Qwen3TTSModel.from_pretrained(",
    "        model_id,",
    "        device_map=device_map,",
    "        dtype=dtype,",
    "    )",
    "    wavs, sr = model.generate_custom_voice(text=text, language='Chinese', speaker='Vivian')",
    "    wav = wavs[0] if isinstance(wavs, (list, tuple)) else wavs",
    "    sf.write(out_file, wav, sr)",
    "    print(json.dumps({'ok': True, 'sample_rate': int(sr), 'out_file': out_file}, ensure_ascii=True))",
    "",
    "if __name__ == '__main__':",
    "    try:",
    "        main()",
    "    except Exception as e:",
    "        print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()[-2400:]}, ensure_ascii=True))",
    "        raise",
  ].join("\n");
  fs.writeFileSync(pyFile, pyCode, "utf8");
  try {
    const out = await runVoiceStep({
      kind: "python",
      args: [pyFile, inFile],
      timeoutMs: 25 * 60 * 1000,
    });
    if (!out.ok) {
      throw new Error(out.error || "本地 Qwen3-TTS 执行失败");
    }
    const parsed = parseLastJsonLine(out.output);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("本地 Qwen3-TTS 返回结果解析失败");
    }
    if (parsed.error) {
      throw new Error(String(parsed.error));
    }
    if (!fs.existsSync(outFile)) {
      throw new Error("本地 Qwen3-TTS 未生成音频文件");
    }
    const buf = fs.readFileSync(outFile);
    if (!buf.length) {
      throw new Error("本地 Qwen3-TTS 音频为空");
    }
    return { audioBase64: buf.toString("base64"), mimeType: "audio/wav", provider: "local" };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

function buildMiniMaxImageUrl(baseRaw) {
  let b = String(baseRaw || "").trim().replace(/\/+$/, "");
  if (!b) {
    return "https://api.minimax.io/v1/image_generation";
  }
  b = b.replace(/\/images\/generations$/i, "").replace(/\/chat\/completions$/i, "").replace(/\/+$/, "");
  if (/\/image_generation$/i.test(b)) {
    return b;
  }
  if (/\/v1$/i.test(b)) {
    return `${b}/image_generation`;
  }
  if (/api\.minimax\.io$/i.test(b) || /api\.minimaxi\.com$/i.test(b)) {
    return `${b}/v1/image_generation`;
  }
  return `${b}/image_generation`;
}

function mapImageModelToMiniMax(model) {
  const m = String(model || "").trim();
  if (!m) {
    return "image-01";
  }
  const k = m.toLowerCase().replace(/-/g, " ").replace(/\s+/g, " ");
  if (k === "image 01" || k === "minimax image 01") {
    return "image-01";
  }
  return m;
}

function mapSizeToAspectRatio(size) {
  const s = String(size || "").toLowerCase().trim();
  if (!/^\d+x\d+$/.test(s)) {
    return "1:1";
  }
  const [wStr, hStr] = s.split("x");
  const w = Number(wStr);
  const h = Number(hStr);
  if (!w || !h) {
    return "1:1";
  }
  const r = w / h;
  if (r > 1.6) return "16:9";
  if (r > 1.2) return "4:3";
  if (r < 0.65) return "9:16";
  if (r < 0.85) return "3:4";
  return "1:1";
}

ipcMain.handle("tts-speak", async (_event, payload) => {
  const cap = readCapabilitySettings();
  if (!cap.ttsEnabled) {
    throw new Error("请先在「AI能力组合」中开启语音播报。");
  }
  const cred = resolveTTSCredentials();
  const rawText = String(payload?.text || "").trim();
  if (!rawText) {
    throw new Error("缺少播报文本");
  }
  const text = rawText.slice(0, 4096);
  if (String(cred.provider || "") === "local") {
    return ttsSpeakLocalByCredential(cred, text);
  }
  return ttsSpeakCloudByCredential(cred, text);
});

ipcMain.handle("image-generate", async (_event, payload) => {
  const cap = readCapabilitySettings();
  if (!cap.imageGenEnabled) {
    throw new Error("请先在「AI能力组合」中开启图像生成。");
  }
  const cred = resolveImageCredentials();
  if (!cred.apiKey) {
    throw new Error(
      isModularRouting()
        ? "请先在图像能力设置中填写 API Key。"
        : "请先在「模型配置」中填写 API Key。"
    );
  }
  let prompt = String(payload?.prompt || "").trim();
  if (!prompt) {
    throw new Error("缺少文生图提示词");
  }
  if (payload?.motion === true || payload?.motion === "gif") {
    prompt += "（画面富有动感与连续性，适合作为循环动图或短视频分镜参考）";
  }
  const base = cred.baseUrl.replace(/\/$/, "");
  if (isMiniMaxTtsHost(base)) {
    const mmUrl = buildMiniMaxImageUrl(base);
    const mmPayload = {
      model: mapImageModelToMiniMax(cred.genModel),
      prompt: prompt.slice(0, 4000),
      response_format: "base64",
      aspect_ratio: mapSizeToAspectRatio(String(payload?.size || cred.size)),
    };
    const mmRes = await fetch(mmUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cred.apiKey}`,
      },
      body: JSON.stringify(mmPayload),
    });
    const mmRaw = await mmRes.text();
    let mmData = null;
    try {
      mmData = JSON.parse(mmRaw);
    } catch {
      mmData = null;
    }
    if (!mmRes.ok) {
      const msg = (mmData && (mmData.base_resp?.status_msg || mmData.message || mmData.error?.message)) || mmRaw || `HTTP ${mmRes.status}`;
      throw new Error(`图像生成失败：${msg}`);
    }
    const arr = mmData?.data?.image_base64;
    const b64 = Array.isArray(arr) ? String(arr[0] || "") : "";
    if (!b64) {
      throw new Error("图像生成失败：MiniMax 未返回可用图片数据");
    }
    return { imageUrl: "", b64_json: b64, revised_prompt: mmData?.base_resp?.status_msg || "", raw: mmData };
  }
  const url = `${base}/images/generations`;
  const bodyPayload = {
    model: cred.genModel,
    prompt: prompt.slice(0, 4000),
    n: 1,
    size: String(payload?.size || cred.size),
    response_format: "url",
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error?.message || data.message)) || raw || `HTTP ${res.status}`;
    throw new Error(`图像生成失败：${msg}`);
  }
  const item = data?.data?.[0];
  const imageUrl = item?.url || "";
  const b64 = item?.b64_json || "";
  return { imageUrl, b64_json: b64, revised_prompt: item?.revised_prompt || data?.revised_prompt, raw: data };
});

function normalizeVisionPayloadImages(payload) {
  const arr = Array.isArray(payload?.images) ? payload.images : null;
  if (arr && arr.length) {
    const out = [];
    for (const x of arr) {
      const imageBase64 =
        typeof x?.imageBase64 === "string"
          ? x.imageBase64
          : typeof x?.base64 === "string"
            ? x.base64
            : "";
      if (!imageBase64) continue;
      out.push({
        mimeType: String(x?.mimeType || "image/png"),
        imageBase64,
      });
    }
    return out;
  }
  const single = typeof payload?.imageBase64 === "string" ? payload.imageBase64 : "";
  if (!single) return [];
  return [{ mimeType: String(payload?.mimeType || "image/png"), imageBase64: single }];
}

ipcMain.handle("image-understand", async (_event, payload) => {
  const cap = readCapabilitySettings();
  if (!cap.imageUnderstandEnabled) {
    throw new Error("请先在「AI能力组合」中开启图像理解。");
  }
  const cred = resolveImageCredentials();
  if (!cred.apiKey) {
    throw new Error(
      isModularRouting()
        ? "请先在图像能力设置中填写 API Key。"
        : "请先在「模型配置」中填写 API Key。"
    );
  }
  const imgs = normalizeVisionPayloadImages(payload);
  if (!imgs.length) {
    throw new Error("缺少图片数据");
  }
  const userPrompt = String(payload?.prompt || "请详细描述图片内容，并列出可见文字与关键物体。").trim();
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        ...imgs.map((img) => ({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.imageBase64}` },
        })),
      ],
    },
  ];
  const base = cred.baseUrl.replace(/\/$/, "");
  const isMm = inferProviderFromBaseUrl(base) === "minimax";
  const url = isMm ? buildMiniMaxChatCompletionV2Url(base) : `${base}/chat/completions`;
  const bodyPayload = isMm
    ? {
        model: cred.visionModel,
        messages,
        temperature: 0.4,
        max_completion_tokens: 2048,
      }
    : {
        model: cred.visionModel,
        messages,
        temperature: 0.4,
        max_tokens: 2048,
      };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cred.apiKey}`,
    },
    body: JSON.stringify(bodyPayload),
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data &&
        (data.error?.message ||
          data.message ||
          data.base_resp?.status_msg)) ||
      text ||
      `HTTP ${res.status}`;
    throw new Error(appendMiniMaxErrorHints(`图像理解失败：${msg}`));
  }
  if (data?.base_resp && Number(data.base_resp.status_code) !== 0) {
    const msg = data.base_resp.status_msg || `status_code ${data.base_resp.status_code}`;
    throw new Error(appendMiniMaxErrorHints(`图像理解失败：${msg}`));
  }
  const content = data?.choices?.[0]?.message?.content ?? "";
  return { content: String(content || "").trim(), raw: data };
});

function lastUserMessageText(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") {
      return m.content.trim();
    }
  }
  return "";
}

const WEB_SEARCH_MAX = 3200;
/** 多源并行检索，略放宽超时，适配代理/慢网环境 */
const WEB_FETCH_TIMEOUT_MS = 9000;
const SEARCH_RULES_FILE = "search-rule-config.json";
const webSearchSourceState = new Map();

function searchRulesPath() {
  return path.join(app.getPath("userData"), SEARCH_RULES_FILE);
}

function defaultSearchRuleConfig() {
  return {
    sourceRules: DEFAULT_SOURCE_RULES,
    requestMode: "parallel",
    pageSize: 10,
    timeout: WEB_FETCH_TIMEOUT_MS,
    topN: 5,
    showSource: true,
    sourceAttribution: true,
    preferFreshness: true,
    conflictDetection: true,
  };
}

function readSearchRuleConfig() {
  const defaults = defaultSearchRuleConfig();
  const p = searchRulesPath();
  if (!fs.existsSync(p)) return defaults;
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      ...defaults,
      ...raw,
      sourceRules: mergeSourceRules(raw?.sourceRules || defaults.sourceRules),
      pageSize: Math.max(1, Math.min(20, Number(raw?.pageSize) || defaults.pageSize)),
      timeout: Math.max(1200, Math.min(12000, Number(raw?.timeout) || defaults.timeout)),
      topN: Math.max(1, Math.min(10, Number(raw?.topN) || defaults.topN)),
      showSource: raw?.showSource !== false,
      sourceAttribution: raw?.sourceAttribution !== false,
      preferFreshness: raw?.preferFreshness !== false,
      conflictDetection: raw?.conflictDetection !== false,
    };
  } catch {
    return defaults;
  }
}

function writeSearchRuleConfig(next) {
  const merged = {
    ...defaultSearchRuleConfig(),
    ...(next && typeof next === "object" ? next : {}),
  };
  merged.sourceRules = mergeSourceRules(merged.sourceRules || {});
  fs.writeFileSync(searchRulesPath(), JSON.stringify(merged), "utf8");
  return merged;
}

function psSingleQuote(s) {
  // PowerShell 单引号字符串：内部单引号用两个单引号转义
  return "'" + String(s ?? "").replace(/'/g, "''") + "'";
}

async function fetchJsonViaPowerShell(url, headers, timeoutMs) {
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  const urlEsc = psSingleQuote(url);

  const headerEntries = Object.entries(headers || {}).filter(([, v]) => v != null && String(v) !== "");
  const headerJs = headerEntries
    .map(([k, v]) => `${psSingleQuote(k)}=${psSingleQuote(v)}`)
    .join(";");

  // 用 Invoke-RestMethod 走 Windows 网络栈，通常比 Node fetch 更容易兼容代理/证书环境
  const ps = `
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13;
      $headers = @{};
      ${headerJs ? `$headers = @${"{"}${headerJs}${"}"};` : ""}
      $res = Invoke-RestMethod -Uri ${urlEsc} -Method Get -Headers $headers -TimeoutSec ${timeoutSec} -ErrorAction Stop;
      $res | ConvertTo-Json -Depth 25 -Compress
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
      { timeout: timeoutMs + 2000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          return resolve(null);
        }
        try {
          const raw = String(stdout || "").trim();
          if (!raw) return resolve(null);
          resolve(JSON.parse(raw));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

async function fetchJsonViaElectronNet(url, headers) {
  try {
    const res = await net.fetch(url, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      return null;
    }
    const text = await res.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchTextViaElectronNet(url, headers) {
  try {
    const res = await net.fetch(url, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      return "";
    }
    return await res.text();
  } catch {
    return "";
  }
}

/**
 * 优先使用 Chromium net.fetch，可走系统代理/证书链，减少「换电脑后检索全空」。
 */
async function fetchTextWithNodeOrElectron(url, headers, timeoutMs) {
  let netText = "";
  try {
    netText = await Promise.race([
      fetchTextViaElectronNet(url, headers),
      new Promise((resolve) => {
        setTimeout(() => resolve(""), timeoutMs);
      }),
    ]);
  } catch {
    netText = "";
  }
  if (netText) {
    return netText;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers,
    });
    if (!res.ok) {
      return "";
    }
    return await res.text();
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * JSON 检索同样优先 net.fetch，再走 Node fetch，提高代理环境下的成功率。
 */
async function fetchJsonWithNodeOrPowerShell(url, headers, timeoutMs) {
  let j = null;
  try {
    j = await Promise.race([
      fetchJsonViaElectronNet(url, headers),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } catch {
    j = null;
  }
  if (j) {
    return j;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      headers,
    });
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch (err) {
    if (String(process.env.ALLOW_PS_WEB_FALLBACK || "").toLowerCase() === "true") {
      return await fetchJsonViaPowerShell(url, headers, timeoutMs);
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDuckDuckGoContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://api.duckduckgo.com/?q=${encodeURIComponent(q.slice(0, 200))}&format=json&no_html=1&no_redirect=1`;
  try {
    const d = await fetchJsonWithNodeOrPowerShell(
      u,
      {
        "User-Agent": "DailyTaskTracker/1.7 (Electron desktop; AI web augment)",
        Accept: "application/json",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!d) {
      return "";
    }
    const parts = [];
    if (d.Answer) {
      parts.push(`即时答案：${d.Answer}`);
    }
    if (d.AbstractText) {
      parts.push(`摘要：${d.AbstractText}`);
    }
    if (d.AbstractURL) {
      parts.push(`参考链接：${d.AbstractURL}`);
    }
    function walkTopics(topics, depth) {
      if (depth > 4 || !Array.isArray(topics)) {
        return;
      }
      for (const t of topics.slice(0, 10)) {
        if (!t || typeof t !== "object") {
          continue;
        }
        if (t.Text) {
          parts.push(`- ${t.Text}`);
        }
        if (t.Topics) {
          walkTopics(t.Topics, depth + 1);
        }
      }
    }
    walkTopics(d.RelatedTopics, 0);
    let out = parts.join("\n").trim();
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

async function fetchWikipediaOpenSearchContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://zh.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q.slice(0, 120))}&limit=5&namespace=0&format=json&origin=*`;
  try {
    const data = await fetchJsonWithNodeOrPowerShell(
      u,
      {
        "User-Agent": "DailyTaskTracker/1.7 (https://github.com/; local desktop app)",
        Accept: "application/json",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!data) {
      return "";
    }
    const titles = data[1];
    const descs = data[2];
    if (!Array.isArray(titles) || titles.length === 0) {
      return "";
    }
    const lines = [];
    for (let i = 0; i < titles.length; i++) {
      const line = `${titles[i]}${descs[i] ? `：${descs[i]}` : ""}`;
      lines.push(line);
    }
    let out = `中文维基百科相关词条（简介）：\n${lines.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

async function fetchBingNewsRssContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://www.bing.com/news/search?q=${encodeURIComponent(q.slice(0, 120))}&format=RSS`;
  try {
    const xml = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent": "DailyTaskTracker/1.7 (Electron desktop; AI web augment)",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!xml) {
      return "";
    }
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < 6) {
      const blk = m[1] || "";
      const t = (blk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || blk.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const l = (blk.match(/<link>([\s\S]*?)<\/link>/i) || [])[1];
      const title = String(t || "").replace(/<[^>]+>/g, "").trim();
      const link = String(l || "").trim();
      if (title) {
        items.push(`- ${title}${link ? `（${link}）` : ""}`);
      }
    }
    if (!items.length) {
      return "";
    }
    let out = `Bing 新闻检索（RSS）:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

async function fetchBingWebSearchContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://www.bing.com/search?q=${encodeURIComponent(`${q} 新闻`)}`;
  try {
    const html = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!html) {
      return "";
    }
    const items = [];
    const seen = new Set();
    const rules = [
      /<li class="b_algo"[\s\S]*?<h2[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h2>/gi,
      /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?<h3[^>]*>([\s\S]*?)<\/h3>[\s\S]*?<\/a>/gi,
      /<h2[^>]*><a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/gi,
    ];
    for (const re of rules) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(html)) && items.length < 6) {
        const link = String(m[1] || "").trim();
        const title = String(m[2] || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
        if (!title || !link) {
          continue;
        }
        const key = `${title}|${link}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        items.push(`- ${title}（${link}）`);
      }
      if (items.length >= 4) {
        break;
      }
    }
    if (!items.length) {
      return "";
    }
    let out = `Bing 网页检索结果:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

async function fetchBaiduNewsContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://www.baidu.com/s?wd=${encodeURIComponent(`${q} 科技 新闻`)}`;
  try {
    const html = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!html) {
      return "";
    }
    const items = [];
    const seen = new Set();
    const rules = [
      /<h3[^>]*class="[^"]*t[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi,
      /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi,
      /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];
    for (const re of rules) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(html)) && items.length < 8) {
        const link = String(m[1] || "").trim();
        const title = String(m[2] || "")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/\s+/g, " ")
          .trim();
        if (!title || !link) {
          continue;
        }
        if (/百度首页|百度一下|百度快照|相关搜索/.test(title)) {
          continue;
        }
        const key = `${title}|${link}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        items.push(`- ${title}（${link}）`);
      }
      if (items.length >= 5) {
        break;
      }
    }
    if (!items.length) {
      return "";
    }
    let out = `百度新闻/网页检索结果:\n${items.slice(0, 6).join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

function parseSearchHtmlItemsByRegex(html, rules, maxItems = 6) {
  const items = [];
  const seen = new Set();
  const text = String(html || "");
  for (const re of rules || []) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text)) && items.length < maxItems) {
      const link = String(m[1] || "").trim();
      const title = String(m[2] || "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim();
      if (!title || !link) continue;
      const key = `${title}|${link}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(`- ${title}（${link}）`);
    }
    if (items.length >= maxItems) break;
  }
  return items;
}

async function fetchSogouWebSearchContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  const u = `https://www.sogou.com/web?query=${encodeURIComponent(q.slice(0, 160))}`;
  try {
    const html = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!html) return "";
    const rules = [
      /<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi,
      /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi,
    ];
    const items = parseSearchHtmlItemsByRegex(html, rules, 6);
    if (!items.length) return "";
    let out = `搜狗网页检索结果:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

async function fetchToutiaoSearchContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  const u = `https://so.toutiao.com/search?dvpf=pc&keyword=${encodeURIComponent(q.slice(0, 160))}`;
  try {
    const html = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!html) return "";
    const rules = [
      /<a[^>]*href="(https?:\/\/[^"]+)"[^>]*title="([^"]+)"[^>]*>/gi,
      /<h3[^>]*>[\s\S]*?<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/gi,
    ];
    const items = parseSearchHtmlItemsByRegex(html, rules, 6);
    if (!items.length) return "";
    let out = `头条搜索结果:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

async function fetchBaiduBaikeContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  const u = `https://baike.baidu.com/search/word?word=${encodeURIComponent(q.slice(0, 120))}`;
  try {
    const html = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!html) return "";
    const rules = [
      /<dd[^>]*class="search-list[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
      /<a[^>]*href="(\/item\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ];
    const items = parseSearchHtmlItemsByRegex(html, rules, 6).map((x) => x.replace("（/item/", "（https://baike.baidu.com/item/"));
    if (!items.length) return "";
    let out = `百度百科相关词条:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

async function fetchGovPolicyContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:www.gov.cn ${q}`);
}

async function fetchGithubTrendingContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:github.com ${q}`);
}

async function fetchStackOverflowContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:stackoverflow.com ${q}`);
}

async function fetchPeopleNewsContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:people.com.cn ${q}`);
}

async function fetchXinhuaContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:xinhuanet.com ${q}`);
}

async function fetchEnterpriseAnnouncementContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:cninfo.com.cn OR site:sse.com.cn OR site:szse.cn ${q}`);
}

async function fetchDouyinBaikeContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:douyin.com OR site:baike.com ${q}`);
}

async function fetchZhihuContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:zhihu.com ${q}`);
}

async function fetchXiaohongshuContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:xiaohongshu.com ${q}`);
}

async function fetchBilibiliContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:bilibili.com ${q}`);
}

async function fetchCsdnContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:csdn.net ${q}`);
}

async function fetchHuggingFaceContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:huggingface.co ${q}`);
}

async function fetchModelScopeContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:modelscope.cn ${q}`);
}

async function fetchOllamaLibraryContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:ollama.com/library ${q}`);
}

async function fetchPapersWithCodeContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  return fetchBingWebSearchContext(`site:paperswithcode.com ${q}`);
}

async function fetchArxivContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  const u = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(q.slice(0, 120))}&start=0&max_results=6`;
  try {
    const xml = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent": "DailyTaskTracker/1.9 (Electron desktop; AI web augment)",
        Accept: "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!xml) return "";
    const items = [];
    const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
    let m;
    while ((m = entryRe.exec(xml)) && items.length < 6) {
      const blk = m[1] || "";
      const t = (blk.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const l =
        (blk.match(/<id>([\s\S]*?)<\/id>/i) || [])[1] ||
        (blk.match(/<link[^>]*href="([^"]+)"[^>]*\/?>/i) || [])[1];
      const title = String(t || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      const link = String(l || "").trim();
      if (!title) continue;
      items.push(`- ${title}${link ? `（${link}）` : ""}`);
    }
    if (!items.length) return "";
    let out = `arXiv 论文检索:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

function guessCurrencyBaseFromQuery(query) {
  const q = String(query || "").toUpperCase();
  if (/美元|USD/.test(q)) return "USD";
  if (/欧元|EUR/.test(q)) return "EUR";
  if (/英镑|GBP/.test(q)) return "GBP";
  if (/日元|JPY/.test(q)) return "JPY";
  if (/港币|HKD/.test(q)) return "HKD";
  return "CNY";
}

async function fetchFxApiContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  if (!/(汇率|货币|美元|欧元|英镑|日元|港币|exchange|fx)/i.test(q)) return "";
  const base = guessCurrencyBaseFromQuery(q);
  const u = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  try {
    const data = await fetchJsonWithNodeOrPowerShell(
      u,
      {
        "User-Agent": "DailyTaskTracker/1.9 (Electron desktop; AI web augment)",
        Accept: "application/json",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!data || String(data.result || "").toLowerCase() !== "success" || !data.rates) {
      return "";
    }
    const rates = data.rates || {};
    const picks = ["USD", "CNY", "EUR", "JPY", "GBP", "HKD"];
    const lines = picks
      .filter((k) => Number.isFinite(Number(rates[k])))
      .map((k) => `- 1 ${base} = ${Number(rates[k]).toFixed(4)} ${k}`);
    if (!lines.length) return "";
    let out = `汇率实时 API（open.er-api.com）:\n${lines.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

async function fetchWeatherApiContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) return "";
  if (!/(天气|气温|降雨|湿度|风力|temperature|weather)/i.test(q)) return "";
  try {
    const text = await fetchTextWithNodeOrElectron(
      "https://wttr.in/?format=j1",
      {
        "User-Agent": "DailyTaskTracker/1.9 (Electron desktop; AI web augment)",
        Accept: "application/json",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!text) return "";
    const data = JSON.parse(text);
    const cur = Array.isArray(data?.current_condition) ? data.current_condition[0] : null;
    if (!cur) return "";
    const lines = [
      `- 观测温度：${cur.temp_C || "?"}°C（体感 ${cur.FeelsLikeC || "?"}°C）`,
      `- 天气：${Array.isArray(cur.weatherDesc) ? cur.weatherDesc[0]?.value || "" : ""}`,
      `- 湿度：${cur.humidity || "?"}%`,
      `- 风速：${cur.windspeedKmph || "?"} km/h`,
      `- 观测时间：${cur.localObsDateTime || cur.observation_time || "未知"}`,
    ];
    let out = `天气实时 API（wttr.in）:\n${lines.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    return out;
  } catch {
    return "";
  }
}

/** Google News RSS，部分地区 Bing/百度不可用时仍常可解析 */
async function fetchGoogleNewsRssContext(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "";
  }
  const u = `https://news.google.com/rss/search?q=${encodeURIComponent(q.slice(0, 200))}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  try {
    const xml = await fetchTextWithNodeOrElectron(
      u,
      {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
      WEB_FETCH_TIMEOUT_MS
    );
    if (!xml) {
      return "";
    }
    const items = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/gi;
    let m;
    while ((m = itemRe.exec(xml)) && items.length < 8) {
      const blk = m[1] || "";
      const t = (blk.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) || blk.match(/<title>([\s\S]*?)<\/title>/i) || [])[1];
      const l = (blk.match(/<link>([\s\S]*?)<\/link>/i) || [])[1];
      const title = String(t || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
      const link = String(l || "").trim();
      if (!title || /^related articles|^related coverage|^more coverage/i.test(title)) {
        continue;
      }
      if (title) {
        items.push(`- ${title}${link ? `（${link}）` : ""}`);
      }
    }
    if (!items.length) {
      return "";
    }
    let out = `Google News RSS:\n${items.join("\n")}`;
    if (out.length > WEB_SEARCH_MAX) {
      out = `${out.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return out;
  } catch {
    return "";
  }
}

function buildWebSearchAssistantInstruction() {
  return (
    "【联网检索行为要求】用户已在应用底栏开启「联网检索」。\n" +
    "1) 系统消息中会包含本客户端通过公开 HTTP 拉取的「联网检索摘要」；若存在有效条目，你须优先据此回答时事、新闻类问题，并提示用户自行点击链接核实来源与实效。\n" +
    "2) 禁止回答「我没有联网搜索功能」「无法访问互联网」等否认客户端检索能力的表述——检索由本应用在发送对话前完成并写入上文。\n" +
    "3) 若仅出现「本次未获取到可解析的公开网页摘要」等失败说明，应解释为当前网络、防火墙、代理或地区对部分检索源不可达，并给出可操作建议（检查网络/代理、稍后重试、换热点等），仍不得声称自身不具备联网检索。\n" +
    "4) 默认按“结论 -> 依据 -> 建议/步骤”输出，不要只给一句结论。若用户在问“有哪些/推荐/怎么选/对比”，至少给 6 条候选项，并按类型分组（如轻量/均衡/高性能），每项包含：适用场景、关键优点、主要限制。\n" +
    "5) 允许适度详细：优先保证信息完整、可执行，再追求简短；避免空泛口号和机械复述。\n"
  );
}

function getWebSourceAdapters() {
  return {
    BAIDU: fetchBaiduNewsContext,
    BING: fetchBingWebSearchContext,
    BING_NEWS: fetchBingNewsRssContext,
    GOOGLE_NEWS: fetchGoogleNewsRssContext,
    WIKIPEDIA: fetchWikipediaOpenSearchContext,
    DUCKDUCKGO: fetchDuckDuckGoContext,
    SOGOU: fetchSogouWebSearchContext,
    TOUTIAO: fetchToutiaoSearchContext,
    DOUYIN_BAIKE: fetchDouyinBaikeContext,
    BAIDU_BAIKE: fetchBaiduBaikeContext,
    GOV_POLICY: fetchGovPolicyContext,
    XINHUA: fetchXinhuaContext,
    ENTERPRISE_ANNOUNCEMENT: fetchEnterpriseAnnouncementContext,
    GITHUB_TRENDING: fetchGithubTrendingContext,
    STACKOVERFLOW: fetchStackOverflowContext,
    CSDN: fetchCsdnContext,
    PEOPLE_NEWS: fetchPeopleNewsContext,
    ZHIHU: fetchZhihuContext,
    XIAOHONGSHU: fetchXiaohongshuContext,
    BILIBILI: fetchBilibiliContext,
    HUGGINGFACE: fetchHuggingFaceContext,
    MODELSCOPE: fetchModelScopeContext,
    OLLAMA_LIBRARY: fetchOllamaLibraryContext,
    ARXIV: fetchArxivContext,
    PAPERSWITHCODE: fetchPapersWithCodeContext,
    WEATHER_API: fetchWeatherApiContext,
    FX_API: fetchFxApiContext,
  };
}

function buildSearchQueryProcessData(originalQuery, needExpand = true) {
  const coreKeywords = extractCoreKeywords(originalQuery);
  const intentInfo = inferQueryIntent(originalQuery);
  const expandedQueries = expandQueries(originalQuery, coreKeywords, intentInfo.queryIntent, needExpand !== false);
  return {
    originalQuery: String(originalQuery || "").trim(),
    coreKeywords,
    expandedQueries,
    queryIntent: intentInfo.queryIntent,
    intentDesc: intentInfo.intentDesc,
  };
}

async function runSearchPipelineByQuery(originalQuery) {
  const t0 = Date.now();
  const cfg = readSearchRuleConfig();
  const queryData = buildSearchQueryProcessData(originalQuery, true);
  const retrieveData = await retrieveMultiSource(
    {
      queries: queryData.expandedQueries,
      queryIntent: queryData.queryIntent,
      pageSize: cfg.pageSize,
      timeout: cfg.timeout,
    },
    getWebSourceAdapters(),
    {
      sourceRules: cfg.sourceRules,
      sourceStateMap: webSearchSourceState,
    }
  );
  retrieveData.retrieveTime = Date.now() - t0;
  const t1 = Date.now();
  const contentData = processContent(
    {
      sourceResults: retrieveData.sourceResults,
      coreKeywords: queryData.coreKeywords,
      topN: cfg.topN,
    },
    {
      sourceRules: cfg.sourceRules,
      preferFreshness: cfg.preferFreshness !== false,
      conflictDetection: cfg.conflictDetection !== false,
    }
  );
  contentData.processTime = Date.now() - t1;
  return { queryData, retrieveData, contentData, cfg };
}

async function buildWebSearchBlock(query) {
  const q = String(query || "").trim();
  if (q.length < 2) {
    return "【联网检索】检索词过短，已跳过联网检索。";
  }
  try {
    const { queryData, contentData, cfg } = await runSearchPipelineByQuery(q);
    const summary = buildWebSearchSummaryBlock(contentData, queryData.queryIntent, {
      sourceAttribution: cfg.showSource !== false && cfg.sourceAttribution !== false,
    });
    if (summary.length > WEB_SEARCH_MAX) {
      return `${summary.slice(0, WEB_SEARCH_MAX)}\n…（已截断）`;
    }
    return summary;
  } catch {
    return "【联网检索】本次未获取到可解析的公开网页摘要。请基于已有知识先给出参考答案，并明确标注时效风险。";
  }
}

function buildSessionMetaBlock(modelId, profileLabel) {
  const name = profileLabel || "当前配置";
  return (
    "【本应用会话元信息】\n" +
    `- 当前模型配置名称：「${name}」。\n` +
    `- 当前请求在 OpenAI 兼容接口中使用的 model 参数为：「${modelId}」。\n` +
    "- 若用户问「你是什么模型」「用的哪个模型」，请直接如实回答上述 model 标识与配置名称；勿编造其他模型名。\n"
  );
}

function buildLocalDateBlock() {
  const now = new Date();
  const week = ["日", "一", "二", "三", "四", "五", "六"][now.getDay()];
  const pad = (n) => String(n).padStart(2, "0");
  const dateText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeText = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  return (
    "【本机时间信息（优先参考）】\n" +
    `- 当前本机日期：${dateText}（星期${week}）\n` +
    `- 当前本机时间：${timeText}\n` +
    "- 若用户询问今天几号/星期几，应优先依据本机时间回答，不要臆测。\n"
  );
}

function isLocalDateQuestion(text) {
  const q = String(text || "").trim().toLowerCase();
  if (!q) return false;
  return /(今天|今日|现在|当前).*(几号|日期|星期|周几|礼拜)|what.*date|today.*date/.test(q);
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertNotAborted(signal) {
  if (signal && signal.aborted) {
    throw new Error("用户已取消生成");
  }
}

async function sleepMsAbortable(ms, signal) {
  if (!ms || ms <= 0) {
    return;
  }
  assertNotAborted(signal);
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("用户已取消生成"));
    };
    if (signal && signal.aborted) {
      clearTimeout(t);
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** webContents.id -> 当前进行中的 ai-chat 可中止句柄 */
const activeAiChatByWebContents = new Map();

let cachedLocationContext = { block: "", ts: 0 };
async function buildApproxLocationBlock() {
  const now = Date.now();
  if (cachedLocationContext.block && now - cachedLocationContext.ts < 10 * 60 * 1000) {
    return cachedLocationContext.block;
  }
  const locale = app.getLocale ? app.getLocale() : "";
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  let ipLine = "";
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2500);
    const res = await fetch("http://ip-api.com/json/?lang=zh-CN", { signal: ctl.signal });
    clearTimeout(to);
    if (res.ok) {
      const j = await res.json();
      if (j && j.status === "success") {
        const seg = [j.country, j.regionName, j.city].filter(Boolean).join(" / ");
        ipLine = seg ? `\n- 运营商/IP 近似地理位置：${seg}` : "";
      }
    }
  } catch {
    /* 网络不可达时忽略，回退到时区/语言环境 */
  }
  const block =
    "【当前所在地（近似）】\n" +
    `- 系统语言环境：${locale || "未知"}` +
    `\n- 系统时区：${tz || "未知"}` +
    ipLine +
    "\n- 说明：若用户问到“我附近/本地”等地点相关问题，请优先参考上述信息；若置信度不足，明确提示需用户补充更精确位置。";
  cachedLocationContext = { block, ts: now };
  return block;
}

function miniMaxFailureRetryable(httpStatus, data, rawText) {
  if ([520, 502, 503, 504, 429].includes(httpStatus)) {
    return true;
  }
  const msg = data && typeof data === "object" ? String(data.error?.message || data.message || "") : "";
  const code = data && typeof data === "object" ? data.error?.code ?? data.code : undefined;
  if (code === 1000 || code === "1000") {
    return true;
  }
  if (code === 2064 || code === "2064") {
    return true;
  }
  const choiceCount = data && typeof data === "object" && Array.isArray(data.choices) ? data.choices.length : -1;
  const baseStatusCode = data && typeof data === "object" ? data.base_resp?.status_code : undefined;
  if (httpStatus === 200 && choiceCount === 0 && (baseStatusCode === 0 || baseStatusCode === "0")) {
    return true;
  }
  if (/unknown error/i.test(msg) && /\b1000\b|\(1000\)/.test(msg)) {
    return true;
  }
  if (/集群负载较高|cluster.*load|please retry later/i.test(msg)) {
    return true;
  }
  if (!data && /\b1000\b|"code"\s*:\s*1000/i.test(String(rawText || ""))) {
    return true;
  }
  if (!data && /\b2064\b|"code"\s*:\s*2064/i.test(String(rawText || ""))) {
    return true;
  }
  return false;
}


/**
 * speech-* 等为语音合成模型，仅走 TTS 接口；AI 助手走 /chat/completions，二者不可混用。
 */
function assertProfileSupportsChatCompletions(cred) {
  const mid = String(cred.model || "").trim();
  if (/^speech-/i.test(mid) || /^tts-1/i.test(mid)) {
    throw new Error(
      "当前模型 ID「" +
        mid +
        "」为语音合成（TTS）模型，不能用于 AI 助手对话。请在「模型」下拉里切换为文本对话模型（如 MiniMax-M3、MiniMax-M2.7）；语音朗读请使用顶栏「AI能力」中的 TTS 或分模块语音设置。"
    );
  }
  const bu = String(cred.baseUrl || "").toLowerCase();
  if (/\/t2a/i.test(bu) || /text-to-audio/i.test(bu)) {
    throw new Error(
      "当前 API Base URL 指向语音合成接口（如 …/t2a…），不能用于对话。AI 助手需使用文本 OpenAI 兼容根路径（例如 https://api.minimax.io/v1），与 TTS 配置分开保存。"
    );
  }
}

ipcMain.handle("ai-chat", async (event, payload) => {
  const {
    messages: rawMessages,
    webSearch,
    webSearchQuery,
    tools,
    tool_choice: toolChoice,
    requestId: rawRequestId,
  } = payload || {};
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new Error("缺少对话消息");
  }
  const requestId = String(rawRequestId || "").trim();
  const wcId = event.sender.id;
  const controller = new AbortController();
  if (requestId) {
    activeAiChatByWebContents.set(wcId, { requestId, controller });
  }
  try {
    const messages = rawMessages.map((m) => {
      const base = {
        role: m.role,
        content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      };
      // runChatWithTools 多轮时必须保留 tool_calls / tool_call_id，否则供应商会报 tool id not found
      if (m && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        base.tool_calls = m.tool_calls;
      }
      if (m && typeof m.tool_call_id === "string" && m.tool_call_id.trim()) {
        base.tool_call_id = m.tool_call_id;
      }
      if (m && typeof m.name === "string" && m.name.trim()) {
        base.name = m.name;
      }
      return base;
    });

    assertNotAborted(controller.signal);
    const cred = getActiveProfileCredentials();
    assertProfileSupportsChatCompletions(cred);
    const modelId = cred.model;
    const metaBlock = buildSessionMetaBlock(modelId, cred.label);
    const localDateBlock = buildLocalDateBlock();
    const locationBlock = await buildApproxLocationBlock();
    assertNotAborted(controller.signal);
    {
      const sysIdx = messages.findIndex((m) => m.role === "system");
      if (sysIdx >= 0) {
        messages[sysIdx] = {
          ...messages[sysIdx],
          content: `${messages[sysIdx].content}\n\n${metaBlock}\n${localDateBlock}\n${locationBlock}`,
        };
      } else {
        messages.unshift({ role: "system", content: `${metaBlock}\n${localDateBlock}\n${locationBlock}` });
      }
    }

    if (webSearch) {
      const q = (typeof webSearchQuery === "string" ? webSearchQuery.trim() : "") || lastUserMessageText(messages);
      let webBlock = "";
      if (!isLocalDateQuestion(q)) {
        webBlock = await buildWebSearchBlock(q);
      } else {
        webBlock =
          "【联网检索】当前为日期/星期类问题，已跳过外网网页拉取；请仅依据上文「本机时间信息」作答。\n";
      }
      assertNotAborted(controller.signal);
      const instr = buildWebSearchAssistantInstruction();
      const tail = `${webBlock}\n\n${instr}`;
      const sysIdx2 = messages.findIndex((m) => m.role === "system");
      if (sysIdx2 >= 0) {
        messages[sysIdx2] = {
          ...messages[sysIdx2],
          content: `${messages[sysIdx2].content}\n\n${tail}`,
        };
      } else {
        messages.unshift({ role: "system", content: tail });
      }
    }
    const apiKey = cred.apiKey;
    const localInference = isLocalChatInferenceBaseUrl(cred.baseUrl);
    if (!apiKey && !localInference) {
      throw new Error(
        "当前为云端/API 模型配置，但未读取到有效 API Key。请到「AI能力」→「管理对话模型配置」检查当前选中项是否已保存密钥；若刚保存过仍如此，可能是本机安全存储不可用导致密钥未能写入，请重启应用或改用本机 Ollama 配置测试。"
      );
    }
    const base = cred.baseUrl.replace(/\/$/, "");
    const useOllamaNative = localInference && isLikelyOllamaOpenAiBase(cred.baseUrl);
    let ollamaApiRoot = useOllamaNative ? stripOpenAiV1BaseSuffix(cred.baseUrl) : "";
    if (useOllamaNative && (!ollamaApiRoot || !/^https?:\/\//i.test(ollamaApiRoot))) {
      ollamaApiRoot = normalizeOllamaHost(readOllamaSettings().host);
    }

    const bodyPayload = {
      model: modelId,
      messages,
      temperature: 1.0,
    };
    // 仅对云端供应商透传联网开关；本机 Ollama 等不需要且部分实现可能对未知字段不兼容。
    if (webSearch && !localInference) {
      bodyPayload.web_search = true;
      bodyPayload.webSearch = true;
    }
    if (Array.isArray(tools) && tools.length > 0) {
      bodyPayload.tools = tools;
      bodyPayload.tool_choice = toolChoice || "auto";
    }

    const maxAttempts = 4;
    const backoffMs = [0, 1200, 2600, 4200];
    let lastFailText = "";

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      assertNotAborted(controller.signal);
      if (backoffMs[attempt] > 0) {
        await sleepMsAbortable(backoffMs[attempt], controller.signal);
      }
      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
      }

      let url;
      let body;
      if (useOllamaNative) {
        const oset = readOllamaSettings();
        const toolsInUse = Array.isArray(tools) && tools.length > 0;
        const options = buildOllamaNativeOptions(oset, { toolsInUse });
        url = `${ollamaApiRoot}/api/chat`;
        const nativeBody = {
          model: modelId,
          messages,
          stream: false,
          options,
        };
        if (Array.isArray(tools) && tools.length > 0) {
          nativeBody.tools = tools;
          nativeBody.tool_choice = toolChoice || "auto";
        }
        body = JSON.stringify(nativeBody);
      } else {
        url = `${base}/chat/completions`;
        body = JSON.stringify(bodyPayload);
      }

      let res;
      let text;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body,
          signal: controller.signal,
        });
        text = await res.text();
      } catch (e) {
        if (controller.signal.aborted || e?.name === "AbortError") {
          throw new Error("用户已取消生成");
        }
        throw e;
      }
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }

      if (useOllamaNative) {
        const errFromNative =
          typeof data?.error === "string" ? data.error : data?.error?.message || data?.error;
        const assistantMsg = data?.message;
        const nativeOk =
          res.ok &&
          assistantMsg &&
          !errFromNative &&
          (assistantMsg.role == null || assistantMsg.role === "assistant");
        if (nativeOk) {
          const syntheticRaw = { choices: [{ message: assistantMsg }], model: data.model };
          const ollamaUsage = extractOllamaNativeChatUsage(data, assistantMsg);
          return { content: assistantMsg.content ?? "", raw: syntheticRaw, ollamaUsage };
        }
        let msg = text || res.statusText;
        if (data) {
          msg = errFromNative || msg;
        }
        lastFailText = msg || `HTTP ${res.status}`;
        const retryable = miniMaxFailureRetryable(res.status, data, text);
        if (retryable && attempt < maxAttempts - 1) {
          continue;
        }
        throw new Error(appendMiniMaxErrorHints(lastFailText));
      }

      const hasChoices = data && Array.isArray(data.choices) && data.choices.length > 0;
      const apiErr = data && data.error && (data.error.message || data.error.code !== undefined);

      if (res.ok && hasChoices && !apiErr) {
        const content = data.choices[0]?.message?.content ?? "";
        return { content, raw: data, ollamaUsage: null };
      }

      let msg = text || res.statusText;
      if (data) {
        msg = data.error?.message || data.message || msg;
      }
      lastFailText = msg || `HTTP ${res.status}`;
      const retryable = miniMaxFailureRetryable(res.status, data, text);

      if (retryable && attempt < maxAttempts - 1) {
        continue;
      }

      throw new Error(appendMiniMaxErrorHints(lastFailText));
    }

    throw new Error(appendMiniMaxErrorHints(lastFailText));
  } finally {
    const cur = activeAiChatByWebContents.get(wcId);
    if (cur && cur.controller === controller) {
      activeAiChatByWebContents.delete(wcId);
    }
  }
});

ipcMain.handle("ai-chat-abort", (event, payload) => {
  const wcId = event.sender.id;
  const want = String(payload?.requestId || "");
  const cur = activeAiChatByWebContents.get(wcId);
  if (!cur) {
    return { ok: true, note: "no-active" };
  }
  if (!want || cur.requestId === want) {
    cur.controller.abort();
    return { ok: true };
  }
  return { ok: false, note: "id-mismatch" };
});

ipcMain.handle("ai-location-context", async () => {
  const block = await buildApproxLocationBlock();
  return { ok: true, block };
});


async function verifyKnowledgeTextOnline({ docName, text }) {
  const raw = String(text || "").trim();
  if (!raw) {
    return { correctedText: raw, summary: "原文为空，无需核验", sources: [] };
  }
  const query = `${String(docName || "").trim()} ${raw.slice(0, 160)}`.trim();
  const webBlock = await buildWebSearchBlock(query);
  const lines = String(webBlock || "")
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^-\s/.test(x) && /https?:\/\//i.test(x))
    .slice(0, 6);
  const sources = lines.map((x) => x.replace(/^-+\s*/, ""));
  const cred = getActiveProfileCredentials();
  const localInference = isLocalChatInferenceBaseUrl(cred.baseUrl);
  if (!cred.apiKey && !localInference) {
    return {
      correctedText: raw,
      summary: "已尝试联网检索，但当前云端模型未配置 API Key，跳过自动修正",
      sources,
    };
  }
  const base = cred.baseUrl.replace(/\/$/, "");
  const model = String(cred.model || DEFAULT_AI_MODEL).trim();
  const headers = { "Content-Type": "application/json" };
  if (cred.apiKey) {
    headers.Authorization = `Bearer ${cred.apiKey}`;
  }
  const systemPrompt =
    "你是知识库质检助手。请根据联网检索摘要对文档原文进行事实核验与纠错。仅在有明确证据时修正；证据不足时保留原文。输出必须为 JSON，格式：{\"corrected_text\":\"...\",\"summary\":\"...\"}。summary 简短描述修正点。";
  const userPrompt = `【文档名】${docName || "未命名"}\n【原文】\n${raw}\n\n【联网检索摘要】\n${webBlock}\n\n请输出 JSON。`;
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  const txt = await res.text();
  let data = null;
  try {
    data = JSON.parse(txt);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || txt || `HTTP ${res.status}`;
    throw new Error(appendMiniMaxErrorHints(String(msg)));
  }
  const out = String(data?.choices?.[0]?.message?.content || "").trim();
  let parsed = null;
  try {
    parsed = JSON.parse(out);
  } catch {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        parsed = JSON.parse(m[0]);
      } catch {
        parsed = null;
      }
    }
  }
  const correctedText = String(parsed?.corrected_text || "").trim() || raw;
  const summary = String(parsed?.summary || "").trim() || "已完成联网核验，未发现明确可修正错误";
  return { correctedText, summary, sources };
}


if (process.env.JINGLUO_DISABLE_GPU === "1") {
  app.disableHardwareAcceleration();
}

let kbHandlers = null;

app.on("before-quit", () => {
  kbHandlers?.kbWatch?.stopAll?.();
});

app.whenReady().then(async () => {
  registerExtractedIpcHandlers(ipcMain, { app });
  registerWorkbenchWindowIpc(ipcMain);
  registerWindowChromeHandlers(ipcMain);
  registerStartupIpc(ipcMain);
  kbHandlers = registerKnowledgeBaseHandlers(ipcMain, {
    getUserDataPath: () => app.getPath("userData"),
    readOllamaSettings,
    verifyTextOnline: verifyKnowledgeTextOnline,
    webSearchBlockBuilder: buildWebSearchBlock,
  });
  await bootstrapApplication();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void bootstrapApplication();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
