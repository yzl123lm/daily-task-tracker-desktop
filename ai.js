const AI_SYSTEM =
  "你是智能工作助手，擅长结合「任务列表摘要」做跟进、总结与建议；也具备通用问答能力。系统消息中会给出当前接口配置的模型标识，被问及时须如实引用。回答应信息充分、结构清晰、避免过度简略；当用户开启底栏「联网」后，系统消息中会附带客户端拉取的公开网页摘要，须结合摘要回答时事并提醒核实来源；不得声称自身无法联网。使用中文。\n\n" +
  "【回复排版规范】面向开发文档与软件说明场景，输出需正式严谨、术语统一、避免口语化。优先使用 1. / 1.1 / 1.1.1 连续编号标题，最多四级；段落保持短句（每段约 3-5 行）；步骤使用有序列表（1. 2. 3.），并列项使用无序列表（●）；涉及对比或参数时优先用表格。关键术语与阈值可使用**加粗**，避免过度装饰。标点统一中文全角。\n\n" +
  "【结构优先】默认采用“结论 -> 依据 -> 执行动作”结构；若信息不足，明确说明“已知/未知”并给出补充项。\n\n" +
  "【技能调用】用户可发送 /help 查看能力矩阵。涉及任务 CRUD、检索统计、risk_report（统一风险报告）、日报周报、看板/自定义报表（dashboard_snapshot、custom_report_generate）、任务模板（task_template_list）、文案润色、BGE 嵌入、kb_search、农历/黄历、export_word_desktop/export_pdf_desktop、task_export_excel 时，必须通过 function calling 执行。定位任务前先 task_list_snapshot。工具返回后简要说明结果。\n\n" +
  "【知识库 kb_search】接口文档：query 含 3.16 时须分别输出 3.16.1 请求与 3.16.2 响应（若 evidence 含两节）；字段表按小节独立，禁止用修订历史代替字段表；禁止虚构 outOrderId；禁止 {...} 占位。\n\n" +
  "【导出文件】若调用了 export_word_desktop 或 export_pdf_desktop，向用户说明保存位置时，**必须逐字使用工具返回 JSON 中的 filePath**，禁止自行猜测或拼写路径（例如不要默认写成 C:\\\\Users\\\\Administrator\\\\Desktop，真实桌面可能是 OneDrive 等重定向目录）。若工具返回 ok:false，不得声称已保存成功。\n\n" +
  "【公文 Word/PDF】导出函件/通知/终结函等时，content 用 Markdown：# 单位 ## 文种 ### 条款（### 后可无空格）；**加粗**；| 表格 |；不要用 ``` 包裹全文。用户要 PDF 时须调用 export_pdf_desktop（勿再说「仅支持 Word」）。点「导出 PDF」或单条助手长文导出时，客户端会按公文版式写入文件。";

function isHighLogicModeEnabled() {
  const getter = window.getSkillCatalog;
  const list = typeof getter === "function" ? getter() : [];
  if (!Array.isArray(list)) {
    return true;
  }
  const s = list.find((x) => x && x.id === "high-logic-mode");
  if (!s) {
    return true;
  }
  return s.status === "enabled";
}

const CONTEXT_MAX_CHARS = 12000;
const AI_KB_TOOL_TOGGLE_KEY = "daily_task_tracker_ai_kb_tool_enabled_v1";
const AI_LONG_MEMORY_ENABLED_KEY = "daily_task_tracker_ai_long_memory_enabled_v1";
const AI_LONG_MEMORY_ITEMS_KEY = "daily_task_tracker_ai_long_memory_items_v1";
const AI_LONG_MEMORY_MAX_ITEMS = 50;
const AI_LONG_MEMORY_CONTEXT_MAX = 3000;
const AI_SESSION_SUMMARY_KEY = "daily_task_tracker_ai_session_summary_v1";
const AI_SESSION_SUMMARY_MAX = 2000;

const AI_HELP_TEXT = `【智能工作助手 · 能力速览】
发送 /help 可随时查看本表。

| 能力 | 工具/操作 | 说明 |
|------|---------|------|
| 任务操作 | task_create / task_update / task_complete 等 | 登记、流转、备注；taskId 可自动生成 |
| 检索统计 | task_query / task_stats | 多条件筛选与汇总 |
| 风险报告 | risk_report（推荐）/ task_top_risks | 黄/橙/红分级 + TOP 风险 |
| 日报周报 | report_generate | daily / weekly |
| 任务导出 | task_export_excel | 导出 .xlsx 到桌面 |
| 数据看板 | dashboard_snapshot | 状态/负载/趋势聚合 |
| 自定义报表 | custom_report_generate | 按维度指标汇总 |
| 任务模板 | task_template_list | 登记页模板列表 |
| 跨会话摘要 | 系统自动注入 | 延续上轮对话语境 |
| 知识库 | kb_search | 需启用技能且已入库 |
| 文档导出 | export_word_desktop / export_pdf_desktop | 公文 Word/PDF |
| 农历黄历 | lunar_calendar_query / cnlunar_calendar_query | 后者需 pip install cnlunar |
| 长期记忆 | 底栏「长期记忆」开关；「管理记忆」可编辑 | 最多 50 条 |

排版：结论→依据→行动项；对比用表格。`;

function isAiKbToolEnabled() {
  try {
    const raw = localStorage.getItem(AI_KB_TOOL_TOGGLE_KEY);
    if (raw == null) {
      return false;
    }
    return raw === "1";
  } catch {
    return false;
  }
}

function setAiKbToolEnabled(next) {
  try {
    localStorage.setItem(AI_KB_TOOL_TOGGLE_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function isLongMemoryEnabled() {
  try {
    const raw = localStorage.getItem(AI_LONG_MEMORY_ENABLED_KEY);
    if (raw == null) {
      return true;
    }
    return raw === "1";
  } catch {
    return true;
  }
}

function setLongMemoryEnabled(next) {
  try {
    localStorage.setItem(AI_LONG_MEMORY_ENABLED_KEY, next ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readLongMemoryItems() {
  try {
    const raw = localStorage.getItem(AI_LONG_MEMORY_ITEMS_KEY);
    if (!raw) {
      return [];
    }
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) {
      return [];
    }
    return arr
      .map((x) => ({
        q: String(x?.q || "").trim(),
        a: String(x?.a || "").trim(),
        ts: String(x?.ts || ""),
      }))
      .filter((x) => x.q && x.a);
  } catch {
    return [];
  }
}

function writeLongMemoryItems(items) {
  try {
    localStorage.setItem(AI_LONG_MEMORY_ITEMS_KEY, JSON.stringify(items || []));
  } catch {
    /* ignore */
  }
}

function appendLongMemoryPair(q, a) {
  const qq = String(q || "").trim();
  const aa = String(a || "").trim();
  if (!qq || !aa) {
    return;
  }
  const list = readLongMemoryItems();
  list.push({ q: qq, a: aa, ts: new Date().toISOString() });
  while (list.length > AI_LONG_MEMORY_MAX_ITEMS) {
    list.shift();
  }
  writeLongMemoryItems(list);
}

function buildLongMemoryBlock() {
  if (!isLongMemoryEnabled()) {
    return "";
  }
  const list = readLongMemoryItems();
  if (!list.length) {
    return "";
  }
  const lines = list.slice(-24).map((x, i) => `- 记忆${i + 1} 问：${x.q}\n  答：${x.a}`);
  let out = lines.join("\n");
  if (out.length > AI_LONG_MEMORY_CONTEXT_MAX) {
    out = out.slice(out.length - AI_LONG_MEMORY_CONTEXT_MAX);
  }
  return out.trim();
}

function readSessionSummary() {
  try {
    return String(localStorage.getItem(AI_SESSION_SUMMARY_KEY) || "").trim();
  } catch {
    return "";
  }
}

function updateSessionSummary(userText, assistantText) {
  const u = String(userText || "").replace(/\s+/g, " ").trim().slice(0, 220);
  const a = String(assistantText || "").replace(/\s+/g, " ").trim().slice(0, 360);
  if (!u && !a) {
    return;
  }
  const prev = readSessionSummary();
  const line = `Q: ${u} → A: ${a}`;
  let next = prev ? `${prev}\n${line}` : line;
  if (next.length > AI_SESSION_SUMMARY_MAX) {
    next = next.slice(next.length - AI_SESSION_SUMMARY_MAX);
  }
  try {
    localStorage.setItem(AI_SESSION_SUMMARY_KEY, next);
  } catch {
    /* ignore */
  }
}

function buildSessionSummaryBlock() {
  return readSessionSummary();
}

function getActiveTools() {
  const getter = window.getAISkillTools;
  const list = typeof getter === "function" ? getter() : [];
  if (!Array.isArray(list) || !list.length) {
    return [];
  }
  if (isAiKbToolEnabled()) {
    return list;
  }
  return list.filter((t) => t?.function?.name !== "kb_search");
}

const QUICK_PROMPTS = {
  today: "根据「任务列表摘要」，总结今天的任务进展、重点待办与风险。",
  weekly: "根据「任务列表摘要」，生成本周工作周报（完成情况、进行中、下周计划）。",
  kb: "结合本地知识库与任务摘要，检索并回答我关心的问题；若知识库无相关内容请明确说明。",
  generate:
    "根据下方「任务列表摘要」，生成若干条合理的待办任务建议（可含优先级说明）。若摘要为空则说明无法生成。",
  daily: "根据「任务列表摘要」，整理今日工作日报要点（已完成、进行中、待办、风险）。",
  analyze: "分析当前任务的状态分布、可能风险与下一步建议。",
  polish: "请将用户随后提供的跟进或备注内容润色为更专业、简洁的表述；若用户未单独粘贴内容，则基于任务摘要给出通用润色示例。",
  search: "在「任务列表摘要」范围内检索并回答用户关心的信息；若摘要中无相关内容请明确说明。",
};

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightEscaped(text, query) {
  const raw = String(text);
  const needle = query.trim();
  if (!needle) {
    return escapeHtml(raw);
  }
  const re = new RegExp(escapeRegExp(needle), "gi");
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(raw)) !== null) {
    out += escapeHtml(raw.slice(last, m.index));
    out += `<mark class="ai-search-mark">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

/**
 * 去掉思维链 / 思考过程（MiniMax、```think、<redacted_thinking> 等），不展示、不参与 TTS、不进入后续多轮正文。
 */
function stripAssistantCoT(raw) {
  let s = String(raw ?? "");
  s = s.replace(/```(?:think|thinking)[\s\S]*?```/gi, "");
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, "");
  s = s.replace(/<\/?think\b[^>]*>/gi, "");
  s = s.replace(/\u200B/g, "");
  s = s.replace(/\n{3,}/g, "\n\n").trim();
  return s;
}

/** Ollama /api/chat 返回的 total_duration 等为纳秒 */
function formatOllamaNsDuration(ns) {
  const n = Number(ns);
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  const ms = n / 1e6;
  if (ms < 1) {
    return `${Math.round(n)} ns`;
  }
  if (ms < 1000) {
    return `${ms.toFixed(1)} ms`;
  }
  const s = n / 1e9;
  if (s < 60) {
    return `${s.toFixed(2)} 秒`;
  }
  const m = Math.floor(s / 60);
  const rs = s - m * 60;
  return `${m} 分 ${rs.toFixed(1)} 秒`;
}

function ollamaTokenDisplay(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    return "—";
  }
  return String(Math.round(n));
}

function ollamaUsageHasAny(u) {
  if (!u || typeof u !== "object") {
    return false;
  }
  const keys = [
    "prompt_eval_count",
    "eval_count",
    "total_duration_ns",
    "load_duration_ns",
    "prompt_eval_duration_ns",
    "eval_duration_ns",
  ];
  return keys.some((k) => {
    const n = Number(u[k]);
    return Number.isFinite(n) && n >= 0;
  });
}

function buildOllamaUsageDetailsEl(ollamaUsage) {
  const pe = Number(ollamaUsage.prompt_eval_count);
  const ec = Number(ollamaUsage.eval_count);
  const peOk = Number.isFinite(pe) && pe >= 0;
  const ecOk = Number.isFinite(ec) && ec >= 0;
  let totalStr = "—";
  if (peOk || ecOk) {
    totalStr = String(Math.round((peOk ? pe : 0) + (ecOk ? ec : 0)));
  }
  const details = document.createElement("details");
  details.className = "ai-ollama-usage";
  const summary = document.createElement("summary");
  summary.textContent = "运行效率情况查看";
  const grid = document.createElement("div");
  grid.className = "ai-ollama-usage-grid";
  const addRow = (label, value) => {
    const k = document.createElement("div");
    k.className = "ai-ollama-usage-k";
    k.textContent = label;
    const v = document.createElement("div");
    v.className = "ai-ollama-usage-v";
    v.textContent = value;
    grid.appendChild(k);
    grid.appendChild(v);
  };
  addRow("提问 Tokens", ollamaTokenDisplay(ollamaUsage.prompt_eval_count));
  addRow("回答 Tokens", ollamaTokenDisplay(ollamaUsage.eval_count));
  addRow("总消耗", totalStr);
  addRow("总耗时（端到端）", formatOllamaNsDuration(ollamaUsage.total_duration_ns));
  const ld = Number(ollamaUsage.load_duration_ns);
  if (Number.isFinite(ld) && ld >= 0) {
    addRow("模型加载时长", formatOllamaNsDuration(ld));
  }
  const ped = Number(ollamaUsage.prompt_eval_duration_ns);
  if (Number.isFinite(ped) && ped >= 0) {
    addRow("提示词评估时长", formatOllamaNsDuration(ped));
  }
  const ed = Number(ollamaUsage.eval_duration_ns);
  if (Number.isFinite(ed) && ed >= 0) {
    addRow("生成内容时长", formatOllamaNsDuration(ed));
  }
  details.appendChild(summary);
  details.appendChild(grid);
  return details;
}

function renderInlineRich(text) {
  let out = escapeHtml(String(text || ""));
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  return out;
}

function isLikelyTableLine(line) {
  const s = String(line || "").trim();
  return s.includes("|") && s.replace(/\|/g, "").trim().length > 0;
}

function splitTableRow(line) {
  const s = String(line || "").trim().replace(/^\|/, "").replace(/\|$/, "");
  return s.split("|").map((c) => c.trim());
}

function isPrimaryTableHeader(header, index) {
  const h = String(header || "").trim().toLowerCase();
  if (!h) {
    return index < 3;
  }
  const primaryRe =
    /(排名|名次|序号|rank|model|模型|发布方|厂商|provider|公司|参数|规模|size|版本|version|时间|date|名称|name)/i;
  if (primaryRe.test(h)) {
    return true;
  }
  return index < 3;
}

function renderRichAssistantHtml(rawText) {
  const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = String(raw || "").trim();
    if (!line) {
      i += 1;
      continue;
    }
    const mdH = line.match(/^(#{1,4})\s+(.+)$/);
    if (mdH) {
      const level = Math.max(1, Math.min(4, mdH[1].length));
      html.push(`<h${level + 1} class="ai-doc-h ai-doc-h-${level}">${renderInlineRich(mdH[2])}</h${level + 1}>`);
      i += 1;
      continue;
    }
    const numH = line.match(/^(\d+(?:\.\d+){0,3})\.?\s+(.+)$/);
    if (numH) {
      const level = Math.max(1, Math.min(4, numH[1].split(".").length));
      html.push(
        `<h${level + 1} class="ai-doc-h ai-doc-h-${level}"><span class="ai-doc-h-num">${escapeHtml(numH[1])}</span> ${renderInlineRich(
          numH[2]
        )}</h${level + 1}>`
      );
      i += 1;
      continue;
    }
    const ol = line.match(/^(\d+)\.\s+(.+)$/);
    if (ol) {
      const items = [];
      while (i < lines.length) {
        const m = String(lines[i] || "").trim().match(/^(\d+)\.\s+(.+)$/);
        if (!m) break;
        items.push(`<li>${renderInlineRich(m[2])}</li>`);
        i += 1;
      }
      html.push(`<ol class="ai-doc-ol">${items.join("")}</ol>`);
      continue;
    }
    const ul = line.match(/^[●\-\*]\s+(.+)$/);
    if (ul) {
      const items = [];
      while (i < lines.length) {
        const m = String(lines[i] || "").trim().match(/^[●\-\*]\s+(.+)$/);
        if (!m) break;
        items.push(`<li>${renderInlineRich(m[1])}</li>`);
        i += 1;
      }
      html.push(`<ul class="ai-doc-ul">${items.join("")}</ul>`);
      continue;
    }
    if (isLikelyTableLine(line) && i + 1 < lines.length && /^[\s|\-:]+$/.test(String(lines[i + 1] || "").trim())) {
      const headers = splitTableRow(lines[i]);
      const priorities = headers.map((h, idx) => (isPrimaryTableHeader(h, idx) ? "primary" : "secondary"));
      i += 2;
      const rows = [];
      while (i < lines.length && isLikelyTableLine(lines[i])) {
        rows.push(splitTableRow(lines[i]));
        i += 1;
      }
      const thead = `<thead><tr>${headers
        .map((h, idx) => `<th data-priority="${priorities[idx]}">${renderInlineRich(h)}</th>`)
        .join("")}</tr></thead>`;
      const tbody = `<tbody>${rows
        .map((r) => {
          const tds = r
            .map((c, idx) => {
              const label = headers[idx] || `列${idx + 1}`;
              const text = String(c || "").trim();
              return `<td data-label="${escapeHtmlAttr(label)}" data-priority="${priorities[idx] || "secondary"}" title="${escapeHtmlAttr(
                text
              )}">${renderInlineRich(c)}</td>`;
            })
            .join("");
          return `<tr>${tds}</tr>`;
        })
        .join("")}</tbody>`;
      html.push(`<div class="ai-doc-table-wrap"><table class="ai-doc-table">${thead}${tbody}</table></div>`);
      continue;
    }
    const para = [];
    while (i < lines.length) {
      const t = String(lines[i] || "").trim();
      if (!t) {
        i += 1;
        break;
      }
      if (
        /^(#{1,4})\s+/.test(t) ||
        /^(\d+(?:\.\d+){0,3})\.?\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^[●\-\*]\s+/.test(t) ||
        (isLikelyTableLine(t) && i + 1 < lines.length && /^[\s|\-:]+$/.test(String(lines[i + 1] || "").trim()))
      ) {
        break;
      }
      para.push(renderInlineRich(t));
      i += 1;
    }
    if (para.length) {
      html.push(`<p class="ai-doc-p">${para.join("<br/>")}</p>`);
      continue;
    }
    i += 1;
  }
  return html.join("");
}

function renderAssistantBodyElement(body, rawText, searchQuery) {
  body.dataset.rawText = rawText;
  body.innerHTML = "";
  const q = (searchQuery || "").trim();
  const text = String(rawText || "").trim();
  const div = document.createElement("div");
  div.className = "ai-msg-core-text";
  if (q) {
    div.innerHTML = highlightEscaped(text, q);
  } else {
    const richHtml = renderRichAssistantHtml(text);
    div.classList.add("ai-msg-core-rich");
    div.innerHTML = richHtml || escapeHtml(text);
  }
  body.appendChild(div);
}

function renderUserBodyElement(body, rawText, searchQuery) {
  body.dataset.rawText = rawText;
  const q = (searchQuery || "").trim();
  if (!q) {
    body.textContent = rawText;
  } else {
    body.innerHTML = highlightEscaped(rawText, searchQuery);
  }
  const docsRaw = String(body.dataset.userDocs || "").trim();
  if (!docsRaw) {
    return;
  }
  let docs = [];
  try {
    docs = JSON.parse(docsRaw);
  } catch {
    docs = [];
  }
  if (!Array.isArray(docs) || !docs.length) {
    return;
  }
  const docWrap = document.createElement("div");
  docWrap.className = "ai-msg-attachments";
  docs.forEach((d) => {
    const item = document.createElement("div");
    item.className = "ai-msg-attachment ai-msg-attachment--doc";
    const visual = docVisualFromExtName(d?.ext, d?.name);
    const iconEl = document.createElement("div");
    iconEl.className = `ai-msg-attachment-icon ai-doc-thumb-icon is-${visual.kind}`;
    iconEl.textContent = visual.badge;
    const infoEl = document.createElement("div");
    infoEl.className = "ai-msg-attachment-info";
    const nameEl = document.createElement("div");
    nameEl.className = "ai-msg-attachment-name";
    nameEl.textContent = d?.name || "未命名文档";
    const metaEl = document.createElement("div");
    metaEl.className = "ai-msg-attachment-meta";
    const st = String(d?.status || "").toLowerCase();
    metaEl.textContent = st === "ready" ? "已提取文本" : st === "error" ? String(d?.errorMsg || "解析失败") : "已附加";
    infoEl.appendChild(nameEl);
    infoEl.appendChild(metaEl);
    item.appendChild(iconEl);
    item.appendChild(infoEl);
    docWrap.appendChild(item);
  });
  body.appendChild(docWrap);
}

function truncate(s, max) {
  if (!s || s.length <= max) {
    return s;
  }
  return `${s.slice(0, max)}\n…（已截断）`;
}

let currentAssistantAudio = null;
let aiVoiceStream = null;
let aiVoiceRecorder = null;
let aiVoiceChunks = [];
let aiVoiceHolding = false;
let aiVoiceFinishing = false;
let aiVoiceMimeType = "audio/webm";
let aiVoiceStartAt = 0;
let aiVoiceAutoStopTimer = null;
const AI_VOICE_MIN_MS = 320;
const AI_VOICE_MAX_MS = 90 * 1000;

function stopAssistantAudioPlayback() {
  if (!currentAssistantAudio) {
    return;
  }
  try {
    currentAssistantAudio.pause();
    currentAssistantAudio.currentTime = 0;
  } catch (e) {
    console.warn("Stop assistant audio failed:", e);
  } finally {
    currentAssistantAudio = null;
  }
}

function stopAiVoiceCapture() {
  if (aiVoiceAutoStopTimer) {
    clearTimeout(aiVoiceAutoStopTimer);
    aiVoiceAutoStopTimer = null;
  }
  const rec = aiVoiceRecorder;
  aiVoiceRecorder = null;
  if (rec && rec.state !== "inactive") {
    try {
      rec.stop();
    } catch {
      /* ignore */
    }
  }
  if (aiVoiceStream) {
    try {
      aiVoiceStream.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
  }
  aiVoiceStream = null;
}

async function transcribeAiVoiceChunks(api) {
  if (!Array.isArray(aiVoiceChunks) || !aiVoiceChunks.length) {
    return "";
  }
  if (!api || typeof api.asrTranscribe !== "function") {
    throw new Error("当前环境不支持 ASR 接口。");
  }
  const mimeType = String(aiVoiceMimeType || "audio/webm").trim() || "audio/webm";
  const blob = new Blob(aiVoiceChunks, { type: mimeType });
  aiVoiceChunks = [];
  let outMime = blob.type || "audio/webm";
  let outBytes = new Uint8Array(await blob.arrayBuffer());
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await audioCtx.decodeAudioData(await blob.arrayBuffer());
    const sampleRate = decoded.sampleRate;
    const channels = Math.min(1, decoded.numberOfChannels);
    const pcm = decoded.getChannelData(0);
    const wavBuf = new ArrayBuffer(44 + pcm.length * 2);
    const view = new DataView(wavBuf);
    const writeStr = (offset, s) => {
      for (let i = 0; i < s.length; i += 1) {
        view.setUint8(offset + i, s.charCodeAt(i));
      }
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + pcm.length * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, pcm.length * 2, true);
    let o = 44;
    for (let i = 0; i < pcm.length; i += 1) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
    outMime = "audio/wav";
    outBytes = new Uint8Array(wavBuf);
    audioCtx.close().catch(() => {});
  } catch {
    /* fallback to original blob bytes */
  }
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < outBytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, outBytes.subarray(i, i + chunk));
  }
  const audioBase64 = btoa(bin);
  const ret = await api.asrTranscribe({
    audioBase64,
    mimeType: outMime,
    finalChunk: true,
  });
  return String(ret?.text || "").trim();
}

async function speakAssistantTextNow(api, rawText, { requireAuto = false } = {}) {
  if (!api || typeof api.getCapabilitySettings !== "function" || typeof api.ttsSpeak !== "function") {
    return;
  }
  const cap = await api.getCapabilitySettings();
  if (!cap?.ttsEnabled) {
    // 自动播报场景下，用户关闭语音能力时应静默跳过，不提示失败气泡。
    if (requireAuto) {
      return;
    }
    throw new Error("请先在「AI能力组合」中开启语音播报。");
  }
  if (requireAuto && !cap?.ttsSpeakOnAiReply) {
    return;
  }
  const text = stripTextForTts(rawText);
  if (!text) {
    return;
  }
  const { audioBase64, mimeType } = await api.ttsSpeak({ text });
  if (!audioBase64) {
    return;
  }
  const url = `data:${mimeType || "audio/mpeg"};base64,${audioBase64}`;
  stopAssistantAudioPlayback();
  const audio = new Audio(url);
  currentAssistantAudio = audio;
  audio.addEventListener("ended", () => {
    if (currentAssistantAudio === audio) {
      currentAssistantAudio = null;
    }
  });
  audio.addEventListener("error", () => {
    if (currentAssistantAudio === audio) {
      currentAssistantAudio = null;
    }
  });
  await audio.play();
}

/** 播报前去掉代码块、思考折叠、工具日志等，避免 TTS 读乱码 */
function stripTextForTts(raw) {
  let s = String(raw || "");
  s = s.replace(/```(?:think|thinking)[\s\S]*?```/gi, " ");
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, " ");
  s = s.replace(/```[\s\S]*?```/g, " ");
  s = s.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, " ");
  s = s.replace(/<\/?think\b[^>]*>/gi, " ");
  s = s.replace(/\[TOOL_CALL\][\s\S]*?\[\/TOOL_CALL\]/gi, " ");
  s = s.replace(/\[TOOL_CALL\][\s\S]*$/gi, " ");
  s = s.replace(/^#{1,6}\s+/gm, "");
  s = s.replace(/\*\*([^*]+)\*\*/g, "$1");
  s = s.replace(/`([^`]+)`/g, "$1");
  s = s.replace(/\s+/g, " ").trim();
  return truncate(s, 3500);
}

