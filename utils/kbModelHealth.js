const os = require("os");
const {
  ollamaModelNameMatches,
  buildOllamaEmbedErrorCtx,
  formatOllamaEmbedError,
} = require("./ollamaEmbedError.js");
const {
  readOllamaSettings,
  fetchOllamaEmbedJson,
  buildOllamaEmbedPayload,
} = require("../main/ollamaRuntime.js");
const { rerankDocuments, DEFAULT_OLLAMA_RERANK_MODEL } = require("./kbRerank.js");

const HEALTH_CHECK_TOTAL_MS = 15000;
const OLLAMA_VERSION_TIMEOUT_MS = 2000;
const OLLAMA_TAGS_TIMEOUT_MS = 3000;
const EMBED_TEST_TIMEOUT_MS = 8000;
const RERANK_TEST_TIMEOUT_MS = 10000;
const EMBED_TEST_TEXT = "知识库模型健康检测测试文本";

function normalizeOllamaHost(raw) {
  const base = String(raw || readOllamaSettings().host || "http://127.0.0.1:11434").trim();
  return base.replace(/\/+$/, "");
}

function isValidOllamaBaseUrl(host) {
  try {
    const u = new URL(normalizeOllamaHost(host));
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

async function fetchOllamaTimed(host, pathname, timeoutMs, { method = "GET", body } = {}) {
  const base = normalizeOllamaHost(host);
  if (!isValidOllamaBaseUrl(base)) {
    return {
      ok: false,
      status: "config_error",
      latencyMs: 0,
      error: "Ollama 地址配置异常，请使用 http:// 或 https:// 开头的有效 URL",
      data: null,
    };
  }
  const url = `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(300, Number(timeoutMs) || 3000));
  const t0 = Date.now();
  try {
    const opts = {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
    };
    if (body !== undefined) {
      opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { _raw: text.slice(0, 400) };
      }
    }
    const latencyMs = Date.now() - t0;
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
      return {
        ok: false,
        status: "invalid_response",
        latencyMs,
        error: String(msg).slice(0, 500),
        data,
      };
    }
    return { ok: true, status: "ok", latencyMs, error: null, data };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = String(err?.message || err || "");
    const aborted = err?.name === "AbortError" || /aborted|timeout/i.test(msg);
    const notRunning = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(msg);
    let status = "not_running";
    if (aborted) {
      status = "timeout";
    } else if (!notRunning && msg) {
      status = "invalid_response";
    }
    return {
      ok: false,
      status,
      latencyMs,
      error: aborted ? `请求超时（>${timeoutMs}ms）` : msg || "无法连接 Ollama",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

function redactSensitiveText(text) {
  let out = String(text || "");
  const home = os.homedir();
  if (home) {
    const escaped = home.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "gi"), "~");
  }
  out = out.replace(/C:\\Users\\[^\\]+/gi, "C:\\Users\\<user>");
  out = out.replace(/Users\\[^\\]+/gi, "Users\\<user>");
  return out;
}

function buildSuggestion(level, title, actionText, command) {
  return {
    level,
    title,
    actionText: actionText || "",
    command: command || "",
  };
}

async function checkOllamaService(host) {
  const baseUrl = normalizeOllamaHost(host);
  if (!isValidOllamaBaseUrl(baseUrl)) {
    return {
      status: "error",
      baseUrl,
      version: "",
      modelCount: 0,
      models: [],
      latencyMs: null,
      versionLatencyMs: null,
      tagsLatencyMs: null,
      error: "Ollama 地址配置异常",
      suggestions: [
        buildSuggestion("error", "Ollama 地址无效", "请检查服务地址格式", ""),
      ],
    };
  }

  const verOut = await fetchOllamaTimed(baseUrl, "/api/version", OLLAMA_VERSION_TIMEOUT_MS);
  if (!verOut.ok) {
    const errMsg =
      verOut.status === "timeout"
        ? "Ollama 响应超时，请确认服务已启动"
        : verOut.status === "config_error"
          ? verOut.error
          : "Ollama 未运行或无法连接";
    return {
      status: "error",
      baseUrl,
      version: "",
      modelCount: 0,
      models: [],
      latencyMs: verOut.latencyMs,
      versionLatencyMs: verOut.latencyMs,
      tagsLatencyMs: null,
      error: errMsg,
      detail: verOut.error,
      suggestions: [
        buildSuggestion(
          "error",
          errMsg,
          "请先启动 Ollama，或检查服务地址",
          ""
        ),
      ],
    };
  }

  const tagsOut = await fetchOllamaTimed(baseUrl, "/api/tags", OLLAMA_TAGS_TIMEOUT_MS);
  const models = Array.isArray(tagsOut.data?.models)
    ? tagsOut.data.models.map((m) => ({
        name: String(m?.name || m?.model || ""),
        size: m?.size != null ? Number(m.size) : 0,
        modified_at: String(m?.modified_at || ""),
      }))
    : [];

  if (!tagsOut.ok) {
    return {
      status: "warning",
      baseUrl,
      version: String(verOut.data?.version || ""),
      modelCount: 0,
      models: [],
      latencyMs: (verOut.latencyMs || 0) + (tagsOut.latencyMs || 0),
      versionLatencyMs: verOut.latencyMs,
      tagsLatencyMs: tagsOut.latencyMs,
      error: tagsOut.error || "模型列表读取失败",
      suggestions: [
        buildSuggestion("warning", "无法读取本地模型列表", "请检查 Ollama 权限或服务状态", ""),
      ],
    };
  }

  const totalLatency = (verOut.latencyMs || 0) + (tagsOut.latencyMs || 0);
  const slow = totalLatency > 800;
  return {
    status: slow ? "warning" : "ok",
    baseUrl,
    version: String(verOut.data?.version || ""),
    modelCount: models.length,
    models,
    latencyMs: totalLatency,
    versionLatencyMs: verOut.latencyMs,
    tagsLatencyMs: tagsOut.latencyMs,
    error: slow ? "服务响应较慢，可能影响入库和检索速度" : null,
    suggestions: slow
      ? [buildSuggestion("warning", "Ollama 响应较慢", "可检查本机负载或模型是否占用过多资源", "")]
      : [],
  };
}

async function checkEmbeddingModel(host, embedModel, ollamaModels, ollamaSettings) {
  const model = String(embedModel || "bge-m3").trim() || "bge-m3";
  const inferSettings =
    ollamaSettings && typeof ollamaSettings === "object"
      ? ollamaSettings
      : { host: normalizeOllamaHost(host), inferenceDevice: "gpu", numThread: null };
  const exists = (ollamaModels || []).some((row) =>
    ollamaModelNameMatches(row.name, model)
  );
  const base = {
    status: "checking",
    model,
    exists,
    embedTestPassed: false,
    dimension: null,
    latencyMs: null,
    error: null,
    suggestions: [],
    customModelNote: model.toLowerCase() !== "bge-m3" ? `当前使用自定义嵌入模型：${model}` : "",
  };

  if (!exists) {
    return {
      ...base,
      status: "error",
      error: `未检测到嵌入模型「${model}」`,
      suggestions: [
        buildSuggestion(
          "error",
          `未检测到 ${model}`,
          "请安装嵌入模型",
          `ollama pull ${model}`
        ),
      ],
    };
  }

  const t0 = Date.now();
  try {
    const payload = buildOllamaEmbedPayload(model, EMBED_TEST_TEXT, inferSettings);
    const data = await fetchOllamaEmbedJson(
      `${normalizeOllamaHost(host)}/api/embed`,
      payload,
      EMBED_TEST_TIMEOUT_MS
    );
    const embeddings = Array.isArray(data?.embeddings)
      ? data.embeddings
      : data?.embedding
        ? [data.embedding]
        : [];
    const vec = embeddings[0];
    const dimension = Array.isArray(vec) ? vec.length : 0;
    const latencyMs = Date.now() - t0;
    if (!dimension) {
      return {
        ...base,
        status: "error",
        embedTestPassed: false,
        latencyMs,
        error: "嵌入测试返回空向量",
        suggestions: [
          buildSuggestion(
            "error",
            "嵌入模型调用失败",
            "可能是模型损坏或服务异常，请重启 Ollama 后重试",
            `ollama pull ${model}`
          ),
        ],
      };
    }
    const expectedBge = model.toLowerCase().includes("bge-m3");
    const dimWarning = expectedBge && dimension !== 1024;
    return {
      ...base,
      status: dimWarning ? "warning" : "ok",
      embedTestPassed: true,
      dimension,
      latencyMs,
      error: dimWarning ? `bge-m3 预期 1024 维，实测 ${dimension} 维` : null,
      suggestions: dimWarning
        ? [
            buildSuggestion(
              "warning",
              "向量维度与 bge-m3 预期不一致",
              "请确认模型 tag 是否正确",
              `ollama pull ${model}`
            ),
          ]
        : [],
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const ctx = buildOllamaEmbedErrorCtx(model);
    const friendly = formatOllamaEmbedError(err?.message || String(err), ctx);
    return {
      ...base,
      status: "error",
      embedTestPassed: false,
      latencyMs,
      error: friendly.split("\n")[0] || "嵌入测试失败",
      detail: friendly,
      suggestions: [
        buildSuggestion(
          "error",
          "嵌入模型调用失败",
          "请确认 Ollama 正常运行并已安装模型",
          `ollama pull ${model}`
        ),
      ],
    };
  }
}

async function checkRerankerModel(host, settings, userDataPath) {
  const enabled = settings?.rerankEnabled !== false;
  const provider = String(settings?.rerankProvider || "auto").toLowerCase();
  const model = String(settings?.rerankModel || "bge-reranker-v2-m3").trim();

  if (!enabled) {
    return {
      status: "skipped",
      enabled: false,
      provider,
      activeProvider: null,
      model,
      testPassed: false,
      score: null,
      latencyMs: 0,
      fallbackAvailable: false,
      error: null,
      suggestions: [],
    };
  }

  const query = "模型健康检测";
  const passages = [
    "模型健康检测用于判断 Ollama、嵌入模型和重排序模型是否可用。",
    "这是一个无关文本。",
  ];
  const t0 = Date.now();
  try {
    const result = await Promise.race([
      rerankDocuments({
        host,
        model,
        provider,
        query,
        documents: passages,
        userDataPath,
        topN: 2,
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`重排序检测超时（>${RERANK_TEST_TIMEOUT_MS}ms）`)), RERANK_TEST_TIMEOUT_MS);
      }),
    ]);
    const scores = Array.isArray(result?.scores) ? result.scores : [];
    const score = scores.length ? Number(scores[0]) : null;
    const testPassed = scores.length > 0 && scores.some((s) => Number.isFinite(Number(s)));
    return {
      status: testPassed ? "ok" : "warning",
      enabled: true,
      provider,
      activeProvider: String(result?.provider || "unknown"),
      model,
      testPassed,
      score,
      latencyMs: Date.now() - t0,
      fallbackAvailable: provider === "auto",
      error: testPassed ? null : "重排序测试未返回有效分数",
      suggestions: testPassed
        ? []
        : [
            buildSuggestion(
              "warning",
              "重排序测试未通过",
              "检索将自动降级为混合检索",
              `ollama pull ${DEFAULT_OLLAMA_RERANK_MODEL}`
            ),
          ],
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const msg = String(err?.message || err || "重排序不可用");
    return {
      status: "warning",
      enabled: true,
      provider,
      activeProvider: null,
      model,
      testPassed: false,
      score: null,
      latencyMs,
      fallbackAvailable: provider === "auto",
      error: msg.split("\n")[0],
      detail: msg,
      suggestions: [
        buildSuggestion(
          "warning",
          "重排序模型不可用",
          "系统将自动降级为混合检索，不影响基础搜索",
          provider === "onnx" || provider === "auto"
            ? "npm run preload:kb-rerank-model"
            : `ollama pull ${DEFAULT_OLLAMA_RERANK_MODEL}`
        ),
      ],
    };
  }
}

function computeOverallStatus(ollama, embedding, reranker) {
  if (ollama.status === "error" || embedding.status === "error") {
    return "error";
  }
  if (
    ollama.status === "warning" ||
    embedding.status === "warning" ||
    reranker.status === "warning" ||
    reranker.status === "error"
  ) {
    return "warning";
  }
  return "ok";
}

function mergeSuggestions(...groups) {
  const out = [];
  const seen = new Set();
  for (const list of groups) {
    for (const item of list || []) {
      const key = `${item.level}:${item.title}:${item.command}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

function formatCheckedAt(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * @param {object} opts
 * @param {object} opts.settings KB settings (embedModel, rerank*)
 * @param {string} opts.host Ollama host
 * @param {string} [opts.userDataPath]
 * @param {string} [opts.appVersion]
 */
async function runKbModelHealthCheck(opts = {}) {
  const settings = opts.settings && typeof opts.settings === "object" ? opts.settings : {};
  const host = normalizeOllamaHost(opts.host || readOllamaSettings().host);
  const ollamaSettings =
    opts.ollamaSettings && typeof opts.ollamaSettings === "object"
      ? opts.ollamaSettings
      : readOllamaSettings();
  const started = Date.now();
  const checkedAt = formatCheckedAt();

  const ollama = await checkOllamaService(host);

  let embedding;
  if (ollama.status === "error") {
    embedding = {
      status: "skipped",
      model: String(settings.embedModel || "bge-m3").trim(),
      exists: false,
      embedTestPassed: false,
      dimension: null,
      latencyMs: null,
      error: "Ollama 不可用，跳过嵌入检测",
      suggestions: [],
    };
  } else {
    embedding = await checkEmbeddingModel(host, settings.embedModel, ollama.models, ollamaSettings);
  }

  let reranker;
  if (Date.now() - started > HEALTH_CHECK_TOTAL_MS) {
    reranker = {
      status: "skipped",
      enabled: settings.rerankEnabled !== false,
      provider: String(settings.rerankProvider || "auto"),
      activeProvider: null,
      model: String(settings.rerankModel || "bge-reranker-v2-m3"),
      testPassed: false,
      score: null,
      latencyMs: 0,
      fallbackAvailable: false,
      error: "整体检测超时，跳过重排序检测",
      suggestions: [],
    };
  } else {
    reranker = await checkRerankerModel(host, settings, opts.userDataPath || "");
  }

  const durationMs = Date.now() - started;
  const suggestions = mergeSuggestions(ollama.suggestions, embedding.suggestions, reranker.suggestions);

  return {
    overallStatus: computeOverallStatus(ollama, embedding, reranker),
    checkedAt,
    durationMs,
    appVersion: String(opts.appVersion || ""),
    platform: `${process.platform} ${os.release()}`,
    ollama: {
      status: ollama.status,
      baseUrl: ollama.baseUrl,
      version: ollama.version,
      modelCount: ollama.modelCount,
      latencyMs: ollama.latencyMs,
      versionLatencyMs: ollama.versionLatencyMs,
      tagsLatencyMs: ollama.tagsLatencyMs,
      error: ollama.error,
      detail: ollama.detail || null,
    },
    embedding: {
      status: embedding.status,
      model: embedding.model,
      exists: embedding.exists,
      embedTestPassed: embedding.embedTestPassed,
      dimension: embedding.dimension,
      latencyMs: embedding.latencyMs,
      error: embedding.error,
      detail: embedding.detail || null,
      customModelNote: embedding.customModelNote || "",
    },
    reranker: {
      status: reranker.status,
      enabled: reranker.enabled,
      provider: reranker.provider,
      activeProvider: reranker.activeProvider,
      model: reranker.model,
      testPassed: reranker.testPassed,
      score: reranker.score,
      latencyMs: reranker.latencyMs,
      fallbackAvailable: reranker.fallbackAvailable,
      error: reranker.error,
      detail: reranker.detail || null,
    },
    suggestions,
  };
}

function buildKbModelHealthDiagnostics(report) {
  const r = report && typeof report === "object" ? report : {};
  const modelNames = Array.isArray(r.ollama?.models)
    ? r.ollama.models.map((m) => m.name).filter(Boolean)
    : [];
  const payload = {
    appVersion: r.appVersion || "",
    platform: redactSensitiveText(r.platform || ""),
    checkedAt: r.checkedAt || "",
    durationMs: r.durationMs || 0,
    overallStatus: r.overallStatus || "",
    ollama: {
      status: r.ollama?.status,
      baseUrl: r.ollama?.baseUrl,
      version: r.ollama?.version,
      running: r.ollama?.status === "ok" || r.ollama?.status === "warning",
      modelCount: r.ollama?.modelCount,
      latencyMs: r.ollama?.latencyMs,
      error: redactSensitiveText(r.ollama?.error || ""),
    },
    embedModel: r.embedding?.model,
    embedExists: r.embedding?.exists,
    embedTestPassed: r.embedding?.embedTestPassed,
    embedDimension: r.embedding?.dimension,
    embedLatencyMs: r.embedding?.latencyMs,
    embedError: redactSensitiveText(r.embedding?.error || ""),
    rerankEnabled: r.reranker?.enabled,
    rerankProvider: r.reranker?.provider,
    rerankActiveProvider: r.reranker?.activeProvider,
    rerankTestPassed: r.reranker?.testPassed,
    rerankLatencyMs: r.reranker?.latencyMs,
    rerankError: redactSensitiveText(r.reranker?.error || ""),
    localModelNames: modelNames,
    suggestions: r.suggestions || [],
  };
  return JSON.stringify(payload, null, 2);
}

module.exports = {
  runKbModelHealthCheck,
  buildKbModelHealthDiagnostics,
  HEALTH_CHECK_TOTAL_MS,
};
