const crypto = require("crypto");
const { safeStorage } = require("electron");
const { assertSafeId } = require("../../utils/ipcValidate.js");
const {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  decryptKeyB64,
  encryptKeyToB64,
} = require("../aiSessionStore.js");
const {
  normalizeApiKey,
  normalizeOpenAiChatBaseUrl,
  normalizeModelNameForMiniMax,
  allowsChatWithoutApiKey,
  assertNotMiniMaxLoginJwtAsApiKey,
  isLocalChatInferenceBaseUrl,
} = require("../apiNormalize.js");
const store = require("../aiSessionStore.js");

function registerAiSessionHandlers(ipcMain) {
  ipcMain.handle("ai-settings-get", () => {
    const sess = store.readAISession();
    const p = store.getActiveProfile(sess);
    const c = store.getActiveProfileCredentials();
    const purpose = typeof p.purpose === "string" ? p.purpose : "";
    const label = (p.label && String(p.label).trim()) || p.model || "";
    return {
      baseUrl: c.baseUrl,
      model: c.model,
      hasKey: Boolean(c.apiKey) || allowsChatWithoutApiKey(c.baseUrl),
      label,
      purpose,
    };
  });

  ipcMain.handle("ai-settings-set", (_event, settings) => {
    const sess = store.readAISession();
    const p = store.getActiveProfile(sess);
    const curKey = normalizeApiKey(decryptKeyB64(p.encryptedKeyB64));
    let nextKey = curKey;
    if (settings.clearKey) {
      nextKey = "";
    } else if (typeof settings.apiKey === "string" && settings.apiKey.trim() !== "") {
      nextKey = normalizeApiKey(settings.apiKey);
    } else if (settings.preserveKey) {
      nextKey = curKey;
    } else {
      nextKey = curKey;
    }
    p.baseUrl =
      typeof settings.baseUrl === "string" && settings.baseUrl.trim() !== ""
        ? normalizeOpenAiChatBaseUrl(settings.baseUrl.trim())
        : normalizeOpenAiChatBaseUrl(p.baseUrl || DEFAULT_AI_BASE);
    const baseForNorm = p.baseUrl || DEFAULT_AI_BASE;
    p.model =
      typeof settings.model === "string" && settings.model.trim() !== ""
        ? normalizeModelNameForMiniMax(settings.model.trim(), baseForNorm)
        : normalizeModelNameForMiniMax(p.model || DEFAULT_AI_MODEL, baseForNorm);
    if (typeof settings.label === "string") {
      const lb = settings.label.trim();
      p.label = lb || p.model || "未命名";
    }
    if (typeof settings.purpose === "string") {
      p.purpose = settings.purpose.trim().slice(0, 2000);
    }
    if (nextKey === "") {
      p.encryptedKeyB64 = "";
    } else if (nextKey) {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("无法加密保存 API Key（本机安全存储不可用）。");
      }
      const enc = encryptKeyToB64(nextKey);
      if (!enc) {
        throw new Error("无法加密保存 API Key（加密失败）。请重启应用后重试。");
      }
      p.encryptedKeyB64 = enc;
    }
    store.writeAISession(sess);
    return { ok: true };
  });

  ipcMain.handle("ai-state-get", () => {
    const sess = store.readAISession();
    return {
      activeId: sess.activeProfileId,
      webSearch: sess.webSearch === true,
      profiles: sess.profiles.map((pr) => {
        const bu = normalizeOpenAiChatBaseUrl(pr.baseUrl || DEFAULT_AI_BASE);
        const localInference = isLocalChatInferenceBaseUrl(bu);
        return {
          id: pr.id,
          label: (pr.label && String(pr.label).trim()) || pr.model || "未命名",
          purpose: typeof pr.purpose === "string" ? pr.purpose : "",
          baseUrl: bu,
          model: normalizeModelNameForMiniMax(pr.model || DEFAULT_AI_MODEL, pr.baseUrl || DEFAULT_AI_BASE),
          localInference,
          hasKey:
            Boolean(normalizeApiKey(decryptKeyB64(pr.encryptedKeyB64))) || allowsChatWithoutApiKey(bu),
        };
      }),
    };
  });

  ipcMain.handle("ai-profile-set-active", (_event, { id }) => {
    const sess = store.readAISession();
    const safeId = assertSafeId(id, "配置 id");
    if (!sess.profiles.some((p) => p.id === safeId)) {
      throw new Error("模型配置不存在");
    }
    sess.activeProfileId = safeId;
    store.writeAISession(sess);
    return { ok: true };
  });

  ipcMain.handle("ai-profile-save", (_event, payload) => {
    const sess = store.readAISession();
    let p;
    if (payload?.id) {
      const safeId = assertSafeId(payload.id, "配置 id");
      p = sess.profiles.find((x) => x.id === safeId);
    }
    if (!p) {
      p = {
        id: crypto.randomUUID(),
        label: "",
        purpose: "",
        baseUrl: DEFAULT_AI_BASE,
        model: DEFAULT_AI_MODEL,
        encryptedKeyB64: "",
      };
      sess.profiles.push(p);
      sess.activeProfileId = p.id;
    }
    if (typeof payload?.purpose === "string") {
      p.purpose = payload.purpose.trim().slice(0, 2000);
    }
    if (typeof payload?.baseUrl === "string" && payload.baseUrl.trim()) {
      p.baseUrl = normalizeOpenAiChatBaseUrl(payload.baseUrl.trim());
    }
    if (typeof payload?.model === "string" && payload.model.trim()) {
      p.model = normalizeModelNameForMiniMax(payload.model.trim(), p.baseUrl || DEFAULT_AI_BASE);
    }
    if (typeof payload?.label === "string") {
      const t = payload.label.trim();
      p.label = t || p.model || "未命名";
    }
    if (!p.label) {
      p.label = p.model || "新模型";
    }
    if (payload?.clearKey) {
      p.encryptedKeyB64 = "";
    } else if (typeof payload?.apiKey === "string" && payload.apiKey.trim()) {
      assertNotMiniMaxLoginJwtAsApiKey(p.baseUrl || DEFAULT_AI_BASE, payload.apiKey);
      const normalizedKey = normalizeApiKey(payload.apiKey);
      const enc = encryptKeyToB64(normalizedKey);
      if (!enc) {
        throw new Error(
          "无法加密保存 API Key（本机安全存储不可用或加密失败）。云端接口需要可保存的密钥；请重启应用、检查操作系统账户与磁盘权限，或仅在「本地模型」场景使用 Ollama（如 http://127.0.0.1:11434/v1，可不填 Key）。切勿在保存失败误以为密钥已生效。"
        );
      }
      p.encryptedKeyB64 = enc;
    }
    store.writeAISession(sess);
    return { ok: true, id: p.id };
  });

  ipcMain.handle("ai-profile-delete", (_event, { id }) => {
    const sess = store.readAISession();
    const safeId = assertSafeId(id, "配置 id");
    if (sess.profiles.length <= 1) {
      throw new Error("至少保留一个模型配置");
    }
    const idx = sess.profiles.findIndex((p) => p.id === safeId);
    if (idx === -1) {
      throw new Error("配置不存在");
    }
    sess.profiles.splice(idx, 1);
    if (sess.activeProfileId === safeId) {
      sess.activeProfileId = sess.profiles[0].id;
    }
    store.writeAISession(sess);
    return { ok: true };
  });

  ipcMain.handle("ai-web-search-set", (_event, { enabled }) => {
    const sess = store.readAISession();
    sess.webSearch = Boolean(enabled);
    store.writeAISession(sess);
    return { ok: true };
  });
}

module.exports = { registerAiSessionHandlers };
