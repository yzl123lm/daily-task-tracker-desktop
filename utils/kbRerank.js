const path = require("path");
const { fetchOllamaEmbedJson, readOllamaSettings } = require("../main/ollamaRuntime.js");

const DEFAULT_RERANK_MODEL = "bge-reranker-v2-m3";
const DEFAULT_OLLAMA_RERANK_MODEL = "dengcao/bge-reranker-v2-m3";
const ONNX_MODEL_ID = "onnx-community/bge-reranker-v2-m3-ONNX";
const ONNX_DTYPE = "q8";
const OLLAMA_API_RERANK_TIMEOUT_MS = 30000;

function ollamaEmbedRerankTimeoutMs(docCount) {
  return Math.min(120000, 15000 + Math.max(1, Number(docCount) || 1) * 900);
}

function isOllamaModelMissingError(message) {
  return /not found|does not exist|unknown model|model .* not found|404/i.test(String(message || ""));
}

let ollamaRerankFastSkip = false;

let onnxLoadPromise = null;
let onnxTokenizer = null;
let onnxModel = null;

function sigmoid(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) {
    return 0;
  }
  if (n >= 0) {
    const z = Math.exp(-n);
    return 1 / (1 + z);
  }
  const z = Math.exp(n);
  return z / (1 + z);
}

function normalizeOllamaHost(host) {
  const base = String(host || readOllamaSettings().host || "http://127.0.0.1:11434").trim();
  return base.replace(/\/+$/, "");
}

function truncatePassage(text, maxLen = 1800) {
  const t = String(text || "").trim();
  if (t.length <= maxLen) {
    return t;
  }
  return t.slice(0, maxLen);
}

function formatBgeRerankPair(query, passage) {
  return `${String(query || "").trim()}\n${truncatePassage(passage)}`;
}

