/**
 * 本地模型部署：连接 Ollama，浏览内置模型库、拉取 / 删除本机模型，并可一键写入 AI 助手配置。
 */
function formatBytes(n) {
  const x = Number(n) || 0;
  if (x < 1024) {
    return `${x} B`;
  }
  if (x < 1024 * 1024) {
    return `${(x / 1024).toFixed(1)} KB`;
  }
  if (x < 1024 * 1024 * 1024) {
    return `${(x / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(x / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function inferModelScaleTag(name) {
  const s = String(name || "").toLowerCase();
  if (/(^|[\/:_\-.])qwen3-(asr|tts)([\/:_\-.]|$)/.test(s) || /(^|[\/:_\-.])(asr|tts)([\/:_\-.]|$)/.test(s)) {
    return { label: "语音模型", valueB: 0, isExpert: false };
  }
  const m = s.match(/(?:^|[:/_\-.])((?:e)?\d+(?:\.\d+)?)b(?:\b|[^a-z0-9])/i);
  if (m && m[1]) {
    const raw = m[1].toLowerCase();
    const n = Number(raw.replace(/^e/, ""));
    if (Number.isFinite(n) && n > 0) {
      return {
        label: `${raw.toUpperCase()} 级`,
        valueB: n,
        isExpert: raw.startsWith("e"),
      };
    }
  }
  const defaults = [
    { re: /^llama3\.3/, b: 70, label: "70B 级" },
    { re: /^llama3\.(1|2)|^llama3$/, b: 8, label: "8B 级" },
    { re: /^llama2/, b: 7, label: "7B 级" },
    { re: /^mixtral/, b: 8, label: "8x7B MoE" },
    { re: /^mistral-small/, b: 24, label: "24B 级" },
    { re: /^mistral|^codestral|^devstral/, b: 7, label: "7B 级" },
    { re: /^gemma4:e2b/, b: 2, label: "E2B 级" },
    { re: /^gemma4:e4b/, b: 4, label: "E4B 级" },
    { re: /^gemma4:26b/, b: 26, label: "26B 级" },
    { re: /^gemma4:31b/, b: 31, label: "31B 级" },
    { re: /^gemma4|^gemma3|^gemma2|^gemma/, b: 9, label: "9B 级" },
    { re: /^qwen3|^qwen2\.5|^qwen2|^qwen|^yi|^glm4/, b: 7, label: "7B 级" },
    { re: /^deepseek-r1|^deepseek-v3/, b: 70, label: "70B+ 级" },
    { re: /^deepseek-coder-v2|^deepseek-coder/, b: 16, label: "16B 级" },
    { re: /^phi4/, b: 14, label: "14B 级" },
    { re: /^phi3\.5|^phi3|^phi/, b: 4, label: "3-4B 级" },
    { re: /^tinyllama|^smollm2/, b: 1, label: "1B 级" },
    { re: /^command-r-plus/, b: 100, label: "100B+ 级" },
    { re: /^command-r/, b: 35, label: "35B 级" },
    { re: /^falcon3|^falcon2|^falcon/, b: 7, label: "7B 级" },
    { re: /^bge-|^nomic-embed|^mxbai-embed|^snowflake-arctic-embed/, b: 1, label: "Embedding" },
    { re: /vision|llava|bakllava|moondream|minicpm-v/, b: 7, label: "视觉多模态" },
  ];
  for (const d of defaults) {
    if (d.re.test(s)) {
      return { label: d.label, valueB: d.b, isExpert: /MoE|E\d+B/.test(d.label) };
    }
  }
  return { label: "参数待确认", valueB: 0, isExpert: false };
}

function estimateDownloadSize(name) {
  const s = String(name || "").toLowerCase();
  if (/(^|[\/:_\-.])qwen3-(asr|tts)([\/:_\-.]|$)/.test(s) || /(^|[\/:_\-.])(asr|tts)([\/:_\-.]|$)/.test(s)) {
    return "约 1-6 GB";
  }
  const scale = inferModelScaleTag(name);
  if (/embed|embedding|bge-|nomic-embed|mxbai-embed|snowflake-arctic-embed/.test(s)) {
    return "约 0.1-1 GB";
  }
  if (!scale.valueB) {
    return "体积待确认";
  }
  let factor = 0.62; // 常见 Q4 量化粗估
  if (/q8|int8/.test(s)) {
    factor = 1.05;
  } else if (/q6/.test(s)) {
    factor = 0.85;
  } else if (/q5/.test(s)) {
    factor = 0.73;
  } else if (/q3/.test(s)) {
    factor = 0.45;
  } else if (/fp16|f16|bf16/.test(s)) {
    factor = 2.0;
  }
  const gb = Math.max(0.2, scale.valueB * factor);
  if (gb < 1) {
    return `约 ${(gb * 1024).toFixed(0)} MB`;
  }
  if (gb < 10) {
    return `约 ${gb.toFixed(1)} GB`;
  }
  return `约 ${Math.round(gb)} GB`;
}

/**
 * 根据 Ollama 模型名（含 tag）推断常见厂商/系谱，用于模型库与本机列表展示。
 */
function inferOllamaModelVendor(fullName) {
  const raw = String(fullName || "").trim();
  const stem = raw.split(":")[0].trim().toLowerCase();
  const cloudHint = /:cloud|\bcloud\b|\bremote\b|\bapi\b/i.test(raw)
    ? "名称或标签含 cloud/remote 等时可能走厂商云端或代理路由，与纯本机权重不同。"
    : "";

  const rules = [
    {
      test: () => /^qwen2\.5vl|^qwen2\.5-vl|^qwen-vl|^qwen2-vl/.test(stem),
      label: "阿里巴巴（通义·多模态 / 视觉）",
      hint: "",
    },
    { test: () => /^qwen|^qvq|^codeqwen|^tongyi/.test(stem), label: "阿里巴巴（通义）", hint: "" },
    { test: () => /^deepseek/.test(stem), label: "DeepSeek", hint: "" },
    { test: () => /^llama|^codellama/.test(stem), label: "Meta（Llama）", hint: "" },
    { test: () => /^mistral|^mixtral|^codestral|^ministral|^pixtral|^devstral/.test(stem), label: "Mistral AI", hint: "" },
    {
      test: () => /^gemma4/.test(stem),
      label: "Google（Gemma 4）",
      hint: "建议 Ollama ≥ 0.20；常用标签：latest（默认）、e2b、e4b、26b、31b；详见 ollama.com/library/gemma4。",
    },
    { test: () => /^gemma/.test(stem), label: "Google（Gemma）", hint: "" },
    { test: () => /^phi|^smollm/.test(stem), label: "Microsoft", hint: "" },
    { test: () => /^command-|^embed-|^cohere/.test(stem) || stem === "aya", label: "Cohere", hint: "" },
    { test: () => /^minimax/.test(stem), label: "MiniMax", hint: "部分为厂商分发或云端路由模型，请核对 Ollama 模型卡。" },
    { test: () => /^glm|^chatglm|^cogview|^codegeex2/.test(stem), label: "智谱 AI", hint: "" },
    { test: () => stem === "yi" || stem.startsWith("yi-"), label: "零一万物", hint: "" },
    { test: () => /^internlm|^internvl/.test(stem), label: "书生·浦语（上海 AI Lab）", hint: "" },
    { test: () => /^falcon|^tiiuae/.test(stem), label: "TII（阿联酋）", hint: "" },
    { test: () => /^solar/.test(stem), label: "Upstage", hint: "" },
    { test: () => /^granite/.test(stem), label: "IBM", hint: "" },
    { test: () => /^stablelm|^stable-code/.test(stem), label: "Stability AI", hint: "" },
    { test: () => /^bge|^jina-embeddings|^multilingual-e5/.test(stem), label: "BAAI / 嵌入", hint: "" },
    { test: () => /^nomic/.test(stem), label: "Nomic AI", hint: "" },
    { test: () => /^mxbai/.test(stem), label: "Mixedbread", hint: "" },
    { test: () => /^snowflake/.test(stem), label: "Snowflake", hint: "" },
    { test: () => /^openchat/.test(stem), label: "OpenChat", hint: "" },
    { test: () => /^dbrx/.test(stem), label: "Databricks", hint: "" },
    { test: () => /^olmo|^olmoe/.test(stem), label: "Ai2（OLMo）", hint: "" },
    { test: () => /^jamba/.test(stem), label: "AI21 Labs", hint: "" },
    { test: () => /^hermes|^nous-|^wizard|^vicuna|^orca-|^neural-chat|^dolphin/.test(stem), label: "社区微调", hint: "多基于 Llama/Mistral 等开源基座" },
    { test: () => /^starcoder|^tinyllama|^codegeex/.test(stem), label: "BigCode / 社区", hint: "" },
    { test: () => /^llava|^bakllava|^moondream|^bunny/.test(stem), label: "LLaVA / 多模态视觉", hint: "" },
    { test: () => /^cogito/.test(stem), label: "Cogito", hint: "" },
    { test: () => /^gpt-oss|^gptoss/.test(stem), label: "开源 GPT 系", hint: "" },
  ];

  for (const r of rules) {
    if (r.test()) {
      const hint = [r.hint, cloudHint].filter(Boolean).join(" ");
      return { label: r.label, hint };
    }
  }
  return {
    label: "社区 / 未归类",
    hint: cloudHint || "以 Ollama 官方模型页或 Modelfile 为准",
  };
}

/** 内置库中无 tag 的条目：点击后预填为官方推荐的完整拉取名，减少歧义与失败重试。 */
function recommendedOllamaPullName(catalogName) {
  const s = String(catalogName || "").trim();
  if (!s || s.includes(":")) {
    return s;
  }
  return s;
}

function modelFamilyName(name) {
  return String(name || "").trim().toLowerCase().split(":")[0];
}

function getKnownParamVariants(name) {
  const family = modelFamilyName(name);
  const known = [
    { re: /^qwen3$/, variants: ["0.6B", "1.7B", "4B", "8B", "14B", "32B"] },
    { re: /^qwen2\.5$/, variants: ["0.5B", "1.5B", "3B", "7B", "14B", "32B", "72B"] },
    { re: /^qwen2$/, variants: ["0.5B", "1.5B", "7B", "72B"] },
    { re: /^llama3\.3$/, variants: ["70B"] },
    { re: /^llama3\.2$/, variants: ["1B", "3B"] },
    { re: /^llama3\.1$/, variants: ["8B", "70B"] },
    { re: /^llama3$/, variants: ["8B", "70B"] },
    { re: /^gemma4$/, variants: ["E2B", "E4B", "12B", "27B"] },
    { re: /^gemma3$/, variants: ["1B", "4B", "12B", "27B"] },
    { re: /^gemma2$/, variants: ["2B", "9B", "27B"] },
    { re: /^deepseek-r1$/, variants: ["7B", "14B", "32B", "70B"] },
    { re: /^deepseek-v3$/, variants: ["671B（MoE）"] },
    { re: /^deepseek-coder-v2|^deepseek-coder$/, variants: ["1.3B", "6.7B", "16B", "33B"] },
    { re: /^phi4$/, variants: ["14B"] },
    { re: /^phi3\.5$/, variants: ["3.8B"] },
    { re: /^phi3$/, variants: ["3.8B", "14B"] },
    { re: /^mistral-small$/, variants: ["24B"] },
    { re: /^mistral$/, variants: ["7B"] },
    { re: /^mixtral$/, variants: ["8x7B", "8x22B"] },
  ];
  for (const row of known) {
    if (row.re.test(family)) {
      return row.variants;
    }
  }
  return [];
}

function normalizeVariantTag(label) {
  const txt = String(label || "")
    .toLowerCase()
    .replace(/（.*?）/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, "");
  if (!txt) {
    return "";
  }
  if (txt.includes("moe")) {
    return "";
  }
  if (/^\d+(?:\.\d+)?b$/.test(txt)) {
    return txt;
  }
  if (/^e\d+(?:\.\d+)?b$/.test(txt)) {
    return txt;
  }
  if (/^\d+x\d+b$/.test(txt)) {
    return txt;
  }
  return "";
}

function getKnownInstallVariants(name) {
  const base = String(name || "").trim();
  if (!base || base.includes(":")) {
    return [];
  }
  return getKnownParamVariants(base)
    .map((label) => {
      const tag = normalizeVariantTag(label);
      if (!tag) {
        return null;
      }
      return {
        label,
        pullName: `${base}:${tag}`,
      };
    })
    .filter(Boolean);
}

/** Gemma 4 在库内的展示顺序（与 Ollama 库常见档位一致）。 */
const GEMMA4_CATALOG_ORDER = ["gemma4:latest", "gemma4:31b", "gemma4:26b", "gemma4:e4b", "gemma4:e2b"];

/**
 * 将筛选后的库内模型名按 inferOllamaModelVendor().label 分组，供二级目录展示。
 */
function groupCatalogNamesByVendor(names) {
  const map = new Map();
  for (const name of names) {
    const v = inferOllamaModelVendor(name);
    if (!map.has(v.label)) {
      map.set(v.label, { label: v.label, items: [] });
    }
    map.get(v.label).items.push(name);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    if (g.label === "Google（Gemma 4）") {
      g.items.sort((a, b) => {
        const ia = GEMMA4_CATALOG_ORDER.indexOf(a);
        const ib = GEMMA4_CATALOG_ORDER.indexOf(b);
        if (ia !== -1 && ib !== -1) {
          return ia - ib;
        }
        if (ia !== -1) {
          return -1;
        }
        if (ib !== -1) {
          return 1;
        }
        return a.localeCompare(b);
      });
    } else {
      g.items.sort((a, b) => a.localeCompare(b));
    }
  }
  groups.sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  return groups;
}

function openAiBaseFromOllamaHost(hostRaw) {
  const h = String(hostRaw || "").trim().replace(/\/+$/, "");
  if (!h) {
    return "http://127.0.0.1:11434/v1";
  }
  const withProto = /^https?:\/\//i.test(h) ? h : `http://${h}`;
  return withProto.endsWith("/v1") ? withProto : `${withProto}/v1`;
}

function initLocalModels() {
  const api = window.electronAPI;
  const overviewView = document.getElementById("localModelsOverviewView");
  const catalogView = document.getElementById("localModelsCatalogView");
  const inferenceView = document.getElementById("localModelsInferenceView");
  const subnavBtns = document.querySelectorAll(".local-models-subnav-btn[data-local-view]");
  const hostInput = document.getElementById("ollamaHostInput");
  const saveHostBtn = document.getElementById("ollamaSaveHostBtn");
  const pingBtn = document.getElementById("ollamaPingBtn");
  const refreshLocalBtn = document.getElementById("ollamaRefreshLocalBtn");
  const openApiDocsBtn = document.getElementById("ollamaOpenApiDocsBtn");
  const statusLine = document.getElementById("ollamaStatusLine");
  const inferenceStatusLine = document.getElementById("ollamaInferenceStatusLine");
  const catalogStatusLine = document.getElementById("ollamaCatalogStatusLine");
  const overviewStatusBadge = document.getElementById("ollamaOverviewStatusBadge");
  const overviewModelCount = document.getElementById("ollamaOverviewModelCount");
  const overviewCpuBrand = document.getElementById("ollamaOverviewCpuBrand");
  const overviewLogicalCores = document.getElementById("ollamaOverviewLogicalCores");
  const overviewPlatform = document.getElementById("ollamaOverviewPlatform");
  const overviewSuggestedThread = document.getElementById("ollamaOverviewSuggestedThread");
  const overviewTipsList = document.getElementById("ollamaOverviewTipsList");
  const catalogSearch = document.getElementById("ollamaCatalogSearch");
  const catalogList = document.getElementById("ollamaCatalogList");
  const catalogRecommendBtn = document.getElementById("ollamaCatalogRecommendBtn");
  const modelLibraryTypeSelect = document.getElementById("modelLibraryTypeSelect");
  const localInstalledCard = document.getElementById("localInstalledCard");
  const localList = document.getElementById("ollamaLocalList");
  const pullNameInput = document.getElementById("ollamaPullNameInput");
  const pullBtn = document.getElementById("ollamaPullBtn");
  const deleteBtn = document.getElementById("ollamaDeleteBtn");
  const pullLog = document.getElementById("ollamaPullLog");
  const applyAiBtn = document.getElementById("ollamaApplyAiProfileBtn");
  const cpuHintBox = document.getElementById("ollamaCpuHintBox");
  const recommendPanel = document.getElementById("ollamaRecommendPanel");
  const recommendSummary = document.getElementById("ollamaRecommendSummary");
  const recommendList = document.getElementById("ollamaRecommendList");
  const recommendPullAllBtn = document.getElementById("ollamaRecommendPullAllBtn");
  const recommendCloseBtn = document.getElementById("ollamaRecommendCloseBtn");
  const recommendNotesHost = document.getElementById("ollamaRecommendNotesHost");

  if (!hostInput || !api || typeof api.getOllamaSettings !== "function") {
    return;
  }

  let activeLocalView = "overview";

  function syncSubnavActive(view) {
    subnavBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-local-view") === view);
    });
  }

  function hideLocalViews() {
    [overviewView, catalogView, inferenceView].forEach((el) => {
      if (!el) {
        return;
      }
      el.hidden = true;
      el.classList.remove("is-active");
    });
  }

  function showLocalView(view) {
    activeLocalView = view;
    hideLocalViews();
    syncSubnavActive(view);
    const map = {
      overview: overviewView,
      catalog: catalogView,
      inference: inferenceView,
    };
    const target = map[view] || overviewView;
    if (target) {
      target.hidden = false;
      target.classList.add("is-active");
    }
  }

  window.showLocalModelsView = showLocalView;
  window.focusLocalModelsInference = async () => {
    showLocalView("inference");
    await loadInferencePanel();
    try {
      document.getElementById("ollamaInferenceDevice")?.focus?.();
    } catch {
      /* ignore */
    }
  };

  function activeStatusLine() {
    if (activeLocalView === "catalog") {
      return catalogStatusLine;
    }
    if (activeLocalView === "inference") {
      return inferenceStatusLine || statusLine;
    }
    return statusLine;
  }

  function setOverviewStatusBadge(ok, text) {
    if (!overviewStatusBadge) {
      return;
    }
    overviewStatusBadge.textContent = text;
    overviewStatusBadge.classList.remove("is-ok", "is-err", "is-unknown");
    if (ok === true) {
      overviewStatusBadge.classList.add("is-ok");
    } else if (ok === false) {
      overviewStatusBadge.classList.add("is-err");
    } else {
      overviewStatusBadge.classList.add("is-unknown");
    }
  }

  function renderOverviewEnvironment(h) {
    if (!h) {
      return;
    }
    if (overviewCpuBrand) {
      overviewCpuBrand.textContent = h.cpuBrand || "—";
    }
    if (overviewLogicalCores) {
      overviewLogicalCores.textContent = String(h.logicalProcessors || "—");
    }
    if (overviewPlatform) {
      overviewPlatform.textContent = `${h.arch || "—"} / ${h.platform || "—"}`;
    }
    if (overviewSuggestedThread) {
      const snippet = String(h.envSnippet || "").trim();
      overviewSuggestedThread.innerHTML = snippet ? `<code>${snippet}</code>` : "—";
    }
    if (overviewTipsList) {
      overviewTipsList.innerHTML = "";
      const tips = Array.isArray(h.tips) && h.tips.length ? h.tips : ["建议在 AVX2 平台使用 Ollama（x64）", "建议 Q4_K_M / Q5 等较小量化模型", "token 延迟与内存占用更低"];
      tips.forEach((tip) => {
        const li = document.createElement("li");
        li.textContent = tip;
        overviewTipsList.appendChild(li);
      });
    }
  }

  async function renderCpuLocalLlmHint() {
    if (!cpuHintBox || typeof api.getCpuLocalLlmHint !== "function") {
      return;
    }
    try {
      const h = await api.getCpuLocalLlmHint();
      cpuHintBox.innerHTML = "";
      const title = document.createElement("h4");
      title.textContent = "当前 CPU 与本地大模型（Ollama）适配";
      cpuHintBox.appendChild(title);
      const meta = document.createElement("div");
      meta.className = "local-ollama-cpu-meta";
      const vendorLabel =
        h.cpuVendor === "intel"
          ? "英特尔"
          : h.cpuVendor === "amd"
            ? "AMD"
            : h.cpuVendor === "apple"
              ? "Apple"
              : "未知厂商";
      meta.textContent = `${vendorLabel} · ${h.cpuBrand} · ${h.logicalProcessors} 逻辑处理器 · ${h.arch} / ${h.platform}`;
      cpuHintBox.appendChild(meta);
      const envP = document.createElement("p");
      envP.appendChild(document.createElement("strong")).textContent = "建议为 Ollama 设置：";
      const code = document.createElement("code");
      code.textContent = h.envSnippet || "";
      envP.appendChild(code);
      envP.appendChild(
        document.createTextNode(
          "（环境变量需保存后重启 Ollama；本应用内对话可在「推理算力设置」页签按请求写入 num_thread / num_gpu，一般无需重启服务。）"
        )
      );
      cpuHintBox.appendChild(envP);
      const ul = document.createElement("ul");
      (h.tips || []).forEach((t) => {
        const li = document.createElement("li");
        li.textContent = t;
        ul.appendChild(li);
      });
      cpuHintBox.appendChild(ul);
      cpuHintBox.hidden = true;
      renderOverviewEnvironment(h);
    } catch {
      cpuHintBox.hidden = true;
      cpuHintBox.textContent = "";
      if (overviewTipsList) {
        overviewTipsList.innerHTML = "<li>暂无法读取本机 CPU 适配建议。</li>";
      }
    }
  }

  const inferenceDeviceEl = document.getElementById("ollamaInferenceDevice");
  const numThreadRange = document.getElementById("ollamaNumThreadRange");
  const numThreadInput = document.getElementById("ollamaNumThreadInput");
  const threadHint = document.getElementById("ollamaThreadHint");
  const threadUseSuggestedBtn = document.getElementById("ollamaThreadUseSuggestedBtn");
  const threadClearFixedBtn = document.getElementById("ollamaThreadClearFixedBtn");
  const saveInferenceBtn = document.getElementById("ollamaSaveInferenceBtn");

  let suggestedNumThread = 8;
  let logicalMaxThreads = 64;
  /** @type {number|null} 已写入 ollama-settings 的固定线程；null 表示自动模式下不写入 num_thread */
  let savedThreadNullable = null;

  function clampThreadVal(n, max) {
    const lim = Math.max(1, max || 1);
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x)) {
      return 1;
    }
    return Math.min(Math.max(1, x), lim);
  }

  function syncThreadInputsFromValues(val, max) {
    const v = clampThreadVal(val, max);
    if (numThreadRange) {
      numThreadRange.value = String(v);
    }
    if (numThreadInput) {
      numThreadInput.value = String(v);
    }
  }

  function updateInferenceThreadHint() {
    if (!threadHint) {
      return;
    }
    const max = Number(numThreadRange?.max) || logicalMaxThreads || 64;
    const draft = clampThreadVal(numThreadInput?.value ?? numThreadRange?.value, max);
    const dev = inferenceDeviceEl?.value || "gpu";
    const fixed =
      savedThreadNullable != null
        ? `已保存 num_thread=${savedThreadNullable}（点「保存推理设置」可更新）。`
        : dev === "auto"
          ? "未固定 num_thread：自动模式下由 Ollama 决定并行度（下方滑块仅作参考，保存后将写入固定值）。"
          : "未单独保存线程数：请求中将使用本机建议值；可点「保存推理设置」固定为滑块数值。";
    threadHint.textContent = `当前 ${draft} / ${max} 逻辑核，建议 ${suggestedNumThread} 线程。可点击保存以固定为默认值。${fixed ? ` ${fixed}` : ""}`;
  }

  async function loadInferencePanel() {
    if (!inferenceDeviceEl || typeof api.getOllamaSettings !== "function") {
      return;
    }
    try {
      const s = await api.getOllamaSettings();
      suggestedNumThread = s.suggestedNumThread || 8;
      logicalMaxThreads = Math.max(1, s.logicalProcessors || 8);
      savedThreadNullable = s.numThread != null && Number.isFinite(Number(s.numThread)) ? Math.floor(Number(s.numThread)) : null;
      inferenceDeviceEl.value = s.inferenceDevice || "gpu";
      if (numThreadRange) {
        numThreadRange.min = "1";
        numThreadRange.max = String(logicalMaxThreads);
      }
      if (numThreadInput) {
        numThreadInput.min = "1";
        numThreadInput.max = String(logicalMaxThreads);
      }
      const display = savedThreadNullable != null ? savedThreadNullable : suggestedNumThread;
      syncThreadInputsFromValues(display, logicalMaxThreads);
      updateInferenceThreadHint();
    } catch {
      /* ignore */
    }
  }

  let catalogNames = [];
  const runtimeSyncedCatalogNames = new Set();
  /** 非空表示从主进程拉取内置清单失败（与 Ollama 是否在线无关） */
  let catalogLoadError = "";
  let selectedCatalogName = "";
  let selectedLocalName = "";
  let pullUnsub = null;
  let catalogFilter = "";
  /** @type {{ model: string, reason: string }[]} */
  let lastRecommendItems = [];
  let pullBusy = false;
  let voiceCatalog = [];
  let voiceStatuses = {};
  let currentLibraryType = "ollama";
  let selectedVoiceItemId = "";
  let recommendedCatalogNameSet = null;

  function normalizeVoiceFamily(item) {
    const explicit = String(item?.family || "").trim();
    if (explicit) {
      return explicit;
    }
    const name = String(item?.name || "").trim();
    return name.replace(/[（(].*?[）)]/g, "").replace(/-\d+(?:\.\d+)?B/gi, "").trim() || name;
  }

  function voiceVersionLabel(item) {
    const explicit = String(item?.version || "").trim();
    if (explicit) {
      return explicit;
    }
    const m = String(item?.name || "").match(/(\d+(?:\.\d+)?B)/i);
    return m ? m[1].toUpperCase() : "默认";
  }

  function buildVoiceCatalogGroups(items) {
    const groups = new Map();
    items.forEach((item) => {
      const key = item.type === "asr" ? "语音识别（ASR）" : "语音合成（TTS）";
      if (!groups.has(key)) {
        groups.set(key, new Map());
      }
      const families = groups.get(key);
      const family = normalizeVoiceFamily(item);
      if (!families.has(family)) {
        families.set(family, []);
      }
      families.get(family).push(item);
    });
    return groups;
  }

  function installedVoiceItems() {
    return voiceCatalog.filter((item) => item && item.installable && voiceStatuses[item.id]?.installed);
  }

  function renderVoiceInstalledList() {
    if (!localList) {
      return;
    }
    localList.innerHTML = "";
    const rows = installedVoiceItems();
    if (!rows.length) {
      const empty = document.createElement("li");
      empty.textContent = "（暂无已安装语音模型）";
      empty.style.cursor = "default";
      localList.appendChild(empty);
      return;
    }
    rows.forEach((item) => {
      const li = document.createElement("li");
      li.dataset.name = item.id || item.name || "";
      const left = document.createElement("div");
      left.className = "local-ollama-local-primary";
      const nameRow = document.createElement("div");
      nameRow.className = "local-ollama-local-name-row";
      const nameEl = document.createElement("span");
      nameEl.className = "local-ollama-model-name";
      nameEl.textContent = item.name || item.id || "";
      const badge = document.createElement("span");
      badge.className = "local-ollama-vendor-badge";
      badge.textContent = item.type === "asr" ? "ASR" : "TTS";
      nameRow.appendChild(nameEl);
      nameRow.appendChild(badge);
      left.appendChild(nameRow);
      li.appendChild(left);
      li.addEventListener("click", () => {
        selectedVoiceItemId = item.id;
        selectedCatalogName = "";
        selectedLocalName = "";
        renderCatalogList();
        if (pullNameInput) {
          pullNameInput.value = item.name || item.id || "";
        }
      });
      localList.appendChild(li);
    });
  }

  if (typeof api.onVoiceLibraryInstallProgress === "function") {
    api.onVoiceLibraryInstallProgress((data) => {
      if (!data || typeof data !== "object") {
        return;
      }
      const line = String(data.line || "").trim();
      if (line) {
        appendLog(line);
      }
    });
  }

  function setStatus(text, kind) {
    const line = activeStatusLine();
    if (!line) {
      return;
    }
    line.textContent = text || "";
    line.classList.remove("is-ok", "is-err");
    if (kind === "ok") {
      line.classList.add("is-ok");
    } else if (kind === "err") {
      line.classList.add("is-err");
    }
  }

  async function refreshOverviewStatus() {
    try {
      const st = await api.getOllamaStatus();
      if (st.ok) {
        setOverviewStatusBadge(true, "● 运行中");
        if (overviewModelCount) {
          overviewModelCount.textContent = `已连接 ${st.modelCount || 0} 个模型`;
        }
      } else {
        setOverviewStatusBadge(false, "● 未连接");
        if (overviewModelCount) {
          overviewModelCount.textContent = "—";
        }
      }
    } catch {
      setOverviewStatusBadge(false, "● 检测失败");
      if (overviewModelCount) {
        overviewModelCount.textContent = "—";
      }
    }
  }

  function appendLog(line) {
    if (!pullLog) {
      return;
    }
    const t = String(line || "").trimEnd();
    pullLog.textContent = (pullLog.textContent ? `${pullLog.textContent}\n` : "") + t;
    pullLog.scrollTop = pullLog.scrollHeight;
  }

  function clearLog() {
    if (pullLog) {
      pullLog.textContent = "";
    }
  }

  function setVoiceStatus(text, kind) {
    setStatus(text, kind);
  }

  async function applyVoiceModelToCapability(item) {
    const target = String(item?.applyTarget || "");
    const model = String(item?.applyModel || "").trim();
    if (!target || !model) {
      throw new Error("该模型项缺少可写入的目标配置。");
    }
    if (target === "asr") {
      const cur = await api.getASRSettings();
      await api.setASRSettings({
        baseUrl: cur?.baseUrl || "",
        model,
        language: cur?.language || "",
        prompt: cur?.prompt || "",
        preserveKey: true,
      });
      return "已写入 ASR 模型配置";
    }
    if (target === "tts") {
      const cur = await api.getTTSSettings();
      const local = String(item?.source || "").toLowerCase() === "local-python" || String(model).startsWith("local:");
      await api.setTTSSettings({
        provider: local ? "local" : "cloud",
        baseUrl: cur?.baseUrl || "",
        model,
        voice: cur?.voice || "",
        preserveKey: true,
      });
      return local ? "已写入 TTS 模型配置（本地）" : "已写入 TTS 模型配置（云端）";
    }
    throw new Error("不支持的写入目标");
  }

  function renderVoiceCatalog() {
    if (!catalogList) {
      return;
    }
    catalogList.innerHTML = "";
    const deployableVoiceCatalog = voiceCatalog.filter((x) => x && x.installable);
    if (!deployableVoiceCatalog.length) {
      const empty = document.createElement("div");
      empty.className = "local-ollama-catalog-empty";
      empty.textContent = "（暂无可本地部署的语音模型）";
      catalogList.appendChild(empty);
      return;
    }
    const q = catalogFilter.trim().toLowerCase();
    const filteredVoiceItems = [];
    deployableVoiceCatalog.forEach((x) => {
      const label = `${x.name || ""} ${x.description || ""} ${x.type || ""} ${x.source || ""}`.toLowerCase();
      if (q && !label.includes(q)) {
        return;
      }
      filteredVoiceItems.push(x);
    });
    const groups = buildVoiceCatalogGroups(filteredVoiceItems);
    if (!groups.size) {
      const empty = document.createElement("div");
      empty.className = "local-ollama-catalog-empty";
      empty.textContent = q ? "（无匹配的语音模型，请清空筛选或换关键词）" : "（暂无可展示语音模型）";
      catalogList.appendChild(empty);
      return;
    }
    Array.from(groups.entries()).forEach(([title, items]) => {
      const det = document.createElement("details");
      det.className = "local-ollama-catalog-group";
      det.open = true;
      const summ = document.createElement("summary");
      summ.className = "local-ollama-catalog-group-summary";
      const titleEl = document.createElement("span");
      titleEl.className = "local-ollama-catalog-group-title";
      titleEl.textContent = title;
      const countEl = document.createElement("span");
      countEl.className = "local-ollama-catalog-group-count";
      const total = Array.from(items.values()).reduce((n, arr) => n + arr.length, 0);
      countEl.textContent = `${total} 个可选`;
      summ.appendChild(titleEl);
      summ.appendChild(countEl);
      det.appendChild(summ);

      const ul = document.createElement("ul");
      ul.className = "local-ollama-catalog-variants";
      Array.from(items.entries()).forEach(([familyName, variants]) => {
        variants.sort((a, b) => voiceVersionLabel(a).localeCompare(voiceVersionLabel(b), "en"));
        const activeVariant = variants.find((v) => v.id === selectedVoiceItemId) || variants[0];
        const li = document.createElement("li");
        const head = document.createElement("div");
        head.className = "local-ollama-catalog-row";
        const nameEl = document.createElement("span");
        nameEl.className = "local-ollama-model-name";
        nameEl.textContent = familyName;
        head.appendChild(nameEl);
        li.appendChild(head);

        if (activeVariant?.description) {
          const desc = document.createElement("div");
          desc.className = "field-hint";
          desc.textContent = activeVariant.description;
          li.appendChild(desc);
        }
        if (activeVariant?.id === selectedVoiceItemId) {
          li.classList.add("is-selected");
        }
        if (variants.length > 1) {
          const picker = document.createElement("div");
          picker.className = "local-ollama-variant-picker";
          const select = document.createElement("select");
          select.className = "local-ollama-variant-select";
          variants.forEach((v) => {
            const opt = document.createElement("option");
            opt.value = v.id;
            const size = String(v.sizeHint || "").trim();
            const ver = voiceVersionLabel(v);
            opt.textContent = size ? `${ver}（${size}）` : ver;
            select.appendChild(opt);
          });
          select.value = activeVariant.id;
          select.addEventListener("click", (ev) => {
            ev.stopPropagation();
          });
          select.addEventListener("change", (ev) => {
            ev.stopPropagation();
            selectedVoiceItemId = String(select.value || "").trim();
            selectedCatalogName = "";
            selectedLocalName = "";
            renderVoiceCatalog();
            const chosen = variants.find((v) => v.id === selectedVoiceItemId);
            if (pullNameInput) {
              pullNameInput.value = chosen?.name || selectedVoiceItemId;
            }
          });
          picker.appendChild(select);
          li.appendChild(picker);
        }
        li.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectedVoiceItemId = activeVariant.id;
          selectedCatalogName = "";
          selectedLocalName = "";
          renderVoiceCatalog();
          if (pullNameInput) {
            pullNameInput.value = activeVariant.name || activeVariant.id || "";
          }
        });
        ul.appendChild(li);
      });
      det.appendChild(ul);
      catalogList.appendChild(det);
    });
  }

  async function loadVoiceLibraryCatalog() {
    if (typeof api.getVoiceLibraryCatalog !== "function") {
      voiceCatalog = [];
      renderVoiceCatalog();
      setVoiceStatus("当前版本暂不支持语音模型库。", "err");
      return;
    }
    try {
      const out = await api.getVoiceLibraryCatalog();
      voiceCatalog = Array.isArray(out?.items) ? out.items.slice() : [];
      renderVoiceCatalog();
    } catch (e) {
      voiceCatalog = [];
      renderVoiceCatalog();
      setVoiceStatus(`语音模型库加载失败：${e.message || e}`, "err");
    }
  }

  async function refreshVoiceLibraryStatus() {
    if (typeof api.getVoiceLibraryStatus !== "function") {
      return;
    }
    try {
      const out = await api.getVoiceLibraryStatus();
      voiceStatuses = out?.statuses && typeof out.statuses === "object" ? out.statuses : {};
      renderVoiceCatalog();
      if (currentLibraryType === "voice") {
        renderVoiceInstalledList();
      }
      setVoiceStatus("语音模型库状态已刷新。", "ok");
    } catch (e) {
      setVoiceStatus(`状态刷新失败：${e.message || e}`, "err");
    }
  }

  function selectedVoiceItem() {
    return voiceCatalog.find((x) => x.id === selectedVoiceItemId) || null;
  }

  function applyLibraryModeUi() {
    const voice = currentLibraryType === "voice";
    if (catalogSearch) {
      catalogSearch.placeholder = voice ? "筛选语音模型名、类型或用途…" : "筛选库内模型名或厂家…";
    }
    if (localInstalledCard) {
      localInstalledCard.hidden = false;
    }
    if (deleteBtn) {
      deleteBtn.hidden = voice;
    }
    if (pullBtn) {
      pullBtn.textContent = voice ? "拉取到本机（语音）" : "拉取到本机";
    }
    if (pullNameInput) {
      pullNameInput.placeholder = voice ? "请先在上方语音模型库选择要安装的模型" : "例如 llama3.2 或 qwen2.5:7b";
    }
    if (applyAiBtn) {
      applyAiBtn.textContent = voice
        ? "将当前选择写入 AI 能力配置（ASR/TTS）"
        : "将当前拉取名加入 AI 模型配置（Ollama）";
    }
    if (catalogRecommendBtn) {
      catalogRecommendBtn.hidden = voice;
      catalogRecommendBtn.textContent = recommendedCatalogNameSet ? "显示全部模型" : "检测推荐模型";
    }
    if (voice) {
      if (recommendPanel) {
        recommendPanel.hidden = true;
      }
      renderVoiceInstalledList();
    } else {
      void refreshLocalModels();
    }
    renderCatalogList();
  }

  async function loadSettingsToUi() {
    try {
      const s = await api.getOllamaSettings();
      hostInput.value = (s && s.host) || "http://127.0.0.1:11434";
    } catch (e) {
      hostInput.value = "http://127.0.0.1:11434";
      setStatus(`读取设置失败：${e.message || e}`, "err");
    }
  }

  async function loadCatalog() {
    catalogLoadError = "";
    try {
      if (typeof api.getOllamaLibraryCatalog !== "function") {
        throw new Error("当前环境缺少模型库接口（请使用最新桌面安装包）");
      }
      const res = await api.getOllamaLibraryCatalog();
      catalogNames = Array.isArray(res?.models) ? res.models.slice() : [];
      catalogNames.sort((a, b) => a.localeCompare(b));
      if (!catalogNames.length) {
        catalogLoadError = "主进程返回的模型清单为空";
      }
    } catch (e) {
      catalogNames = [];
      catalogLoadError = e?.message || String(e);
    }
    renderCatalogList();
  }

  function renderOllamaCatalogList() {
    if (!catalogList) {
      return;
    }
    const q = catalogFilter.trim().toLowerCase();
    catalogList.innerHTML = "";
    const source = Array.isArray(catalogNames)
      ? catalogNames.filter((n) => !recommendedCatalogNameSet || recommendedCatalogNameSet.has(n))
      : [];
    const filtered = source.filter((n) => {
      if (!q) {
        return true;
      }
      const low = n.toLowerCase();
      const v = inferOllamaModelVendor(n);
      return low.includes(q) || v.label.toLowerCase().includes(q);
    });
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "local-ollama-catalog-empty";
      if (catalogLoadError) {
        empty.textContent = `模型库：${catalogLoadError}。仍可在下方「拉取模型名」中手动输入名称。`;
      } else if (recommendedCatalogNameSet && !source.length) {
        empty.textContent = "（当前硬件推荐集为空，请点击“显示全部模型”查看完整可安装模型）";
      } else if (q) {
        empty.textContent = "（无匹配的库内模型，请清空筛选或换关键词）";
      } else if (!catalogNames.length) {
        empty.textContent = "（库内清单未加载：请使用带桌面桥接的安装版并更新到最新；若已是最新版请重启应用。）";
      } else {
        empty.textContent = "（无匹配的库内模型）";
      }
      catalogList.appendChild(empty);
      return;
    }
    const groups = groupCatalogNamesByVendor(filtered);
    for (const g of groups) {
      const det = document.createElement("details");
      det.className = "local-ollama-catalog-group";
      det.open = true;
      const summ = document.createElement("summary");
      summ.className = "local-ollama-catalog-group-summary";
      const titleEl = document.createElement("span");
      titleEl.className = "local-ollama-catalog-group-title";
      titleEl.textContent = g.label;
      const countEl = document.createElement("span");
      countEl.className = "local-ollama-catalog-group-count";
      countEl.textContent = `${g.items.length} 个可选`;
      summ.appendChild(titleEl);
      summ.appendChild(countEl);
      const hint0 = g.items.length ? inferOllamaModelVendor(g.items[0]).hint : "";
      if (hint0) {
        summ.title = hint0;
      }
      det.appendChild(summ);
      const innerUl = document.createElement("ul");
      innerUl.className = "local-ollama-catalog-variants";
      for (const name of g.items) {
        const li = document.createElement("li");
        const installVariants = getKnownInstallVariants(name);
        const activePullName =
          installVariants.find((v) => v.pullName === selectedCatalogName)?.pullName || installVariants[0]?.pullName || name;
        const row = document.createElement("div");
        row.className = "local-ollama-catalog-row";
        const nameEl = document.createElement("span");
        nameEl.className = "local-ollama-model-name";
        nameEl.textContent = name;
        const metaWrap = document.createElement("span");
        metaWrap.className = "local-ollama-catalog-meta-wrap";
        const sizeEl = document.createElement("span");
        sizeEl.className = "local-ollama-catalog-size";
        sizeEl.textContent = estimateDownloadSize(activePullName);
        const scale = inferModelScaleTag(activePullName);
        const scaleEl = document.createElement("span");
        scaleEl.className = "local-ollama-catalog-scale";
        scaleEl.textContent = scale.label;
        if (runtimeSyncedCatalogNames.has(name)) {
          const newEl = document.createElement("span");
          newEl.className = "local-ollama-catalog-new";
          newEl.textContent = "新";
          metaWrap.appendChild(newEl);
        }
        metaWrap.appendChild(scaleEl);
        metaWrap.appendChild(sizeEl);
        row.appendChild(nameEl);
        row.appendChild(metaWrap);
        li.appendChild(row);
        if (installVariants.length) {
          const picker = document.createElement("div");
          picker.className = "local-ollama-variant-picker";
          const select = document.createElement("select");
          select.className = "local-ollama-variant-select";
          installVariants.forEach((v) => {
            const opt = document.createElement("option");
            opt.value = v.pullName;
            opt.textContent = `${v.label}（${estimateDownloadSize(v.pullName)}）`;
            select.appendChild(opt);
          });
          select.value = activePullName;
          select.addEventListener("click", (ev) => {
            ev.stopPropagation();
          });
          select.addEventListener("change", (ev) => {
            ev.stopPropagation();
            const value = String(select.value || "").trim();
            if (!value) {
              return;
            }
            selectedCatalogName = value;
            selectedLocalName = "";
            syncLocalSelectionClass();
            renderCatalogList();
            if (pullNameInput) {
              pullNameInput.value = value;
            }
          });
          picker.appendChild(select);
          li.appendChild(picker);
        }
        if (name === selectedCatalogName || selectedCatalogName.startsWith(`${name}:`)) {
          li.classList.add("is-selected");
        }
        li.addEventListener("click", (ev) => {
          ev.stopPropagation();
          selectedCatalogName = activePullName;
          selectedLocalName = "";
          syncLocalSelectionClass();
          renderCatalogList();
          if (pullNameInput) {
            pullNameInput.value = activePullName;
          }
        });
        innerUl.appendChild(li);
      }
      det.appendChild(innerUl);
      catalogList.appendChild(det);
    }
  }

  function renderCatalogList() {
    if (currentLibraryType === "voice") {
      renderVoiceCatalog();
      return;
    }
    renderOllamaCatalogList();
  }

  function syncLocalSelectionClass() {
    if (!localList) {
      return;
    }
    localList.querySelectorAll("li").forEach((li) => {
      li.classList.toggle("is-selected", li.dataset.name === selectedLocalName);
    });
  }

  async function refreshLocalModels(options = {}) {
    const force = options && options.force === true;
    if (currentLibraryType === "voice" && !force) {
      return;
    }
    if (!localList) {
      return;
    }
    setStatus("正在读取本机模型列表…", "");
    try {
      const res = await api.listOllamaLocalModels();
      if (currentLibraryType === "voice" && !force) {
        return;
      }
      localList.innerHTML = "";
      const rows = Array.isArray(res?.models) ? res.models : [];
      let catalogChanged = false;
      for (const m of rows) {
        const n = String(m?.name || "").trim();
        if (!n) {
          continue;
        }
        if (!catalogNames.includes(n)) {
          catalogNames.push(n);
          runtimeSyncedCatalogNames.add(n);
          catalogChanged = true;
        }
      }
      if (catalogChanged) {
        catalogNames.sort((a, b) => a.localeCompare(b));
        renderCatalogList();
      }
      if (!rows.length) {
        const empty = document.createElement("li");
        empty.textContent = "（暂无已安装模型）";
        empty.style.cursor = "default";
        localList.appendChild(empty);
        setStatus(`已连接 ${res.host || ""}，本机尚未安装模型。`, "ok");
        return;
      }
      rows.forEach((m) => {
        const name = m.name || "";
        if (!name) {
          return;
        }
        const li = document.createElement("li");
        li.dataset.name = name;
        const left = document.createElement("div");
        left.className = "local-ollama-local-primary";
        const nameRow = document.createElement("div");
        nameRow.className = "local-ollama-local-name-row";
        const nameEl = document.createElement("span");
        nameEl.className = "local-ollama-model-name";
        nameEl.textContent = name;
        const badge = document.createElement("span");
        badge.className = "local-ollama-vendor-badge";
        const v = inferOllamaModelVendor(name);
        badge.textContent = v.label;
        if (v.hint) {
          badge.title = v.hint;
        }
        nameRow.appendChild(nameEl);
        nameRow.appendChild(badge);
        left.appendChild(nameRow);
        const meta = document.createElement("span");
        meta.className = "local-ollama-model-meta";
        meta.textContent = formatBytes(m.size);
        li.appendChild(left);
        li.appendChild(meta);
        li.addEventListener("click", () => {
          selectedLocalName = name;
          selectedCatalogName = "";
          renderCatalogList();
          syncLocalSelectionClass();
          if (pullNameInput) {
            pullNameInput.value = name;
          }
        });
        localList.appendChild(li);
      });
      syncLocalSelectionClass();
      setStatus(`已连接 ${res.host || ""}，本机共 ${rows.length} 个模型。`, "ok");
    } catch (e) {
      if (currentLibraryType === "voice" && !force) {
        return;
      }
      localList.innerHTML = "";
      const err = document.createElement("li");
      err.textContent = e.message || String(e);
      err.style.cursor = "default";
      localList.appendChild(err);
      setStatus(`读取失败：${e.message || e}`, "err");
    }
  }

  async function ping() {
    setStatus("正在检测 Ollama 服务…", "");
    setOverviewStatusBadge(null, "检测中");
    try {
      const st = await api.getOllamaStatus();
      if (st.ok) {
        setStatus(`已连接 ${st.host} · 版本 ${st.version || "未知"} · 本机已安装 ${st.modelCount} 个模型`, "ok");
        setOverviewStatusBadge(true, "● 运行中");
        if (overviewModelCount) {
          overviewModelCount.textContent = `已连接 ${st.modelCount || 0} 个模型`;
        }
      } else {
        setStatus(`无法连接 ${st.host}：${st.error || "未知错误"}`, "err");
        setOverviewStatusBadge(false, "● 未连接");
        if (overviewModelCount) {
          overviewModelCount.textContent = "—";
        }
      }
    } catch (e) {
      setStatus(`检测失败：${e.message || e}`, "err");
      setOverviewStatusBadge(false, "● 检测失败");
      if (overviewModelCount) {
        overviewModelCount.textContent = "—";
      }
    }
  }

  saveHostBtn?.addEventListener("click", async () => {
    try {
      await api.setOllamaSettings({ host: hostInput.value.trim() });
      setStatus("服务地址已保存。", "ok");
      await ping();
      await loadInferencePanel();
    } catch (e) {
      setStatus(`保存失败：${e.message || e}`, "err");
    }
  });

  inferenceDeviceEl?.addEventListener("change", () => {
    updateInferenceThreadHint();
  });

  numThreadRange?.addEventListener("input", () => {
    const max = Number(numThreadRange.max) || logicalMaxThreads;
    const v = clampThreadVal(numThreadRange.value, max);
    if (numThreadInput) {
      numThreadInput.value = String(v);
    }
    updateInferenceThreadHint();
  });

  numThreadInput?.addEventListener("input", () => {
    const max = Number(numThreadInput.max) || logicalMaxThreads;
    const v = clampThreadVal(numThreadInput.value, max);
    if (numThreadRange) {
      numThreadRange.value = String(v);
    }
    updateInferenceThreadHint();
  });

  threadUseSuggestedBtn?.addEventListener("click", () => {
    syncThreadInputsFromValues(suggestedNumThread, logicalMaxThreads);
    updateInferenceThreadHint();
  });

  threadClearFixedBtn?.addEventListener("click", async () => {
    try {
      await api.setOllamaSettings({
        host: hostInput.value.trim(),
        clearNumThread: true,
      });
      setStatus("已清除固定线程数（自动模式下由 Ollama 决定）。", "ok");
      await loadInferencePanel();
    } catch (e) {
      setStatus(`清除失败：${e.message || e}`, "err");
    }
  });

  saveInferenceBtn?.addEventListener("click", async () => {
    try {
      const max = Number(numThreadInput?.max) || logicalMaxThreads;
      const v = clampThreadVal(numThreadInput?.value ?? numThreadRange?.value, max);
      await api.setOllamaSettings({
        host: hostInput.value.trim(),
        inferenceDevice: inferenceDeviceEl?.value || "gpu",
        numThread: v,
      });
      setStatus("推理算力设置已保存（对 AI 对话与知识库向量嵌入下次起生效）。", "ok");
      await loadInferencePanel();
    } catch (e) {
      setStatus(`保存失败：${e.message || e}`, "err");
    }
  });

  pingBtn?.addEventListener("click", () => {
    void ping();
  });

  refreshLocalBtn?.addEventListener("click", () => {
    void (async () => {
      await loadCatalog();
      await refreshLocalModels();
      await loadVoiceLibraryCatalog();
      await refreshVoiceLibraryStatus();
      renderCatalogList();
    })();
  });

  modelLibraryTypeSelect?.addEventListener("change", () => {
    currentLibraryType = modelLibraryTypeSelect.value === "voice" ? "voice" : "ollama";
    catalogFilter = "";
    if (catalogSearch) {
      catalogSearch.value = "";
    }
    if (currentLibraryType === "voice") {
      setStatus("已切换到语音模型库。请先选择模型，再使用「拉取到本机（语音）」安装。", "ok");
    } else {
      setStatus("已切换到 Ollama 模型库。", "ok");
    }
    applyLibraryModeUi();
  });

  catalogSearch?.addEventListener("input", () => {
    catalogFilter = catalogSearch.value || "";
    renderCatalogList();
  });

  async function runPullModel(modelName) {
    const name = String(modelName || "").trim();
    if (!name) {
      appendLog("模型名为空，跳过。");
      return;
    }
    if (pullBusy) {
      appendLog("已有拉取任务进行中，请稍候再试。");
      return;
    }
    if (typeof api.pullOllamaModel !== "function") {
      appendLog("当前环境不支持拉取模型。");
      return;
    }
    pullBusy = true;
    if (typeof pullUnsub === "function") {
      pullUnsub();
      pullUnsub = null;
    }
    appendLog(`开始拉取：${name}`);
    if (pullBtn) {
      pullBtn.disabled = true;
    }
    if (deleteBtn) {
      deleteBtn.disabled = true;
    }
    if (recommendPullAllBtn) {
      recommendPullAllBtn.disabled = true;
    }
    recommendList?.querySelectorAll(".local-ollama-recommend-pull-one").forEach((b) => {
      b.disabled = true;
    });
    pullUnsub = api.onOllamaPullProgress((data) => {
      if (!data || typeof data !== "object") {
        return;
      }
      if (data.error) {
        appendLog(`错误：${data.error}`);
        return;
      }
      const parts = [];
      if (data.status) {
        parts.push(data.status);
      }
      if (data.digest) {
        parts.push(`digest ${String(data.digest).slice(0, 16)}…`);
      }
      if (data.completed != null && data.total != null) {
        parts.push(`${data.completed}/${data.total}`);
      }
      if (parts.length) {
        appendLog(parts.join(" · "));
      }
    });
    try {
      await api.pullOllamaModel({ name });
      appendLog(`拉取完成：${name}`);
      await refreshLocalModels();
    } catch (e) {
      const msg = e.message || String(e);
      appendLog(`拉取失败：${name} · ${msg}`);
      if (/412|precondition|upgrade|version|too old|unsupported/i.test(msg)) {
        appendLog(
          "提示：若为 Gemma 4 等新模型，请将 Ollama 升级到较新版本（官方建议 0.20+）后重试拉取。"
        );
      }
    } finally {
      if (typeof pullUnsub === "function") {
        pullUnsub();
        pullUnsub = null;
      }
      if (pullBtn) {
        pullBtn.disabled = false;
      }
      if (deleteBtn) {
        deleteBtn.disabled = false;
      }
      if (recommendPullAllBtn) {
        recommendPullAllBtn.disabled = false;
      }
      recommendList?.querySelectorAll(".local-ollama-recommend-pull-one").forEach((b) => {
        b.disabled = false;
      });
      pullBusy = false;
    }
  }

  async function runVoiceInstallModel(item) {
    if (!item || !item.id) {
      appendLog("请先在语音模型库中选择模型。");
      return;
    }
    if (!item.installable) {
      appendLog(`该模型无需本地安装：${item.name || item.id}。请使用下方写入按钮同步到 AI 能力配置。`);
      return;
    }
    if (pullBusy) {
      appendLog("已有安装任务进行中，请稍候再试。");
      return;
    }
    if (typeof api.installVoiceLibraryItem !== "function") {
      appendLog("当前客户端版本不支持语音模型安装接口。");
      return;
    }
    pullBusy = true;
    if (pullBtn) {
      pullBtn.disabled = true;
    }
    if (deleteBtn) {
      deleteBtn.disabled = true;
    }
    if (recommendPullAllBtn) {
      recommendPullAllBtn.disabled = true;
    }
    recommendList?.querySelectorAll(".local-ollama-recommend-pull-one").forEach((b) => {
      b.disabled = true;
    });
    appendLog(`开始安装语音模型：${item.name || item.id}`);
    try {
      await api.installVoiceLibraryItem({ id: item.id });
      await refreshVoiceLibraryStatus();
      appendLog(`安装完成：${item.name || item.id}`);
      setVoiceStatus(`语音模型安装完成：${item.name || item.id}`, "ok");
    } catch (e) {
      const msg = e.message || String(e);
      appendLog(`安装失败：${item.name || item.id} · ${msg}`);
      setVoiceStatus(`语音模型安装失败：${msg}`, "err");
    } finally {
      if (pullBtn) {
        pullBtn.disabled = false;
      }
      if (deleteBtn) {
        deleteBtn.disabled = false;
      }
      if (recommendPullAllBtn) {
        recommendPullAllBtn.disabled = false;
      }
      recommendList?.querySelectorAll(".local-ollama-recommend-pull-one").forEach((b) => {
        b.disabled = false;
      });
      pullBusy = false;
      renderCatalogList();
    }
  }

  pullBtn?.addEventListener("click", async () => {
    clearLog();
    if (currentLibraryType === "voice") {
      const item = selectedVoiceItem();
      await runVoiceInstallModel(item);
      return;
    }
    const name = (pullNameInput?.value || "").trim();
    if (!name) {
      appendLog("请先填写或选择要拉取的模型名。");
      return;
    }
    await runPullModel(name);
  });

  recommendCloseBtn?.addEventListener("click", () => {
    if (recommendPanel) {
      recommendPanel.hidden = true;
    }
  });

  recommendPullAllBtn?.addEventListener("click", async () => {
    if (!lastRecommendItems.length) {
      appendLog("暂无推荐项，请先点击「检测推荐模型」。");
      return;
    }
    const n = lastRecommendItems.length;
    if (!confirm(`将按顺序拉取 ${n} 个推荐模型，耗时与磁盘占用较大，是否继续？`)) {
      return;
    }
    clearLog();
    appendLog(`一键顺序拉取：共 ${n} 个模型…`);
    for (const row of lastRecommendItems) {
      await runPullModel(row.model);
    }
    appendLog("一键拉取序列已全部尝试结束。");
  });

  catalogRecommendBtn?.addEventListener("click", async () => {
    if (recommendedCatalogNameSet) {
      recommendedCatalogNameSet = null;
      applyLibraryModeUi();
      setStatus("已恢复展示全部可安装模型。", "ok");
      return;
    }
    if (typeof api.getOllamaHardwareRecommend !== "function") {
      alert("当前客户端版本过旧，缺少「本机评估」接口，请重新安装/更新。");
      return;
    }
    catalogRecommendBtn.disabled = true;
    lastRecommendItems = [];
    if (recommendPanel) {
      recommendPanel.hidden = false;
    }
    if (recommendSummary) {
      recommendSummary.textContent = "正在评估本机硬件（内存、CPU、显卡）…";
    }
    if (recommendList) {
      recommendList.innerHTML = "";
    }
    if (recommendNotesHost) {
      recommendNotesHost.innerHTML = "";
    }
    try {
      const data = await api.getOllamaHardwareRecommend();
      const s = data.summary || {};
      const tierLabel = escapeHtmlAttr(data.tierLabel || "");
      const tierKey = escapeHtmlAttr(data.tier || "");
      const score = s.score != null ? escapeHtmlAttr(String(s.score)) : "";
      const cpuLine = `${escapeHtmlAttr(s.cpuBrand || "未知")} · ${escapeHtmlAttr(String(s.logicalProcessors ?? ""))} 逻辑线程 · 内存总计约 ${escapeHtmlAttr(String(s.totalRamGb ?? ""))} GB（空闲约 ${escapeHtmlAttr(String(s.freeRamGb ?? ""))} GB）`;
      let gpuLine = "未检测到可用显存读数（集显、驱动或虚拟机环境常见）。";
      if (Array.isArray(s.gpus) && s.gpus.length) {
        gpuLine = s.gpus
          .map((g) => {
            const gn = escapeHtmlAttr(g.name || "");
            const vg = Number(g.vramGb) || 0;
            return vg > 0 ? `${gn}（约 ${vg} GB 显存）` : gn;
          })
          .join("；");
      }
      if (recommendSummary) {
        recommendSummary.innerHTML = `<strong>推荐档位：${tierLabel}</strong>（${tierKey}） · 综合分约 ${score}<br/><span class="local-ollama-recommend-meta">CPU：${cpuLine}<br/>显卡：${gpuLine}</span>`;
      }
      lastRecommendItems = Array.isArray(data.items) ? data.items.filter((x) => x && x.model) : [];
      recommendedCatalogNameSet = new Set(lastRecommendItems.map((x) => String(x.model || "").trim()).filter(Boolean));
      if (!recommendedCatalogNameSet.size) {
        recommendedCatalogNameSet = null;
      }
      if (recommendList) {
        lastRecommendItems.forEach((row) => {
          const li = document.createElement("li");
          const wrap = document.createElement("div");
          wrap.className = "local-ollama-recommend-row";
          const text = document.createElement("div");
          text.className = "local-ollama-recommend-text";
          const mEl = document.createElement("span");
          mEl.className = "local-ollama-recommend-model";
          mEl.textContent = row.model;
          const rEl = document.createElement("span");
          rEl.className = "local-ollama-recommend-reason";
          rEl.textContent = row.reason || "";
          text.appendChild(mEl);
          text.appendChild(rEl);
          const oneBtn = document.createElement("button");
          oneBtn.type = "button";
          oneBtn.className = "local-ollama-recommend-pull-one";
          oneBtn.textContent = "拉取";
          oneBtn.title = `拉取 ${row.model}`;
          oneBtn.addEventListener("click", () => {
            if (pullNameInput) {
              pullNameInput.value = row.model;
            }
            void runPullModel(row.model);
          });
          wrap.appendChild(text);
          wrap.appendChild(oneBtn);
          li.appendChild(wrap);
          recommendList.appendChild(li);
        });
        if (!lastRecommendItems.length) {
          const li = document.createElement("li");
          li.textContent = "（未生成推荐项，请更新应用或检查内置模型库）";
          li.style.cursor = "default";
          recommendList.appendChild(li);
        }
        const notes = Array.isArray(data.notes) ? data.notes : [];
        if (notes.length && recommendNotesHost) {
          const noteUl = document.createElement("ul");
          noteUl.className = "local-ollama-recommend-notes";
          notes.forEach((t) => {
            const li = document.createElement("li");
            li.textContent = String(t || "");
            noteUl.appendChild(li);
          });
          recommendNotesHost.appendChild(noteUl);
        }
      }
      applyLibraryModeUi();
      if (recommendedCatalogNameSet) {
        setStatus(`本机评估完成：${data.tierLabel || ""}档，已筛选 ${recommendedCatalogNameSet.size} 个推荐模型。`, "ok");
      } else {
        setStatus("本机评估完成，但未产出推荐筛选，已保持展示全部模型。", "err");
      }
    } catch (e) {
      lastRecommendItems = [];
      recommendedCatalogNameSet = null;
      applyLibraryModeUi();
      if (recommendSummary) {
        recommendSummary.textContent = `评估失败：${e.message || e}`;
      }
      setStatus(`本机评估失败：${e.message || e}`, "err");
    } finally {
      catalogRecommendBtn.disabled = false;
    }
  });

  deleteBtn?.addEventListener("click", async () => {
    const name = (pullNameInput?.value || "").trim() || selectedLocalName;
    if (!name) {
      alert("请先在「本机已安装」中点选一项，或在「拉取模型名」中填写要删除的名称。");
      return;
    }
    if (!confirm(`确定从本机删除模型「${name}」？此操作不可撤销。`)) {
      return;
    }
    try {
      await api.deleteOllamaModel({ name });
      setStatus(`已删除：${name}`, "ok");
      selectedLocalName = "";
      await refreshLocalModels();
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  applyAiBtn?.addEventListener("click", async () => {
    if (currentLibraryType === "voice") {
      const item = selectedVoiceItem();
      if (!item) {
        alert("请先在语音模型库中选择模型。");
        return;
      }
      try {
        const msg = await applyVoiceModelToCapability(item);
        setVoiceStatus(
          `${msg}：${item.applyModel || ""}（可在 AI能力组合 的 ${item.type === "asr" ? "ASR" : "TTS"} 面板查看）`,
          "ok"
        );
      } catch (e) {
        setVoiceStatus(`写入失败：${e.message || e}`, "err");
      }
      return;
    }
    const model = (pullNameInput?.value || "").trim();
    if (!model) {
      alert("请填写要用于对话的模型名（可与已安装名一致）。");
      return;
    }
    if (typeof api.saveAIProfile !== "function") {
      alert("当前环境不支持保存模型配置。");
      return;
    }
    const openAiBase = openAiBaseFromOllamaHost(hostInput.value.trim());
    try {
      await api.saveAIProfile({
        label: `${model}（Ollama）`,
        purpose: "本机 Ollama 推理",
        baseUrl: openAiBase,
        model,
      });
      setStatus(`已写入 AI 模型配置并切换为当前：${model} · ${openAiBase}`, "ok");
      document.dispatchEvent(new CustomEvent("refresh-ai-chat-profiles"));
      if (typeof window.openOrFocusTab === "function") {
        window.openOrFocusTab("ai");
      }
    } catch (e) {
      alert(e.message || String(e));
    }
  });

  window.onLocalModelsPanelVisible = async () => {
    showLocalView("overview");
    await loadSettingsToUi();
    void renderCpuLocalLlmHint();
    await loadInferencePanel();
    await loadCatalog();
    await ping();
    await refreshLocalModels();
    await loadVoiceLibraryCatalog();
    await refreshVoiceLibraryStatus();
    currentLibraryType = modelLibraryTypeSelect?.value === "voice" ? "voice" : "ollama";
    applyLibraryModeUi();
    await refreshOverviewStatus();
  };

  subnavBtns.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const view = btn.getAttribute("data-local-view");
      if (!view || view === activeLocalView) {
        return;
      }
      showLocalView(view);
      if (view === "overview") {
        await refreshOverviewStatus();
        void renderCpuLocalLlmHint();
        await ping();
      }
      if (view === "catalog") {
        await refreshLocalModels();
        await loadCatalog();
      }
      if (view === "inference") {
        await loadInferencePanel();
      }
    });
  });

  document.getElementById("localModelsOpenAiBtn")?.addEventListener("click", () => {
    if (typeof window.openOrFocusTab === "function") {
      window.openOrFocusTab("ai");
    }
  });

  openApiDocsBtn?.addEventListener("click", async () => {
    const host = String(hostInput?.value || "http://127.0.0.1:11434").trim().replace(/\/+$/, "");
    const url = /^https?:\/\//i.test(host) ? host : `http://${host}`;
    if (typeof api.runtimePrerequisitesOpenUrl === "function") {
      await api.runtimePrerequisitesOpenUrl({ url });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  });

  // 页签可见时轮询：发现新安装模型后自动并入模型库展示
  window.setInterval(() => {
    const capPanel = document.querySelector('.cap-panel[data-cap-panel="local-models"]');
    if (!capPanel || capPanel.hidden || activeLocalView !== "catalog") {
      return;
    }
    if (currentLibraryType !== "ollama") {
      return;
    }
    void refreshLocalModels();
  }, 25000);

  // 进入页签时才刷新连接状态，但内置模型库不依赖 Ollama；启动时即拉取清单，避免未触发 onLocalModelsPanelVisible 时列表一直空白
  currentLibraryType = modelLibraryTypeSelect?.value === "voice" ? "voice" : "ollama";
  applyLibraryModeUi();
  void loadCatalog();
  void loadVoiceLibraryCatalog();
}

initLocalModels();
