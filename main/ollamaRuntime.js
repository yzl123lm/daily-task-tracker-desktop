const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { app } = require("electron");
const { ollamaModelNameMatches } = require("../utils/ollamaEmbedError.js");

let toSimplifiedChinese = (text) => String(text || "");
try {
  const { Converter } = require("opencc-js");
  const t2s = Converter({ from: "tw", to: "cn" });
  toSimplifiedChinese = (text) => t2s(String(text || ""));
} catch {
  /* opencc-js optional fallback */
}

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

const OLLAMA_CURATED_LIBRARY_MODELS = [
  "llama3.3",
  "llama3.2",
  "llama3.1",
  "llama3",
  "llama2",
  "mistral",
  "mixtral",
  "codellama",
  "phi4",
  "phi3.5",
  "phi3",
  "phi",
  "gemma3",
  "gemma4:latest",
  "gemma4:31b",
  "gemma4:26b",
  "gemma4:e4b",
  "gemma4:e2b",
  "gemma2",
  "gemma",
  "qwen3",
  "qwen2.5",
  "qwen2",
  "qwen",
  "deepseek-r1",
  "deepseek-v3",
  "deepseek-v2",
  "deepseek-coder-v2",
  "deepseek-coder",
  "codestral",
  "starcoder2",
  "tinyllama",
  "vicuna",
  "openchat",
  "neural-chat",
  "orca-mini",
  "wizard-vicuna-uncensored",
  "nous-hermes2",
  "dolphin-mixtral",
  "dolphin-mistral",
  "yi",
  "solar",
  "falcon3",
  "falcon2",
  "falcon",
  "stablelm2",
  "sqlcoder",
  "stable-code",
  "granite-code",
  "command-r-plus",
  "command-r",
  "smollm2",
  "hermes3",
  "bakllava",
  "llava",
  "moondream",
  "minicpm-v",
  "nomic-embed-text",
  "mxbai-embed-large",
  "snowflake-arctic-embed",
  "bge-m3",
  "bge-large",
  "llama3.2-vision",
  "mistral-small",
  "mistral-nemo",
  "aya",
  "wizardcoder",
  "zephyr",
  "notus",
  "internlm2",
  "glm4",
  "cogito",
  "devstral",
  "gpt-oss",
];
const VOICE_LIBRARY_ITEMS = [
  {
    id: "qwen3-tts-local",
    name: "Qwen3-TTS（本地 Python）",
    type: "tts",
    source: "local-python",
    installable: true,
    description: "本地文本转语音（推荐 NVIDIA GPU）。",
    commands: [
      {
        kind: "python",
        args: ["-m", "pip", "install", "-U", "qwen-tts"],
        desc: "安装 qwen-tts",
      },
    ],
    check: { kind: "python", args: ["-c", "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('qwen_tts') else 1)"] },
    applyTarget: "tts",
    applyModel: "local:qwen3-tts",
  },
  {
    id: "qwen3-asr-local-0.6b",
    name: "Qwen3-ASR-0.6B（本地 Python）",
    family: "Qwen3-ASR",
    version: "0.6B",
    sizeHint: "约 2-4 GB",
    type: "asr",
    source: "local-python",
    installable: true,
    description: "本地语音识别（轻量版，自动下载并缓存 Qwen3-ASR-0.6B 权重）。",
    commands: [
      {
        kind: "python",
        args: ["-m", "pip", "install", "-U", "qwen-asr", "modelscope"],
        desc: "安装 qwen-asr 与 modelscope",
      },
      {
        kind: "python",
        args: ["-c", "from modelscope import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-0.6B')"],
        desc: "下载 Qwen3-ASR-0.6B 本地权重",
        timeoutMs: 30 * 60 * 1000,
      },
    ],
    check: {
      kind: "python",
      args: [
        "-c",
        "import sys; from modelscope import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-0.6B', local_files_only=True); sys.exit(0)",
      ],
    },
    applyTarget: "asr",
    applyModel: "local:qwen3-asr-0.6b",
  },
  {
    id: "qwen3-asr-local-1.7b",
    name: "Qwen3-ASR-1.7B（本地 Python）",
    family: "Qwen3-ASR",
    version: "1.7B",
    sizeHint: "约 5-9 GB",
    type: "asr",
    source: "local-python",
    installable: true,
    description: "本地语音识别（高精度版，自动下载并缓存 Qwen3-ASR-1.7B 权重）。",
    commands: [
      {
        kind: "python",
        args: ["-m", "pip", "install", "-U", "qwen-asr", "modelscope"],
        desc: "安装 qwen-asr 与 modelscope",
      },
      {
        kind: "python",
        args: ["-c", "from modelscope import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-1.7B')"],
        desc: "下载 Qwen3-ASR-1.7B 本地权重",
        timeoutMs: 45 * 60 * 1000,
      },
    ],
    check: {
      kind: "python",
      args: [
        "-c",
        "import sys; from modelscope import snapshot_download; snapshot_download('Qwen/Qwen3-ASR-1.7B', local_files_only=True); sys.exit(0)",
      ],
    },
    applyTarget: "asr",
    applyModel: "local:qwen3-asr-1.7b",
  },
  {
    id: "faster-whisper-local",
    name: "faster-whisper（本地 ASR）",
    type: "asr",
    source: "local-python",
    installable: true,
    description: "本地语音识别（Whisper 推理，CPU/GPU 均可）。",
    commands: [
      {
        kind: "python",
        args: ["-m", "pip", "install", "-U", "faster-whisper"],
        desc: "安装 faster-whisper",
      },
    ],
    check: { kind: "python", args: ["-c", "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('faster_whisper') else 1)"] },
    applyTarget: "asr",
    applyModel: "whisper-1",
  },
  {
    id: "funasr-local",
    name: "FunASR（本地 ASR）",
    type: "asr",
    source: "local-python",
    installable: true,
    description: "本地语音识别（中文场景友好，常配 paraformer）。",
    commands: [
      {
        kind: "python",
        args: ["-m", "pip", "install", "-U", "funasr", "modelscope"],
        desc: "安装 funasr 与 modelscope",
      },
    ],
    check: { kind: "python", args: ["-c", "import importlib.util,sys;sys.exit(0 if importlib.util.find_spec('funasr') else 1)"] },
    applyTarget: "asr",
    applyModel: "paraformer-v2",
  },
  {
    id: "qwen3-asr-cloud",
    name: "Qwen3-ASR（云端）",
    type: "asr",
    source: "cloud-only",
    installable: false,
    description: "云端语音识别模型。用于兼容 OpenAI 网关场景。",
    applyTarget: "asr",
    applyModel: "qwen3-asr",
  },
  {
    id: "qwen3-tts-cloud",
    name: "Qwen3-TTS（云端）",
    type: "tts",
    source: "cloud-only",
    installable: false,
    description: "云端语音合成模型。用于兼容 OpenAI 网关场景。",
    applyTarget: "tts",
    applyModel: "qwen3-tts",
  },
];