async function maybeSpeakAssistantReply(api, replyText) {
  if (!api || typeof api.getCapabilitySettings !== "function" || typeof api.ttsSpeak !== "function") {
    return;
  }
  try {
    await speakAssistantTextNow(api, replyText, { requireAuto: true });
  } catch (e) {
    const msg = String(e?.message || e || "");
    try {
      window.dispatchEvent(
        new CustomEvent("ai-tts-error", {
          detail: { message: msg || "自动语音播报失败（未知错误）" },
        }),
      );
    } catch {
      /* ignore event dispatch failure */
    }
    if (/usage limit exceeded|quota|配额|额度|限额/i.test(msg)) {
      try {
        const cap = await api.getCapabilitySettings();
        if (cap && cap.ttsSpeakOnAiReply && typeof api.setCapabilitySettings === "function") {
          await api.setCapabilitySettings({
            routingMode: cap.routingMode === "modular" ? "modular" : "unified",
            ttsEnabled: cap.ttsEnabled,
            ttsSpeakOnAiReply: false,
            imageGenEnabled: cap.imageGenEnabled,
            imageUnderstandEnabled: cap.imageUnderstandEnabled,
          });
          stopAssistantAudioPlayback();
        }
      } catch (muteErr) {
        console.warn("TTS auto disable failed:", muteErr);
      }
    }
  }
}

function buildTaskContext() {
  const getter = window.getTasksForAI;
  const list = typeof getter === "function" ? getter() : [];
  if (!Array.isArray(list) || list.length === 0) {
    return "（当前无任务记录）";
  }
  const lines = list.map((t, i) => {
    const id = t.taskId ?? t.id ?? "";
    const st = t.status ?? "";
    const ct = (t.content ?? "").replace(/\s+/g, " ").trim();
    const rp = (t.reporter ?? "").trim();
    const hd = (t.handler ?? "").trim();
    const rm = Array.isArray(t.remarks)
      ? t.remarks
          .map((r) => (r && r.content ? String(r.content) : ""))
          .filter(Boolean)
          .join("；")
      : "";
    const pr = (t.priority ?? "中").trim();
    const dl = (t.deadline ?? "").trim();
    return `${i + 1}. ID:${id} 状态:${st} 优先级:${pr}${dl ? ` 截止:${dl}` : ""} 登记:${rp} 处理:${hd} 内容:${ct}${rm ? ` 备注:${rm}` : ""}`;
  });
  return truncate(lines.join("\n"), CONTEXT_MAX_CHARS);
}

/** 单次发送内的对话请求 ID（传给主进程以支持中止当前 HTTP 请求） */
const aiComposeSession = { requestId: "", aborted: false };

