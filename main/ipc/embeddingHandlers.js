const {
  readOllamaSettings,
  normalizeOllamaHost,
  stripOpenAiV1BaseSuffix,
  isLikelyOllamaOpenAiBase,
  buildOllamaEmbedOptions,
  buildOllamaEmbedPayload,
} = require("../ollamaRuntime.js");
const { getActiveProfileCredentials } = require("../aiSessionStore.js");
const { isLocalChatInferenceBaseUrl } = require("../apiNormalize.js");
const { appendMiniMaxErrorHints } = require("../miniMaxHints.js");

const DEFAULT_EMBEDDING_MODEL_BGE_M3 = "BAAI/bge-m3";

function registerEmbeddingHandlers(ipcMain) {
  ipcMain.handle("embedding-openai", async (_event, payload) => {
    const { texts: rawTexts, text: singleText, model: modelArg } = payload || {};
    const parts = [];
    if (Array.isArray(rawTexts)) {
      rawTexts.forEach((x) => {
        const s = String(x ?? "").trim();
        if (s) {
          parts.push(s);
        }
      });
    }
    const one = typeof singleText === "string" ? singleText.trim() : "";
    if (one) {
      parts.push(one);
    }
    if (parts.length === 0) {
      throw new Error("缺少待嵌入文本：请传 texts 数组或 text 字符串");
    }
    const model = String(modelArg || DEFAULT_EMBEDDING_MODEL_BGE_M3).trim();
    const cred = getActiveProfileCredentials();
    const base = cred.baseUrl.replace(/\/$/, "");
    const apiKey = cred.apiKey;
    const localInference = isLocalChatInferenceBaseUrl(cred.baseUrl);
    if (!apiKey && !localInference) {
      throw new Error(
        "当前为云端/API 地址但未读取到 API Key，无法调用嵌入接口。请在「管理对话模型配置」中保存密钥，或改用本机 Ollama 等可免 Key 的地址。"
      );
    }

    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    function buildEmbeddingSummary(data, modelUsed) {
      const rows = Array.isArray(data?.data) ? data.data : [];
      const usage = data?.usage != null ? data.usage : null;
      const summaries = rows.map((row, i) => {
        const emb = row?.embedding;
        const dim = Array.isArray(emb) ? emb.length : 0;
        const head = Array.isArray(emb) ? emb.slice(0, 8) : [];
        return { index: row?.index != null ? row.index : i, dimensions: dim, head };
      });
      const dimsFirst = summaries[0]?.dimensions ?? 0;
      return {
        ok: true,
        model: data?.model || modelUsed,
        count: summaries.length,
        dimensions: dimsFirst,
        usage,
        vectors: summaries,
        note: "为节省对话 token，每条仅返回向量前 8 个分量；完整向量请在业务侧落库或导出使用。",
      };
    }

    const useOllamaNative = localInference && isLikelyOllamaOpenAiBase(cred.baseUrl);
    let ollamaApiRoot = "";
    if (useOllamaNative) {
      ollamaApiRoot = stripOpenAiV1BaseSuffix(cred.baseUrl);
      if (!ollamaApiRoot || !/^https?:\/\//i.test(ollamaApiRoot)) {
        ollamaApiRoot = normalizeOllamaHost(readOllamaSettings().host);
      }
    }

    if (useOllamaNative) {
      const root = String(ollamaApiRoot || "").replace(/\/$/, "");
      const url = `${root}/api/embeddings`;
      const merged = [];
      for (let i = 0; i < parts.length; i += 1) {
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(buildOllamaEmbedPayload(model, parts[i], readOllamaSettings())),
        });
        const text = await res.text();
        let data = null;
        try {
          data = JSON.parse(text);
        } catch {
          data = null;
        }
        if (!res.ok) {
          const errMsg =
            (data && (data.error || data.message)) || text || `Ollama 嵌入请求失败 HTTP ${res.status}`;
          throw new Error(String(errMsg));
        }
        const emb = data?.embedding;
        if (!Array.isArray(emb)) {
          throw new Error("Ollama 返回中缺少 embedding 数组");
        }
        merged.push({ index: i, embedding: emb });
      }
      return buildEmbeddingSummary({ data: merged, model }, model);
    }

    const url = `${base}/embeddings`;
    const input = parts.length === 1 ? parts[0] : parts;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ model, input }),
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || text || `HTTP ${res.status}`;
      throw new Error(appendMiniMaxErrorHints(String(msg)));
    }
    if (!data || !Array.isArray(data.data) || data.data.length === 0) {
      throw new Error("嵌入接口返回格式异常：缺少 data[].embedding");
    }
    return buildEmbeddingSummary(data, model);
  });
}

module.exports = { registerEmbeddingHandlers };