/** 本机硬件评估 → Ollama 可部署模型推荐（名称须在内置库 OLLAMA_CURATED_LIBRARY_MODELS 中） */
const OLLAMA_HARDWARE_RECOMMEND_TIERS = {
  minimal: [
    { model: "tinyllama", reason: "约 0.6B 级轻量模型，内存紧张时优先尝试。" },
    { model: "phi3", reason: "微软 Phi-3 系列，小内存机型较易跑通。" },
    { model: "smollm2", reason: "小体积通用对话，资源占用较低。" },
    { model: "orca-mini", reason: "小型指令模型，适合入门验证 Ollama。" },
  ],
  balanced: [
    { model: "llama3.2", reason: "Meta 小中杯，8～16GB 内存常见配置首选之一。" },
    { model: "qwen2.5", reason: "通义 2.5，中文场景友好。" },
    { model: "mistral-small", reason: "Mistral 紧凑档，日常助手向。" },
    { model: "gemma2", reason: "Google Gemma 2，效果与体积折中。" },
    { model: "phi4", reason: "Phi-4 系列，算力中等时可作备选。" },
  ],
  advanced: [
    { model: "llama3.1", reason: "较大上下文能力，建议 16GB+ 空闲内存或较好显卡。" },
    { model: "qwen3", reason: "通义新一代，算力充足时综合能力强。" },
    { model: "mistral", reason: "经典 7B 级 Mistral，通用推理与创作。" },
    { model: "deepseek-coder", reason: "偏代码与逻辑任务，开发者常用。" },
    { model: "codestral", reason: "代码向 Mistral 系，中高配可试。" },
  ],
  heavy: [
    { model: "llama3.3", reason: "旗舰级体量，需大内存/大显存与足够磁盘。" },
    { model: "mixtral", reason: "MoE 架构，推理开销高，适合工作站。" },
    { model: "deepseek-r1", reason: "推理增强大模型，资源要求很高。" },
    { model: "command-r-plus", reason: "长上下文与企业场景，高配推荐。" },
    { model: "gemma4:e2b", reason: "Gemma 4 较低档量化，需 Ollama 0.20+。" },
  ],
};
function sanitizeGpuVramBytes(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  if (n === 0xffffffff || n > 128 * 1024 ** 3) {
    return 0;
  }
  return n;
}

function getWindowsGpuListForRecommend() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve([]);
      return;
    }
    const psCmd =
      "try { " +
      "Get-CimInstance Win32_VideoController | " +
      "Where-Object { $_.Name -and ($_.Name -notmatch 'Microsoft Basic|Parsec|VirtualBox|VMware|Remote Desktop') } | " +
      "Select-Object Name,@{N='AdapterRAM';E={[int64]$_.AdapterRAM}} | " +
      "ConvertTo-Json -Compress " +
      "} catch { '[]' }";
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psCmd],
      { timeout: 12000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout) {
          return resolve([]);
        }
        try {
          const txt = String(stdout).trim();
          if (!txt || txt === "[]") {
            return resolve([]);
          }
          const j = JSON.parse(txt);
          const arr = Array.isArray(j) ? j : [j];
          const out = [];
          for (const x of arr) {
            if (!x || !x.Name) {
              continue;
            }
            const bytes = sanitizeGpuVramBytes(x.AdapterRAM);
            const vramGb = bytes > 0 ? Math.round((bytes / 1024 ** 3) * 10) / 10 : 0;
            out.push({ name: String(x.Name).trim(), vramGb });
          }
          resolve(out);
        } catch {
          resolve([]);
        }
      }
    );
  });
}

/**
 * 汇总内存 / CPU /（Windows）显卡信息，按启发式打分给出 Ollama 模型推荐档位。
 */
async function buildOllamaHardwareRecommendPayload() {
  const cpuBrandFromCim = await getWindowsCpuBrandFromCim();
  const cpuBrand = (cpuBrandFromCim || getLocalCpuBrandFromOs() || "未知 CPU").trim();
  const logicalProcessors = Math.max(1, os.cpus().length);
  const totalRamGb = Math.round((os.totalmem() / 1024 ** 3) * 10) / 10;
  const freeRamGb = Math.round((os.freemem() / 1024 ** 3) * 10) / 10;

  let gpus = [];
  if (process.platform === "win32") {
    gpus = await getWindowsGpuListForRecommend();
  }

  const maxVramGb = gpus.reduce((m, g) => Math.max(m, Number(g.vramGb) || 0), 0);
  const score =
    Math.min(totalRamGb / 3, 12) +
    Math.min(maxVramGb * 1.2, 14) +
    Math.min(logicalProcessors / 8, 2);

  let tierKey = "balanced";
  if (score < 4.5) {
    tierKey = "minimal";
  } else if (score < 8) {
    tierKey = "balanced";
  } else if (score < 12) {
    tierKey = "advanced";
  } else {
    tierKey = "heavy";
  }

  const tierList = OLLAMA_HARDWARE_RECOMMEND_TIERS[tierKey] || OLLAMA_HARDWARE_RECOMMEND_TIERS.balanced;
  const items = [];
  const seen = new Set();
  for (const row of tierList) {
    if (!OLLAMA_CURATED_LIBRARY_MODELS.includes(row.model)) {
      continue;
    }
    if (seen.has(row.model)) {
      continue;
    }
    seen.add(row.model);
    items.push({ model: row.model, reason: row.reason });
    if (items.length >= 6) {
      break;
    }
  }

  const tierLabels = { minimal: "入门", balanced: "均衡", advanced: "进阶", heavy: "高配" };
  const notes = [
    "依据系统报告的内存、逻辑处理器与（Windows）显卡显存做启发式评估；实际表现因量化、并发与 Ollama 版本而异。",
    "集显或虚拟机下显存常无法正确读取，将以内存与 CPU 为主。",
  ];

  return {
    summary: {
      cpuBrand,
      logicalProcessors,
      totalRamGb,
      freeRamGb,
      platform: process.platform,
      arch: process.arch,
      gpus,
      maxVramGb: Math.round(maxVramGb * 10) / 10,
      score: Math.round(score * 10) / 10,
    },
    tier: tierKey,
    tierLabel: tierLabels[tierKey] || "均衡",
    items,
    notes,
  };
}
function ollamaSettingsPath() {
  return path.join(app.getPath("userData"), "ollama-settings.json");
}