async function tryOllamaNativeRerank(host, model, query, documents, topN) {
  const base = normalizeOllamaHost(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_API_RERANK_TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/api/rerank`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: String(model || DEFAULT_OLLAMA_RERANK_MODEL).trim(),
        query: String(query || "").trim(),
        documents: documents.map((d) => truncatePassage(d)),
        top_n: Math.max(1, Number(topN) || documents.length),
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || text || `HTTP ${res.status}`);
    }
    const rows = Array.isArray(data?.results)
      ? data.results
      : Array.isArray(data?.data)
        ? data.data
        : [];
    if (!rows.length) {
      throw new Error("Ollama rerank 返回空结果");
    }
    const scores = new Array(documents.length).fill(0);
    rows.forEach((row) => {
      const idx = Number(row.index);
      if (!Number.isInteger(idx) || idx < 0 || idx >= scores.length) {
        return;
      }
      const raw = Number(row.relevance_score ?? row.score ?? 0);
      scores[idx] = raw > 1 ? sigmoid(raw) : Math.max(0, Math.min(1, raw));
    });
    return { scores, provider: "ollama-api" };
  } finally {
    clearTimeout(timer);
  }
}

async function tryOllamaEmbedPairScores(host, model, query, documents) {
  const base = normalizeOllamaHost(host);
  const modelName = String(model || DEFAULT_OLLAMA_RERANK_MODEL).trim();
  const pairs = documents.map((doc) => formatBgeRerankPair(query, doc));
  const data = await fetchOllamaEmbedJson(
    `${base}/api/embed`,
    {
      model: modelName,
      input: pairs,
      keep_alive: "10m",
    },
    ollamaEmbedRerankTimeoutMs(documents.length)
  );
  const embeddings = Array.isArray(data?.embeddings) ? data.embeddings : [];
  if (!embeddings.length) {
    throw new Error("Ollama 重排 embed 返回为空");
  }
  const scores = embeddings.map((emb) => {
    if (!Array.isArray(emb) || !emb.length) {
      return 0;
    }
    if (emb.length === 1) {
      return sigmoid(emb[0]);
    }
    return sigmoid(emb[0]);
  });
  return { scores, provider: "ollama-embed" };
}

function getTransformersCacheDir(userDataPath) {
  return path.join(String(userDataPath || ""), "transformers-cache");
}

function applyTransformersEnv(cacheDir) {
  const { env } = require("@huggingface/transformers");
  env.cacheDir = cacheDir;
  env.allowLocalModels = false;
  env.useBrowserCache = false;
  const endpoint = String(
    process.env.HF_ENDPOINT || process.env.HUGGINGFACE_HUB_BASE_URL || "https://hf-mirror.com"
  )
    .trim()
    .replace(/\/+$/, "");
  env.remoteHost = `${endpoint}/`;
}

async function loadOnnxReranker(userDataPath) {
  if (onnxTokenizer && onnxModel) {
    return { tokenizer: onnxTokenizer, model: onnxModel };
  }
  if (!onnxLoadPromise) {
    onnxLoadPromise = (async () => {
      const { AutoTokenizer, AutoModelForSequenceClassification } = require("@huggingface/transformers");
      const cacheDir = getTransformersCacheDir(userDataPath);
      applyTransformersEnv(cacheDir);
      const tokenizer = await AutoTokenizer.from_pretrained(ONNX_MODEL_ID);
      const model = await AutoModelForSequenceClassification.from_pretrained(ONNX_MODEL_ID, {
        dtype: ONNX_DTYPE,
      });
      onnxTokenizer = tokenizer;
      onnxModel = model;
      return { tokenizer, model };
    })().catch((err) => {
      onnxLoadPromise = null;
      throw err;
    });
  }
  return onnxLoadPromise;
}

async function rerankViaOnnx(userDataPath, query, documents, options = {}) {
  const { tokenizer, model } = await loadOnnxReranker(userDataPath);
  const batchSize = Math.max(1, Math.min(16, Number(options.batchSize) || 8));
  const scores = new Array(documents.length).fill(0);
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize).map((d) => truncatePassage(d));
    const inputs = tokenizer(
      batch.map(() => String(query || "").trim()),
      { text_pair: batch, padding: true, truncation: true, max_length: 512 }
    );
    const { logits } = await model(inputs);
    const data = logits?.data || logits;
    for (let j = 0; j < batch.length; j += 1) {
      const logit = Number(data[j]);
      scores[i + j] = sigmoid(logit);
    }
  }
  return { scores, provider: "onnx" };
}

/**
 * @param {object} opts
 * @param {string} opts.host
 * @param {string} [opts.model]
 * @param {'auto'|'ollama'|'onnx'} [opts.provider]
 * @param {string} opts.query
 * @param {string[]} opts.documents
 * @param {string} [opts.userDataPath]
 * @param {number} [opts.topN]
 */
async function rerankDocuments(opts) {
  const query = String(opts?.query || "").trim();
  const documents = (opts?.documents || []).map((d) => truncatePassage(d)).filter(Boolean);
  if (!query || !documents.length) {
    return { scores: [], provider: "none", skipped: true, reason: "empty query or documents" };
  }
  const provider = String(opts?.provider || "auto").toLowerCase();
  const model = String(opts?.model || DEFAULT_RERANK_MODEL).trim() || DEFAULT_RERANK_MODEL;
  const ollamaModel = model.includes("/") ? model : DEFAULT_OLLAMA_RERANK_MODEL;
  const host = opts?.host;
  const topN = Math.max(1, Number(opts?.topN) || documents.length);
  const errors = [];

  const tryOllama = (provider === "auto" || provider === "ollama") && !ollamaRerankFastSkip;
  const tryOnnx = provider === "auto" || provider === "onnx";

  if (tryOllama) {
    try {
      return await tryOllamaNativeRerank(host, ollamaModel, query, documents, topN);
    } catch (err) {
      errors.push(`ollama-api: ${err.message || String(err)}`);
    }
    try {
      return await tryOllamaEmbedPairScores(host, ollamaModel, query, documents);
    } catch (err) {
      errors.push(`ollama-embed: ${err.message || String(err)}`);
      if (provider === "auto" && isOllamaModelMissingError(err?.message || err)) {
        ollamaRerankFastSkip = true;
      }
    }
  }

  if (tryOnnx) {
    try {
      return await rerankViaOnnx(opts?.userDataPath, query, documents, opts);
    } catch (err) {
      errors.push(`onnx: ${err.message || String(err)}`);
    }
  }

  const err = new Error(
    `重排模型不可用。请执行 ollama pull ${DEFAULT_OLLAMA_RERANK_MODEL}，或等待首次检索自动下载 ONNX 版 bge-reranker-v2-m3。\n${errors.join("\n")}`
  );
  err.details = errors;
  throw err;
}

/**
 * 对检索命中做 cross-encoder 重排并融合原 RRF/混合分。
 * @param {object[]} hits
 * @param {string} query
 * @param {object} settings
 * @param {object} runtime
 */
async function rerankSearchHits(hits, query, settings, runtime = {}) {
  const list = Array.isArray(hits) ? hits : [];
  if (!list.length || settings?.rerankEnabled === false) {
    return { hits: list, rerankMs: 0, rerankProvider: "disabled", rerankSkipped: true };
  }
  const topN = Math.max(
    1,
    Math.min(list.length, Number(settings?.rerankTopN ?? 30) || 30)
  );
  const weight = Math.max(0.1, Math.min(0.95, Number(settings?.rerankWeight ?? 0.75) || 0.75));
  const candidates = list.slice(0, topN);
  const documents = candidates.map((h) => String(h.text || "").trim()).filter(Boolean);
  if (!documents.length) {
    return { hits: list, rerankMs: 0, rerankProvider: "none", rerankSkipped: true };
  }

  const t0 = Date.now();
  const result = await rerankDocuments({
    host: runtime.host,
    model: String(settings?.rerankModel || DEFAULT_RERANK_MODEL).trim(),
    provider: String(settings?.rerankProvider || "auto").toLowerCase(),
    query,
    documents,
    userDataPath: runtime.userDataPath,
    topN: documents.length,
  });
  const rerankMs = Date.now() - t0;
  const scores = Array.isArray(result.scores) ? result.scores : [];

  const rerankedHead = candidates.map((hit, index) => {
    const rerankScore = Number(scores[index] ?? 0);
    const baseScore = Number(hit.finalScore ?? hit.score ?? 0);
    const combined = weight * rerankScore + (1 - weight) * baseScore;
    return {
      ...hit,
      rerankScore,
      preRerankScore: baseScore,
      score: combined,
      finalScore: combined,
    };
  });
  rerankedHead.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const tail = list.slice(topN);
  return {
    hits: [...rerankedHead, ...tail],
    rerankMs,
    rerankProvider: result.provider || "unknown",
    rerankModel: settings?.rerankModel || DEFAULT_RERANK_MODEL,
    rerankTopN: topN,
    rerankWeight: weight,
    rerankSkipped: false,
  };
}

function resetOnnxRerankerCache() {
  onnxLoadPromise = null;
  onnxTokenizer = null;
  onnxModel = null;
}

function resetOllamaRerankFastSkip() {
  ollamaRerankFastSkip = false;
}

module.exports = {
  DEFAULT_RERANK_MODEL,
  DEFAULT_OLLAMA_RERANK_MODEL,
  ONNX_MODEL_ID,
  rerankDocuments,
  rerankSearchHits,
  resetOnnxRerankerCache,
  resetOllamaRerankFastSkip,
  sigmoid,
};
