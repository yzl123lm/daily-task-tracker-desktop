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

function modelNameMatches(installedName, requestedName) {
  const inst = String(installedName || "").trim().toLowerCase();
  const req = String(requestedName || "").trim().toLowerCase();
  if (!inst || !req) {
    return false;
  }
  if (inst === req || inst.startsWith(`${req}:`) || req.startsWith(`${inst}:`)) {
    return true;
  }
  return normalizeModelTag(inst) === normalizeModelTag(req);
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
  const want = String(modelName || "").trim();
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  return list.some((m) => {
    const name = String(m?.name || m?.model || "").trim();
    return modelNameMatches(name, want);
  });
}

function findInstalledEmbedModel(tagsData) {
  if (modelInstalled(tagsData, REQUIRED_EMBED_MODEL)) {
    return REQUIRED_EMBED_MODEL;
  }
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  for (const m of list) {
    const name = String(m?.name || m?.model || "").trim();
    if (isEmbedModelName(name)) {
      return name;
    }
  }
  return "";
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
  normalizeModelTag,
  modelNameMatches,
  isEmbedModelName,
  isChatModelName,
  isRerankModelName,
  modelInstalled,
  findInstalledEmbedModel,
  findInstalledChatModel,
  findInstalledRerankModel,
};