function resetAiComposeSession() {
  const rid =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `ai-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  aiComposeSession.requestId = rid;
  aiComposeSession.aborted = false;
  return rid;
}

function markAiComposeAborted() {
  aiComposeSession.aborted = true;
}

function throwIfAiComposeAborted() {
  if (aiComposeSession.aborted) {
    const e = new Error("用户已取消生成");
    e.name = "AbortError";
    throw e;
  }
}

async function runChatWithTools(api, messages, firstOpts) {
  let msgs = messages;
  const maxRounds = 8;
  let lastRaw = null;
  let lastOllamaUsage = null;
  const requestId = String(firstOpts?.requestId || aiComposeSession.requestId || "").trim();
  for (let r = 0; r < maxRounds; r++) {
    throwIfAiComposeAborted();
    const webSearch = r === 0 && firstOpts.webSearch;
    const webSearchQuery = r === 0 ? firstOpts.webSearchQuery : "";
    const res = await api.aiChat({
      messages: msgs,
      tools: getActiveTools(),
      webSearch,
      webSearchQuery,
      tool_choice: "auto",
      requestId,
    });
    lastRaw = res.raw;
    if (res.ollamaUsage) {
      lastOllamaUsage = res.ollamaUsage;
    }
    const msg = lastRaw?.choices?.[0]?.message;
    if (!msg) {
      return { text: stripAssistantCoT(res.content || ""), raw: lastRaw, ollamaUsage: lastOllamaUsage };
    }
    const tcs = msg.tool_calls;
    if (!Array.isArray(tcs) || tcs.length === 0) {
      return { text: stripAssistantCoT(msg.content || ""), raw: lastRaw, ollamaUsage: lastOllamaUsage };
    }
    const assistantMsg = {
      role: "assistant",
      content: stripAssistantCoT(msg.content || "") || null,
      tool_calls: msg.tool_calls,
    };
    msgs = [...msgs, assistantMsg];
    for (const tc of tcs) {
      throwIfAiComposeAborted();
      const name = tc.function?.name;
      let args = {};
      try {
        args = JSON.parse(tc.function?.arguments || "{}");
      } catch {
        args = {};
      }
      const runner = window.runAITaskTool;
      let result =
        typeof runner === "function" ? runner(name, args) : { ok: false, error: "请在桌面版使用任务操作" };
      if (result && typeof result.then === "function") {
        result = await result;
      }
      msgs.push({
        role: "tool",
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      });
    }
  }
  const fallback =
    stripAssistantCoT(lastRaw?.choices?.[0]?.message?.content || "") || "（工具调用轮次过多，请简化诉求后重试）";
  return { text: fallback, raw: lastRaw, ollamaUsage: lastOllamaUsage };
}

const AI_PROVIDER_LIBRARY = [
  {
    id: "minimax",
    label: "MiniMax",
    baseUrl: "https://api.minimax.io/v1",
    models: [
      "MiniMax-M3",
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2",
      "M2-her",
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    models: [
      "deepseek-chat",
      "deepseek-reasoner",
      "deepseek-v3",
      "deepseek-v4-flash",
      "deepseek-v4-pro",
    ],
  },
  {
    id: "qwen",
    label: "通义千问（DashScope）",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: [
      "qwen-max",
      "qwen-plus",
      "qwen-turbo",
      "qwen3-max",
      "qwen2.5-72b-instruct",
    ],
  },
  {
    id: "moonshot",
    label: "月之暗面（Moonshot）",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  {
    id: "zhipu",
    label: "智谱（GLM）",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-air", "glm-4-long"],
  },
  {
    id: "baidu",
    label: "百度千帆",
    baseUrl: "https://qianfan.baidubce.com/v2",
    models: ["ernie-4.0-8k", "ernie-4.0-turbo-8k", "ernie-3.5-8k"],
  },
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini", "gpt-4.1-mini", "o4-mini"],
  },
  {
    id: "ollama",
    label: "Ollama（本地 OpenAI 兼容）",
    baseUrl: "http://127.0.0.1:11434/v1",
    models: [
      "llama3.2",
      "qwen2.5:7b",
      "deepseek-r1:8b",
      "phi3",
      "gemma2:9b",
      "mistral:7b",
      "codellama:7b",
    ],
  },
];

function getProviderById(id) {
  return AI_PROVIDER_LIBRARY.find((x) => x.id === id) || null;
}

function inferProviderId(baseUrl, model) {
  const bu = String(baseUrl || "").toLowerCase();
  const mv = String(model || "").trim();
  if (bu.includes("minimax")) return "minimax";
  if (bu.includes("deepseek")) return "deepseek";
  if (bu.includes("dashscope") || bu.includes("aliyuncs")) return "qwen";
  if (bu.includes("moonshot")) return "moonshot";
  if (bu.includes("bigmodel")) return "zhipu";
  if (bu.includes("qianfan") || bu.includes("baidubce")) return "baidu";
  if (bu.includes("openai")) return "openai";
  if (bu.includes(":11434") || /\bollama\b/.test(bu)) return "ollama";
  const byModel = AI_PROVIDER_LIBRARY.find((p) => p.models.includes(mv));
  return byModel ? byModel.id : "minimax";
}

function fillProviderOptions(providerEl) {
  if (!providerEl) return;
  providerEl.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = "请选择提供商";
  providerEl.appendChild(first);
  AI_PROVIDER_LIBRARY.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.label;
    providerEl.appendChild(opt);
  });
}

function fillModelOptions(modelEl, providerId, currentModel = "") {
  if (!modelEl) return;
  modelEl.innerHTML = "";
  if (!providerId) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "请先选择提供商";
    modelEl.appendChild(opt);
    return;
  }
  const provider = getProviderById(providerId);
  if (!provider) return;
  const picked = String(currentModel || "").trim();
  const listed = new Set(provider.models);
  const allModels = [...provider.models];
  if (picked && !listed.has(picked)) {
    allModels.unshift(picked);
  }
  allModels.forEach((m, idx) => {
    const opt = document.createElement("option");
    opt.value = m;
    opt.textContent = idx === 0 && picked && !listed.has(picked) ? `${m}（当前配置）` : m;
    modelEl.appendChild(opt);
  });
  if (picked) {
    modelEl.value = picked;
  } else if (provider.models[0]) {
    modelEl.value = provider.models[0];
  }
}

function profileCardMeta(profile) {
  const providerId = inferProviderId(profile.baseUrl, profile.model);
  const provider = getProviderById(providerId);
  const isLocal = providerId === "ollama" || /:11434\b|127\.0\.0\.1/.test(String(profile.baseUrl || ""));
  const providerShort = (provider?.label || providerId || "模型").split("（")[0].trim();
  const iconMap = {
    minimax: "MM",
    deepseek: "DS",
    qwen: "QW",
    moonshot: "MS",
    zhipu: "GL",
    baidu: "BD",
    openai: "OA",
    ollama: "Ol",
  };
  return {
    providerId,
    providerShort,
    hostType: isLocal ? "本地" : "云端",
    iconText: iconMap[providerId] || providerShort.slice(0, 2).toUpperCase() || "AI",
  };
}

function initAI() {
  const api = window.electronAPI;
  const fallback = document.getElementById("aiWebFallback");
  const main = document.getElementById("aiPanelMain");
  const chatLog = document.getElementById("aiChatLog");
  const emptyStateEl = document.getElementById("aiChatEmpty");
  const inputEl = document.getElementById("aiUserInput");
  const sendBtn = document.getElementById("aiSendBtn");
  const clearMemoryBtn = document.getElementById("aiClearMemoryBtn");
  const manageMemoryBtn = document.getElementById("aiManageMemoryBtn");
  const memoryManageDialog = document.getElementById("aiMemoryManageDialog");
  const memoryManageList = document.getElementById("aiMemoryManageList");
  const memoryManageCloseBtn = document.getElementById("aiMemoryManageCloseBtn");
  const openOllamaInferenceBtn = document.getElementById("aiOpenOllamaInferenceBtn");
  const topbarAi = document.getElementById("topbarAiBtn");
  const chatStatusEl = document.getElementById("aiChatStatus");
  const profileSelect = document.getElementById("aiProfileSelect");
  const webToggleBtn = document.getElementById("aiWebToggleBtn");
  const kbToggleBtn = document.getElementById("aiKbToggleBtn");
  const memoryToggleBtn = document.getElementById("aiMemoryToggleBtn");
  const voiceToggleBtn = document.getElementById("aiVoiceToggleBtn");
  const voiceInputBtn = document.getElementById("aiVoiceInputBtn");
  const modeChatBtn = document.getElementById("aiModeChatBtn");
  const modeImageGenBtn = document.getElementById("aiModeImageGenBtn");
  const modeImageVisionBtn = document.getElementById("aiModeImageVisionBtn");
  const modeCompactTrigger = document.getElementById("aiModeCompactTrigger");
  const modeCompactMenu = document.getElementById("aiModeCompactMenu");
  const modeCompactLabel = document.getElementById("aiModeCompactLabel");
  const composerPanel = document.getElementById("aiComposerPanel");
  const composerEl = document.getElementById("aiComposer");
  const profileTrigger = document.getElementById("aiProfileTrigger");
  const profileMenu = document.getElementById("aiProfileMenu");
  const profilePanelBody = document.getElementById("aiProfilePanelBody");
  const profileSearchInput = document.getElementById("aiProfileSearchInput");
  const profileManageBtn = document.getElementById("aiProfileManageBtn");
  const profileTabButtons = Array.from(document.querySelectorAll("[data-profile-tab]"));
  let profilePanelTab = "cloud";
  let profileSearchFilter = "";
  const visionAttachBar = document.getElementById("aiVisionAttachBar");
  const visionThumbRow = document.getElementById("aiVisionThumbRow");
  const docWorkspace = document.getElementById("aiDocWorkspace");
  const docMainCol = document.getElementById("aiDocMainCol");
  const docSplitHandle = document.getElementById("aiDocSplitHandle");
  const docPreviewPane = document.getElementById("aiDocPreviewPane");
  const docPreviewSelect = document.getElementById("aiDocPreviewSelect");
  const docZoomOutBtn = document.getElementById("aiDocZoomOutBtn");
  const docZoomResetBtn = document.getElementById("aiDocZoomResetBtn");
  const docZoomInBtn = document.getElementById("aiDocZoomInBtn");
  const docPreviewContent = document.getElementById("aiDocPreviewContent");
  const docPreviewCloseBtn = document.getElementById("aiDocPreviewCloseBtn");
  const docPreviewFrame = document.getElementById("aiDocPreviewFrame");
  const docPreviewImage = document.getElementById("aiDocPreviewImage");
  const docPreviewHtml = document.getElementById("aiDocPreviewHtml");
  const docPreviewContentWrap = document.querySelector(".ai-doc-preview-content-wrap");
  const manageListEl = document.getElementById("aiProfilesManageList");
  const profileAddSubmitBtn = document.getElementById("aiProfileAddSubmitBtn");
  const profileAddCancelBtn = document.getElementById("aiProfileAddCancelBtn");
  const profileClearFormBtn = document.getElementById("aiProfileClearFormBtn");
  const profilesSearchInput = document.getElementById("aiProfilesSearchInput");
  const profilesRefreshBtn = document.getElementById("aiProfilesRefreshBtn");
  const profilesScrollToAddBtn = document.getElementById("aiProfilesScrollToAddBtn");
  const profilesStatCountEl = document.getElementById("aiProfilesStatCount");
  const profilesStatDefaultEl = document.getElementById("aiProfilesStatDefault");
  const profilesListCountEl = document.getElementById("aiProfilesListCount");
  const profileSetDefaultEl = document.getElementById("aiNewProfileSetDefault");
  const profileKeyToggleBtn = document.getElementById("aiNewProfileKeyToggle");
  const profileTestBtn = document.getElementById("aiNewProfileTestBtn");
  const profileHostToggle = document.querySelector(".cap-chat-profiles-host-toggle");
  const itemEditDialog = document.getElementById("aiProfileItemEditDialog");
  const itemEditForm = document.getElementById("aiProfileItemEditForm");
  const itemEditCancelBtn = document.getElementById("aiItemEditCancelBtn");
  const itemEditClearKeyBtn = document.getElementById("aiItemEditClearKeyBtn");
  const addProviderEl = document.getElementById("aiNewProfileProvider");
  const addModelTypeEl = document.getElementById("aiNewProfileModelType");
  const addBaseUrlEl = document.getElementById("aiNewProfileBase");
  const editProviderEl = document.getElementById("aiItemEditProvider");
  const editModelTypeEl = document.getElementById("aiItemEditModelType");
  const editBaseUrlEl = document.getElementById("aiItemEditBaseUrl");
  const capabilityDialogEl = document.getElementById("aiCapabilityDialog");
  const searchShowSourceEl = document.getElementById("aiSearchShowSource");
  const searchConflictDetectionEl = document.getElementById("aiSearchConflictDetection");
  const searchPreferFreshnessEl = document.getElementById("aiSearchPreferFreshness");
  const searchSourceAttributionEl = document.getElementById("aiSearchSourceAttribution");
  const searchPageSizeEl = document.getElementById("aiSearchPageSize");
  const searchTopNEl = document.getElementById("aiSearchTopN");
  const searchSourceListEl = document.getElementById("aiSearchSourceList");
  const searchRefreshStatusBtn = document.getElementById("aiSearchRefreshStatusBtn");
  const searchConfigSaveBtn = document.getElementById("aiSearchConfigSaveBtn");

  /**
   * 「编辑模型配置」叠在「AI能力组合」的 showModal 之上；仅关掉子弹窗时母弹窗仍打开，
   * 浏览器会对背后主界面保持 inert，表现为 AI 助手输入框看得见但无法输入。
   */
  function closeAiCapabilityDialogIfOpen() {
    if (capabilityDialogEl && capabilityDialogEl.open && typeof capabilityDialogEl.close === "function") {
      capabilityDialogEl.close();
    }
  }

  function focusAiComposerAfterDialogs() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try {
          inputEl?.focus({ preventScroll: false });
        } catch {
          if (inputEl) {
            inputEl.focus();
          }
        }
      });
    });
  }

  let chatTurns = [];
  let syncingSelect = false;
  let cachedState = { profiles: [], activeId: "", webSearch: false };
  let searchRuleDraft = null;
  /** 本机 Ollama /api/tags 返回的已安装模型名，用于模型选择提示 */
  let ollamaInstalledModelNames = [];
  let aiMode = "chat";
  /** @type {{ file: File; url: string }[]} */
  let pendingVisionEntries = [];
  /** @type {{ file: File; name: string; ext: string; status: "parsing"|"ready"|"error"; textBlock: string; previewText: string; previewKind?: string; previewUrl?: string; previewHtml?: string; previewWarn?: string; errorMsg: string }[]} */
  let pendingDocEntries = [];
  /** @type {{ name: string; ext: string; status: string; errorMsg: string; previewText: string; previewKind?: string; previewUrl?: string; previewHtml?: string; previewWarn?: string; textBlock: string }[]} */
  const WORK_DOC_EXTS = new Set([
    ".txt",
    ".md",
    ".markdown",
    ".doc",
    ".docx",
    ".pdf",
    ".xlsx",
    ".xls",
    ".csv",
    ".json",
    ".log",
    ".rtf",
    ".html",
    ".htm",
    ".xml",
    ".yml",
    ".yaml",
  ]);
  const WORK_DOC_MAX_FILES = 5;
  const WORK_DOC_MAX_CHARS_PER_FILE = 8000;
  const WORK_DOC_MAX_TOTAL_CHARS = 24000;
  const MODE_LABELS = { chat: "对话", "image-gen": "文生图", "image-vision": "图像理解" };
  const MODE_ORDER = ["chat", "image-gen", "image-vision"];
  /** @type {string[]} */
  let inputHistory = [];
  let historyIndex = -1;
  let draftBeforeHistory = "";

  if (!fallback || !main) {
    return;
  }

  if (!api) {
    fallback.hidden = false;
    main.hidden = true;
    return;
  }

  fallback.hidden = true;
  main.hidden = false;
  if (!isSearchConfigApiReady()) {
    if (searchConfigSaveBtn) {
      searchConfigSaveBtn.disabled = true;
      searchConfigSaveBtn.title = "当前环境不支持联网策略配置";
    }
    if (searchRefreshStatusBtn) {
      searchRefreshStatusBtn.disabled = true;
      searchRefreshStatusBtn.title = "当前环境不支持联网策略配置";
    }
    if (searchSourceListEl) {
      searchSourceListEl.innerHTML = '<p class="field-hint">当前环境不支持联网策略配置。</p>';
    }
  }

  fillProviderOptions(addProviderEl);
  fillProviderOptions(editProviderEl);
  fillModelOptions(addModelTypeEl, "");
  fillModelOptions(editModelTypeEl, "");

  if (addProviderEl) {
    addProviderEl.addEventListener("change", () => {
      const provider = getProviderById(addProviderEl.value);
      fillModelOptions(addModelTypeEl, addProviderEl.value);
      if (provider && addBaseUrlEl) {
        addBaseUrlEl.value = provider.baseUrl;
      }
    });
  }
  if (addModelTypeEl) {
    addModelTypeEl.addEventListener("change", () => {
      const labelEl = document.getElementById("aiNewProfileLabel");
      const picked = addModelTypeEl.value?.trim() || "";
      if (labelEl && picked && !labelEl.value.trim()) {
        labelEl.value = picked;
      }
    });
  }
  if (editProviderEl) {
    editProviderEl.addEventListener("change", () => {
      const provider = getProviderById(editProviderEl.value);
      fillModelOptions(editModelTypeEl, editProviderEl.value);
      if (provider && editBaseUrlEl) {
        editBaseUrlEl.value = provider.baseUrl;
      }
    });
  }

  function scrollChatToBottom() {
    if (!chatLog) {
      return;
    }
    requestAnimationFrame(() => {
      chatLog.scrollTop = chatLog.scrollHeight;
      requestAnimationFrame(() => {
        chatLog.scrollTop = chatLog.scrollHeight;
      });
    });
  }

  const searchInput = document.getElementById("aiChatSearchInput");
  const searchMeta = document.getElementById("aiChatSearchMeta");
  const searchPrev = document.getElementById("aiChatSearchPrev");
  const searchNext = document.getElementById("aiChatSearchNext");
  const searchClear = document.getElementById("aiChatSearchClear");
  let searchHitIndex = 0;

  function updateSearchNav() {
    const marks = chatLog ? Array.from(chatLog.querySelectorAll(".ai-search-mark")) : [];
    const q = (searchInput?.value || "").trim();
    if (!searchMeta) {
      return;
    }
    if (!q) {
      searchMeta.textContent = "";
      marks.forEach((m) => m.classList.remove("ai-search-current"));
      return;
    }
    if (marks.length === 0) {
      searchMeta.textContent = "无匹配";
      return;
    }
    if (searchHitIndex >= marks.length) {
      searchHitIndex = 0;
    }
    searchMeta.textContent = `第 ${searchHitIndex + 1} / ${marks.length} 处`;
    marks.forEach((m, i) => m.classList.toggle("ai-search-current", i === searchHitIndex));
    marks[searchHitIndex]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function openDetailsWithSearchHit() {
    if (!chatLog) {
      return;
    }
    chatLog.querySelectorAll(".ai-search-mark").forEach((mark) => {
      const d = mark.closest("details.ai-assistant-fold");
      if (d) {
        d.open = true;
      }
    });
  }

  function applyChatSearchToBodies() {
    const q = (searchInput?.value || "").trim();
    if (!chatLog) {
      return;
    }
    chatLog.querySelectorAll(".ai-msg-body").forEach((body) => {
      const raw = body.dataset.rawText;
      if (raw == null) {
        return;
      }
      const row = body.closest(".ai-msg");
      if (!row) {
        return;
      }
      if (row.classList.contains("ai-msg-assistant") && !row.classList.contains("ai-msg-error")) {
        renderAssistantBodyElement(body, raw, q);
      } else if (row.classList.contains("ai-msg-user")) {
        renderUserBodyElement(body, raw, q);
      } else {
        if (q) {
          body.innerHTML = highlightEscaped(raw, q);
        } else {
          body.textContent = raw;
        }
      }
    });
    openDetailsWithSearchHit();
    updateSearchNav();
    if (!q) {
      scrollChatToBottom();
    }
  }

  function goSearchHit(delta) {
    const marks = chatLog ? Array.from(chatLog.querySelectorAll(".ai-search-mark")) : [];
    if (marks.length === 0) {
      return;
    }
    searchHitIndex = (searchHitIndex + delta + marks.length) % marks.length;
    updateSearchNav();
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = String(r.result || "");
        const marker = ";base64,";
        const idx = dataUrl.indexOf(marker);
        if (idx !== -1) {
          const header = dataUrl.slice("data:".length, idx);
          const mimeType = (header.split(";")[0] || "").trim() || "application/octet-stream";
          const base64 = dataUrl.slice(idx + marker.length).replace(/\s/g, "");
          if (base64.length) {
            resolve({ mimeType, base64 });
            return;
          }
        }
        const r2 = new FileReader();
        r2.onload = () => {
          const buf = r2.result;
          if (!(buf instanceof ArrayBuffer) || !buf.byteLength) {
            reject(new Error("无法读取图片（文件为空或未被识别为图片）"));
            return;
          }
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          const mimeType = String(file.type || "").trim() || "application/octet-stream";
          resolve({ mimeType, base64: btoa(bin) });
        };
        r2.onerror = () => reject(r2.error || new Error("读取失败"));
        r2.readAsArrayBuffer(file);
      };
      r.onerror = () => reject(r.error || new Error("读取失败"));
      r.readAsDataURL(file);
    });
  }

  function fileExt(name) {
    const n = String(name || "").trim();
    const i = n.lastIndexOf(".");
    return i >= 0 ? n.slice(i).toLowerCase() : "";
  }

  function docVisualByExtName(extRaw, nameRaw = "") {
    return docVisualFromExtName(extRaw || fileExt(nameRaw), nameRaw);
  }

  function stripDocTextBlock(raw) {
    return String(raw || "")
      .replace(/^【上传文档：[^\n]*】\n?/g, "")
      .replace(/\n?【文档结束】$/g, "")
      .trim();
  }

  function asFileList(source) {
    const out = [];
    if (source instanceof File) {
      out.push(source);
      return out;
    }
    if (source && typeof source.length === "number") {
      for (let i = 0; i < source.length; i++) {
        const f = source[i];
        if (f) out.push(f);
      }
    }
    return out;
  }

  function buildPendingDocContextBlock(entries = pendingDocEntries) {
    const ready = (Array.isArray(entries) ? entries : []).filter((x) => x.status === "ready" && x.textBlock);
    if (!ready.length) {
      return "";
    }
    const body = ready.map((x) => x.textBlock).join("\n\n");
    return (
      "【用户上传文档（后台提取上下文）】\n" +
      "- 以下为用户本轮随消息上传的文档提取文本，请结合用户问题进行分析；若文档证据不足请明确说明。\n" +
      "- 文档分析输出请默认包含：1) 现在问题 2) 要改成什么 3) 要做的页面 4) 一句话总结（最精炼） 5) AI 后续可继续协助项。\n\n" +
      body
    ).trim();
  }

  function clonePendingDocEntries(entries = pendingDocEntries) {
    if (!Array.isArray(entries) || !entries.length) {
      return [];
    }
    return entries.map((x) => ({
      name: String(x?.name || "未命名文档"),
      ext: String(x?.ext || fileExt(x?.name || "") || ""),
      status: String(x?.status || ""),
      errorMsg: String(x?.errorMsg || ""),
      previewText: String(x?.previewText || stripDocTextBlock(x?.textBlock || "")),
      previewKind: String(x?.previewKind || ""),
      previewUrl: String(x?.previewUrl || ""),
      previewHtml: String(x?.previewHtml || ""),
      previewWarn: String(x?.previewWarn || ""),
      textBlock: String(x?.textBlock || ""),
    }));
  }

  const docPreview =
    typeof createDocPreviewController === "function"
      ? createDocPreviewController({
          elements: {
            workspace: docWorkspace,
            mainCol: docMainCol,
            splitHandle: docSplitHandle,
            pane: docPreviewPane,
            select: docPreviewSelect,
            content: docPreviewContent,
            frame: docPreviewFrame,
            image: docPreviewImage,
            html: docPreviewHtml,
            contentWrap: docPreviewContentWrap,
            zoomOutBtn: docZoomOutBtn,
            zoomResetBtn: docZoomResetBtn,
            zoomInBtn: docZoomInBtn,
            closeBtn: docPreviewCloseBtn,
            toggleBtn: document.getElementById("aiDocPreviewToggleBtn"),
          },
          docVisualByExtName: docVisualFromExtName,
          fileExt,
        })
      : null;

  function isWorkDocFile(file) {
    if (!file) return false;
    const ext = fileExt(file.name || "");
    if (WORK_DOC_EXTS.has(ext)) return true;
    const mt = String(file.type || "").toLowerCase();
    return (
      mt.startsWith("text/") ||
      mt.includes("word") ||
      mt.includes("officedocument") ||
      mt.includes("pdf") ||
      mt.includes("spreadsheet") ||
      mt.includes("excel") ||
      mt.includes("json") ||
      mt.includes("xml")
    );
  }

  async function addWorkDocFilesToInput(source) {
    if (!api || typeof api.kbParseLocalFile !== "function" || !inputEl) {
      return 0;
    }
    const leftSlots = Math.max(0, WORK_DOC_MAX_FILES - pendingDocEntries.length);
    const files = asFileList(source).filter((f) => isWorkDocFile(f)).slice(0, leftSlots);
    if (!files.length) {
      return 0;
    }
    setAiVoiceCaptureStatus("正在解析文档内容…");
    let total = pendingDocEntries
      .filter((x) => x.status === "ready")
      .reduce((sum, x) => sum + String(x.textBlock || "").length, 0);
    const freshEntries = files.map((file) => ({
      file,
      name: String(file.name || "未命名文档"),
      ext: fileExt(file.name || ""),
      status: "parsing",
      textBlock: "",
      previewText: "",
      previewKind: "",
      previewUrl: "",
      previewHtml: "",
      previewWarn: "",
      errorMsg: "",
    }));
    pendingDocEntries.push(...freshEntries);
    refreshVisionAttachBar();
    let okCount = 0;
    for (const file of files) {
      if (total >= WORK_DOC_MAX_TOTAL_CHARS) {
        break;
      }
      const entry = pendingDocEntries.find((x) => x.file === file);
      const localPath = String(file.path || "").trim();
      try {
        let out = null;
        if (localPath) {
          out = await api.kbParseLocalFile({
            filePath: localPath,
            fileName: file.name || "",
            ext: fileExt(file.name || ""),
            maxChars: WORK_DOC_MAX_CHARS_PER_FILE,
          });
        } else {
          const b = await readFileAsBase64(file);
          out = await api.kbParseLocalFile({
            fileName: file.name || "",
            ext: fileExt(file.name || ""),
            base64: b?.base64 || "",
            maxChars: WORK_DOC_MAX_CHARS_PER_FILE,
          });
        }
        if (!out?.ok) {
          if (entry) {
            entry.status = "error";
            entry.errorMsg = String(out?.error || "解析失败");
          }
          refreshVisionAttachBar();
          continue;
        }
        const text = String(out.text || "").trim();
        if (!text) {
          if (entry) {
            entry.status = "error";
            entry.errorMsg = "未提取到可用文本";
          }
          refreshVisionAttachBar();
          continue;
        }
        const rest = WORK_DOC_MAX_TOTAL_CHARS - total;
        if (rest <= 0) {
          break;
        }
        const useText = text.length > rest ? `${text.slice(0, Math.max(500, rest - 10)).trim()}\n…（总上下文已截断）` : text;
        total += useText.length;
        const tip = out.truncated ? "（单文件内容已截断）" : "";
        if (entry) {
          entry.status = "ready";
          entry.errorMsg = "";
          entry.ext = fileExt(out.fileName || file.name || "");
          entry.previewText = useText;
          entry.previewHtml = String(out.previewHtml || "");
          entry.previewWarn = String(out.previewWarn || "");
          const extNow = entry.ext;
          if (entry.previewHtml) {
            entry.previewKind = "html";
          } else if (extNow === ".pdf") {
            entry.previewKind = "pdf";
          } else if (String(file.type || "").startsWith("image/")) {
            entry.previewKind = "image";
          } else {
            entry.previewKind = "text";
          }
          if ((entry.previewKind === "pdf" || entry.previewKind === "image") && !entry.previewUrl) {
            try {
              entry.previewUrl = URL.createObjectURL(file);
            } catch {
              entry.previewUrl = "";
            }
          }
          entry.textBlock = `【上传文档：${out.fileName || file.name}${tip}】\n${useText}\n【文档结束】`;
        }
        okCount += 1;
        refreshVisionAttachBar();
      } catch (err) {
        if (entry) {
          entry.status = "error";
          entry.errorMsg = String(err?.message || "解析失败");
        }
        refreshVisionAttachBar();
      }
    }
    if (!okCount) {
      setAiVoiceCaptureStatus("文档解析失败：请重试或更换文件格式。", true);
      return 0;
    }
    setAiMode("chat");
    if (aiMode === "chat" && docPreview) {
      docPreview.openByEntries(clonePendingDocEntries());
    }
    setAiVoiceCaptureStatus(`已加载 ${okCount} 份文档，输入问题后发送（文档内容将后台参与理解）。`, false);
    return okCount;
  }

  function profileUsesOllamaEndpoint(baseUrl) {
    const u = String(baseUrl || "").toLowerCase();
    return /\bollama\b/.test(u) || /:11434(\/|$|\?)/.test(u);
  }

  /** Ollama CLI /api/tags 模型名比较：统一小写、去首尾空格。 */
  function normalizeOllamaCliModelName(s) {
    return String(s || "").trim().toLowerCase();
  }

  /**
   * 判断配置中的 model 是否仍在本机 Ollama /api/tags 列表中。
   * 必须按完整「基名:标签」匹配，禁止仅用基名（否则 gemma4:26b 会与 gemma4:e4b 误判为同一套）。
   * 若配置未写标签（如 llama3），则允许匹配本机任意同基名已装条目。
   */
  function isOllamaModelInstalledOnHost(profileModel) {
    const m = String(profileModel || "").trim();
    if (!m || !ollamaInstalledModelNames.length) {
      return false;
    }
    const mLow = normalizeOllamaCliModelName(m);
    const mHasTag = m.includes(":");
    return ollamaInstalledModelNames.some((ins) => {
      const insLow = normalizeOllamaCliModelName(ins);
      if (insLow === mLow) {
        return true;
      }
      if (!mHasTag) {
        const stem = mLow.split(":")[0];
        const insStem = insLow.split(":")[0];
        return insStem === stem && stem.length > 0;
      }
      return false;
    });
  }

  /** 本机 Ollama 配置且对应模型已从本机移除：不出现在模型选择菜单 / 下拉中。 */
  function isOllamaProfileStillInstalled(p) {
    return !profileUsesOllamaEndpoint(p.baseUrl) || isOllamaModelInstalledOnHost(p.model);
  }

  /**
   * 模型选择菜单中展示的 profile 列表：已装 Ollama 或云端；若仅剩已删的 Ollama 配置则退化为仅云端，再否则保留全部以免无选项。
   */
  function pickProfilesForModelMenu(st) {
    const all = st.profiles || [];
    const installedOk = all.filter((p) => isOllamaProfileStillInstalled(p));
    if (installedOk.length) {
      return installedOk;
    }
    const cloudOnly = all.filter((p) => !profileUsesOllamaEndpoint(p.baseUrl));
    if (cloudOnly.length) {
      return cloudOnly;
    }
    return all;
  }

  async function refreshOllamaInstalledModelNames() {
    ollamaInstalledModelNames = [];
    if (typeof api.listOllamaLocalModels !== "function") {
      return;
    }
    try {
      const r = await api.listOllamaLocalModels();
      ollamaInstalledModelNames = (r.models || []).map((x) => x.name).filter(Boolean);
    } catch {
      ollamaInstalledModelNames = [];
    }
  }

  function formatProfileMenuLine(p) {
    const keyHint = p.hasKey ? "" : "（未配置 Key）";
    const purpose = (p.purpose && String(p.purpose).trim()) || "";
    const routeTag =
      p.localInference === true || profileUsesOllamaEndpoint(p.baseUrl) ? " · 本机推理" : " · 云端 API";
    const localTag =
      profileUsesOllamaEndpoint(p.baseUrl) && isOllamaModelInstalledOnHost(p.model) ? " · 本机已装" : "";
    return purpose
      ? `${p.label} · ${p.model}${routeTag} · ${purpose}${keyHint}${localTag}`
      : `${p.label} · ${p.model}${routeTag}${keyHint}${localTag}`;
  }

  function closeProfileMenu() {
    if (!profileMenu || !profileTrigger) {
      return;
    }
    profileMenu.hidden = true;
    profileTrigger.setAttribute("aria-expanded", "false");
    profileTrigger.classList.remove("is-open");
  }

  function openProfileMenu() {
    closeModeMenu();
    if (!profileMenu || !profileTrigger) {
      return;
    }
    if (profileSearchInput) {
      profileSearchInput.value = "";
      profileSearchFilter = "";
    }
    rebuildProfileMenu();
    profileMenu.hidden = false;
    profileTrigger.setAttribute("aria-expanded", "true");
    profileTrigger.classList.add("is-open");
  }

  function closeModeMenu() {
    if (!modeCompactMenu || !modeCompactTrigger) {
      return;
    }
    modeCompactMenu.hidden = true;
    modeCompactTrigger.setAttribute("aria-expanded", "false");
    modeCompactTrigger.classList.remove("is-open");
  }

  function openModeMenu() {
    closeProfileMenu();
    if (!modeCompactMenu || !modeCompactTrigger) {
      return;
    }
    modeCompactMenu.hidden = false;
    modeCompactTrigger.setAttribute("aria-expanded", "true");
    modeCompactTrigger.classList.add("is-open");
  }

  function toggleModeMenu() {
    if (!modeCompactMenu || !modeCompactTrigger) {
      return;
    }
    if (modeCompactMenu.hidden) {
      openModeMenu();
    } else {
      closeModeMenu();
    }
  }

  function abortActiveAiChatCompose() {
    markAiComposeAborted();
    if (api?.aiChatAbort && aiComposeSession.requestId) {
      void api.aiChatAbort({ requestId: aiComposeSession.requestId });
    }
  }

  function syncVoiceComposerBtn() {
    if (!voiceInputBtn || !chatStatusEl) {
      return;
    }
    const busy = chatStatusEl.classList.contains("is-busy");
    const stopMode = !!(busy && aiMode === "chat");
    voiceInputBtn.classList.toggle("is-stop-mode", stopMode);
    const mic = voiceInputBtn.querySelector(".ai-voice-icon-mic");
    const stopIc = voiceInputBtn.querySelector(".ai-voice-icon-stop");
    if (mic) {
      mic.hidden = stopMode;
    }
    if (stopIc) {
      stopIc.hidden = !stopMode;
    }
    const rec = voiceInputBtn.classList.contains("is-on");
    if (stopMode) {
      voiceInputBtn.title = "停止生成：点击中断当前联网检索或模型回复";
      voiceInputBtn.setAttribute("aria-label", "停止生成");
      voiceInputBtn.setAttribute("aria-pressed", "false");
    } else if (rec) {
      voiceInputBtn.title = "录音中：松开后停止并自动发送";
      voiceInputBtn.setAttribute("aria-label", "录音中，松开发送");
      voiceInputBtn.setAttribute("aria-pressed", "true");
    } else {
      voiceInputBtn.title = "语音问答：按住说话，松开发送";
      voiceInputBtn.setAttribute("aria-label", "语音问答，按住说话");
      voiceInputBtn.setAttribute("aria-pressed", "false");
    }
  }

  function syncChatEmptyState() {
    if (!emptyStateEl || !chatLog) {
      return;
    }
    const hasMsgs = chatLog.querySelectorAll(".ai-msg").length > 0;
    emptyStateEl.hidden = hasMsgs;
  }

  function syncSendEnabled() {
    if (!inputEl) {
      return;
    }
    const busy = Boolean(chatStatusEl?.classList.contains("is-busy"));
    const canSend = String(inputEl.value || "").trim().length > 0 && !busy;
    if (sendBtn) {
      sendBtn.disabled = !canSend;
    }
    syncVoiceComposerBtn();
  }

  function autoResizeInput() {
    if (!inputEl) {
      return;
    }
    inputEl.style.height = "auto";
    const maxPx = Math.min(window.innerHeight * 0.33, 320);
    const next = Math.min(inputEl.scrollHeight, maxPx);
    inputEl.style.height = `${Math.max(44, next)}px`;
  }

  async function tryAutoLearnTurn(question, answer, sourceType = "chat") {
    if (!api || typeof api.kbAutoLearnIngest !== "function") {
      return;
    }
    const q = String(question || "").trim();
    const a = String(answer || "").trim();
    if (!q || !a) {
      return;
    }
    try {
      await api.kbAutoLearnIngest({
        question: q,
        answer: a,
        sourceType: String(sourceType || "chat"),
      });
    } catch {
      /* 自动学习失败不影响主对话流程 */
    }
  }

  function pushInputHistory(text) {
    const t = String(text || "").trim();
    if (!t) {
      return;
    }
    if (inputHistory[inputHistory.length - 1] === t) {
      return;
    }
    inputHistory.push(t);
    if (inputHistory.length > 50) {
      inputHistory.shift();
    }
  }

  function toggleProfileMenu() {
    if (!profileMenu || profileMenu.hidden) {
      openProfileMenu();
    } else {
      closeProfileMenu();
    }
  }

  function openAiBaseFromOllamaHost(hostRaw) {
    const h = String(hostRaw || "").trim().replace(/\/+$/, "");
    if (!h) {
      return "http://127.0.0.1:11434/v1";
    }
    const withProto = /^https?:\/\//i.test(h) ? h : `http://${h}`;
    return withProto.endsWith("/v1") ? withProto : `${withProto}/v1`;
  }

  function findOllamaProfileByModelName(modelName) {
    const n = String(modelName || "").trim();
    if (!n) {
      return null;
    }
    const nLow = normalizeOllamaCliModelName(n);
    const nStem = nLow.split(":")[0];
    const nHasTag = n.includes(":");
    const profiles = cachedState.profiles || [];
    let hit = profiles.find((p) => {
      if (!profileUsesOllamaEndpoint(p.baseUrl)) {
        return false;
      }
      return normalizeOllamaCliModelName(p.model) === nLow;
    });
    if (hit) {
      return hit;
    }
    if (nHasTag) {
      hit = profiles.find((p) => {
        if (!profileUsesOllamaEndpoint(p.baseUrl)) {
          return false;
        }
        const m = String(p.model || "").trim();
        if (m.includes(":")) {
          return false;
        }
        return normalizeOllamaCliModelName(m) === nStem;
      });
    }
    return hit || null;
  }

  async function activateOrCreateOllamaProfile(modelName) {
    closeProfileMenu();
    const name = String(modelName || "").trim();
    if (!name || !api.saveAIProfile) {
      return;
    }
    const existing = findOllamaProfileByModelName(name);
    try {
      if (existing) {
        if (existing.id !== cachedState.activeId) {
          await api.setActiveAIProfile(existing.id);
        }
      } else {
        let host = "http://127.0.0.1:11434";
        if (typeof api.getOllamaSettings === "function") {
          try {
            const s = await api.getOllamaSettings();
            if (s && s.host) {
              host = s.host;
            }
          } catch {
            /* keep default */
          }
        }
        const baseUrl = openAiBaseFromOllamaHost(host);
        const res = await api.saveAIProfile({
          label: `${name}（Ollama）`,
          purpose: "本机 Ollama 已装模型",
          baseUrl,
          model: name,
        });
        const newId = res && res.id;
        if (newId) {
          await api.setActiveAIProfile(newId);
        }
      }
      await refreshAIState();
    } catch (err) {
      appendBubble("assistant", `选用本机模型失败：${err.message || err}`, { isError: true });
      await refreshAIState();
    }
  }

  function isCloudProfile(p) {
    return !profileUsesOllamaEndpoint(p.baseUrl) && p.localInference !== true;
  }

  function isLocalProfileConfig(p) {
    return profileUsesOllamaEndpoint(p.baseUrl) || p.localInference === true;
  }

  function inferOllamaModelRole(name) {
    const n = String(name || "").toLowerCase();
    if (/reranker|bge-reranker/.test(n)) {
      return { key: "rerank", label: "重排序模型" };
    }
    if (/bge-m3|embed|nomic-embed|e5-|gte-/.test(n)) {
      return { key: "embed", label: "嵌入模型" };
    }
    if (/whisper|asr|tts|voice|speech/.test(n)) {
      return { key: "voice", label: "语音模型" };
    }
    return { key: "chat", label: "文本/对话" };
  }

  function inferProviderLabel(p) {
    const blob = `${p?.label || ""} ${p?.model || ""}`.toLowerCase();
    if (/deepseek/.test(blob)) {
      return "DeepSeek";
    }
    if (/minimax/.test(blob)) {
      return "MiniMax";
    }
    if (/qwen/.test(blob)) {
      return "Qwen";
    }
    if (/openai|gpt-/.test(blob)) {
      return "OpenAI";
    }
    if (profileUsesOllamaEndpoint(p?.baseUrl)) {
      return "Ollama";
    }
    const label = String(p?.label || "").trim();
    return label.split(/[\s·（(]/)[0] || "云端";
  }

  function profileCardDescription(p) {
    const purpose = String(p?.purpose || "").trim();
    if (purpose) {
      return purpose;
    }
    if (isCloudProfile(p)) {
      if (/deepseek/i.test(String(p.model || ""))) {
        return "综合能力强，适合大多数文本对话与推理场景";
      }
      if (/deepseek-v4|v4-pro/i.test(String(p.model || ""))) {
        return "更强的推理与代码能力，适合复杂任务";
      }
      return "通过云端 API 调用，需配置有效 API Key";
    }
    return "本机 Ollama 推理，可不填 API Key";
  }

  function formatProfileCardTitle(p) {
    const model = String(p?.model || "").trim();
    const viaOllama = profileUsesOllamaEndpoint(p?.baseUrl);
    if (viaOllama && model && !/\(ollama\)/i.test(String(p?.label || ""))) {
      return `${model} (Ollama)`;
    }
    return String(p?.label || model || "未命名配置").trim();
  }

  function matchesProfileSearch(...parts) {
    const q = String(profileSearchFilter || "").trim().toLowerCase();
    if (!q) {
      return true;
    }
    const hay = parts
      .flat()
      .map((x) => String(x || ""))
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  function setProfilePanelTab(tab) {
    profilePanelTab = tab === "local" ? "local" : "cloud";
    profileTabButtons.forEach((btn) => {
      const on = btn.dataset.profileTab === profilePanelTab;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    rebuildProfileMenu();
  }

  function createModelTag(text, kind) {
    const span = document.createElement("span");
    span.className = `ai-model-tag${kind ? ` is-${kind}` : ""}`;
    span.textContent = text;
    return span;
  }

  function createModelCard(opts) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "ai-model-card";
    if (opts.isActive) {
      card.classList.add("is-active");
      card.setAttribute("aria-selected", "true");
    } else {
      card.setAttribute("aria-selected", "false");
    }
    card.setAttribute("role", "option");
    if (opts.titleAttr || opts.title) {
      card.title = opts.titleAttr || opts.title;
    }

    const main = document.createElement("div");
    main.className = "ai-model-card__main";

    const nameEl = document.createElement("div");
    nameEl.className = "ai-model-card__name";
    nameEl.textContent = opts.title || "";
    main.appendChild(nameEl);

    if (opts.provider) {
      const providerEl = document.createElement("div");
      providerEl.className = "ai-model-card__provider";
      providerEl.textContent = opts.provider;
      main.appendChild(providerEl);
    }

    if (opts.tags && opts.tags.length) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "ai-model-card__tags";
      opts.tags.forEach(({ text, kind }) => tagsEl.appendChild(createModelTag(text, kind)));
      main.appendChild(tagsEl);
    }

    if (opts.desc) {
      const descEl = document.createElement("div");
      descEl.className = "ai-model-card__desc";
      descEl.textContent = opts.desc;
      main.appendChild(descEl);
    }

    card.appendChild(main);

    const tail = document.createElement("span");
    tail.className = "ai-model-card__tail";
    tail.setAttribute("aria-hidden", "true");
    tail.textContent = opts.isActive ? "✓" : "›";
    card.appendChild(tail);

    card.addEventListener("click", async (ev) => {
      ev.stopPropagation();
      if (typeof opts.onClick === "function") {
        await opts.onClick();
      }
    });

    return card;
  }

  function appendModelSection(container, sectionOpts, cards) {
    if (!cards.length) {
      return;
    }
    const section = document.createElement("section");
    section.className = "ai-model-section";

    const head = document.createElement("header");
    head.className = "ai-model-section__head";
    const icon = document.createElement("span");
    icon.className = `ai-model-section__icon is-${sectionOpts.iconKind || "default"}`;
    icon.textContent = sectionOpts.icon || "";
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("span");
    title.className = "ai-model-section__title";
    title.textContent = sectionOpts.title || "";
    head.appendChild(icon);
    head.appendChild(title);
    section.appendChild(head);

    const list = document.createElement("div");
    list.className = "ai-model-section__list";
    cards.forEach((card) => list.appendChild(card));
    section.appendChild(list);
    container.appendChild(section);
  }

  async function selectProfileById(profileId) {
    closeProfileMenu();
    if (!profileId || profileId === cachedState.activeId || syncingSelect) {
      return;
    }
    try {
      await api.setActiveAIProfile(profileId);
      await refreshAIState();
    } catch (err) {
      appendBubble("assistant", `切换模型失败：${err.message || err}`, { isError: true });
      await refreshAIState();
    }
  }

  function rebuildProfileMenu() {
    if (!profilePanelBody) {
      return;
    }
    profilePanelBody.innerHTML = "";
    const profiles = (cachedState.profiles || []).filter((p) => isOllamaProfileStillInstalled(p));
    const active = profiles.find((p) => p.id === cachedState.activeId) || null;
    const cloudProfiles = profiles.filter((p) => isCloudProfile(p));
    const localProfiles = profiles.filter((p) => isLocalProfileConfig(p));

    const profileCardFrom = (p, extraTags = []) => {
      if (!matchesProfileSearch(p.label, p.model, inferProviderLabel(p), p.purpose)) {
        return null;
      }
      const isActive = p.id === cachedState.activeId;
      const tags = [
        ...(isActive ? [{ text: "主模型", kind: "primary" }] : []),
        { text: "文本/对话", kind: "chat" },
        { text: isCloudProfile(p) ? "云端" : "本地", kind: isCloudProfile(p) ? "cloud" : "local" },
        ...extraTags,
      ];
      if (!p.hasKey && isCloudProfile(p)) {
        tags.push({ text: "未配置 Key", kind: "warn" });
      }
      return createModelCard({
        title: formatProfileCardTitle(p),
        provider: inferProviderLabel(p),
        tags,
        desc: profileCardDescription(p),
        isActive,
        titleAttr: formatProfileMenuLine(p),
        onClick: () => selectProfileById(p.id),
      });
    };

    const recommendedCards = [];
    if (active) {
      const card = profileCardFrom(active);
      if (card) {
        recommendedCards.push(card);
      }
    }

    const cloudCards = cloudProfiles
      .filter((p) => p.id !== active?.id)
      .map((p) => profileCardFrom(p))
      .filter(Boolean);

    const localConfigCards = localProfiles
      .filter((p) => p.id !== active?.id)
      .map((p) => profileCardFrom(p))
      .filter(Boolean);

    const localInstalledCards = [];
    if (profilePanelTab === "cloud" || profilePanelTab === "local") {
      ollamaInstalledModelNames.forEach((name) => {
        if (!matchesProfileSearch(name, inferOllamaModelRole(name).label, "Ollama")) {
          return;
        }
        const existing = findOllamaProfileByModelName(name);
        const role = inferOllamaModelRole(name);
        const isActive = existing && existing.id === cachedState.activeId;
        const tags = [
          { text: role.label, kind: role.key },
          { text: "已安装", kind: "installed" },
          { text: "本地", kind: "local" },
        ];
        if (role.key === "chat") {
          tags.unshift({ text: "文本/对话", kind: "chat" });
        }
        localInstalledCards.push(
          createModelCard({
            title: `${name} (Ollama)`,
            provider: "Ollama",
            tags,
            desc: existing
              ? `切换到已有配置「${existing.label}」`
              : "将新建 Ollama 配置并切换（可不填 API Key）",
            isActive,
            onClick: async () => {
              if (syncingSelect) {
                return;
              }
              await activateOrCreateOllamaProfile(name);
            },
          })
        );
      });
    }

    if (profilePanelTab === "cloud") {
      appendModelSection(profilePanelBody, { icon: "★", iconKind: "star", title: "推荐模型" }, recommendedCards);
      appendModelSection(profilePanelBody, { icon: "☁", iconKind: "cloud", title: "云端模型" }, cloudCards);
      appendModelSection(
        profilePanelBody,
        { icon: "🖥", iconKind: "local", title: "本地已安装" },
        localInstalledCards
      );
    } else {
      if (active && isLocalProfileConfig(active)) {
        appendModelSection(profilePanelBody, { icon: "★", iconKind: "star", title: "推荐模型" }, recommendedCards);
      } else if (recommendedCards.length && active && isCloudProfile(active)) {
        appendModelSection(profilePanelBody, { icon: "★", iconKind: "star", title: "当前选用" }, recommendedCards);
      }
      appendModelSection(
        profilePanelBody,
        { icon: "🖥", iconKind: "local", title: "本地已安装" },
        localInstalledCards
      );
      appendModelSection(
        profilePanelBody,
        { icon: "⚙", iconKind: "config", title: "本机配置" },
        localConfigCards
      );
    }

    if (!profilePanelBody.children.length) {
      const empty = document.createElement("p");
      empty.className = "ai-profile-panel__empty";
      empty.textContent = profileSearchFilter.trim()
        ? "无匹配的模型，请调整搜索词"
        : "暂无可选模型，请点击下方「管理模型与提供商」添加";
      profilePanelBody.appendChild(empty);
    }
  }

  function updateProfileTriggerTitle() {
    if (!profileTrigger) {
      return;
    }
    const p = (cachedState.profiles || []).find((x) => x.id === cachedState.activeId);
    let title = p ? `当前：${formatProfileMenuLine(p)}` : "当前模型配置";
    if (ollamaInstalledModelNames.length) {
      title += ` · 本机 Ollama 已装 ${ollamaInstalledModelNames.length} 个模型`;
    }
    profileTrigger.title = title;
  }

  function updateProfileTriggerLabelBadge() {
    const trigText = profileTrigger?.querySelector?.(".ai-profile-trigger-text");
    if (!trigText) {
      return;
    }
    trigText.textContent = ollamaInstalledModelNames.length
      ? `模型选择（本机已装 ${ollamaInstalledModelNames.length}）`
      : "模型选择";
  }

  function refreshVisionAttachBar() {
    if (!visionAttachBar || !visionThumbRow) {
      return;
    }
    const has = pendingVisionEntries.length > 0 || pendingDocEntries.length > 0;
    visionAttachBar.hidden = !has;
    visionThumbRow.innerHTML = "";
    pendingVisionEntries.forEach((entry, index) => {
      const wrap = document.createElement("div");
      wrap.className = "ai-vision-thumb";
      wrap.setAttribute("data-index", String(index));
      const img = document.createElement("img");
      img.src = entry.url;
      img.alt = entry.file.name || `图片 ${index + 1}`;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-vision-thumb-remove";
      btn.setAttribute("aria-label", "删除此图片");
      btn.setAttribute("title", "删除此图片");
      btn.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      wrap.appendChild(img);
      wrap.appendChild(btn);
      visionThumbRow.appendChild(wrap);
    });
    pendingDocEntries.forEach((entry, index) => {
      const wrap = document.createElement("div");
      wrap.className = "ai-vision-thumb ai-vision-thumb--doc";
      wrap.setAttribute("data-kind", "doc");
      wrap.setAttribute("data-index", String(index));
      const icon = document.createElement("div");
      const visual = docVisualByExtName(entry?.ext, entry?.name);
      icon.className = `ai-doc-thumb-icon is-${visual.kind}`;
      icon.textContent = visual.badge;
      const name = document.createElement("div");
      name.className = "ai-doc-thumb-name";
      name.textContent = entry.name || `文档 ${index + 1}`;
      const meta = document.createElement("div");
      const stClass =
        entry.status === "ready" ? "ai-doc-thumb-meta is-ready" : entry.status === "error" ? "ai-doc-thumb-meta is-error" : "ai-doc-thumb-meta is-parsing";
      meta.className = stClass;
      meta.textContent =
        entry.status === "ready" ? "已提取文本" : entry.status === "error" ? entry.errorMsg || "解析失败" : "解析中...";
      const info = document.createElement("div");
      info.className = "ai-doc-thumb-info";
      info.appendChild(name);
      info.appendChild(meta);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ai-vision-thumb-remove";
      btn.setAttribute("aria-label", "删除此文档");
      btn.setAttribute("title", "删除此文档");
      btn.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      wrap.appendChild(icon);
      wrap.appendChild(info);
      wrap.appendChild(btn);
      visionThumbRow.appendChild(wrap);
    });
    if (composerPanel) {
      composerPanel.classList.toggle("ai-composer-panel--has-vision", has);
    }
  }

  function removeVisionAt(index) {
    if (index < 0 || index >= pendingVisionEntries.length) {
      return;
    }
    const [removed] = pendingVisionEntries.splice(index, 1);
    if (removed?.url) {
      try {
        URL.revokeObjectURL(removed.url);
      } catch {
        /* ignore */
      }
    }
    refreshVisionAttachBar();
    if (!pendingVisionEntries.length && inputEl) {
      inputEl.classList.remove("is-drag-over");
    }
    if (!pendingVisionEntries.length && aiMode === "image-vision") {
      // 删除最后一张图片后自动回到对话模式，避免发送时报“请先上传图片”。
      setAiMode("chat");
    }
  }

  function clearVisionAttachment() {
    for (const e of pendingVisionEntries) {
      if (e.url) {
        try {
          URL.revokeObjectURL(e.url);
        } catch {
          /* ignore */
        }
      }
    }
    pendingVisionEntries = [];
    refreshVisionAttachBar();
    if (inputEl) {
      inputEl.classList.remove("is-drag-over");
    }
    if (aiMode === "image-vision") {
      setAiMode("chat");
    }
  }

  function removeDocAt(index) {
    if (index < 0 || index >= pendingDocEntries.length) {
      return;
    }
    const [removed] = pendingDocEntries.splice(index, 1);
    if (removed?.previewUrl) {
      try {
        URL.revokeObjectURL(removed.previewUrl);
      } catch {
        /* ignore */
      }
    }
    refreshVisionAttachBar();
    setAiVoiceCaptureStatus(pendingDocEntries.length ? "已移除文档附件。" : "", false);
  }

  function clearDocAttachment() {
    for (const e of pendingDocEntries) {
      if (e?.previewUrl) {
        try {
          URL.revokeObjectURL(e.previewUrl);
        } catch {
          /* ignore */
        }
      }
    }
    pendingDocEntries = [];
    refreshVisionAttachBar();
  }

  /**
   * @param {File|FileList|File[]|null|undefined} source
   */
  function addVisionFiles(source) {
    const list = [];
    if (source instanceof File) {
      list.push(source);
    } else if (source && typeof source.length === "number") {
      for (let i = 0; i < source.length; i++) {
        const f = source[i];
        if (f) {
          list.push(f);
        }
      }
    }
    let added = 0;
    for (const file of list) {
      if (!file || !String(file.type || "").startsWith("image/")) {
        continue;
      }
      pendingVisionEntries.push({ file, url: URL.createObjectURL(file) });
      added += 1;
    }
    if (added) {
      setAiMode("image-vision");
      refreshVisionAttachBar();
    }
  }

  function setAiMode(mode) {
    aiMode = mode === "image-gen" || mode === "image-vision" ? mode : "chat";
    const pairs = [
      [modeChatBtn, "chat"],
      [modeImageGenBtn, "image-gen"],
      [modeImageVisionBtn, "image-vision"],
    ];
    pairs.forEach(([btn, key]) => {
      if (!btn) {
        return;
      }
      const active = aiMode === key;
      btn.classList.toggle("is-on", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (modeCompactLabel) {
      modeCompactLabel.textContent = MODE_LABELS[aiMode] || "对话";
    }
    closeModeMenu();
    if (searchInput) {
      searchInput.placeholder = aiMode === "chat" ? "搜索本页对话（含折叠内容）" : "搜索当前会话记录";
    }
    if (inputEl) {
      if (aiMode === "image-gen") {
        inputEl.placeholder = "输入文生图提示词，Enter 发送";
      } else if (aiMode === "image-vision") {
        inputEl.placeholder = "可将图片拖入此框或粘贴截图，输入问题后 Enter 发送";
      } else {
        inputEl.placeholder = "输入问题或指令，Enter 发送（Shift+Enter 换行）";
      }
    }
    syncSendEnabled();
  }

  function appendBubble(
    role,
    text,
    { isError = false, imageUrl = "", imageBase64 = "", imageAlt = "生成图片", ollamaUsage = null, userDocs = [] } = {},
  ) {
    const row = document.createElement("div");
    row.className = `ai-msg ai-msg-${role}` + (isError ? " ai-msg-error" : "");
    const label = document.createElement("div");
    label.className = "ai-msg-label";
    label.textContent = role === "user" ? "我" : role === "assistant" ? "助手" : "系统";
    const body = document.createElement("div");
    body.className = "ai-msg-body";
    const q = (searchInput?.value || "").trim();
    if ((imageUrl || imageBase64) && role === "assistant" && !isError) {
      body.dataset.rawText = text || "";
      if (text) {
        const cap = document.createElement("div");
        cap.className = "ai-msg-core-text";
        cap.innerHTML = q ? highlightEscaped(text, q) : escapeHtml(text);
        body.appendChild(cap);
      }
      const img = document.createElement("img");
      img.src = imageUrl || `data:image/png;base64,${imageBase64}`;
      img.alt = imageAlt;
      img.className = "ai-msg-inline-image";
      body.appendChild(img);
    } else if (role === "assistant" && !isError) {
      renderAssistantBodyElement(body, text, q);
    } else if (role === "user") {
      const docs = Array.isArray(userDocs) ? userDocs : [];
      body.dataset.userDocs = docs.length ? JSON.stringify(docs) : "";
      renderUserBodyElement(body, text, q);
    } else {
      body.dataset.rawText = text;
      if (q) {
        body.innerHTML = highlightEscaped(text, q);
      } else {
        body.textContent = text;
      }
    }
    row.appendChild(label);
    row.appendChild(body);
    if (role === "assistant" && !isError && !(imageUrl || imageBase64)) {
      row.dataset.ttsText = String(text || "");
      const actions = document.createElement("div");
      actions.className = "ai-msg-actions";
      const stopBtn = document.createElement("button");
      stopBtn.type = "button";
      stopBtn.className = "secondary ai-msg-stop-tts";
      stopBtn.textContent = "停止播报";
      stopBtn.title = "立即停止当前语音播报";
      const replayBtn = document.createElement("button");
      replayBtn.type = "button";
      replayBtn.className = "secondary ai-msg-replay-tts";
      replayBtn.textContent = "重复播报";
      replayBtn.title = "重新播报本条助手回复";
      actions.appendChild(stopBtn);
      actions.appendChild(replayBtn);
      row.appendChild(actions);
    }
    if (
      role === "assistant" &&
      !isError &&
      !(imageUrl || imageBase64) &&
      ollamaUsageHasAny(ollamaUsage)
    ) {
      body.appendChild(buildOllamaUsageDetailsEl(ollamaUsage));
    }
    chatLog.appendChild(row);
    syncChatEmptyState();
    scrollChatToBottom();
    if (q) {
      openDetailsWithSearchHit();
      searchHitIndex = 0;
      updateSearchNav();
    }
  }

  window.addEventListener("ai-tts-error", (ev) => {
    const msg = String(ev?.detail?.message || "").trim() || "自动语音播报失败（未知错误）";
    appendBubble("assistant", `语音播报失败：${msg}`, { isError: true });
    if (typeof window.offerRuntimePrereqAfterTtsFailure === "function") {
      void window.offerRuntimePrereqAfterTtsFailure(msg);
    }
  });

  function setWebToggleUI(on) {
    if (!webToggleBtn) {
      return;
    }
    webToggleBtn.classList.toggle("is-on", on);
    webToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function isSearchConfigApiReady() {
    return (
      api &&
      typeof api.searchRuleConfigGet === "function" &&
      typeof api.searchRuleConfigSet === "function" &&
      typeof api.searchSourceStatus === "function"
    );
  }

  function cloneDefaultSearchConfig() {
    return {
      sourceRules: {},
      pageSize: 10,
      topN: 5,
      showSource: true,
      sourceAttribution: true,
      preferFreshness: true,
      conflictDetection: true,
    };
  }

  function updateSearchSourceStatusSummary(statusRows) {
    const summaryEl = document.getElementById("aiSearchSourceStatusSummary");
    if (!summaryEl) return;
    const list = Array.isArray(statusRows) ? statusRows : [];
    if (!list.length) {
      summaryEl.textContent = "";
      summaryEl.hidden = true;
      summaryEl.className = "ai-search-source-status-summary";
      return;
    }
    const onlineCount = list.filter((row) => row?.online === true).length;
    const probedCount = list.filter((row) => row?.probed).length;
    const latencies = list
      .map((row) => Number(row?.latencyMs))
      .filter((n) => Number.isFinite(n));
    const latencyMs = latencies.length
      ? Math.round(latencies.reduce((sum, n) => sum + n, 0) / latencies.length)
      : null;
    const allOnline = probedCount > 0 && onlineCount === probedCount;
    const allOffline = probedCount > 0 && onlineCount === 0;
    const statusLabel = !probedCount
      ? "待检测"
      : allOnline
        ? "在线"
        : allOffline
          ? "离线"
          : "部分在线";
    summaryEl.textContent = latencyMs != null ? `${statusLabel}: ${latencyMs}ms` : statusLabel;
    summaryEl.hidden = false;
    summaryEl.className = `ai-search-source-status-summary ${
      !probedCount ? "is-pending" : allOffline ? "is-offline" : "is-online"
    }`;
  }

  function formatSearchSourceStatusText(row) {
    if (row?.probed === false || row?.online == null) {
      return "待检测";
    }
    const latencyText = Number.isFinite(Number(row?.latencyMs)) ? ` · ${Number(row.latencyMs)}ms` : "";
    return `${row.online ? "在线" : "离线"}${latencyText}`;
  }

  function formatSearchSourceMetaText(row) {
    const err = String(row?.errorMsg || "").trim();
    if (err) return err;
    if (row?.probed === false || row?.online == null) return "点击「刷新状态」检测连通性";
    return row?.online ? "状态正常" : "暂未连通";
  }

  function renderSearchSourceRows(statusRows, sourceRules) {
    if (!searchSourceListEl) return;
    const list = Array.isArray(statusRows) ? statusRows : [];
    updateSearchSourceStatusSummary(list);
    if (!list.length) {
      searchSourceListEl.innerHTML = '<p class="field-hint">暂无数据源状态。</p>';
      return;
    }
    searchSourceListEl.innerHTML = "";
    list.forEach((row) => {
      const sourceType = String(row?.sourceType || "").trim();
      if (!sourceType) return;
      const rule = sourceRules?.[sourceType] || {};
      const enabled = rule.enabled !== false;
      const weight = Number(rule.weight ?? row?.weight ?? 0.8);
      const box = document.createElement("div");
      box.className = "ai-search-source-row ai-search-source-row--compact";
      const statusText = formatSearchSourceStatusText(row);
      const metaText = escapeHtml(formatSearchSourceMetaText(row));
      const statusClass =
        row?.probed === false || row?.online == null
          ? "ai-search-source-state-pending"
          : row?.online
            ? "ai-search-source-state-on"
            : "ai-search-source-state-off";
      box.innerHTML = `
        <div class="ai-search-source-row-head">
          <div class="ai-search-source-row-title">
            <strong>${escapeHtml(String(row?.sourceName || sourceType))}</strong>
            <span class="ai-search-source-row-meta">${metaText}</span>
          </div>
          <span class="${statusClass}">${statusText}</span>
        </div>
        <div class="ai-search-source-row-controls">
          <label class="ai-search-source-ctl-enable">启用
            <select data-source-enabled="${escapeHtmlAttr(sourceType)}">
              <option value="true"${enabled ? " selected" : ""}>开启</option>
              <option value="false"${!enabled ? " selected" : ""}>关闭</option>
            </select>
          </label>
          <label class="ai-search-source-ctl-weight">权重
            <input data-source-weight="${escapeHtmlAttr(sourceType)}" type="number" min="0.1" max="1.5" step="0.01" value="${Number.isFinite(weight) ? weight.toFixed(2) : "0.80"}" />
          </label>
        </div>
      `;
      searchSourceListEl.appendChild(box);
    });
  }

  function syncSearchConfigForm(cfg) {
    const c = cfg && typeof cfg === "object" ? cfg : cloneDefaultSearchConfig();
    if (searchShowSourceEl) searchShowSourceEl.checked = c.showSource !== false;
    if (searchConflictDetectionEl) searchConflictDetectionEl.checked = c.conflictDetection !== false;
    if (searchPreferFreshnessEl) searchPreferFreshnessEl.checked = c.preferFreshness !== false;
    if (searchSourceAttributionEl) searchSourceAttributionEl.checked = c.sourceAttribution !== false;
    if (searchPageSizeEl) searchPageSizeEl.value = String(Number(c.pageSize) || 10);
    if (searchTopNEl) searchTopNEl.value = String(Number(c.topN) || 5);
  }

  function collectSearchConfigFromForm(baseCfg) {
    const next = {
      ...(baseCfg && typeof baseCfg === "object" ? baseCfg : cloneDefaultSearchConfig()),
      showSource: searchShowSourceEl ? searchShowSourceEl.checked === true : true,
      sourceAttribution: searchSourceAttributionEl ? searchSourceAttributionEl.checked === true : true,
      preferFreshness: searchPreferFreshnessEl ? searchPreferFreshnessEl.checked === true : true,
      conflictDetection: searchConflictDetectionEl ? searchConflictDetectionEl.checked === true : true,
      pageSize: Math.max(1, Math.min(20, Number(searchPageSizeEl?.value) || 10)),
      topN: Math.max(1, Math.min(10, Number(searchTopNEl?.value) || 5)),
    };
    const sourceRules = { ...(next.sourceRules || {}) };
    if (searchSourceListEl) {
      const enabledNodes = Array.from(searchSourceListEl.querySelectorAll("select[data-source-enabled]"));
      const weightNodes = Array.from(searchSourceListEl.querySelectorAll("input[data-source-weight]"));
      enabledNodes.forEach((node) => {
        const sourceType = node.getAttribute("data-source-enabled");
        if (!sourceType) return;
        sourceRules[sourceType] = {
          ...(sourceRules[sourceType] || {}),
          enabled: String(node.value) !== "false",
        };
      });
      weightNodes.forEach((node) => {
        const sourceType = node.getAttribute("data-source-weight");
        if (!sourceType) return;
        const n = Number(node.value);
        sourceRules[sourceType] = {
          ...(sourceRules[sourceType] || {}),
          weight: Number.isFinite(n) ? Math.max(0.1, Math.min(1.5, n)) : 0.8,
        };
      });
    }
    next.sourceRules = sourceRules;
    return next;
  }

  async function refreshSearchSourceStatus(options = {}) {
    if (!isSearchConfigApiReady()) return;
    const probe = options.probe !== false;
    if (searchRefreshStatusBtn) {
      searchRefreshStatusBtn.disabled = probe;
      searchRefreshStatusBtn.textContent = probe ? "检测中…" : "刷新状态";
    }
    try {
      const statusResp = await api.searchSourceStatus({ probe });
      const rows = statusResp?.code === 0 && Array.isArray(statusResp?.data) ? statusResp.data : [];
      if (statusResp?.code !== 0) {
        throw new Error(statusResp?.message || "读取数据源状态失败");
      }
      renderSearchSourceRows(rows, searchRuleDraft?.sourceRules || {});
    } catch (err) {
      appendBubble("assistant", `数据源状态检测失败：${err.message || err}`, { isError: true });
    } finally {
      if (searchRefreshStatusBtn) {
        searchRefreshStatusBtn.disabled = false;
        searchRefreshStatusBtn.textContent = "刷新状态";
      }
    }
  }

  async function loadSearchConfigPanel() {
    if (!isSearchConfigApiReady()) return;
    try {
      const cfgResp = await api.searchRuleConfigGet({});
      if (cfgResp?.code !== 0) {
        throw new Error(cfgResp?.message || "读取联网策略失败");
      }
      searchRuleDraft = { ...cloneDefaultSearchConfig(), ...(cfgResp?.data || {}) };
      syncSearchConfigForm(searchRuleDraft);
      const rowsFromCache = await api.searchSourceStatus({ probe: false });
      const cached = rowsFromCache?.code === 0 && Array.isArray(rowsFromCache?.data) ? rowsFromCache.data : [];
      renderSearchSourceRows(cached, searchRuleDraft?.sourceRules || {});
      void refreshSearchSourceStatus({ probe: true });
    } catch (err) {
      appendBubble("assistant", `读取联网策略失败：${err.message || err}`, { isError: true });
    }
  }

  async function saveSearchConfigDialog() {
    if (!isSearchConfigApiReady()) return;
    const payload = collectSearchConfigFromForm(searchRuleDraft || {});
    const ret = await api.searchRuleConfigSet({ configContent: payload });
    if (!ret || ret.code !== 0) {
      throw new Error(ret?.message || "保存联网策略失败");
    }
    searchRuleDraft = { ...payload };
  }

  function setKbToggleUI(on) {
    if (!kbToggleBtn) {
      return;
    }
    kbToggleBtn.classList.toggle("is-on", on);
    kbToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    kbToggleBtn.title = on
      ? "AI 可调用本地知识库（kb_search）"
      : "AI 不调用本地知识库（kb_search 已禁用）";
  }

  function setMemoryToggleUI(on) {
    if (!memoryToggleBtn) {
      return;
    }
    memoryToggleBtn.classList.toggle("is-on", on);
    memoryToggleBtn.setAttribute("aria-pressed", on ? "true" : "false");
    const count = readLongMemoryItems().length;
    memoryToggleBtn.title = on
      ? `长期记忆已开启（当前 ${count} 条记忆）`
      : "长期记忆已关闭（不会在后续对话中使用历史记忆）";
  }

  function isWebSearchOn() {
    return webToggleBtn && webToggleBtn.classList.contains("is-on");
  }

  function setVoiceToggleUI(on) {
    if (!voiceToggleBtn) {
      return;
    }
    const enabled = !!on;
    voiceToggleBtn.classList.toggle("is-on", enabled);
    voiceToggleBtn.setAttribute("aria-pressed", enabled ? "true" : "false");
    voiceToggleBtn.title = enabled ? "自动语音播报：开启" : "自动语音播报：关闭";
  }

  function setAiVoiceInputUI(recording) {
    if (!voiceInputBtn) {
      return;
    }
    const on = !!recording;
    voiceInputBtn.classList.toggle("is-on", on);
    syncVoiceComposerBtn();
  }

  function setAiVoiceCaptureStatus(text, isError = false) {
    if (!chatStatusEl || chatStatusEl.classList.contains("is-busy")) {
      return;
    }
    chatStatusEl.textContent = String(text || "");
    chatStatusEl.classList.toggle("is-error", !!isError);
  }

  async function refreshVoiceToggleState() {
    if (!voiceToggleBtn || typeof api.getCapabilitySettings !== "function") {
      return;
    }
    try {
      const cap = await api.getCapabilitySettings();
      setVoiceToggleUI(Boolean(cap?.ttsEnabled && cap?.ttsSpeakOnAiReply));
    } catch {
      setVoiceToggleUI(false);
    }
  }

  async function refreshAIState() {
    if (!profileSelect || !api.getAIState) {
      return;
    }
    try {
      await refreshOllamaInstalledModelNames();
      let st = await api.getAIState();
      const menuProfiles = pickProfilesForModelMenu(st);
      const activeOk = menuProfiles.some((p) => p.id === st.activeId);
      if (!activeOk && menuProfiles.length && st.activeId) {
        try {
          await api.setActiveAIProfile(menuProfiles[0].id);
          st = await api.getAIState();
        } catch {
          /* 切换失败时仍渲染菜单，避免卡死 */
        }
      }
      cachedState = st;
      syncingSelect = true;
      profileSelect.innerHTML = "";
      menuProfiles.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.id;
        const keyHint = p.hasKey ? "" : "（未配置 Key）";
        const purpose = (p.purpose && String(p.purpose).trim()) || "";
        const shortPurpose = purpose.length > 36 ? `${purpose.slice(0, 36)}…` : purpose;
        const routeTag =
          p.localInference === true || profileUsesOllamaEndpoint(p.baseUrl) ? " · 本机" : " · 云端";
        const localTag =
          profileUsesOllamaEndpoint(p.baseUrl) && isOllamaModelInstalledOnHost(p.model) ? " · 本机已装" : "";
        opt.textContent = shortPurpose
          ? `${p.label} · ${p.model}${routeTag} · ${shortPurpose}${keyHint}${localTag}`
          : `${p.label} · ${p.model}${routeTag}${keyHint}${localTag}`;
        if (purpose) {
          opt.title = purpose;
        }
        profileSelect.appendChild(opt);
      });
      if (st.activeId) {
        profileSelect.value = st.activeId;
      }
      syncingSelect = false;
      setWebToggleUI(!!st.webSearch);
      await refreshVoiceToggleState();
      rebuildProfileMenu();
      updateProfileTriggerTitle();
      updateProfileTriggerLabelBadge();
    } catch (e) {
      syncingSelect = false;
      appendBubble("assistant", `加载模型列表失败：${e.message || e}`, { isError: true });
    }
  }

  window.onAIPanelVisible = () => {
    refreshAIState();
  };

  if (profileSelect) {
    profileSelect.addEventListener("change", async () => {
      if (syncingSelect) {
        return;
      }
      try {
        await api.setActiveAIProfile(profileSelect.value);
      } catch (err) {
        appendBubble("assistant", `切换模型失败：${err.message || err}`, { isError: true });
        await refreshAIState();
      }
    });
  }

  if (webToggleBtn) {
    webToggleBtn.addEventListener("click", async () => {
      const next = !webToggleBtn.classList.contains("is-on");
      try {
        await api.setWebSearchEnabled(next);
        setWebToggleUI(next);
      } catch (err) {
        appendBubble("assistant", `联网开关失败：${err.message || err}`, { isError: true });
        await refreshAIState();
      }
    });
  }

  if (searchRefreshStatusBtn) {
    searchRefreshStatusBtn.addEventListener("click", () => {
      void refreshSearchSourceStatus();
    });
  }

  if (searchConfigSaveBtn) {
    searchConfigSaveBtn.addEventListener("click", async () => {
      try {
        await saveSearchConfigDialog();
        appendBubble("assistant", "联网检索策略已保存：将按最新权重、冲突甄别与时效规则生效。");
      } catch (err) {
        appendBubble("assistant", `保存联网策略失败：${err.message || err}`, { isError: true });
      }
    });
  }

  document.addEventListener("open-capability-web-strategy", () => {
    void loadSearchConfigPanel();
  });

  if (kbToggleBtn) {
    setKbToggleUI(isAiKbToolEnabled());
    kbToggleBtn.addEventListener("click", () => {
      const next = !kbToggleBtn.classList.contains("is-on");
      setAiKbToolEnabled(next);
      setKbToggleUI(next);
      appendBubble(
        "assistant",
        next
          ? "已开启：允许 AI 调用本地知识库（可与高逻辑模式同时生效）。"
          : "已关闭：本轮起 AI 不再调用本地知识库。"
      );
    });
  }

  if (memoryToggleBtn) {
    setMemoryToggleUI(isLongMemoryEnabled());
    memoryToggleBtn.addEventListener("click", () => {
      const next = !memoryToggleBtn.classList.contains("is-on");
      setLongMemoryEnabled(next);
      setMemoryToggleUI(next);
      appendBubble("assistant", next ? "已开启长期记忆：后续对话会参考历史记忆。" : "已关闭长期记忆：后续对话不再注入历史记忆。");
    });
  }

  if (voiceToggleBtn && typeof api.getCapabilitySettings === "function" && typeof api.setCapabilitySettings === "function") {
    voiceToggleBtn.addEventListener("click", async () => {
      try {
        const cap = await api.getCapabilitySettings();
        const isOn = Boolean(cap?.ttsEnabled && cap?.ttsSpeakOnAiReply);
        const nextOn = !isOn;
        await api.setCapabilitySettings({
          routingMode: cap?.routingMode === "modular" ? "modular" : "unified",
          ttsEnabled: nextOn ? true : Boolean(cap?.ttsEnabled),
          ttsSpeakOnAiReply: nextOn,
          imageGenEnabled: cap?.imageGenEnabled !== false,
          imageUnderstandEnabled: cap?.imageUnderstandEnabled !== false,
        });
        if (!nextOn) {
          stopAssistantAudioPlayback();
        }
        setVoiceToggleUI(nextOn);
      } catch (err) {
        appendBubble("assistant", `自动语音播报开关失败：${err.message || err}`, { isError: true });
        await refreshVoiceToggleState();
      }
    });
  }

  if (voiceInputBtn) {
    setAiVoiceInputUI(false);
    const startHoldRecording = async () => {
      try {
        if (aiVoiceRecorder && aiVoiceRecorder.state !== "inactive") {
          return;
        }
        if (chatStatusEl?.classList.contains("is-busy")) {
          throw new Error("助手正在处理中，请稍后再进行语音采集。");
        }
        if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
          throw new Error("当前环境不支持麦克风录音。");
        }
        if (typeof api.getASRSettings === "function") {
          const s = await api.getASRSettings();
          if (typeof api.getCapabilitySettings === "function") {
            const cap = await api.getCapabilitySettings();
            if (cap && cap.asrEnabled === false) {
              throw new Error("请先在「AI 能力组合 → 语音能力」中启用 ASR。");
            }
          }
          let hasKey = !!s?.hasKey;
          if (typeof api.getCapabilitySettings === "function" && typeof api.getAISettings === "function") {
            const cap = await api.getCapabilitySettings();
            if (cap && cap.routingMode !== "modular") {
              const ai = await api.getAISettings();
              hasKey = !!ai?.hasKey;
            }
          }
          if (!hasKey) {
            throw new Error("请先在 ASR 设置（或统一模式下的模型配置）中填写可用 API Key。");
          }
        }
        aiVoiceChunks = [];
        aiVoiceStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 16000 },
            sampleSize: { ideal: 16 },
          },
        });
        let pickedMime = "";
        if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
          const cands = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
          pickedMime = cands.find((x) => MediaRecorder.isTypeSupported(x)) || "";
        }
        aiVoiceRecorder = pickedMime ? new MediaRecorder(aiVoiceStream, { mimeType: pickedMime }) : new MediaRecorder(aiVoiceStream);
        aiVoiceMimeType = String(aiVoiceRecorder?.mimeType || pickedMime || "audio/webm");
        aiVoiceRecorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            aiVoiceChunks.push(ev.data);
          }
        };
        aiVoiceRecorder.onstop = () => {
          if (aiVoiceStream) {
            try {
              aiVoiceStream.getTracks().forEach((t) => t.stop());
            } catch {
              /* ignore */
            }
          }
          aiVoiceStream = null;
        };
        aiVoiceRecorder.start(300);
        aiVoiceStartAt = Date.now();
        setAiVoiceInputUI(true);
        aiVoiceHolding = true;
        setAiVoiceCaptureStatus("正在录音，松开后自动发送…");
        aiVoiceAutoStopTimer = setTimeout(() => {
          if (!aiVoiceHolding || aiVoiceFinishing) {
            return;
          }
          setAiVoiceCaptureStatus("达到最大录音时长，正在识别…");
          void finishHoldRecording();
        }, AI_VOICE_MAX_MS);
      } catch (err) {
        aiVoiceHolding = false;
        setAiVoiceInputUI(false);
        stopAiVoiceCapture();
        aiVoiceChunks = [];
        setAiVoiceCaptureStatus(`语音采集失败：${err?.message || err}`, true);
        appendBubble("assistant", `语音问答启动失败：${err?.message || err}`, { isError: true });
      }
    };
    const finishHoldRecording = async () => {
      if (!aiVoiceHolding || aiVoiceFinishing) {
        return;
      }
      aiVoiceHolding = false;
      aiVoiceFinishing = true;
      try {
        setAiVoiceInputUI(false);
        stopAiVoiceCapture();
        const holdMs = Date.now() - Number(aiVoiceStartAt || Date.now());
        if (holdMs < AI_VOICE_MIN_MS) {
          aiVoiceChunks = [];
          setAiVoiceCaptureStatus("录音时间过短，已取消。");
          return;
        }
        setAiVoiceCaptureStatus("语音识别中…");
        const transcribed = await transcribeAiVoiceChunks(api);
        if (!transcribed) {
          setAiVoiceCaptureStatus("语音识别结果为空，请重试。");
          appendBubble("assistant", "语音识别结果为空，请重试并靠近麦克风。", { isError: true });
          return;
        }
        inputEl.value = transcribed;
        autoResizeInput();
        setAiVoiceCaptureStatus("已识别并发送。");
        void sendUserText(transcribed);
      } catch (err) {
        setAiVoiceCaptureStatus(`语音识别失败：${err?.message || err}`, true);
        appendBubble("assistant", `语音识别失败：${err?.message || err}`, { isError: true });
      } finally {
        aiVoiceFinishing = false;
      }
    };
    voiceInputBtn.addEventListener("pointerdown", (ev) => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      if (voiceInputBtn.setPointerCapture && Number.isFinite(ev.pointerId)) {
        try {
          voiceInputBtn.setPointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      void startHoldRecording();
    });
    voiceInputBtn.addEventListener("pointerup", (ev) => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        ev.preventDefault();
        return;
      }
      ev.preventDefault();
      if (voiceInputBtn.releasePointerCapture && Number.isFinite(ev.pointerId)) {
        try {
          voiceInputBtn.releasePointerCapture(ev.pointerId);
        } catch {
          /* ignore */
        }
      }
      void finishHoldRecording();
    });
    voiceInputBtn.addEventListener("pointercancel", () => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        return;
      }
      void finishHoldRecording();
    });
    voiceInputBtn.addEventListener("lostpointercapture", () => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        return;
      }
      void finishHoldRecording();
    });
    // 停止模式：click 触发中止；否则防止 click 干扰按住录音
    voiceInputBtn.addEventListener("click", (ev) => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        ev.preventDefault();
        ev.stopPropagation();
        abortActiveAiChatCompose();
        return;
      }
      ev.preventDefault();
    });
    // 键盘可访问：按住空格/回车开始，抬起结束；停止模式下空格/回车等同中止
    voiceInputBtn.addEventListener("keydown", (ev) => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        if (ev.key === " " || ev.key === "Enter") {
          ev.preventDefault();
          abortActiveAiChatCompose();
        }
        return;
      }
      if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        void startHoldRecording();
      }
    });
    voiceInputBtn.addEventListener("keyup", (ev) => {
      if (voiceInputBtn.classList.contains("is-stop-mode")) {
        return;
      }
      if (ev.key === " " || ev.key === "Enter") {
        ev.preventDefault();
        void finishHoldRecording();
      }
    });
  }

  if (modeChatBtn) {
    modeChatBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setAiMode("chat");
    });
  }

  if (modeImageGenBtn) {
    modeImageGenBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setAiMode("image-gen");
    });
  }
  if (modeImageVisionBtn) {
    modeImageVisionBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setAiMode("image-vision");
    });
  }

  document.addEventListener("navigate-ai-image-mode", (ev) => {
    const mode = ev.detail?.mode;
    if (mode === "image-gen" || mode === "image-vision") {
      setAiMode(mode);
    }
  });

  if (profileTrigger && profileMenu) {
    profileTrigger.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleProfileMenu();
    });
  }

  profileTabButtons.forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      setProfilePanelTab(btn.dataset.profileTab || "cloud");
    });
  });

  if (profileSearchInput) {
    profileSearchInput.addEventListener("input", () => {
      profileSearchFilter = String(profileSearchInput.value || "");
      rebuildProfileMenu();
    });
    profileSearchInput.addEventListener("click", (ev) => ev.stopPropagation());
  }

  if (profileManageBtn) {
    profileManageBtn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      closeProfileMenu();
      document.dispatchEvent(new CustomEvent("navigate-capability-to-chat-profiles", { detail: {} }));
    });
  }

  document.addEventListener("click", () => {
    closeProfileMenu();
    closeModeMenu();
  });

  if (modeCompactTrigger) {
    modeCompactTrigger.addEventListener("click", (ev) => {
      ev.stopPropagation();
      toggleModeMenu();
    });
  }

  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      closeProfileMenu();
      closeModeMenu();
    }
  });

  if (visionThumbRow) {
    visionThumbRow.addEventListener("click", (ev) => {
      const btn = ev.target && ev.target.closest && ev.target.closest(".ai-vision-thumb-remove");
      if (!btn) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const wrap = btn.closest(".ai-vision-thumb");
      const idx = wrap ? Number.parseInt(wrap.getAttribute("data-index") || "", 10) : NaN;
      const kind = String(wrap?.getAttribute("data-kind") || "vision");
      if (Number.isFinite(idx)) {
        if (kind === "doc") {
          removeDocAt(idx);
        } else {
          removeVisionAt(idx);
        }
      }
    });
  }

  if (chatLog) {
    chatLog.addEventListener("click", async (ev) => {
      const stopBtn = ev.target && ev.target.closest && ev.target.closest(".ai-msg-stop-tts");
      if (stopBtn) {
        ev.preventDefault();
        stopAssistantAudioPlayback();
        return;
      }
      const btn = ev.target && ev.target.closest && ev.target.closest(".ai-msg-replay-tts");
      if (!btn) {
        return;
      }
      ev.preventDefault();
      const row = btn.closest(".ai-msg");
      const raw = String(row?.dataset?.ttsText || "").trim();
      if (!raw) {
        appendBubble("assistant", "该消息没有可播报内容。", { isError: true });
        return;
      }
      const oldText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "播报中...";
      try {
        await speakAssistantTextNow(api, raw, { requireAuto: false });
      } catch (err) {
        const msg = String(err?.message || err || "").trim() || "语音播报失败（未知错误）";
        try {
          window.dispatchEvent(new CustomEvent("ai-tts-error", { detail: { message: msg } }));
        } catch {
          appendBubble("assistant", `语音播报失败：${msg}`, { isError: true });
        }
      } finally {
        btn.disabled = false;
        btn.textContent = oldText || "重复播报";
      }
    });
  }

  const dragHighlightTarget = composerEl || inputEl;
  if (dragHighlightTarget && inputEl) {
    dragHighlightTarget.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      inputEl.classList.add("is-drag-over");
    });
    dragHighlightTarget.addEventListener("dragleave", (ev) => {
      if (!dragHighlightTarget.contains(ev.relatedTarget)) {
        inputEl.classList.remove("is-drag-over");
      }
    });
    dragHighlightTarget.addEventListener("drop", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      inputEl.classList.remove("is-drag-over");
      const files = ev.dataTransfer?.files;
      if (files && files.length) {
        const hasImage = asFileList(files).some((f) => String(f?.type || "").startsWith("image/"));
        const hasDoc = asFileList(files).some((f) => isWorkDocFile(f));
        if (hasDoc) {
          void addWorkDocFilesToInput(files);
          return;
        }
        if (aiMode === "image-vision") {
          addVisionFiles(files);
          return;
        }
        if (hasImage) {
          addVisionFiles(files);
        }
      }
    });
    inputEl.addEventListener("paste", (ev) => {
      const items = ev.clipboardData?.items;
      if (!items) {
        return;
      }
      const files = ev.clipboardData?.files;
      if (files && files.length && aiMode !== "image-vision") {
        const hasDoc = asFileList(files).some((f) => isWorkDocFile(f));
        if (hasDoc) {
          ev.preventDefault();
          void addWorkDocFilesToInput(files);
          return;
        }
      }
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file" && String(it.type || "").startsWith("image/")) {
          ev.preventDefault();
          const f = it.getAsFile();
          if (f) {
            addVisionFiles(f);
          }
          return;
        }
      }
    });
  }

  function openItemEditForProfile(profileId) {
    if (!itemEditDialog || !itemEditForm) {
      return;
    }
    const p = (cachedState.profiles || []).find((x) => x.id === profileId);
    if (!p) {
      return;
    }
    const idEl = document.getElementById("aiItemEditId");
    const purposeEl = document.getElementById("aiItemEditPurpose");
    const baseEl = document.getElementById("aiItemEditBaseUrl");
    const modelEl = document.getElementById("aiItemEditModelType");
    const keyEl = document.getElementById("aiItemEditApiKey");
    if (!idEl || !purposeEl || !baseEl || !modelEl || !keyEl) {
      return;
    }
    idEl.value = p.id;
    purposeEl.value = (p.purpose && String(p.purpose)) || "";
    baseEl.value = p.baseUrl || "";
    const inferredProvider = inferProviderId(p.baseUrl, p.model);
    if (editProviderEl) {
      editProviderEl.value = inferredProvider;
    }
    fillModelOptions(editModelTypeEl, inferredProvider, p.model || "");
    modelEl.value = p.model || "";
    keyEl.value = "";
    keyEl.placeholder = p.hasKey ? "留空表示不修改已保存的密钥" : "请输入 API Key";
    itemEditDialog.showModal();
  }

  function closeProfileMoreMenus() {
    document.querySelectorAll(".cap-chat-profile-more.is-open").forEach((el) => {
      el.classList.remove("is-open");
    });
  }

  function clearAddProfileForm() {
    if (addProviderEl) {
      addProviderEl.value = "";
    }
    fillModelOptions(addModelTypeEl, "");
    const labelEl = document.getElementById("aiNewProfileLabel");
    const modelKindEl = document.getElementById("aiNewProfileModelKind");
    const baseEl = document.getElementById("aiNewProfileBase");
    const keyEl = document.getElementById("aiNewProfileKey");
    if (labelEl) labelEl.value = "";
    if (modelKindEl) modelKindEl.value = "对话模型";
    if (baseEl) baseEl.value = "";
    if (keyEl) {
      keyEl.value = "";
      keyEl.type = "password";
    }
    if (profileKeyToggleBtn) {
      profileKeyToggleBtn.setAttribute("aria-label", "显示或隐藏密钥");
      profileKeyToggleBtn.title = "显示或隐藏";
    }
    if (profileSetDefaultEl) profileSetDefaultEl.checked = true;
    profileHostToggle?.querySelectorAll(".cap-chat-profiles-host-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.hostMode === "cloud");
    });
  }

  function updateProfilesHeaderStats(list) {
    const rows = Array.isArray(list) ? list : [];
    const active = rows.find((p) => p.id === cachedState.activeId) || null;
    if (profilesStatCountEl) {
      profilesStatCountEl.textContent = `${rows.length} 个`;
    }
    if (profilesStatDefaultEl) {
      profilesStatDefaultEl.textContent = active?.label || active?.model || "—";
    }
    if (profilesListCountEl) {
      profilesListCountEl.textContent = `共 ${rows.length} 个配置`;
    }
  }

  function profileMatchesSearch(profile, query) {
    const q = String(query || "").trim().toLowerCase();
    if (!q) return true;
    const meta = profileCardMeta(profile);
    const hay = [
      profile.label,
      profile.model,
      profile.baseUrl,
      profile.purpose,
      meta.providerShort,
      meta.hostType,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  }

  async function testNewProfileConnection() {
    const providerId = addProviderEl?.value?.trim() || "";
    const provider = getProviderById(providerId);
    const baseUrl = (addBaseUrlEl?.value?.trim() || provider?.baseUrl || "").replace(/\/$/, "");
    const model = addModelTypeEl?.value?.trim() || "";
    const apiKey = document.getElementById("aiNewProfileKey")?.value?.trim() || "";
    const skipKey = providerId === "ollama";
    if (!baseUrl || !model) {
      alert("请先填写 API Base URL 与可调用模型。");
      return;
    }
    if (!apiKey && !skipKey) {
      alert("请先填写 API Key。");
      return;
    }
    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const testBtn = profileTestBtn;
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.textContent = "测试中…";
    }
    try {
      const res = await fetch(`${baseUrl}/models`, { method: "GET", headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      alert("连接成功：Base URL 可访问。");
    } catch (err) {
      alert(`连接失败：${err?.message || err}`);
    } finally {
      if (testBtn) {
        testBtn.disabled = false;
        testBtn.textContent = "⟳ 测试连接";
      }
    }
  }

  function renderManageList() {
    if (!manageListEl) {
      return;
    }
    closeProfileMoreMenus();
    manageListEl.innerHTML = "";
    const list = cachedState.profiles || [];
    const searchQuery = profilesSearchInput?.value || "";
    updateProfilesHeaderStats(list);
    const filtered = list.filter((p) => profileMatchesSearch(p, searchQuery));
    if (!filtered.length) {
      const empty = document.createElement("li");
      empty.className = "cap-chat-profiles-empty";
      empty.textContent = searchQuery ? "没有匹配的配置。" : "暂无配置。";
      manageListEl.appendChild(empty);
      return;
    }
    filtered.forEach((p) => {
      const meta = profileCardMeta(p);
      const isActive = p.id === cachedState.activeId;
      const li = document.createElement("li");
      li.className = "ai-profiles-manage-item cap-chat-profile-card";
      const icon = document.createElement("div");
      applyProviderBrandIcon(icon, meta.providerId, meta.providerShort || meta.iconText);
      const body = document.createElement("div");
      body.className = "cap-chat-profile-card-body";
      const titleRow = document.createElement("div");
      titleRow.className = "cap-chat-profile-card-title";
      const title = document.createElement("strong");
      title.textContent = p.label || p.model || "未命名";
      titleRow.appendChild(title);
      if (isActive) {
        const badge = document.createElement("span");
        badge.className = "cap-chat-profile-badge";
        badge.textContent = "默认";
        titleRow.appendChild(badge);
      }
      const url = document.createElement("div");
      url.className = "cap-chat-profile-card-url";
      url.textContent = p.baseUrl || "";
      url.title = p.baseUrl || "";
      const tags = document.createElement("div");
      tags.className = "cap-chat-profile-card-tags";
      const tagProvider = document.createElement("span");
      tagProvider.className = "cap-chat-profile-tag";
      tagProvider.textContent = meta.providerShort;
      const tagHost = document.createElement("span");
      tagHost.className = "cap-chat-profile-tag";
      tagHost.textContent = meta.hostType;
      tags.appendChild(tagProvider);
      tags.appendChild(tagHost);
      if (!p.hasKey && meta.providerId !== "ollama") {
        const tagKey = document.createElement("span");
        tagKey.className = "cap-chat-profile-tag";
        tagKey.textContent = "无 Key";
        tags.appendChild(tagKey);
      }
      body.appendChild(titleRow);
      body.appendChild(url);
      body.appendChild(tags);
      const actions = document.createElement("div");
      actions.className = "cap-chat-profile-card-actions";
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "secondary ai-profiles-edit";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", () => {
        openItemEditForProfile(p.id);
      });
      actions.appendChild(editBtn);
      const more = document.createElement("div");
      more.className = "cap-chat-profile-more";
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "secondary cap-chat-profile-more-btn";
      moreBtn.textContent = "更多";
      moreBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const open = more.classList.contains("is-open");
        closeProfileMoreMenus();
        if (!open) more.classList.add("is-open");
      });
      const menu = document.createElement("div");
      menu.className = "cap-chat-profile-more-menu";
      if (!isActive && api.setActiveAIProfile) {
        const defaultBtn = document.createElement("button");
        defaultBtn.type = "button";
        defaultBtn.textContent = "设为默认";
        defaultBtn.addEventListener("click", async () => {
          closeProfileMoreMenus();
          try {
            await api.setActiveAIProfile(p.id);
            await refreshAIState();
            renderManageList();
          } catch (err) {
            alert(err.message || String(err));
          }
        });
        menu.appendChild(defaultBtn);
      }
      if (list.length > 1) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "删除";
        delBtn.addEventListener("click", async () => {
          closeProfileMoreMenus();
          if (!confirm(`确定删除配置「${p.label}」？`)) {
            return;
          }
          try {
            await api.deleteAIProfile(p.id);
            await refreshAIState();
            renderManageList();
          } catch (err) {
            alert(err.message || String(err));
          }
        });
        menu.appendChild(delBtn);
      }
      more.appendChild(moreBtn);
      more.appendChild(menu);
      actions.appendChild(more);
      li.appendChild(icon);
      li.appendChild(body);
      li.appendChild(actions);
      manageListEl.appendChild(li);
    });
  }

  function openProfilesManagementModal(opts = {}) {
    document.dispatchEvent(
      new CustomEvent("navigate-capability-to-chat-profiles", {
        detail: { scrollToAdd: !!opts.scrollToAdd },
      })
    );
  }

  document.addEventListener("refresh-ai-chat-profiles", (ev) => {
    const scrollToAdd = !!(ev && ev.detail && ev.detail.scrollToAdd);
    void (async () => {
      await refreshAIState();
      renderManageList();
      if (scrollToAdd) {
        const addSection = document.getElementById("aiProfileAddBlock");
        if (addSection && typeof addSection.scrollIntoView === "function") {
          addSection.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
        const focusEl = document.getElementById("aiNewProfileProvider");
        if (focusEl) {
          setTimeout(() => focusEl.focus(), 150);
        }
      }
    })();
  });

  if (itemEditForm && api.saveAIProfile) {
    itemEditForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("aiItemEditId")?.value?.trim() || "";
      const purpose = document.getElementById("aiItemEditPurpose")?.value ?? "";
      const baseUrl = document.getElementById("aiItemEditBaseUrl")?.value?.trim() || "";
      const model = document.getElementById("aiItemEditModelType")?.value?.trim() || "";
      const keyVal = document.getElementById("aiItemEditApiKey")?.value?.trim() || "";
      if (!id) {
        return;
      }
      if (!baseUrl || !model) {
        alert("请填写 API Base URL 与可调用模型。");
        return;
      }
      const payload = {
        id,
        label: model,
        purpose,
        baseUrl,
        model,
      };
      if (keyVal) {
        payload.apiKey = keyVal;
      }
      try {
        await api.saveAIProfile(payload);
        await refreshAIState();
        renderManageList();
        if (itemEditDialog) {
          itemEditDialog.close();
        }
        closeAiCapabilityDialogIfOpen();
        appendBubble("assistant", "模型配置已保存。");
        focusAiComposerAfterDialogs();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

  if (itemEditClearKeyBtn && api.saveAIProfile) {
    itemEditClearKeyBtn.addEventListener("click", async () => {
      if (!confirm("确定清除该配置的已保存 API Key？")) {
        return;
      }
      const id = document.getElementById("aiItemEditId")?.value?.trim() || "";
      const purpose = document.getElementById("aiItemEditPurpose")?.value ?? "";
      const baseUrl = document.getElementById("aiItemEditBaseUrl")?.value?.trim() || "";
      const model = document.getElementById("aiItemEditModelType")?.value?.trim() || "";
      if (!id || !baseUrl || !model) {
        return;
      }
      try {
        await api.saveAIProfile({
          id,
          clearKey: true,
          label: model,
          purpose,
          baseUrl,
          model,
        });
        const keyEl = document.getElementById("aiItemEditApiKey");
        if (keyEl) {
          keyEl.value = "";
          keyEl.placeholder = "请输入 API Key";
        }
        await refreshAIState();
        renderManageList();
        closeAiCapabilityDialogIfOpen();
        appendBubble("assistant", "已清除该配置的密钥。");
        focusAiComposerAfterDialogs();
      } catch (err) {
        alert(err.message || String(err));
      }
    });
  }

  if (itemEditCancelBtn && itemEditDialog) {
    itemEditCancelBtn.addEventListener("click", () => itemEditDialog.close());
  }

  async function submitNewAiProfile() {
    if (!api.saveAIProfile) {
      return;
    }
    const displayLabel = document.getElementById("aiNewProfileLabel")?.value?.trim() || "";
    const modelKind = document.getElementById("aiNewProfileModelKind")?.value?.trim() || "对话模型";
    const providerId = document.getElementById("aiNewProfileProvider")?.value?.trim() || "";
    const baseUrl = document.getElementById("aiNewProfileBase")?.value?.trim() || "";
    const model = document.getElementById("aiNewProfileModelType")?.value?.trim() || "";
    const apiKey = document.getElementById("aiNewProfileKey")?.value?.trim() || "";
    const setAsDefault = profileSetDefaultEl ? profileSetDefaultEl.checked === true : true;
    const previousActiveId = cachedState.activeId;
    const provider = getProviderById(providerId);
    const baseUrlFinal = baseUrl || provider?.baseUrl || "";
    const skipKey = providerId === "ollama";
    const label = displayLabel || model;
    const purpose = modelKind ? `[${modelKind}]` : "";
    if (!providerId || !baseUrlFinal || !model || !label || (!apiKey && !skipKey)) {
      alert(
        skipKey
          ? "请填写模型名称、提供商、Base URL 与可调用模型（Ollama 本地服务可不填 API Key）。"
          : "请填写模型名称、提供商、Base URL、可调用模型与 API Key。"
      );
      return;
    }
    try {
      const saveRes = await api.saveAIProfile({ label, purpose, baseUrl: baseUrlFinal, model, apiKey });
      const newId = saveRes?.id || "";
      await refreshAIState();
      if (newId && !setAsDefault && previousActiveId && previousActiveId !== newId && api.setActiveAIProfile) {
        await api.setActiveAIProfile(previousActiveId);
        await refreshAIState();
      }
      clearAddProfileForm();
      renderManageList();
      closeAiCapabilityDialogIfOpen();
      appendBubble(
        "assistant",
        setAsDefault ? "已添加模型配置并切换为当前使用。" : "已添加模型配置（未切换默认模型）。"
      );
      focusAiComposerAfterDialogs();
    } catch (err) {
      alert(err.message || String(err));
    }
  }

  if (profileAddSubmitBtn && api.saveAIProfile) {
    profileAddSubmitBtn.addEventListener("click", () => {
      void submitNewAiProfile();
    });
  }

  if (profileAddCancelBtn) {
    profileAddCancelBtn.addEventListener("click", () => {
      clearAddProfileForm();
    });
  }

  if (profileClearFormBtn) {
    profileClearFormBtn.addEventListener("click", () => {
      clearAddProfileForm();
    });
  }

  if (profilesSearchInput) {
    profilesSearchInput.addEventListener("input", () => {
      renderManageList();
    });
  }

  if (profilesRefreshBtn) {
    profilesRefreshBtn.addEventListener("click", () => {
      void (async () => {
        await refreshAIState();
        renderManageList();
      })();
    });
  }

  if (profilesScrollToAddBtn) {
    profilesScrollToAddBtn.addEventListener("click", () => {
      const addSection = document.getElementById("aiProfileAddBlock");
      if (addSection && typeof addSection.scrollIntoView === "function") {
        addSection.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
      addProviderEl?.focus();
    });
  }

  if (profileKeyToggleBtn) {
    profileKeyToggleBtn.addEventListener("click", () => {
      const keyEl = document.getElementById("aiNewProfileKey");
      if (!keyEl) return;
      const show = keyEl.type === "password";
      keyEl.type = show ? "text" : "password";
      profileKeyToggleBtn.setAttribute("aria-label", show ? "隐藏密钥" : "显示密钥");
      profileKeyToggleBtn.title = show ? "隐藏密钥" : "显示密钥";
    });
  }

  if (profileTestBtn) {
    profileTestBtn.addEventListener("click", () => {
      void testNewProfileConnection();
    });
  }

  if (profileHostToggle) {
    profileHostToggle.addEventListener("click", (ev) => {
      const btn = ev.target.closest(".cap-chat-profiles-host-btn");
      if (!btn) return;
      const mode = btn.dataset.hostMode;
      profileHostToggle.querySelectorAll(".cap-chat-profiles-host-btn").forEach((el) => {
        el.classList.toggle("is-active", el === btn);
      });
      if (mode === "local") {
        if (addProviderEl) {
          addProviderEl.value = "ollama";
          addProviderEl.dispatchEvent(new Event("change"));
        }
      } else if (addProviderEl && addProviderEl.value === "ollama") {
        addProviderEl.value = "";
        fillModelOptions(addModelTypeEl, "");
        if (addBaseUrlEl) addBaseUrlEl.value = "";
      }
    });
  }

  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".cap-chat-profile-more")) {
      closeProfileMoreMenus();
    }
  });

  async function buildMessagesForRequest(docEntries = null) {
    const ctx = buildTaskContext();
    const memoryBlock = buildLongMemoryBlock();
    const sessionBlock = buildSessionSummaryBlock();
    const docContextBlock = buildPendingDocContextBlock(Array.isArray(docEntries) ? docEntries : pendingDocEntries);
    let locationBlock = "";
    try {
      if (api && typeof api.aiLocationContext === "function") {
        const out = await api.aiLocationContext();
        locationBlock = String(out?.block || "").trim();
      }
    } catch {
      locationBlock = "";
    }
    const highLogicBlock = isHighLogicModeEnabled()
      ? "【高逻辑模式】回答必须遵循：1) 先给结论；2) 再列依据（区分已知/未知）；3) 最后给不超过3条可执行行动项；4) 若信息不足要明确指出并提出补充问题。"
      : "";
    const activeProfile = (cachedState.profiles || []).find((p) => p.id === cachedState.activeId) || null;
    const localSmallModelBlock =
      activeProfile && isLocalProfileConfig(activeProfile) && /:0\.5b|:0\.6b|:1\.5b|:1\.7b|:3b|:4b|:7b\b/i.test(String(activeProfile.model || ""))
        ? "【本机小参数模型】使用 kb_search 后：字段表行数须与 grounding.fieldNames 一致，禁止新增文档未出现的字段行；章节备注中的「二选一」写入 orderId 备注，勿虚构 outOrderId。JSON 样例逐字复述 evidence，禁止 {...} 占位。"
        : "";
    const systemContent =
      `${AI_SYSTEM}\n\n【任务列表摘要】\n${ctx}` +
      (sessionBlock
        ? `\n\n【跨会话上下文摘要（历史对话要点，供延续语境；遇冲突以本轮用户输入为准）】\n${sessionBlock}`
        : "") +
      (highLogicBlock ? `\n\n${highLogicBlock}` : "") +
      (localSmallModelBlock ? `\n\n${localSmallModelBlock}` : "") +
      (locationBlock ? `\n\n${locationBlock}` : "") +
      (docContextBlock ? `\n\n${docContextBlock}` : "") +
      (memoryBlock
        ? `\n\n【长期记忆（历史偏好与结论，仅作参考，遇到新证据以新证据为准）】\n${memoryBlock}`
        : "");
    return [{ role: "system", content: systemContent }, ...chatTurns];
  }

  async function sendUserText(text) {
    const trimmed = String(text || "")
      .replace(/【上传文档：[\s\S]*?【文档结束】\n*/g, "")
      .trim();
    if (!trimmed) {
      return false;
    }
    if (chatStatusEl?.classList.contains("is-busy")) {
      return false;
    }
    if (/^\/help\b/i.test(trimmed)) {
      appendBubble("user", trimmed);
      appendBubble("assistant", AI_HELP_TEXT);
      return true;
    }
    if (aiMode === "image-vision" && !pendingVisionEntries.length) {
      appendBubble(
        "assistant",
        "请先将图片拖入输入框、或粘贴截图到输入框，再输入问题并发送。",
        { isError: true }
      );
      return false;
    }
    pushInputHistory(trimmed);
    historyIndex = -1;
    draftBeforeHistory = "";
    const docEntriesForTurn = aiMode === "chat" ? clonePendingDocEntries() : [];
    appendBubble("user", trimmed, { userDocs: docEntriesForTurn });
    if (aiMode === "chat" && pendingDocEntries.length) {
      clearDocAttachment();
    }
    if (aiMode === "chat" && docEntriesForTurn.length) {
      docPreview?.openByEntries(docEntriesForTurn);
    } else if (aiMode === "chat") {
      docPreview?.dispose();
    }
    if (inputEl) {
      inputEl.value = "";
      autoResizeInput();
    }
    if (chatStatusEl) {
      if (aiMode === "image-gen") {
        chatStatusEl.textContent = "文生图生成中…";
      } else if (aiMode === "image-vision") {
        chatStatusEl.textContent = "图像理解中…";
      } else {
        const useWeb = isWebSearchOn();
        chatStatusEl.textContent = useWeb ? "联网检索与生成中…" : "思考中…";
      }
      chatStatusEl.classList.add("is-busy");
    }
    syncSendEnabled();
    try {
      if (aiMode === "image-gen") {
        const res = await api.imageGenerate({ prompt: trimmed });
        appendBubble("assistant", "已生成图片。", {
          imageUrl: res.imageUrl || "",
          imageBase64: res.b64_json || "",
          imageAlt: trimmed,
        });
      } else if (aiMode === "image-vision") {
        if (!pendingVisionEntries.length) {
          throw new Error("缺少图片：请拖入或粘贴图片到输入框。");
        }
        const images = await Promise.all(
          pendingVisionEntries.map(async (e) => {
            const { mimeType, base64 } = await readFileAsBase64(e.file);
            return { mimeType, base64 };
          }),
        );
        const res = await api.imageUnderstand({
          images,
          prompt: trimmed,
        });
        const reply = String(res?.content || "").trim() || "（未返回识别结果）";
        appendBubble("assistant", reply);
        void tryAutoLearnTurn(trimmed, reply, "image-vision");
        clearVisionAttachment();
      } else {
        const reqId = resetAiComposeSession();
        chatTurns.push({ role: "user", content: trimmed });
        const useWeb = isWebSearchOn();
        const messages = await buildMessagesForRequest(docEntriesForTurn);
        let reply = "";
        let ollamaUsage = null;
        try {
          const out = await runChatWithTools(api, messages, {
            webSearch: useWeb,
            webSearchQuery: trimmed,
            requestId: reqId,
          });
          reply = stripAssistantCoT(out.text || "") || "（空回复）";
          ollamaUsage = out.ollamaUsage || null;
        } catch (firstErr) {
          if (
            aiComposeSession.aborted ||
            firstErr?.name === "AbortError" ||
            /用户已取消/.test(String(firstErr?.message || ""))
          ) {
            throw firstErr;
          }
          const res = await api.aiChat({
            messages,
            webSearch: useWeb,
            webSearchQuery: trimmed,
            requestId: reqId,
          });
          reply = stripAssistantCoT(res.content || "") || "（空回复）";
          ollamaUsage = res.ollamaUsage || null;
        }
        chatTurns.push({ role: "assistant", content: reply });
        updateSessionSummary(trimmed, reply);
        if (isLongMemoryEnabled()) {
          appendLongMemoryPair(trimmed, reply);
          setMemoryToggleUI(true);
        }
        appendBubble("assistant", reply, { ollamaUsage });
        void tryAutoLearnTurn(trimmed, reply, "chat");
        void maybeSpeakAssistantReply(api, reply);
      }
    } catch (err) {
      const isAbort =
        err?.name === "AbortError" ||
        /用户已取消|已取消生成|aborted/i.test(String(err?.message || err || ""));
      if (aiMode === "chat") {
        chatTurns.pop();
      }
      if (isAbort) {
        appendBubble("assistant", "已停止生成。你可以修改输入后重新发送。", { isError: false });
      } else {
        appendBubble("assistant", `请求失败：${err.message || err}`, { isError: true });
      }
    } finally {
      if (chatStatusEl) {
        chatStatusEl.textContent = "";
        chatStatusEl.classList.remove("is-busy");
      }
      syncSendEnabled();
    }
    return true;
  }

  inputEl.addEventListener("input", () => {
    autoResizeInput();
    syncSendEnabled();
  });

  window.addEventListener("resize", () => {
    autoResizeInput();
  });

  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (e.isComposing) {
        return;
      }
      e.preventDefault();
      void sendUserText(inputEl.value);
      return;
    }
    if (e.ctrlKey && e.key === "Tab") {
      e.preventDefault();
      const i = MODE_ORDER.indexOf(aiMode);
      const next = MODE_ORDER[(i + 1) % MODE_ORDER.length];
      setAiMode(next);
      return;
    }
    if (e.key === "ArrowUp" && inputEl.selectionStart === 0 && inputEl.selectionEnd === 0) {
      if (!inputHistory.length || chatStatusEl?.classList.contains("is-busy")) {
        return;
      }
      e.preventDefault();
      if (historyIndex === -1) {
        draftBeforeHistory = inputEl.value;
      }
      historyIndex = Math.min(historyIndex + 1, inputHistory.length - 1);
      inputEl.value = inputHistory[inputHistory.length - 1 - historyIndex];
      autoResizeInput();
      syncSendEnabled();
      return;
    }
    if (e.key === "ArrowDown" && inputEl.selectionStart === inputEl.value.length && inputEl.selectionEnd === inputEl.value.length) {
      if (historyIndex < 0 || chatStatusEl?.classList.contains("is-busy")) {
        return;
      }
      e.preventDefault();
      historyIndex -= 1;
      if (historyIndex < 0) {
        inputEl.value = draftBeforeHistory;
      } else {
        inputEl.value = inputHistory[inputHistory.length - 1 - historyIndex];
      }
      autoResizeInput();
      syncSendEnabled();
    }
  });

  function renderMemoryManageList() {
    if (!memoryManageList) {
      return;
    }
    const items = readLongMemoryItems();
    memoryManageList.innerHTML = "";
    if (!items.length) {
      memoryManageList.innerHTML = '<p class="field-hint">暂无长期记忆。</p>';
      return;
    }
    items.forEach((item, idx) => {
      const card = document.createElement("article");
      card.className = "ai-memory-manage-item";
      card.innerHTML = `
        <div class="ai-memory-manage-meta">${escapeHtml(item.ts || "")}</div>
        <label>问 <textarea data-mem-q="${idx}" rows="2">${escapeHtml(item.q)}</textarea></label>
        <label>答 <textarea data-mem-a="${idx}" rows="3">${escapeHtml(item.a)}</textarea></label>
        <div class="ai-memory-manage-actions">
          <button type="button" class="secondary" data-mem-save="${idx}">保存</button>
          <button type="button" class="danger" data-mem-del="${idx}">删除</button>
        </div>`;
      memoryManageList.appendChild(card);
    });
    memoryManageList.querySelectorAll("[data-mem-save]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-mem-save"));
        const list = readLongMemoryItems();
        const qEl = memoryManageList.querySelector(`[data-mem-q="${i}"]`);
        const aEl = memoryManageList.querySelector(`[data-mem-a="${i}"]`);
        if (!list[i] || !qEl || !aEl) {
          return;
        }
        list[i].q = qEl.value.trim();
        list[i].a = aEl.value.trim();
        writeLongMemoryItems(list.filter((x) => x.q && x.a));
        renderMemoryManageList();
        setMemoryToggleUI(isLongMemoryEnabled());
      });
    });
    memoryManageList.querySelectorAll("[data-mem-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-mem-del"));
        const list = readLongMemoryItems();
        list.splice(i, 1);
        writeLongMemoryItems(list);
        renderMemoryManageList();
        setMemoryToggleUI(isLongMemoryEnabled());
      });
    });
  }

  manageMemoryBtn?.addEventListener("click", () => {
    renderMemoryManageList();
    memoryManageDialog?.showModal();
  });
  memoryManageCloseBtn?.addEventListener("click", () => memoryManageDialog?.close());

  clearMemoryBtn?.addEventListener("click", () => {
    writeLongMemoryItems([]);
    setMemoryToggleUI(isLongMemoryEnabled());
    renderMemoryManageList();
    appendBubble("assistant", "已清空长期记忆。");
  });

  openOllamaInferenceBtn?.addEventListener("click", () => {
    if (typeof window.openOllamaInferenceSettings === "function") {
      window.openOllamaInferenceSettings();
    } else if (typeof window.openCapabilityLocalModels === "function") {
      window.openCapabilityLocalModels({ view: "overview", scrollToInference: true });
    } else {
      document.getElementById("topbarCapabilityBtn")?.click();
    }
  });

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      searchHitIndex = 0;
      applyChatSearchToBodies();
    });
  }
  if (searchPrev) {
    searchPrev.addEventListener("click", () => goSearchHit(-1));
  }
  if (searchNext) {
    searchNext.addEventListener("click", () => goSearchHit(1));
  }
  if (searchClear) {
    searchClear.addEventListener("click", () => {
      searchHitIndex = 0;
      if (searchInput) {
        searchInput.value = "";
      }
      applyChatSearchToBodies();
    });
  }

  document.querySelectorAll(".ai-quick").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.prompt;
      const preset = QUICK_PROMPTS[key];
      if (!preset || !inputEl) {
        return;
      }
      inputEl.value = preset;
      inputEl.focus();
      autoResizeInput();
      syncSendEnabled();
    });
  });

  if (sendBtn && inputEl) {
    sendBtn.addEventListener("click", () => {
      void sendUserText(inputEl.value);
    });
  }

  if (topbarAi) {
    topbarAi.addEventListener("click", () => {
      if (typeof window.openOrFocusTab === "function") {
        window.openOrFocusTab("ai");
      }
    });
  }

  window.__getAiComposerPendingFiles = function __getAiComposerPendingFiles() {
    const files = [];
    pendingVisionEntries.forEach((entry) => {
      if (entry?.file) {
        files.push(entry.file);
      }
    });
    pendingDocEntries.forEach((entry) => {
      if (entry?.file) {
        files.push(entry.file);
      }
    });
    return files;
  };

  window.clearAiComposerPendingFiles = function clearAiComposerPendingFiles() {
    clearVisionAttachment();
    clearDocAttachment();
  };

  setAiMode("chat");
  syncChatEmptyState();
  syncSendEnabled();
  refreshAIState();
  autoResizeInput();
  syncSendEnabled();
}

window.initAI = initAI;
initAI();