function normalizeOllamaHost(raw) {
  let h = typeof raw === "string" ? raw.trim() : "";
  if (!h) {
    return "http://127.0.0.1:11434";
  }
  h = h.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(h)) {
    h = `http://${h}`;
  }
  return h;
}

function isLoopbackHostname(hostname) {
  const h = String(hostname || "")
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") {
    return true;
  }
  return h.startsWith("127.");
}

function assertSafeOllamaHost(raw) {
  const normalized = normalizeOllamaHost(raw);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("无效的 Ollama 地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Ollama 地址仅允许 http/https");
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "169.254.169.254" || host === "metadata.google.internal") {
    throw new Error("不允许的 Ollama 地址");
  }
  if (!isLoopbackHostname(host)) {
    throw new Error("Ollama 地址仅允许本机（localhost / 127.0.0.1）");
  }
  return normalized;
}

function readOllamaSettings() {
  const defaults = {
    host: "http://127.0.0.1:11434",
    /** @type {"auto"|"cpu"|"gpu"} 本机 Ollama 推理：自动 / 仅 CPU / 尽量用 GPU（由 Ollama 分配算力） */
    inferenceDevice: "gpu",
    /** 显式线程数；null 表示在「自动」模式下交给 Ollama，在「仅 CPU/优先 GPU」下使用本机建议值或用户保存值 */
    numThread: null,
  };
  const p = ollamaSettingsPath();
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(defaults), "utf8");
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const merged = { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
    try {
      merged.host = assertSafeOllamaHost(merged.host);
    } catch {
      merged.host = defaults.host;
    }
    if (merged.inferenceDevice === "auto") {
      merged.inferenceDevice = "gpu";
      try {
        fs.writeFileSync(p, JSON.stringify(merged), "utf8");
      } catch {
        /* ignore persist failure */
      }
    }
    return merged;
  } catch {
    fs.writeFileSync(p, JSON.stringify(defaults), "utf8");
    return defaults;
  }
}

function writeOllamaSettings(s) {
  fs.writeFileSync(ollamaSettingsPath(), JSON.stringify(s), "utf8");
}

/** 与界面「建议线程」一致：为系统预留 1～2 个逻辑核 */
function computeSuggestedOllamaNumThreadSync() {
  const logical = Math.max(1, os.cpus().length);
  const reserve = logical >= 8 ? 2 : 1;
  return Math.max(1, Math.min(logical, Math.max(1, logical - reserve)));
}

function normalizeInferenceDevice(raw) {
  const v = String(raw || "").toLowerCase();
  if (v === "cpu" || v === "gpu" || v === "auto") {
    return v;
  }
  return "auto";
}

function resolveEffectiveOllamaNumThread(settings) {
  const logical = Math.max(1, os.cpus().length);
  const suggested = computeSuggestedOllamaNumThreadSync();
  const n = settings?.numThread;
  if (n != null && Number.isFinite(Number(n)) && Number(n) >= 1) {
    return Math.min(Math.max(1, Math.floor(Number(n))), logical);
  }
  return suggested;
}

function stripOpenAiV1BaseSuffix(baseUrl) {
  let b = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (/\/v1$/i.test(b)) {
    return b.slice(0, -3);
  }
  return b;
}

function isLikelyOllamaOpenAiBase(baseUrl) {
  const b = String(baseUrl || "").toLowerCase();
  return /\bollama\b/.test(b) || /:11434(\/|$|\?)/.test(b);
}

/**
 * Ollama /api/chat 的 options（Modelfile 参数子集）。
 * num_gpu: 0 表示不使用 GPU 参与；较大值表示尽量让 Ollama 使用 GPU（具体由 llama.cpp / Ollama 截断到硬件可支持范围）。
 */
function buildOllamaNativeOptions(settings, runtime = {}) {
  const dev = normalizeInferenceDevice(settings?.inferenceDevice);
  const opts = { temperature: 1.0 };
  const hasCustomThread =
    settings?.numThread != null && Number.isFinite(Number(settings.numThread)) && Number(settings.numThread) >= 1;
  const effectiveThread = resolveEffectiveOllamaNumThread(settings);

  if (dev === "cpu") {
    opts.num_gpu = 0;
    opts.num_thread = effectiveThread;
  } else if (dev === "gpu") {
    opts.num_gpu = 999;
    opts.num_thread = effectiveThread;
  } else if (hasCustomThread) {
    opts.num_thread = Math.min(
      Math.max(1, Math.floor(Number(settings.numThread))),
      Math.max(1, os.cpus().length)
    );
  }
  const toolsInUse = runtime?.toolsInUse === true;
  const chatNumCtx = Number(settings?.chatNumCtx);
  if (Number.isFinite(chatNumCtx) && chatNumCtx >= 4096) {
    opts.num_ctx = Math.min(131072, Math.floor(chatNumCtx));
  } else if (toolsInUse) {
    opts.num_ctx = 32768;
  }
  const chatNumPredict = Number(settings?.chatNumPredict);
  if (Number.isFinite(chatNumPredict) && chatNumPredict >= 256) {
    opts.num_predict = Math.min(65536, Math.floor(chatNumPredict));
  } else if (toolsInUse) {
    opts.num_predict = 8192;
  }
  return opts;
}

/**
 * 知识库向量嵌入（/api/embed、/api/embeddings）用的 Ollama options。
 * auto / gpu 均尽量将模型层卸到显卡；仅当用户显式选择「仅 CPU」时 num_gpu=0。
 */
