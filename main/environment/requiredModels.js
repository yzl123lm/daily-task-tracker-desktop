const REQUIRED_EMBED_MODEL = "bge-m3";
const DEFAULT_RERANK_MODEL = "bge-reranker-v2-m3";
const OLLAMA_RERANK_MODEL = "dengcao/bge-reranker-v2-m3";

/** 非 embed / rerank 的 Ollama 模型名前缀或关键词，用于判断是否有 chat 模型 */
const CHAT_MODEL_HINTS = [
  "llama",
  "qwen",
  "mistral",
  "phi",
  "gemma",
  "deepseek",
  "mixtral",
  "command",
  "smollm",
  "orca",
  "tinyllama",
  "codestral",
];

function normalizeModelTag(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
}

function isEmbedModelName(name) {
  const n = normalizeModelTag(name);
  return n === "bge-m3" || n.includes("embed") || n.includes("nomic-embed");
}

function isRerankModelName(name) {
  const n = normalizeModelTag(name);
  return n.includes("rerank") || n.includes("bge-reranker");
}

function isChatModelName(name) {
  const n = normalizeModelTag(name);
  if (!n || isEmbedModelName(n) || isRerankModelName(n)) {
    return false;
  }
  return CHAT_MODEL_HINTS.some((hint) => n.startsWith(hint) || n.includes(hint));
}

function modelInstalled(tagsData, modelName) {
  const want = String(modelName || "").trim().toLowerCase();
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  return list.some((m) => {
    const name = String(m?.name || m?.model || "").trim().toLowerCase();
    return name === want || name.startsWith(`${want}:`);
  });
}

function findInstalledChatModel(tagsData) {
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  for (const m of list) {
    const name = String(m?.name || m?.model || "").trim();
    if (isChatModelName(name)) {
      return name;
    }
  }
  return "";
}

function findInstalledRerankModel(tagsData) {
  if (modelInstalled(tagsData, OLLAMA_RERANK_MODEL)) {
    return OLLAMA_RERANK_MODEL;
  }
  if (modelInstalled(tagsData, DEFAULT_RERANK_MODEL)) {
    return DEFAULT_RERANK_MODEL;
  }
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  for (const m of list) {
    const name = String(m?.name || m?.model || "").trim();
    if (isRerankModelName(name)) {
      return name;
    }
  }
  return "";
}

module.exports = {
  REQUIRED_EMBED_MODEL,
  DEFAULT_RERANK_MODEL,
  OLLAMA_RERANK_MODEL,
  isEmbedModelName,
  isChatModelName,
  isRerankModelName,
  modelInstalled,
  findInstalledChatModel,
  findInstalledRerankModel,
};
