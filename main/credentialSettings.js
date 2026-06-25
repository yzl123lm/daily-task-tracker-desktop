const path = require("path");
const fs = require("fs");
const { app, safeStorage } = require("electron");

const DEFAULT_ASR_BASE = "https://api.openai.com/v1";
const DEFAULT_ASR_MODEL = "whisper-1";
const DEFAULT_TTS_BASE = "https://api.openai.com/v1";
const DEFAULT_TTS_MODEL = "tts-1";
const DEFAULT_TTS_VOICE = "alloy";
const DEFAULT_IMAGE_BASE = "https://api.openai.com/v1";
const DEFAULT_IMAGE_GEN_MODEL = "dall-e-3";
const DEFAULT_IMAGE_VISION_MODEL = "gpt-4o";
const DEFAULT_IMAGE_SIZE = "1024x1024";

function normalizeApiKey(key) {
  return String(key || "").trim();
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

const { readJsonFile, writeJsonFile } = require("../utils/settingsStore.js");

function readJsonSettings(filePath, defaults) {
  return readJsonFile(filePath, defaults);
}

function asrSettingsPath() {
  return path.join(app.getPath("userData"), "asr-settings.json");
}

function readASRSettings() {
  return readJsonSettings(asrSettingsPath(), {
    baseUrl: DEFAULT_ASR_BASE,
    model: DEFAULT_ASR_MODEL,
    encryptedKeyB64: "",
    language: "zh",
    prompt: "",
  });
}

function writeASRSettings(s) {
  writeJsonFile(asrSettingsPath(), s);
}

function ttsSettingsPath() {
  return path.join(app.getPath("userData"), "tts-settings.json");
}

function readTTSSettings() {
  return readJsonSettings(ttsSettingsPath(), {
    provider: "cloud",
    baseUrl: DEFAULT_TTS_BASE,
    model: DEFAULT_TTS_MODEL,
    voice: DEFAULT_TTS_VOICE,
    encryptedKeyB64: "",
  });
}

function writeTTSSettings(s) {
  writeJsonFile(ttsSettingsPath(), s);
}

function imageSettingsPath() {
  return path.join(app.getPath("userData"), "image-settings.json");
}

function readImageSettings() {
  return readJsonSettings(imageSettingsPath(), {
    baseUrl: DEFAULT_IMAGE_BASE,
    genModel: DEFAULT_IMAGE_GEN_MODEL,
    visionModel: DEFAULT_IMAGE_VISION_MODEL,
    size: DEFAULT_IMAGE_SIZE,
    genStyle: "realistic",
    genResolution: "hd",
    visionImageLimit: 9,
    visionOutputFormat: "json",
    visionTags: "object,scene,ocr,person",
    visionPrompt: "",
    encryptedKeyB64: "",
  });
}

function writeImageSettings(s) {
  writeJsonFile(imageSettingsPath(), s);
}

function capabilitySettingsPath() {
  return path.join(app.getPath("userData"), "capability-settings.json");
}

function readCapabilitySettings() {
  return readJsonSettings(capabilitySettingsPath(), {
    routingMode: "unified",
    asrEnabled: true,
    ttsEnabled: false,
    ttsSpeakOnAiReply: false,
    imageGenEnabled: true,
    imageUnderstandEnabled: true,
  });
}

function writeCapabilitySettings(s) {
  writeJsonFile(capabilitySettingsPath(), s);
}

function registerModularSettingsHandlers(ipcMain) {
  ipcMain.handle("asr-settings-get", () => {
    const s = readASRSettings();
    const apiKey = normalizeApiKey(decryptKeyB64(s.encryptedKeyB64));
    const lang = typeof s.language === "string" ? s.language.trim() : "zh";
    return {
      baseUrl: (s.baseUrl || DEFAULT_ASR_BASE).replace(/\/$/, ""),
      model: String(s.model || DEFAULT_ASR_MODEL),
      language: lang,
      prompt: String(s.prompt || ""),
      hasKey: Boolean(apiKey),
    };
  });

  ipcMain.handle("asr-settings-set", (_event, payload) => {
    const cur = readASRSettings();
    const curKey = normalizeApiKey(decryptKeyB64(cur.encryptedKeyB64));
    let nextKey = curKey;
    if (payload?.clearKey) {
      nextKey = "";
    } else if (typeof payload?.apiKey === "string" && payload.apiKey.trim() !== "") {
      nextKey = normalizeApiKey(payload.apiKey);
    } else if (payload?.preserveKey) {
      nextKey = curKey;
    }
    const out = {
      ...cur,
      baseUrl:
        typeof payload?.baseUrl === "string" && payload.baseUrl.trim()
          ? payload.baseUrl.trim().replace(/\/$/, "")
          : cur.baseUrl || DEFAULT_ASR_BASE,
      model:
        typeof payload?.model === "string" && payload.model.trim()
          ? payload.model.trim()
          : cur.model || DEFAULT_ASR_MODEL,
      language: typeof payload?.language === "string" ? payload.language.trim() : String(cur.language || "zh").trim(),
      prompt: typeof payload?.prompt === "string" ? payload.prompt : cur.prompt || "",
      encryptedKeyB64: "",
    };
    if (nextKey && safeStorage.isEncryptionAvailable()) {
      const enc = encryptKeyToB64(nextKey);
      if (!enc) {
        throw new Error("无法加密保存 ASR API Key（加密失败）。请重启应用后重试。");
      }
      out.encryptedKeyB64 = enc;
    } else if (nextKey) {
      throw new Error("无法加密保存 ASR API Key（本机安全存储不可用）。");
    }
    writeASRSettings(out);
    return { ok: true };
  });

  ipcMain.handle("capability-settings-get", () => {
    const s = readCapabilitySettings();
    return { ...s };
  });

  ipcMain.handle("capability-settings-set", (_event, payload) => {
    const cur = readCapabilitySettings();
    const next = {
      ...cur,
      routingMode: payload?.routingMode === "modular" ? "modular" : "unified",
      asrEnabled: payload?.asrEnabled !== false,
      ttsEnabled: Boolean(payload?.ttsEnabled),
      ttsSpeakOnAiReply: Boolean(payload?.ttsSpeakOnAiReply),
      imageGenEnabled: payload?.imageGenEnabled !== false,
      imageUnderstandEnabled: payload?.imageUnderstandEnabled !== false,
    };
    writeCapabilitySettings(next);
    return { ok: true };
  });

  ipcMain.handle("tts-settings-get", () => {
    const t = readTTSSettings();
    const apiKey = normalizeApiKey(decryptKeyB64(t.encryptedKeyB64));
    return {
      provider: String(t.provider || "cloud").toLowerCase() === "local" ? "local" : "cloud",
      baseUrl: (t.baseUrl || DEFAULT_TTS_BASE).replace(/\/$/, ""),
      model: String(t.model || DEFAULT_TTS_MODEL),
      voice: String(t.voice || DEFAULT_TTS_VOICE),
      hasKey: Boolean(apiKey),
    };
  });

  ipcMain.handle("tts-settings-set", (_event, payload) => {
    const cur = readTTSSettings();
    const curKey = normalizeApiKey(decryptKeyB64(cur.encryptedKeyB64));
    let nextKey = curKey;
    if (payload?.clearKey) {
      nextKey = "";
    } else if (typeof payload?.apiKey === "string" && payload.apiKey.trim() !== "") {
      nextKey = normalizeApiKey(payload.apiKey);
    } else if (payload?.preserveKey) {
      nextKey = curKey;
    }
    const out = {
      ...cur,
      provider:
        typeof payload?.provider === "string" && payload.provider.toLowerCase() === "local"
          ? "local"
          : "cloud",
      baseUrl:
        typeof payload?.baseUrl === "string" && payload.baseUrl.trim()
          ? payload.baseUrl.trim().replace(/\/$/, "")
          : cur.baseUrl || DEFAULT_TTS_BASE,
      model:
        typeof payload?.model === "string" && payload.model.trim()
          ? payload.model.trim()
          : cur.model || DEFAULT_TTS_MODEL,
      voice:
        typeof payload?.voice === "string" && payload.voice.trim()
          ? payload.voice.trim()
          : cur.voice || DEFAULT_TTS_VOICE,
      encryptedKeyB64: "",
    };
    if (nextKey && safeStorage.isEncryptionAvailable()) {
      const enc = encryptKeyToB64(nextKey);
      if (!enc) {
        throw new Error("无法加密保存 TTS API Key（加密失败）。请重启应用后重试。");
      }
      out.encryptedKeyB64 = enc;
    } else if (nextKey) {
      throw new Error("无法加密保存 TTS API Key（本机安全存储不可用）。");
    }
    writeTTSSettings(out);
    return { ok: true };
  });

  ipcMain.handle("image-settings-get", () => {
    const img = readImageSettings();
    const apiKey = normalizeApiKey(decryptKeyB64(img.encryptedKeyB64));
    return {
      baseUrl: (img.baseUrl || DEFAULT_IMAGE_BASE).replace(/\/$/, ""),
      genModel: String(img.genModel || DEFAULT_IMAGE_GEN_MODEL),
      visionModel: String(img.visionModel || DEFAULT_IMAGE_VISION_MODEL),
      size: String(img.size || DEFAULT_IMAGE_SIZE),
      genStyle: String(img.genStyle || "realistic"),
      genResolution: String(img.genResolution || "hd"),
      visionImageLimit: Number(img.visionImageLimit) > 0 ? Number(img.visionImageLimit) : 9,
      visionOutputFormat: String(img.visionOutputFormat || "json"),
      visionTags: String(img.visionTags || "object,scene,ocr,person"),
      visionPrompt: String(img.visionPrompt || ""),
      hasKey: Boolean(apiKey),
    };
  });

  ipcMain.handle("image-settings-set", (_event, payload) => {
    const cur = readImageSettings();
    const curKey = normalizeApiKey(decryptKeyB64(cur.encryptedKeyB64));
    let nextKey = curKey;
    if (payload?.clearKey) {
      nextKey = "";
    } else if (typeof payload?.apiKey === "string" && payload.apiKey.trim() !== "") {
      nextKey = normalizeApiKey(payload.apiKey);
    } else if (payload?.preserveKey) {
      nextKey = curKey;
    }
    const out = {
      ...cur,
      baseUrl:
        typeof payload?.baseUrl === "string" && payload.baseUrl.trim()
          ? payload.baseUrl.trim().replace(/\/$/, "")
          : cur.baseUrl || DEFAULT_IMAGE_BASE,
      genModel:
        typeof payload?.genModel === "string" && payload.genModel.trim()
          ? payload.genModel.trim()
          : cur.genModel || DEFAULT_IMAGE_GEN_MODEL,
      visionModel:
        typeof payload?.visionModel === "string" && payload.visionModel.trim()
          ? payload.visionModel.trim()
          : cur.visionModel || DEFAULT_IMAGE_VISION_MODEL,
      size:
        typeof payload?.size === "string" && payload.size.trim()
          ? payload.size.trim()
          : cur.size || DEFAULT_IMAGE_SIZE,
      genStyle:
        typeof payload?.genStyle === "string" && payload.genStyle.trim()
          ? payload.genStyle.trim()
          : cur.genStyle || "realistic",
      genResolution:
        typeof payload?.genResolution === "string" && payload.genResolution.trim()
          ? payload.genResolution.trim()
          : cur.genResolution || "hd",
      visionImageLimit:
        payload?.visionImageLimit != null && Number(payload.visionImageLimit) > 0
          ? Math.min(20, Math.floor(Number(payload.visionImageLimit)))
          : cur.visionImageLimit || 9,
      visionOutputFormat:
        typeof payload?.visionOutputFormat === "string" && payload.visionOutputFormat.trim()
          ? payload.visionOutputFormat.trim()
          : cur.visionOutputFormat || "json",
      visionTags:
        typeof payload?.visionTags === "string"
          ? payload.visionTags.trim()
          : cur.visionTags || "object,scene,ocr,person",
      visionPrompt: typeof payload?.visionPrompt === "string" ? payload.visionPrompt : cur.visionPrompt || "",
      encryptedKeyB64: "",
    };
    if (nextKey && safeStorage.isEncryptionAvailable()) {
      const enc = encryptKeyToB64(nextKey);
      if (!enc) {
        throw new Error("无法加密保存图像 API Key（加密失败）。请重启应用后重试。");
      }
      out.encryptedKeyB64 = enc;
    } else if (nextKey) {
      throw new Error("无法加密保存图像 API Key（本机安全存储不可用）。");
    }
    writeImageSettings(out);
    return { ok: true };
  });
}

module.exports = {
  readASRSettings,
  writeASRSettings,
  readTTSSettings,
  writeTTSSettings,
  readImageSettings,
  writeImageSettings,
  readCapabilitySettings,
  writeCapabilitySettings,
  registerModularSettingsHandlers,
};