function buildOllamaEmbedOptions(settings) {
  const dev = normalizeInferenceDevice(settings?.inferenceDevice);
  const effectiveThread = resolveEffectiveOllamaNumThread(settings);
  const opts = {};
  if (dev === "cpu") {
    opts.num_gpu = 0;
    opts.num_thread = effectiveThread;
    return opts;
  }
  opts.num_gpu = 999;
  opts.main_gpu = 0;
  opts.num_thread = Math.max(1, Math.min(effectiveThread, 4));
  return opts;
}

/** 嵌入模型在 Ollama 中保持加载的时长，避免每次检索冷启动（约 5–8s）并维持 GPU 驻留。 */
const OLLAMA_EMBED_KEEP_ALIVE = "30m";
/** 单次嵌入 HTTP 超时（毫秒）；避免 Ollama 卡住时检索界面无限转圈。 */
const OLLAMA_EMBED_TIMEOUT_MS = 120000;

async function fetchOllamaEmbedJson(url, body, timeoutMs = OLLAMA_EMBED_TIMEOUT_MS, externalSignal) {
  const timeout = Math.max(5000, Number(timeoutMs) || OLLAMA_EMBED_TIMEOUT_MS);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const name = String(err?.name || "");
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(
        `Ollama 嵌入请求超时（>${Math.round(timeout / 1000)}s）。请确认 Ollama 服务正常、嵌入模型 bge-m3 已加载，或稍后重试。`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data || {};
}

function buildOllamaEmbedPayload(model, input, settings, extra = {}) {
  const s = settings && typeof settings === "object" ? settings : readOllamaSettings();
  return {
    model: String(model || "").trim(),
    input,
    options: buildOllamaEmbedOptions(s),
    keep_alive: extra.keepAlive ?? OLLAMA_EMBED_KEEP_ALIVE,
  };
}

async function warmOllamaEmbedModel(host, model, settings, externalSignal) {
  const s = settings && typeof settings === "object" ? settings : readOllamaSettings();
  const base = normalizeOllamaHost(host || s.host);
  const modelName = String(model || "bge-m3").trim() || "bge-m3";
  await fetchOllamaEmbedJson(
    `${base}/api/embed`,
    buildOllamaEmbedPayload(modelName, "知识库嵌入预热", s),
    OLLAMA_EMBED_TIMEOUT_MS,
    externalSignal
  );
  return { ok: true, model: modelName };
}

async function fetchOllamaRunningModels(host, timeoutMs = 5000) {
  const base = normalizeOllamaHost(host);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(500, Number(timeoutMs) || 5000));
  try {
    const res = await fetch(`${base}/api/ps`, { signal: controller.signal });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!res.ok) {
      return [];
    }
    return Array.isArray(data?.models) ? data.models : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function describeOllamaModelProcessor(row) {
  const size = Math.max(0, Number(row?.size) || 0);
  const vram = Math.max(0, Number(row?.size_vram) || 0);
  if (!size) {
    return {
      mode: "unknown",
      label: "未知",
      gpuPercent: 0,
      cpuPercent: 0,
    };
  }
  const gpuPercent = Math.max(0, Math.min(100, Math.round((vram / size) * 100)));
  const cpuPercent = Math.max(0, Math.min(100, 100 - gpuPercent));
  let mode = "hybrid";
  let label = `${cpuPercent}% CPU / ${gpuPercent}% GPU`;
  if (gpuPercent >= 95) {
    mode = "gpu";
    label = "100% GPU";
  } else if (gpuPercent <= 5) {
    mode = "cpu";
    label = "100% CPU";
  }
  return { mode, label, gpuPercent, cpuPercent };
}

async function inspectOllamaEmbedDevice(host, modelName, settings) {
  const requested = normalizeInferenceDevice(settings?.inferenceDevice);
  const reqOpts = buildOllamaEmbedOptions(settings);
  let match = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const rows = await fetchOllamaRunningModels(host);
    match = rows.find((row) =>
      ollamaModelNameMatches(String(row?.name || row?.model || ""), modelName)
    );
    if (match) {
      break;
    }
    if (attempt < 5) {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }
  const proc = match
    ? describeOllamaModelProcessor(match)
    : {
        mode: "unknown",
        label: "未检测到已加载模型（可能仍在加载或已卸载）",
        gpuPercent: 0,
        cpuPercent: 0,
      };
  return {
    requested,
    requestedNumGpu: reqOpts.num_gpu ?? null,
    model: String(modelName || "").trim(),
    runningModel: match ? String(match.name || match.model || "") : "",
    sizeBytes: match ? Number(match.size) || 0 : 0,
    sizeVramBytes: match ? Number(match.size_vram) || 0 : 0,
    ...proc,
  };
}

/**
 * 从 Ollama /api/chat 非流式 JSON 中抽取用量与耗时（兼容根字段、metrics 嵌套、部分版本写在 message 上）。
 * 供 AI 助手「运行效率情况查看」折叠块展示。
 */
function extractOllamaNativeChatUsage(data, assistantMsg) {
  if (!data || typeof data !== "object") {
    return null;
  }
  const metrics =
    data.metrics && typeof data.metrics === "object" && !Array.isArray(data.metrics) ? data.metrics : null;
  const msg = assistantMsg && typeof assistantMsg === "object" ? assistantMsg : null;

  function pick(keys) {
    for (const obj of [data, metrics, msg]) {
      if (!obj || typeof obj !== "object") {
        continue;
      }
      for (const k of keys) {
        const v = obj[k];
        if (v != null && v !== "") {
          return v;
        }
      }
    }
    return undefined;
  }

  const prompt_eval_count = pick(["prompt_eval_count"]);
  const eval_count = pick(["eval_count"]);
  const total_duration = pick(["total_duration", "total_duration_ns"]);
  const load_duration = pick(["load_duration"]);
  const prompt_eval_duration = pick(["prompt_eval_duration"]);
  const eval_duration = pick(["eval_duration"]);

  const peN = prompt_eval_count != null ? Number(prompt_eval_count) : NaN;
  const ecN = eval_count != null ? Number(eval_count) : NaN;
  const tdN = total_duration != null ? Number(total_duration) : NaN;
  const ldN = load_duration != null ? Number(load_duration) : NaN;
  const pedN = prompt_eval_duration != null ? Number(prompt_eval_duration) : NaN;
  const edN = eval_duration != null ? Number(eval_duration) : NaN;

  const hasAny =
    (Number.isFinite(peN) && peN >= 0) ||
    (Number.isFinite(ecN) && ecN >= 0) ||
    (Number.isFinite(tdN) && tdN >= 0) ||
    (Number.isFinite(ldN) && ldN >= 0) ||
    (Number.isFinite(pedN) && pedN >= 0) ||
    (Number.isFinite(edN) && edN >= 0);

  if (!hasAny) {
    return null;
  }

  return {
    prompt_eval_count: Number.isFinite(peN) && peN >= 0 ? peN : undefined,
    eval_count: Number.isFinite(ecN) && ecN >= 0 ? ecN : undefined,
    total_duration_ns: Number.isFinite(tdN) && tdN >= 0 ? tdN : undefined,
    load_duration_ns: Number.isFinite(ldN) && ldN >= 0 ? ldN : undefined,
    prompt_eval_duration_ns: Number.isFinite(pedN) && pedN >= 0 ? pedN : undefined,
    eval_duration_ns: Number.isFinite(edN) && edN >= 0 ? edN : undefined,
  };
}

async function ollamaFetchJson(host, pathname, { method = "GET", body } = {}) {
  const base = normalizeOllamaHost(host);
  const url = `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
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
      data = { _raw: text };
    }
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
    throw new Error(String(msg).slice(0, 800));
  }
  return data;
}
function inferCpuVendorFromBrand(brand) {
  const b = String(brand || "").toLowerCase();
  if (/intel|pentium|celeron|xeon|core(\s|)i/i.test(b)) {
    return "intel";
  }
  if (/amd|ryzen|threadripper|athlon|epyc|opteron|fx-/i.test(b)) {
    return "amd";
  }
  if (/apple|m1|m2|m3|m4|m5/i.test(b)) {
    return "apple";
  }
  return "unknown";
}

function getLocalCpuBrandFromOs() {
  const cpus = os.cpus();
  return String(cpus[0]?.model || "").trim();
}

function getWindowsCpuBrandFromCim() {
  return new Promise((resolve) => {
    if (process.platform !== "win32") {
      resolve("");
      return;
    }
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "try { (Get-CimInstance Win32_Processor | Select-Object -First 1 -ExpandProperty Name) } catch { '' }",
      ],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err) {
          return resolve("");
        }
        resolve(String(stdout || "").trim());
      }
    );
  });
}

/**
 * 为 AMD / 英特尔等 x64 客户端汇总本地大模型（Ollama）CPU 推理侧建议：线程数、环境变量与量化提示。
 */
async function buildCpuLocalLlmHintPayload() {
  const fromOs = getLocalCpuBrandFromOs();
  const fromCim = await getWindowsCpuBrandFromCim();
  const cpuBrand = (fromCim || fromOs || "未知 CPU").trim();
  const cpuVendor = inferCpuVendorFromBrand(cpuBrand);
  const logical = Math.max(1, os.cpus().length);
  const suggestedOllamaNumThread = computeSuggestedOllamaNumThreadSync();

  const tips = [];
  if (cpuVendor === "intel") {
    tips.push(
      "检测到英特尔平台：Ollama 在 x64 上会按 CPU 能力选用 AVX2 等路径。纯 CPU 推理建议优先选用 Q4_K_M / Q5 等较小量化，以降低首 token 延迟与内存占用。"
    );
  } else if (cpuVendor === "amd") {
    tips.push(
      "检测到 AMD 平台：与英特尔同为 x86-64，本地推理路径一致。多核机型可适当提高并行线程，但仍建议为系统和桌面预留 1～2 个逻辑处理器，避免整机卡顿。"
    );
  } else if (cpuVendor === "apple") {
    tips.push(
      "检测到 Apple 处理器：若在 macOS 使用 Ollama，可自动利用 Metal 等加速；当前为 Windows 客户端时，以下线程建议仍适用于 x64 兼容层或远程 Ollama 主机。"
    );
  } else {
    tips.push("未能识别具体 CPU 厂商：仍可按下方建议为 Ollama 限制 CPU 线程数，以适配当前机器算力。");
  }
  tips.push(
    `建议在运行 Ollama 的用户或系统环境中设置 OLLAMA_NUM_THREAD=${suggestedOllamaNumThread}（部分版本亦支持 OLLAMA_RUNNER_THREADS），保存后重启 Ollama 服务；或在模型 Modelfile 中加入 PARAMETER num_thread ${suggestedOllamaNumThread} 后 ollama create 自定义模型。`
  );
  tips.push(
    "本应用在调用本机 Ollama 时优先走原生 /api/chat，并可在「本地模型部署」中设置仅 CPU / 优先 GPU 与 CPU 线程数（写入单次请求的 options，一般无需重启 Ollama）。其它 OpenAI 兼容服务仍走 /v1/chat/completions。"
  );

  return {
    platform: process.platform,
    arch: process.arch,
    cpuBrand,
    cpuVendor,
    logicalProcessors: logical,
    suggestedOllamaNumThread,
    envSnippet: `OLLAMA_NUM_THREAD=${suggestedOllamaNumThread}`,
    tips,
  };
}

function voicePythonCandidates() {
  const dedup = new Set();
  const out = [];
  const push = (cmd, prefix = []) => {
    const key = `${cmd}::${prefix.join(" ")}`;
    if (dedup.has(key)) {
      return;
    }
    dedup.add(key);
    out.push({ cmd, prefix });
  };
  if (process.platform === "win32") {
    try {
      const localPyRoot = path.join(process.env.LOCALAPPDATA || "", "Programs", "Python");
      if (localPyRoot && fs.existsSync(localPyRoot)) {
        fs.readdirSync(localPyRoot, { withFileTypes: true })
          .filter((d) => d && d.isDirectory() && /^Python3\d+/i.test(d.name))
          .sort((a, b) => b.name.localeCompare(a.name))
          .forEach((d) => {
            const exe = path.join(localPyRoot, d.name, "python.exe");
            if (fs.existsSync(exe)) {
              push(exe, []);
            }
          });
      }
    } catch {
      /* ignore */
    }
    push("py", ["-3.12"]);
    push("py", ["-3"]);
    push("python", []);
    push("python3", []);
    return out;
  }
  push("python3", []);
  push("python", []);
  return out;
}

function execFileForVoice(cmd, args, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    execFile(
      cmd,
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
      },
      (err, stdout, stderr) => {
      resolve({
        ok: !err,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: err ? String(err.message || err) : "",
      });
      }
    );
  });
}

function parseLastJsonLine(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((x) => String(x || "").trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const s = lines[i];
    if (!(s.startsWith("{") && s.endsWith("}"))) {
      continue;
    }
    try {
      return JSON.parse(s);
    } catch {
      /* continue */
    }
  }
  return null;
}

function resolveLocalQwen3AsrModelId(modelName) {
  const m = String(modelName || "").trim().toLowerCase();
  if (/(^|[:/_-])qwen3-asr-1\.7b($|[:/_-])/.test(m)) {
    return "Qwen/Qwen3-ASR-1.7B";
  }
  if (/(^|[:/_-])qwen3-asr-0\.6b($|[:/_-])/.test(m)) {
    return "Qwen/Qwen3-ASR-0.6B";
  }
  return "";
}

function normalizeLocalQwen3AsrLanguage(languageRaw) {
  const raw = String(languageRaw || "").trim();
  if (!raw) {
    return "";
  }
  const k = raw.toLowerCase();
  const map = {
    zh: "Chinese",
    "zh-cn": "Chinese",
    "zh-hans": "Chinese",
    "zh-tw": "Chinese",
    "zh-hant": "Chinese",
    en: "English",
    "en-us": "English",
    "en-gb": "English",
    yue: "Cantonese",
    ar: "Arabic",
    de: "German",
    fr: "French",
    es: "Spanish",
    pt: "Portuguese",
    id: "Indonesian",
    it: "Italian",
    ko: "Korean",
    ru: "Russian",
    th: "Thai",
    vi: "Vietnamese",
    ja: "Japanese",
    tr: "Turkish",
    hi: "Hindi",
    ms: "Malay",
    nl: "Dutch",
    sv: "Swedish",
    da: "Danish",
    fi: "Finnish",
    pl: "Polish",
    cs: "Czech",
    fil: "Filipino",
    fa: "Persian",
    el: "Greek",
    ro: "Romanian",
    hu: "Hungarian",
    mk: "Macedonian",
  };
  if (map[k]) {
    return map[k];
  }
  const normalizedName = `${raw.slice(0, 1).toUpperCase()}${raw.slice(1).toLowerCase()}`;
  const supported = new Set([
    "Chinese",
    "English",
    "Cantonese",
    "Arabic",
    "German",
    "French",
    "Spanish",
    "Portuguese",
    "Indonesian",
    "Italian",
    "Korean",
    "Russian",
    "Thai",
    "Vietnamese",
    "Japanese",
    "Turkish",
    "Hindi",
    "Malay",
    "Dutch",
    "Swedish",
    "Danish",
    "Finnish",
    "Polish",
    "Czech",
    "Filipino",
    "Persian",
    "Greek",
    "Romanian",
    "Hungarian",
    "Macedonian",
  ]);
  return supported.has(normalizedName) ? normalizedName : "";
}

async function transcribeWithLocalQwen3Asr(payload) {
  const audioBase64 = typeof payload?.audioBase64 === "string" ? payload.audioBase64 : "";
  if (!audioBase64) {
    throw new Error("缺少音频数据");
  }
  const mimeType = String(payload?.mimeType || "audio/webm");
  const modelId = String(payload?.modelId || "Qwen/Qwen3-ASR-0.6B");
  const language = normalizeLocalQwen3AsrLanguage(payload?.language);
  const prompt = typeof payload?.prompt === "string" ? payload.prompt.trim() : "";
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "qwen3-asr-local-"));
  const inFile = path.join(tmpDir, "input.json");
  const pyFile = path.join(tmpDir, "run_local_qwen3_asr.py");
  fs.writeFileSync(
    inFile,
    JSON.stringify({
      model_id: modelId,
      audio_data: `data:${mimeType};base64,${audioBase64}`,
      language,
      prompt,
    }),
    "utf8"
  );
  const pyCode = [
    "import json, sys, traceback",
    "import torch",
    "from qwen_asr import Qwen3ASRModel",
    "",
    "def pick_text(x):",
    "    if isinstance(x, dict):",
    "        return str(x.get('text') or x.get('result') or x.get('transcript') or '')",
    "    for k in ('text', 'result', 'transcript'):",
    "        v = getattr(x, k, None)",
    "        if v:",
    "            return str(v)",
    "    return ''",
    "",
    "def main():",
    "    with open(sys.argv[1], 'r', encoding='utf-8') as f:",
    "        payload = json.load(f)",
    "    model_id = payload.get('model_id') or 'Qwen/Qwen3-ASR-0.6B'",
    "    audio_data = payload.get('audio_data') or ''",
    "    language = payload.get('language') or None",
    "    prompt = payload.get('prompt') or None",
    "    use_cuda = torch.cuda.is_available()",
    "    dtype = torch.bfloat16 if use_cuda else torch.float32",
    "    device_map = 'cuda:0' if use_cuda else 'cpu'",
    "    model = Qwen3ASRModel.from_pretrained(",
    "        model_id,",
    "        dtype=dtype,",
    "        device_map=device_map,",
    "        max_new_tokens=256,",
    "    )",
    "    kwargs = {'audio': audio_data, 'language': language}",
    "    if prompt:",
    "        kwargs['prompt'] = prompt",
    "    result = model.transcribe(**kwargs)",
    "    text = ''",
    "    if isinstance(result, list) and len(result) > 0:",
    "        text = pick_text(result[0])",
    "    elif result is not None:",
    "        text = pick_text(result)",
    "    print(json.dumps({'text': str(text).strip()}, ensure_ascii=True))",
    "",
    "if __name__ == '__main__':",
    "    try:",
    "        main()",
    "    except Exception as e:",
    "        print(json.dumps({'error': str(e), 'traceback': traceback.format_exc()[-2400:]}, ensure_ascii=True))",
    "        raise",
  ].join('\n');
  fs.writeFileSync(pyFile, pyCode, "utf8");
  try {
    const out = await runVoiceStep({
      kind: "python",
      args: [pyFile, inFile],
      timeoutMs: 20 * 60 * 1000,
    });
    if (!out.ok) {
      const detail = String(out.output || "").trim();
      const tail = detail ? detail.split(/\r?\n/).slice(-8).join("\n") : "";
      throw new Error(tail ? `${out.error || "本地 Qwen3-ASR 执行失败"}\n${tail}` : out.error || "本地 Qwen3-ASR 执行失败");
    }
    const parsed = parseLastJsonLine(out.output);
    if (!parsed || typeof parsed !== "object") {
      throw new Error("本地 Qwen3-ASR 返回结果解析失败");
    }
    if (parsed.error) {
      throw new Error(String(parsed.error));
    }
    return {
      text: normalizeAsrDisplayText(parsed.text || ""),
      raw: parsed,
      provider: "qwen3-asr-local",
      model: modelId,
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

async function runVoiceStep(step) {
  if (step?.kind !== "python") {
    return { ok: false, output: "", error: "不支持的安装步骤类型" };
  }
  const cands = voicePythonCandidates();
  let last = null;
  let preferred = null;
  const attempted = [];
  let hasExistingAbsolutePython = false;
  const isCmdMissing = (ret) => {
    const s = `${ret?.error || ""}\n${ret?.stderr || ""}\n${ret?.stdout || ""}`.toLowerCase();
    return (
      /python was not found/.test(s) ||
      /is not recognized as an internal or external command/.test(s) ||
      /app execution aliases/.test(s) ||
      /enoent/.test(s)
    );
  };
  for (const c of cands) {
    attempted.push(`${c.cmd} ${c.prefix.join(" ")}`.trim());
    if (path.isAbsolute(String(c.cmd || "")) && fs.existsSync(String(c.cmd || ""))) {
      hasExistingAbsolutePython = true;
    }
    const ret = await execFileForVoice(c.cmd, [...c.prefix, ...step.args], step.timeoutMs || 10 * 60 * 1000);
    if (ret.ok) {
      return { ok: true, output: [ret.stdout, ret.stderr].filter(Boolean).join("\n"), runner: `${c.cmd} ${c.prefix.join(" ")}`.trim() };
    }
    last = { ...ret, runner: `${c.cmd} ${c.prefix.join(" ")}`.trim() };
    if (!preferred && !isCmdMissing(ret)) {
      preferred = { ...ret, runner: `${c.cmd} ${c.prefix.join(" ")}`.trim() };
    }
  }
  const chosen = preferred || last;
  const rawErr = `${chosen?.error || ""}\n${chosen?.stderr || ""}\n${chosen?.stdout || ""}`.toLowerCase();
  const pythonMissing =
    !hasExistingAbsolutePython &&
    (/python was not found/.test(rawErr) ||
      /is not recognized as an internal or external command/.test(rawErr) ||
      /app execution aliases/.test(rawErr) ||
      /enoent/.test(rawErr));
  const friendly = pythonMissing
    ? `未检测到可用 Python 运行时（尝试：${attempted.join(" / ")}）。请安装 Python 3.11/3.12 并勾选 Add to PATH；若已安装，请在 Windows「应用执行别名」中关闭 python/python3 后重试。`
    : "";
  return {
    ok: false,
    output: [chosen?.stdout || "", chosen?.stderr || ""].filter(Boolean).join("\n"),
    error: friendly || chosen?.error || "执行失败",
    runner: chosen?.runner || "",
  };
}

function registerOllamaVoiceHandlers(ipcMain) {
ipcMain.handle("cpu-local-llm-hint", async () => buildCpuLocalLlmHintPayload());

ipcMain.handle("ollama-hardware-recommend", async () => buildOllamaHardwareRecommendPayload());

ipcMain.handle("voice-library-catalog", () => {
  return {
    items: VOICE_LIBRARY_ITEMS.map((x) => ({
      id: x.id,
      name: x.name,
      type: x.type,
      source: x.source,
      installable: x.installable === true,
      description: x.description || "",
      applyTarget: x.applyTarget || "",
      applyModel: x.applyModel || "",
    })),
  };
});

ipcMain.handle("voice-library-status", async () => {
  const statuses = {};
  for (const item of VOICE_LIBRARY_ITEMS) {
    if (!item.installable || !item.check) {
      statuses[item.id] = {
        installed: false,
        detail: item.source === "cloud-only" ? "云端模型，无需本地安装；写入配置后可直接走云端调用" : "",
      };
      continue;
    }
    const ret = await runVoiceStep({ ...item.check, timeoutMs: 15000 });
    statuses[item.id] = {
      installed: ret.ok,
      detail: ret.ok ? "已检测到本地依赖" : "未检测到本地依赖",
    };
  }
  return { statuses };
});

ipcMain.handle("voice-library-install", async (event, payload) => {
  const id = String(payload?.id || "").trim();
  const item = VOICE_LIBRARY_ITEMS.find((x) => x.id === id);
  if (!item) {
    throw new Error("未找到指定语音模型项");
  }
  if (!item.installable) {
    return { ok: false, error: "该模型为云端项，无需本地安装。" };
  }
  const send = (data) => {
    try {
      event.sender.send("voice-library-install-progress", data);
    } catch {
      /* ignore */
    }
  };
  send({ id, stage: "start", line: `开始安装：${item.name}` });
  for (const step of item.commands || []) {
    send({ id, stage: "step", line: `${step.desc || "执行安装步骤"}…` });
    const out = await runVoiceStep(step);
    if (out.output) {
      String(out.output)
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(-80)
        .forEach((line) => send({ id, stage: "log", line }));
    }
    if (!out.ok) {
      const msg = out.error || "安装失败";
      send({ id, stage: "error", line: msg });
      throw new Error(`${item.name} 安装失败：${msg}`);
    }
  }
  send({ id, stage: "done", line: `安装完成：${item.name}` });
  return { ok: true };
});

ipcMain.handle("ollama-settings-get", () => {
  const s = readOllamaSettings();
  const logical = Math.max(1, os.cpus().length);
  return {
    host: normalizeOllamaHost(s.host),
    inferenceDevice: normalizeInferenceDevice(s.inferenceDevice),
    numThread:
      s.numThread != null && Number.isFinite(Number(s.numThread)) && Number(s.numThread) >= 1
        ? Math.min(Math.floor(Number(s.numThread)), logical)
        : null,
    suggestedNumThread: computeSuggestedOllamaNumThreadSync(),
    logicalProcessors: logical,
  };
});

ipcMain.handle("ollama-settings-set", (_event, payload) => {
  const cur = readOllamaSettings();
  const logical = Math.max(1, os.cpus().length);
  const next = { ...cur };
  if (typeof payload?.host === "string" && payload.host.trim()) {
    next.host = assertSafeOllamaHost(payload.host.trim());
  }
  if (payload?.inferenceDevice !== undefined) {
    next.inferenceDevice = normalizeInferenceDevice(payload.inferenceDevice);
  }
  if (payload?.numThread === null || payload?.numThread === "" || payload?.clearNumThread === true) {
    next.numThread = null;
  } else if (payload?.numThread !== undefined) {
    const nt = Number(payload.numThread);
    if (Number.isFinite(nt) && nt >= 1) {
      next.numThread = Math.min(Math.floor(nt), 512);
    }
  }
  writeOllamaSettings(next);
  if (payload?.inferenceDevice !== undefined || payload?.numThread !== undefined || payload?.clearNumThread) {
    void warmOllamaEmbedModel(next.host, "bge-m3", next).catch(() => {});
  }
  return {
    ok: true,
    host: normalizeOllamaHost(next.host),
    inferenceDevice: normalizeInferenceDevice(next.inferenceDevice),
    numThread:
      next.numThread != null && Number.isFinite(Number(next.numThread)) && Number(next.numThread) >= 1
        ? Math.min(Math.floor(Number(next.numThread)), logical)
        : null,
    suggestedNumThread: computeSuggestedOllamaNumThreadSync(),
    logicalProcessors: logical,
  };
});

ipcMain.handle("ollama-library-catalog", () => {
  return { models: OLLAMA_CURATED_LIBRARY_MODELS.slice() };
});

ipcMain.handle("ollama-status", async () => {
  const s = readOllamaSettings();
  const host = normalizeOllamaHost(s.host);
  try {
    const ver = await ollamaFetchJson(host, "/api/version");
    const tags = await ollamaFetchJson(host, "/api/tags");
    const list = Array.isArray(tags?.models) ? tags.models : [];
    return {
      ok: true,
      host,
      version: ver?.version || "",
      modelCount: list.length,
    };
  } catch (e) {
    return {
      ok: false,
      host,
      error: e.message || String(e),
    };
  }
});

ipcMain.handle("ollama-list-local", async () => {
  const s = readOllamaSettings();
  const host = normalizeOllamaHost(s.host);
  const tags = await ollamaFetchJson(host, "/api/tags");
  const list = Array.isArray(tags?.models) ? tags.models : [];
  return {
    host,
    models: list.map((m) => ({
      name: String(m?.name || m?.model || ""),
      size: m?.size != null ? Number(m.size) : 0,
      digest: String(m?.digest || ""),
      modified_at: String(m?.modified_at || ""),
    })),
  };
});

ipcMain.handle("ollama-delete", async (_event, payload) => {
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!name) {
    throw new Error("请指定要删除的模型名");
  }
  const s = readOllamaSettings();
  const host = normalizeOllamaHost(s.host);
  await ollamaFetchJson(host, "/api/delete", { method: "DELETE", body: { model: name } });
  return { ok: true };
});

ipcMain.handle("ollama-pull", async (event, payload) => {
  const name = typeof payload?.name === "string" ? payload.name.trim() : "";
  if (!name) {
    throw new Error("请填写要拉取的模型名（如 llama3.2 或 qwen2.5:7b）");
  }
  const s = readOllamaSettings();
  const host = normalizeOllamaHost(s.host);
  const url = `${host}/api/pull`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, stream: true }),
  });
  if (!res.ok) {
    const t = await res.text();
    const base = t || `HTTP ${res.status}`;
    if (
      /pull model manifest:\s*file does not exist/i.test(base) &&
      /qwen3-(asr|tts)/i.test(name)
    ) {
      throw new Error(
        `${base}\n（说明：qwen3-asr / qwen3-tts 不是 Ollama 官方库可直接 pull 的模型名。语音模型请在「本地模型部署 > 语音模型库」安装本地版本，或在「AI能力组合」配置云端网关模型。）`
      );
    }
    if (res.status === 412 && /gemma4/i.test(name)) {
      throw new Error(
        `${base}\n（Gemma 4 需较新 Ollama，请先升级到官方 0.20 及以上版本后再拉取 gemma4。）`
      );
    }
    throw new Error(base);
  }
  if (!res.body) {
    throw new Error("拉取失败：无响应流");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastStatus = "";
  let lastError = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const ln = line.trim();
      if (!ln) {
        continue;
      }
      let j = null;
      try {
        j = JSON.parse(ln);
      } catch {
        j = { raw: ln };
      }
      if (j && typeof j === "object") {
        if (typeof j.error === "string" && j.error.trim()) {
          lastError = j.error.trim();
        }
        if (typeof j.status === "string" && j.status) {
          lastStatus = j.status;
        }
        try {
          event.sender.send("ollama-pull-progress", j);
        } catch {
          /* window closed */
        }
      }
    }
  }
  if (lastError) {
    throw new Error(lastError);
  }
  return { ok: true, lastStatus };
});
}
module.exports = {
  readOllamaSettings,
  writeOllamaSettings,
  normalizeOllamaHost,
  buildOllamaNativeOptions,
  buildOllamaEmbedOptions,
  buildOllamaEmbedPayload,
  warmOllamaEmbedModel,
  OLLAMA_EMBED_KEEP_ALIVE,
  OLLAMA_EMBED_TIMEOUT_MS,
  fetchOllamaEmbedJson,
  fetchOllamaRunningModels,
  describeOllamaModelProcessor,
  inspectOllamaEmbedDevice,
  extractOllamaNativeChatUsage,
  ollamaFetchJson,
  runVoiceStep,
  parseLastJsonLine,
  resolveLocalQwen3AsrModelId,
  transcribeWithLocalQwen3Asr,
  buildOllamaHardwareRecommendPayload,
  buildCpuLocalLlmHintPayload,
  stripOpenAiV1BaseSuffix,
  isLikelyOllamaOpenAiBase,
  registerOllamaVoiceHandlers,
};

