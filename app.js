/** 数据键保持不变，升级版本后仍读取旧版登记的任务 */
const STORAGE_KEY = "daily_task_tracker_v1";
const SIDEBAR_COLLAPSED_KEY = "daily_task_tracker_sidebar_collapsed";
const DAILY_WORK_CHILD_ROUTES = new Set(["new", "filter", "list", "dashboard"]);

const ROUTES = {
  new: { panelId: "panel-new", title: "新增待处理事项", breadcrumb: "工作台 / 每日工作跟进 / 新增待处理事项" },
  filter: { panelId: "panel-filter", title: "查询筛选", breadcrumb: "工作台 / 每日工作跟进 / 查询筛选" },
  dashboard: { panelId: "panel-dashboard", title: "数据看板", breadcrumb: "工作台 / 每日工作跟进 / 数据看板" },
  list: { panelId: "panel-list", title: "任务列表", breadcrumb: "工作台 / 每日工作跟进 / 任务列表" },
  ai: { panelId: "panel-ai", title: "AI助手", breadcrumb: "工作台 / AI助手" },
  record: { panelId: "panel-record", title: "记录助手", breadcrumb: "工作台 / 记录助手" },
  "knowledge-base": {
    panelId: "panel-knowledge-base",
    title: "本地知识库",
    breadcrumb: "工作台 / 本地知识库",
  },
};

const taskForm = document.getElementById("taskForm");
const filterForm = document.getElementById("filterForm");
const taskTableBody = document.getElementById("taskTableBody");
const taskStats = document.getElementById("taskStats");
const breadcrumbEl = document.getElementById("breadcrumb");
const tabsStrip = document.getElementById("tabsStrip");
const taskIdInput = document.getElementById("taskId");
const taskIdErrorEl = document.getElementById("taskIdError");
const taskContentInput = document.getElementById("content");
const taskRemarkInput = document.getElementById("remark");
const taskContentCharCount = document.getElementById("contentCharCount");
const taskRemarkCharCount = document.getElementById("remarkCharCount");
const taskPrioritySelect = document.getElementById("priority");
const taskPriorityWrap = document.querySelector(".priority-select-wrap");

function syncTaskNewCharCounter(inputEl, counterEl) {
  if (!inputEl || !counterEl) {
    return;
  }
  const max = Number(inputEl.getAttribute("maxlength")) || 500;
  const len = String(inputEl.value || "").length;
  counterEl.textContent = `${len} / ${max}`;
}

function syncTaskNewPriorityDot() {
  if (!taskPriorityWrap || !taskPrioritySelect) {
    return;
  }
  taskPriorityWrap.setAttribute("data-priority", taskPrioritySelect.value || "中");
}

function resetTaskNewFormUi() {
  syncTaskNewCharCounter(taskContentInput, taskContentCharCount);
  syncTaskNewCharCounter(taskRemarkInput, taskRemarkCharCount);
  syncTaskNewPriorityDot();
}

taskContentInput?.addEventListener("input", () => syncTaskNewCharCounter(taskContentInput, taskContentCharCount));
taskRemarkInput?.addEventListener("input", () => syncTaskNewCharCounter(taskRemarkInput, taskRemarkCharCount));
taskPrioritySelect?.addEventListener("change", syncTaskNewPriorityDot);
resetTaskNewFormUi();

const reminderDialog = document.getElementById("reminderDialog");
const reminderBody = document.getElementById("reminderBody");
const reminderOkBtn = document.getElementById("reminderOkBtn");

const remarkDialog = document.getElementById("remarkDialog");
const remarkDialogTitle = document.getElementById("remarkDialogTitle");
const remarkTarget = document.getElementById("remarkTarget");
const remarkHistoryList = document.getElementById("remarkHistoryList");
const remarkNewInput = document.getElementById("remarkNewInput");
const remarkCancelBtn = document.getElementById("remarkCancelBtn");
const remarkSubmitBtn = document.getElementById("remarkSubmitBtn");
const taskContentDialog = document.getElementById("taskContentDialog");
const taskContentDialogTitle = document.getElementById("taskContentDialogTitle");
const taskContentDialogMeta = document.getElementById("taskContentDialogMeta");
const taskContentDetailBody = document.getElementById("taskContentDetailBody");
const taskContentCloseBtn = document.getElementById("taskContentCloseBtn");
const paginationBar = document.getElementById("paginationBar");
const taskListQuickSearchEl = document.getElementById("taskListQuickSearch");
const skillSummary = document.getElementById("skillSummary");
const skillList = document.getElementById("skillList");

let lastRuntimePrereqSnapshot = null;
const STARTUP_WARMUP_BANNER_DISMISS_KEY = "startup_warmup_banner_dismiss_v1";
let lastStartupWarmupReport = null;
/** @type {object | null} */
window.runtimeProfile = null;

function renderEnvironmentIndicator(profile) {
  const btn = document.getElementById("topbarEnvBtn");
  const dot = document.getElementById("topbarEnvDot");
  const label = document.getElementById("topbarEnvLabel");
  if (!btn) {
    return;
  }
  if (!profile) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  const embed = profile.core?.knowledgeBaseEmbedReady === true;
  const ollama = profile.core?.ollamaRunning === true;
  const chat = profile.core?.localAiReady === true;
  let state = "warn";
  let text = "环境待配置";
  if (embed && ollama && chat) {
    state = "ok";
    text = "环境就绪";
  } else if (ollama && embed) {
    state = "warn";
    text = "缺对话模型";
  } else if (ollama) {
    state = "warn";
    text = "缺 bge-m3";
  } else {
    state = "error";
    text = "缺 Ollama";
  }
  btn.dataset.envState = state;
  if (label) {
    label.textContent = text;
  }
  if (dot) {
    dot.className = `topbar-env-dot topbar-env-dot--${state}`;
  }
}

window.applyRuntimeProfile = function applyRuntimeProfile(profile) {
  window.runtimeProfile = profile && typeof profile === "object" ? profile : null;
  renderEnvironmentIndicator(window.runtimeProfile);
  document.dispatchEvent(new CustomEvent("runtime-profile-updated", { detail: { profile: window.runtimeProfile } }));
};

document.getElementById("topbarEnvBtn")?.addEventListener("click", () => {
  if (typeof window.openEnvironmentSetupWizard === "function") {
    void window.openEnvironmentSetupWizard();
  }
});

/** 避免连续多条播报失败时反复弹窗 */
let lastRuntimePrereqOfferAt = 0;
const RUNTIME_PREREQ_OFFER_COOLDOWN_MS = 90_000;

async function shouldOfferRuntimePrereqAfterTtsFailure(message) {
  const msg = String(message || "");
  if (/play\(\)|NotAllowedError|not allowed|interrupted|用户未与页面|aborted|自动播放/i.test(msg)) {
    return false;
  }
  if (
    /请先在|API Key|api key|密钥|填写.*Key|配额|额度|限额|usage limit|quota|rate limit|401|403|unauthorized|invalid.*key/i.test(
      msg,
    )
  ) {
    return false;
  }
  if (/python|pip|venv|subprocess|ENOENT|spawn|errno|timed out|超时/i.test(msg)) {
    return true;
  }
  return false;
}

/**
 * 语音播报失败后的可选引导：跳转技能中心并执行运行环境评估。
 * 由 ai.js / media.js 在判定可能与本地环境相关时调用。
 */
window.offerRuntimePrereqAfterTtsFailure = async function offerRuntimePrereqAfterTtsFailure(message) {
  const api = window.electronAPI;
  if (!api?.runtimePrerequisitesEvaluate) {
    return;
  }
  if (!(await shouldOfferRuntimePrereqAfterTtsFailure(message))) {
    return;
  }
  const now = Date.now();
  if (now - lastRuntimePrereqOfferAt < RUNTIME_PREREQ_OFFER_COOLDOWN_MS) {
    return;
  }
  lastRuntimePrereqOfferAt = now;
  const go = window.confirm(
    "语音播报失败，可能与本地运行环境有关。\n\n是否前往「设置 → 技能中心」并立即执行运行环境评估？",
  );
  if (!go) {
    return;
  }
  if (typeof window.openCapabilitySkills === "function") {
    window.openCapabilitySkills();
  } else {
    document.getElementById("topbarCapabilityBtn")?.click();
  }
  window.setTimeout(() => {
    void (async () => {
      try {
        lastRuntimePrereqSnapshot = await api.runtimePrerequisitesEvaluate();
      } catch (err) {
        lastRuntimePrereqSnapshot = { ok: false, error: err?.message || String(err), issues: [] };
      }
      renderRuntimePrerequisitesBar();
    })();
  }, 80);
};

function runStartupWarmupAction(action) {
  if (!action || typeof action !== "object") {
    return;
  }
  const type = String(action.type || "");
  if (type === "environment-wizard") {
    if (typeof window.openEnvironmentSetupWizard === "function") {
      void window.openEnvironmentSetupWizard();
    }
    return;
  }
  if (type === "local-models") {
    if (typeof window.openCapabilityLocalModels === "function") {
      window.openCapabilityLocalModels({ scrollToInference: true });
    } else {
      document.getElementById("topbarCapabilityBtn")?.click();
    }
    return;
  }
  if (type === "chat-profiles") {
    if (typeof window.openCapabilityChatProfiles === "function") {
      window.openCapabilityChatProfiles();
    } else {
      document.getElementById("topbarCapabilityBtn")?.click();
    }
    return;
  }
  if (type === "knowledge-base") {
    document.querySelector('.nav-item[data-route="knowledge-base"]')?.click();
    return;
  }
  if (type === "reload") {
    window.location.reload();
  }
}

function renderStartupWarmupBar(report) {
  const bar = document.getElementById("startupWarmupBar");
  if (!bar) {
    return;
  }
  if (!report || report.skipped || report.status === "success") {
    bar.hidden = true;
    bar.innerHTML = "";
    bar.classList.remove("is-warning", "is-error");
    return;
  }
  if (sessionStorage.getItem(STARTUP_WARMUP_BANNER_DISMISS_KEY) === "1") {
    bar.hidden = true;
    return;
  }

  lastStartupWarmupReport = report;
  const isError = report.status === "error";
  const issues = Array.isArray(report.issues) ? report.issues : [];
  const primaryAction = issues.find((i) => i.action)?.action || null;
  const issueItems = issues
    .slice(0, 4)
    .map(
      (issue) =>
        `<li class="startup-warmup-bar__issue"><strong>${escapeHtml(issue.label || "")}</strong>：${escapeHtml(issue.message || "")}</li>`,
    )
    .join("");
  const actionBtn = primaryAction
    ? `<button type="button" class="secondary" data-startup-action="${escapeHtmlAttr(primaryAction.type)}">${escapeHtml(primaryAction.label || "去设置")}</button>`
    : `<button type="button" class="secondary" data-startup-action="chat-profiles">打开设置</button>`;

  bar.classList.toggle("is-warning", !isError);
  bar.classList.toggle("is-error", isError);
  bar.hidden = false;
  bar.innerHTML = `<div class="startup-warmup-bar__inner">
    <div class="startup-warmup-bar__main">
      <p class="startup-warmup-bar__title">${isError ? "启动检查：部分关键模块未就绪" : "启动检查：部分能力待配置"}</p>
      <p class="startup-warmup-bar__summary">${escapeHtml(report.message || "")}${report.timedOut ? "（部分检查可能因超时而未完成）" : ""}</p>
      ${issueItems ? `<ul class="startup-warmup-bar__issues">${issueItems}</ul>` : ""}
    </div>
    <div class="startup-warmup-bar__actions">
      ${actionBtn}
      <button type="button" class="secondary" data-startup-dismiss="1">知道了</button>
    </div>
  </div>`;

  bar.querySelector("[data-startup-dismiss]")?.addEventListener("click", () => {
    sessionStorage.setItem(STARTUP_WARMUP_BANNER_DISMISS_KEY, "1");
    bar.hidden = true;
  });
  bar.querySelector("[data-startup-action]")?.addEventListener("click", (ev) => {
    const type = ev.currentTarget?.getAttribute("data-startup-action") || "";
    const issue = issues.find((i) => i.action?.type === type);
    runStartupWarmupAction(issue?.action || { type, label: "去设置" });
  });
}

async function initStartupWarmupBar() {
  const api = window.electronAPI;
  if (!api?.getStartupReport) {
    return;
  }
  api.onEnvironmentProfile?.((profile) => {
    window.applyRuntimeProfile?.(profile);
  });
  try {
    const profile = await api.environmentGetProfile?.();
    if (profile) {
      window.applyRuntimeProfile?.(profile);
    }
  } catch {
    /* optional */
  }
  api.onStartupReport?.((report) => {
    renderStartupWarmupBar(report);
  });
  try {
    const report = await api.getStartupReport();
    if (report) {
      renderStartupWarmupBar(report);
    }
  } catch {
    /* optional banner */
  }
}

function renderRuntimePrerequisitesBar() {
  const bar = document.getElementById("runtimePrerequisitesBar");
  if (!bar) {
    return;
  }
  const api = window.electronAPI;
  const snap = lastRuntimePrereqSnapshot;
  const issues = Array.isArray(snap?.issues) ? snap.issues : [];
  const healthy = snap?.healthy === true;
  const py = snap?.python;
  const evalLabel = snap ? "重新评估" : "开始评估";

  const issuesHtml = issues.length
    ? issues
        .map((i) => {
          const sev = String(i.severity || "info").replace(/[^a-z]/gi, "");
          const fixBtn =
            i.autoAvailable && api?.runtimePrerequisitesRemediate
              ? `<button type="button" class="secondary" data-prq-fix="${escapeHtmlAttr(i.id)}">应用内修复</button>`
              : "";
          const openBtn =
            i.remediateType === "open_url" && i.remediateUrl && api?.runtimePrerequisitesOpenUrl
              ? `<button type="button" class="secondary" data-prq-open="${escapeHtmlAttr(i.remediateUrl)}">打开安装说明</button>`
              : "";
          return `<div class="runtime-prereq-issue runtime-prereq-sev-${escapeHtml(sev)}">
            <div class="runtime-prereq-issue-title">${escapeHtml(i.title || "")}</div>
            <div class="runtime-prereq-issue-detail">${escapeHtml(i.detail || "")}</div>
            <div class="runtime-prereq-issue-actions">${fixBtn}${openBtn}</div>
          </div>`;
        })
        .join("")
    : '<p class="field-hint">尚未评估。点击下方按钮检测 Python 与编译工具等依赖。</p>';

  const errHint =
    snap && snap.ok === false
      ? `<p class="field-hint" style="color:#b91c1c">评估失败：${escapeHtml(String(snap.error || "未知错误"))}</p>`
      : "";

  const statusLine = snap && snap.ok !== false
    ? `<p class="runtime-prereq-status">${healthy ? "当前无告警项" : `共 ${issues.length} 项提示或问题`}${
        py?.found ? ` · Python ${escapeHtml(py.versionStr)}` : ""
      }</p>`
    : "";

  bar.innerHTML = `
    <div class="runtime-prereq-head">
      <h3 class="runtime-prereq-title">运行环境评估</h3>
      <div class="runtime-prereq-actions">
        <button type="button" class="secondary" id="runtimePrereqEvalBtn">${evalLabel}</button>
        <button type="button" class="secondary" id="runtimePrereqAutoFixBtn">一键修复可自动项</button>
      </div>
    </div>
    ${errHint}
    ${statusLine}
    <div class="runtime-prereq-issues">${issuesHtml}</div>
    <p class="field-hint runtime-prereq-foot">无法自动修复的项会打开官方下载页。</p>
  `;

  const evalBtn = bar.querySelector("#runtimePrereqEvalBtn");
  const autoFixBtn = bar.querySelector("#runtimePrereqAutoFixBtn");
  if (evalBtn && api?.runtimePrerequisitesEvaluate) {
    evalBtn.addEventListener("click", async () => {
      evalBtn.disabled = true;
      if (autoFixBtn) {
        autoFixBtn.disabled = true;
      }
      try {
        lastRuntimePrereqSnapshot = await api.runtimePrerequisitesEvaluate();
      } catch (err) {
        lastRuntimePrereqSnapshot = { ok: false, error: err?.message || String(err), issues: [] };
      } finally {
        evalBtn.disabled = false;
        if (autoFixBtn) {
          autoFixBtn.disabled = false;
        }
        renderRuntimePrerequisitesBar();
      }
    });
  } else if (evalBtn) {
    evalBtn.disabled = true;
  }

  if (autoFixBtn && api?.runtimePrerequisitesRemediateAuto) {
    autoFixBtn.addEventListener("click", async () => {
      autoFixBtn.disabled = true;
      if (evalBtn) {
        evalBtn.disabled = true;
      }
      try {
        const out = await api.runtimePrerequisitesRemediateAuto();
        if (out?.after) {
          lastRuntimePrereqSnapshot = out.after;
        }
      } catch (err) {
        lastRuntimePrereqSnapshot = {
          ok: false,
          error: err?.message || String(err),
          issues: lastRuntimePrereqSnapshot?.issues || [],
        };
      } finally {
        autoFixBtn.disabled = false;
        if (evalBtn) {
          evalBtn.disabled = false;
        }
        renderRuntimePrerequisitesBar();
      }
    });
  } else if (autoFixBtn) {
    autoFixBtn.disabled = true;
  }

  bar.querySelectorAll("[data-prq-fix]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-prq-fix");
      if (!api?.runtimePrerequisitesRemediate || !id) {
        return;
      }
      btn.disabled = true;
      try {
        await api.runtimePrerequisitesRemediate({ issueId: id });
        if (api.runtimePrerequisitesEvaluate) {
          lastRuntimePrereqSnapshot = await api.runtimePrerequisitesEvaluate();
        }
      } finally {
        btn.disabled = false;
        renderRuntimePrerequisitesBar();
      }
    });
  });

  bar.querySelectorAll("[data-prq-open]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.getAttribute("data-prq-open");
      if (!api?.runtimePrerequisitesOpenUrl || !url) {
        return;
      }
      await api.runtimePrerequisitesOpenUrl({ url });
    });
  });
}

const resetFormBtn = document.getElementById("resetFormBtn");
const clearFilterBtn = document.getElementById("clearFilterBtn");
const taskListSortByEl = document.getElementById("taskListSortBy");
const taskExportExcelBtn = document.getElementById("taskExportExcelBtn");
const taskChangeLogListEl = document.getElementById("taskChangeLogList");
const dashboardRootEl = document.getElementById("dashboardRoot");
const dashboardSummaryEl = document.getElementById("dashboardSummary");
const dashboardRefreshBtn = document.getElementById("dashboardRefreshBtn");
const taskTemplateSelectEl = document.getElementById("taskTemplateSelect");
const applyTaskTemplateBtn = document.getElementById("applyTaskTemplateBtn");
const saveTaskTemplateBtn = document.getElementById("saveTaskTemplateBtn");
const deleteTaskTemplateBtn = document.getElementById("deleteTaskTemplateBtn");
const customReportDialog = document.getElementById("customReportDialog");
const customReportGenerateBtn = document.getElementById("customReportGenerateBtn");
const customReportExportBtn = document.getElementById("customReportExportBtn");
const openCustomReportBtn = document.getElementById("openCustomReportBtn");
const listCustomReportBtn = document.getElementById("listCustomReportBtn");
const customReportResultEl = document.getElementById("customReportResult");
const customReportTableHeadEl = document.getElementById("customReportTableHead");
const customReportTableBodyEl = document.getElementById("customReportTableBody");
const taskListEmptyEl = document.getElementById("taskListEmpty");
const taskTableWrapEl = document.getElementById("taskTableWrap");
const taskCardListEl = document.getElementById("taskCardList");
const taskListToastEl = document.getElementById("taskListToast");

let lastCustomReport = null;
let taskListToastTimer = 0;

function te() {
  return window.TaskEnhance || {};
}

function ta() {
  return window.TaskAnalytics || {};
}

function taskStatusList() {
  return te().TASK_STATUSES || ["待处理", "处理中", "已完结"];
}

let tasks = [];
window.getTasksForAI = () => tasks;
let activeRemarkTaskId = null;

const PAGE_SIZE = 10;
const PAGES_IN_GROUP = 10;
let listCurrentPage = 1;
let listPageWindowStart = 1;

/** 已打开的标签顺序 */
let openTabs = [];
/** 当前激活的路由 key */
let activeRoute = null;
let dailyWorkExpanded = false;

function nowString() {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function toLocalTime(ms) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}

function parseAnyTimeToMs(s) {
  if (!s) {
    return 0;
  }
  const n = Date.parse(String(s).replace(/\//g, "-"));
  return Number.isFinite(n) ? n : 0;
}

function pad2(n) {
  return String(Number(n)).padStart(2, "0");
}

/** 本地日历日 YYYY-MM-DD，用于与日期筛选对齐（无时区偏移问题） */
function localDateKeyFromDate(d) {
  if (!d || Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 从登记时间字符串解析出 YYYY-MM-DD。
 * 兼容：ISO 前缀、2026年4月1日、2026/4/1、toLocaleString 等，避免筛选时 taskDay 为空导致全部被过滤。
 */
function parseCreatedAtToDateKey(createdAt) {
  if (!createdAt || typeof createdAt !== "string") {
    return "";
  }
  const s = createdAt.trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return `${m[1]}-${m[2]}-${m[3]}`;
  }
  m = s.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (m) {
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  }
  m = s.match(/^(\d{4})[/.](\d{1,2})[/.](\d{1,2})/);
  if (m) {
    return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  }
  const normalized = s.replace(/\//g, "-").replace(/年|月/g, "-").replace(/日/g, " ");
  const d = new Date(normalized);
  if (!Number.isNaN(d.getTime())) {
    return localDateKeyFromDate(d);
  }
  return "";
}

/** type=date 的 value 直接使用，避免 new Date('YYYY-MM-DD') 的时区偏差 */
function filterInputDateKey(value) {
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return localDateKeyFromDate(d);
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const remarks = Array.isArray(raw.remarks) ? raw.remarks : [];
  const createdAt = String(raw.createdAt ?? nowString());
  let createdAtIsoDate = raw.createdAtIsoDate;
  if (!createdAtIsoDate || !/^\d{4}-\d{2}-\d{2}$/.test(createdAtIsoDate)) {
    createdAtIsoDate = parseCreatedAtToDateKey(createdAt);
  }
  const base = {
    id: raw.id || crypto.randomUUID(),
    taskId: String(raw.taskId ?? ""),
    issueType: String(raw.issueType ?? ""),
    content: String(raw.content ?? ""),
    reporter: String(raw.reporter ?? ""),
    handler: String(raw.handler ?? ""),
    createdAt,
    createdAtIsoDate,
    status: taskStatusList().includes(raw.status) ? raw.status : "待处理",
    remarks,
    completedAt: String(raw.completedAt ?? ""),
  };
  return te().extendNormalizedTask ? te().extendNormalizedTask(raw, base) : base;
}

function readTasks() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map(normalizeTask).filter(Boolean);
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  tlv().invalidateTaskListCache?.();
}

function createTask(data) {
  const createdAt = nowString();
  const createdAtIsoDate = localDateKeyFromDate(new Date());
  const remarkText = data.remark.trim();
  const initialHistory = [];
  if (remarkText) {
    initialHistory.push({
      id: crypto.randomUUID(),
      content: remarkText,
      remarkTime: createdAt,
    });
  }

  const TE = te();
  return {
    id: crypto.randomUUID(),
    taskId: data.taskId.trim(),
    issueType: data.issueType.trim(),
    content: data.content.trim(),
    reporter: data.reporter.trim(),
    handler: data.handler.trim(),
    createdAt,
    createdAtIsoDate,
    status: taskStatusList().includes(data.status) ? data.status : "待处理",
    priority: TE.normalizePriority ? TE.normalizePriority(data.priority) : "中",
    deadline: TE.normalizeDeadline ? TE.normalizeDeadline(data.deadline) : "",
    remarks: initialHistory,
    completedAt: "",
    updatedAt: createdAt,
    changeLog: [],
    blockReason: String(data.blockReason || "").trim(),
    blockDependency: String(data.blockDependency || "").trim(),
    suspendedAt: "",
    cancelledAt: "",
    attachmentDir: String(data.attachmentDir || "").trim(),
  };
}

function refreshAutoTaskId() {
  const TE = te();
  if (taskIdInput && TE.generateTaskId) {
    taskIdInput.value = TE.generateTaskId(tasks);
  }
}

function applyTaskFieldChange(task, field, newValue, operator = "用户") {
  const oldValue = task[field];
  if (oldValue === newValue) {
    return;
  }
  const TE = te();
  TE.recordChangeLog?.(task, {
    at: nowString(),
    operator,
    field,
    oldValue: oldValue ?? "",
    newValue: newValue ?? "",
  });
  task[field] = newValue;
  TE.touchTaskUpdated?.(task, nowString());
}

function initTasksFromStorage() {
  tasks = readTasks();
  const TE = te();
  let dirty = false;
  if (TE.migrateLegacyTaskIds) {
    const mig = TE.migrateLegacyTaskIds(tasks);
    if (mig.changed) {
      dirty = true;
    }
    tasks = mig.tasks;
  }
  if (TE.dedupeExactContentTasks) {
    const ded = TE.dedupeExactContentTasks(tasks);
    if (ded.removed) {
      dirty = true;
    }
    tasks = ded.tasks;
  }
  if (TE.runTaskMaintenance) {
    const m = TE.runTaskMaintenance(tasks, { nowString, getTaskLatestUpdateMs, parseAnyTimeToMs });
    if (m.notes || m.suspended) {
      dirty = true;
    }
  }
  if (dirty) {
    saveTasks();
  }
  window.getTasksForAI = () => tasks;
  refreshAutoTaskId();
}

function latestRemark(task) {
  if (!task.remarks.length) {
    return { content: "", remarkTime: "" };
  }
  const sorted = sortRemarksNewestFirst(task.remarks);
  return sorted[0];
}

function remarkTimeMs(remarkTime) {
  if (!remarkTime) {
    return 0;
  }
  const s = String(remarkTime).trim();
  const d = new Date(s.replace(/\//g, "-"));
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

/** 从新到旧 */
function sortRemarksNewestFirst(remarks) {
  return remarks.slice().sort((a, b) => remarkTimeMs(b.remarkTime) - remarkTimeMs(a.remarkTime));
}

function maxPageWindowStart(totalPages) {
  if (totalPages <= 0) {
    return 1;
  }
  return Math.floor((totalPages - 1) / PAGES_IN_GROUP) * PAGES_IN_GROUP + 1;
}

function resetListPagination() {
  listCurrentPage = 1;
  listPageWindowStart = 1;
}

function renderPagination(totalFiltered) {
  if (!paginationBar) {
    return;
  }
  paginationBar.innerHTML = "";
  const totalPages = totalFiltered === 0 ? 0 : Math.ceil(totalFiltered / PAGE_SIZE);
  if (totalPages === 0) {
    return;
  }

  if (listCurrentPage > totalPages) {
    listCurrentPage = totalPages;
  }
  if (listCurrentPage < 1) {
    listCurrentPage = 1;
  }

  const maxW = maxPageWindowStart(totalPages);
  if (listPageWindowStart > maxW) {
    listPageWindowStart = maxW;
  }
  if (listPageWindowStart < 1) {
    listPageWindowStart = 1;
  }

  const info = document.createElement("div");
  info.className = "pagination-info";
  const startIdx = (listCurrentPage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(listCurrentPage * PAGE_SIZE, totalFiltered);
  info.textContent = `共 ${totalFiltered} 条 · 每页 ${PAGE_SIZE} 条 · 第 ${listCurrentPage}/${totalPages} 页（本页 ${startIdx}-${endIdx}）`;

  const row = document.createElement("div");
  row.className = "pagination-controls";

  const prevGroup = document.createElement("button");
  prevGroup.type = "button";
  prevGroup.className = "secondary pagination-group-btn";
  prevGroup.textContent = "上一组";
  prevGroup.disabled = listPageWindowStart <= 1;
  prevGroup.addEventListener("click", () => {
    listPageWindowStart = Math.max(1, listPageWindowStart - PAGES_IN_GROUP);
    listCurrentPage = listPageWindowStart;
    render();
  });

  const nextGroup = document.createElement("button");
  nextGroup.type = "button";
  nextGroup.className = "secondary pagination-group-btn";
  nextGroup.textContent = "下一组";
  nextGroup.disabled = listPageWindowStart >= maxW;
  nextGroup.addEventListener("click", () => {
    listPageWindowStart = Math.min(maxW, listPageWindowStart + PAGES_IN_GROUP);
    listCurrentPage = listPageWindowStart;
    render();
  });

  const pagesWrap = document.createElement("div");
  pagesWrap.className = "pagination-pages";
  const endPage = Math.min(listPageWindowStart + PAGES_IN_GROUP - 1, totalPages);
  for (let p = listPageWindowStart; p <= endPage; p += 1) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pagination-page" + (p === listCurrentPage ? " is-active" : "");
    btn.textContent = String(p);
    btn.addEventListener("click", () => {
      listCurrentPage = p;
      listPageWindowStart = Math.floor((p - 1) / PAGES_IN_GROUP) * PAGES_IN_GROUP + 1;
      render();
    });
    pagesWrap.appendChild(btn);
  }

  row.appendChild(prevGroup);
  row.appendChild(pagesWrap);
  row.appendChild(nextGroup);
  paginationBar.appendChild(info);
  paginationBar.appendChild(row);
}

function openRemarkModal(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) {
    return;
  }
  activeRemarkTaskId = taskId;
  remarkDialogTitle.textContent = "备注";
  remarkTarget.textContent = `登记事物ID：${task.taskId} ｜ 当前状态：${task.status}`;
  remarkNewInput.value = "";

  if (taskChangeLogListEl) {
    taskChangeLogListEl.innerHTML = "";
    const logs = Array.isArray(task.changeLog) ? task.changeLog.slice().reverse() : [];
    if (!logs.length) {
      const empty = document.createElement("p");
      empty.className = "remark-history-empty";
      empty.textContent = "暂无变更记录";
      taskChangeLogListEl.appendChild(empty);
    } else {
      logs.forEach((item) => {
        const block = document.createElement("div");
        block.className = "remark-history-item";
        block.innerHTML = `<div class="remark-history-time">${escapeHtml(item.at || "")} · ${escapeHtml(item.operator || "用户")}</div><div class="remark-history-text">${escapeHtml(item.field || "")}：${escapeHtml(String(item.oldValue ?? ""))} → ${escapeHtml(String(item.newValue ?? ""))}</div>`;
        taskChangeLogListEl.appendChild(block);
      });
    }
  }

  remarkHistoryList.innerHTML = "";
  const sorted = sortRemarksNewestFirst(task.remarks);
  if (!sorted.length) {
    const empty = document.createElement("p");
    empty.className = "remark-history-empty";
    empty.textContent = "暂无历史备注";
    remarkHistoryList.appendChild(empty);
  } else {
    sorted.forEach((item) => {
      const block = document.createElement("div");
      block.className = "remark-history-item";
      block.innerHTML = `<div class="remark-history-time">${escapeHtml(item.remarkTime)}</div><div class="remark-history-text">${escapeHtml(item.content)}</div>`;
      remarkHistoryList.appendChild(block);
    });
  }

  remarkDialog.showModal();
}

function openTaskContentModal(taskId) {
  const task = tasks.find((t) => t.id === taskId);
  if (!task || !taskContentDialog) {
    return;
  }
  const issueType = String(task.issueType || "—").trim() || "—";
  const content = String(task.content ?? "").trim();
  if (taskContentDialogTitle) {
    taskContentDialogTitle.textContent = issueType;
  }
  if (taskContentDialogMeta) {
    taskContentDialogMeta.textContent = `登记事物ID：${task.taskId || "—"}`;
  }
  if (taskContentDetailBody) {
    taskContentDetailBody.textContent = content || "（暂无跟进事物内容）";
  }
  taskContentDialog.showModal();
  void window.TaskAttachmentsUI?.renderTaskContentAttachments?.(task);
}

function taskPayloadForAttachmentDelete(task) {
  return {
    id: task.id,
    taskId: task.taskId,
    issueType: task.issueType,
    createdAtIsoDate: task.createdAtIsoDate,
    attachmentDir: task.attachmentDir,
  };
}

async function deleteTaskWithAttachments(task) {
  const api = window.electronAPI;
  if (api?.taskAttachmentDeleteForTask) {
    const out = await api.taskAttachmentDeleteForTask({ task: taskPayloadForAttachmentDelete(task) });
    if (out?.ok === false && out?.error) {
      const go = window.confirm(`附件目录删除失败：${out.error}\n仍要删除任务记录吗？`);
      if (!go) {
        return false;
      }
    }
  }
  tasks = tasks.filter((item) => item.id !== task.id);
  saveTasks();
  resetListPagination();
  render();
  return true;
}

function statusTag(status) {
  return status === "已完结" ? "success" : status === "处理中" ? "secondary" : "danger";
}

function getFilters() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const searchId = document.getElementById("searchId").value.trim().toLowerCase();
  const searchContent = document.getElementById("searchContent").value.trim().toLowerCase();
  const filterStatus = document.getElementById("filterStatus").value;
  const filterPriority = document.getElementById("filterPriority")?.value || "";
  return { startDate, endDate, searchId, searchContent, filterStatus, filterPriority };
}

function applyTaskListQuickFilter(list) {
  const q = (taskListQuickSearchEl?.value || "").trim().toLowerCase();
  if (!q) {
    return list;
  }
  return list.filter((task) => {
    const remarkHay = Array.isArray(task.remarks)
      ? task.remarks.map((r) => `${r.content ?? ""} ${r.remarkTime ?? ""}`).join(" ")
      : "";
    const hay = [
      task.taskId,
      task.issueType,
      task.content,
      task.reporter,
      task.handler,
      task.createdAt,
      task.status,
      task.completedAt,
      remarkHay,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function filterTasks(allTasks) {
  const { startDate, endDate, searchId, searchContent, filterStatus, filterPriority } = getFilters();
  return allTasks.filter((task) => {
    const idHay = String(task.taskId ?? "").toLowerCase();
    const matchesId = !searchId || idHay.includes(searchId);

    const contentHay = String(task.content ?? "").toLowerCase();
    const matchesContent = !searchContent || contentHay.includes(searchContent);

    const statusVal = String(task.status ?? "").trim();
    const matchesStatus = !filterStatus || statusVal === filterStatus;

    const priorityVal = String(task.priority ?? "中").trim();
    const matchesPriority = !filterPriority || priorityVal === filterPriority;

    const taskDay = task.createdAtIsoDate || parseCreatedAtToDateKey(String(task.createdAt ?? ""));
    const startDay = filterInputDateKey(startDate);
    const endDay = filterInputDateKey(endDate);
    const matchesStart = !startDay || !taskDay || taskDay >= startDay;
    const matchesEnd = !endDay || !taskDay || taskDay <= endDay;

    return matchesId && matchesContent && matchesStatus && matchesPriority && matchesStart && matchesEnd;
  });
}

function clearTaskIdDuplicateError() {
  taskIdErrorEl.textContent = "";
  taskIdErrorEl.hidden = true;
  taskIdInput.classList.remove("input-invalid");
  taskIdInput.removeAttribute("aria-invalid");
}

function showTaskIdDuplicateError(message) {
  taskIdErrorEl.textContent = message;
  taskIdErrorEl.hidden = false;
  taskIdInput.classList.add("input-invalid");
  taskIdInput.setAttribute("aria-invalid", "true");
  taskIdInput.focus();
  taskIdInput.select();
}

function taskRowClass() {
  return "task-row-v2";
}

const tlv = () => window.TaskListView || {};

function showTaskListToast(message, isError = false) {
  if (!taskListToastEl) {
    return;
  }
  taskListToastEl.textContent = message;
  taskListToastEl.hidden = false;
  taskListToastEl.classList.toggle("is-error", !!isError);
  clearTimeout(taskListToastTimer);
  taskListToastTimer = window.setTimeout(() => {
    taskListToastEl.hidden = true;
  }, 3200);
}

function setTaskTableLoading(loading) {
  if (taskTableWrapEl) {
    taskTableWrapEl.classList.toggle("is-loading", !!loading);
  }
}

function render() {
  let data = applyTaskListQuickFilter(filterTasks(tasks));
  const sortBy = taskListSortByEl?.value || "default";
  if (sortBy !== "default" && te().sortTasksForList) {
    data = te().sortTasksForList(data, sortBy);
  }
  const totalFiltered = data.length;
  const totalPages = totalFiltered === 0 ? 0 : Math.ceil(totalFiltered / PAGE_SIZE);

  if (totalPages > 0 && listCurrentPage > totalPages) {
    listCurrentPage = totalPages;
  }
  if (totalPages > 0 && listCurrentPage < 1) {
    listCurrentPage = 1;
  }

  const pageSlice =
    totalPages === 0 ? [] : data.slice((listCurrentPage - 1) * PAGE_SIZE, listCurrentPage * PAGE_SIZE);

  const baseIndex = (listCurrentPage - 1) * PAGE_SIZE;
  const isEmpty = totalFiltered === 0;

  if (taskListEmptyEl) {
    taskListEmptyEl.hidden = !isEmpty;
  }
  if (taskTableWrapEl) {
    taskTableWrapEl.hidden = isEmpty;
  }
  if (taskCardListEl) {
    taskCardListEl.hidden = isEmpty;
  }

  if (!isEmpty && typeof tlv().renderTaskListPage === "function") {
    tlv().renderTaskListPage({
      pageSlice,
      baseIndex,
      taskTableBody,
      taskCardListEl,
      calcTaskRisk,
      latestRemark,
      taskRowClass,
      getLocalDateKey: () => te().localDateKey?.() || "",
    });
  } else if (!isEmpty) {
    taskTableBody.innerHTML = "";
    if (taskCardListEl) {
      taskCardListEl.innerHTML = "";
    }
  } else {
    taskTableBody.innerHTML = "";
    if (taskCardListEl) {
      taskCardListEl.innerHTML = "";
    }
    tlv().invalidateTaskListCache?.();
  }

  const pending = tasks.filter((task) => task.status !== "已完结" && task.status !== "已取消").length;
  const tierCounts = { red: 0, orange: 0, yellow: 0 };
  tasks.forEach((t) => {
    const r = calcTaskRisk(t);
    if (r.tier && tierCounts[r.tier] !== undefined) {
      tierCounts[r.tier] += 1;
    }
  });
  if (taskStats) {
    taskStats.innerHTML = (tlv().renderTaskStatsHtml || (() => ""))(
      tasks.length,
      pending,
      totalFiltered,
      tierCounts
    );
  }

  renderPagination(totalFiltered);
  if (activeRoute === "dashboard") {
    renderDashboard();
  }
}

function getTaskSummaryCounts() {
  const completed = tasks.filter((t) => t.status === "已完结").length;
  const dai = tasks.filter((t) => t.status === "待处理").length;
  const doing = tasks.filter((t) => t.status === "处理中").length;
  const blocked = tasks.filter((t) => t.status === "已阻塞").length;
  const suspended = tasks.filter((t) => t.status === "已挂起").length;
  const cancelled = tasks.filter((t) => t.status === "已取消").length;
  const incomplete = tasks.filter((t) => t.status !== "已完结" && t.status !== "已取消").length;
  return { completed, incomplete, dai, doing, blocked, suspended, cancelled };
}

function getTaskLatestUpdateMs(task) {
  const remarkTimes = Array.isArray(task.remarks) ? task.remarks.map((r) => parseAnyTimeToMs(r?.remarkTime)) : [];
  const candidates = [
    parseAnyTimeToMs(task.updatedAt),
    parseAnyTimeToMs(task.completedAt),
    parseAnyTimeToMs(task.createdAt),
    ...remarkTimes,
  ].filter((x) => Number.isFinite(x) && x > 0);
  if (!candidates.length) {
    return 0;
  }
  return Math.max(...candidates);
}

function calcTaskRisk(task, opts = {}) {
  const TE = te();
  if (TE.calcTaskRiskV2) {
    return TE.calcTaskRiskV2(task, tasks, opts, { parseAnyTimeToMs, getTaskLatestUpdateMs });
  }
  return { score: 0, tier: "none", tierLabel: "正常", reasons: [], latestMs: 0 };
}

function customReportHelpers() {
  return {
    calcTaskRisk,
    localDateKey: () => (te().localDateKey ? te().localDateKey() : localDateKeyFromDate(new Date())),
    parseCreatedMs: parseAnyTimeToMs,
  };
}

function renderDashboard() {
  const TA = ta();
  if (!dashboardRootEl || !TA.mountDashboard) {
    return;
  }
  TA.mountDashboard(dashboardRootEl, tasks, {
    statusList: taskStatusList(),
    activeStatuses: ["待处理", "处理中", "已阻塞", "已挂起"],
  });
  if (dashboardSummaryEl) {
    const total = tasks.length;
    const open = tasks.filter((t) => t.status !== "已完结" && t.status !== "已取消").length;
    const overdue = tasks.filter((t) => {
      const dk = te().localDateKey ? te().localDateKey() : localDateKeyFromDate(new Date());
      return t.deadline && t.deadline < dk && t.status !== "已完结" && t.status !== "已取消";
    }).length;
    dashboardSummaryEl.textContent = `共 ${total} 条任务，进行中 ${open} 条，逾期 ${overdue} 条。图表随任务数据实时汇总。`;
  }
}

function renderTaskTemplateSelect() {
  if (!taskTemplateSelectEl) {
    return;
  }
  const list = ta().readTemplates?.() || [];
  const prev = taskTemplateSelectEl.value;
  taskTemplateSelectEl.innerHTML = '<option value="">— 选择模板快速填充 —</option>';
  list.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name || t.issueType || t.id;
    taskTemplateSelectEl.appendChild(opt);
  });
  if (prev && list.some((t) => t.id === prev)) {
    taskTemplateSelectEl.value = prev;
  }
}

function applyTaskTemplateById(id) {
  const tpl = ta().getTemplateById?.(id);
  if (!tpl) {
    return false;
  }
  const issueTypeEl = document.getElementById("issueType");
  const contentEl = document.getElementById("content");
  const priorityEl = document.getElementById("priority");
  const statusEl = document.getElementById("status");
  if (issueTypeEl && tpl.issueType) {
    issueTypeEl.value = tpl.issueType;
  }
  if (contentEl && tpl.content) {
    contentEl.value = tpl.content;
  }
  if (priorityEl && tpl.priority) {
    priorityEl.value = tpl.priority;
  }
  if (statusEl && tpl.status && taskStatusList().includes(tpl.status)) {
    statusEl.value = tpl.status;
  }
  return true;
}

function buildCustomReportSpecFromForm() {
  const dims = [...document.querySelectorAll('input[name="crDim"]:checked')].map((el) => el.value);
  const metrics = [...document.querySelectorAll('input[name="crMetric"]:checked')].map((el) => el.value);
  const filters = {};
  const st = document.getElementById("customReportFilterStatus")?.value || "";
  const pr = document.getElementById("customReportFilterPriority")?.value || "";
  const hd = document.getElementById("customReportFilterHandler")?.value?.trim() || "";
  const kw = document.getElementById("customReportFilterKeyword")?.value?.trim() || "";
  if (st) {
    filters.status = st;
  }
  if (pr) {
    filters.priority = pr;
  }
  if (hd) {
    filters.handler = hd;
  }
  if (kw) {
    filters.keyword = kw;
  }
  return {
    title: document.getElementById("customReportTitle")?.value?.trim() || "任务自定义报表",
    dimensions: dims.length ? dims : ["status"],
    metrics: metrics.length ? metrics : ["count"],
    filters,
    limit: 100,
  };
}

function renderCustomReportTable(report) {
  if (!customReportResultEl || !customReportTableHeadEl || !customReportTableBodyEl) {
    return;
  }
  if (!report?.rows?.length) {
    customReportResultEl.hidden = true;
    customReportTableHeadEl.innerHTML = "";
    customReportTableBodyEl.innerHTML = "";
    return;
  }
  const dims = report.dimensions || [];
  const metrics = report.metrics || ["count"];
  const headRow = document.createElement("tr");
  [...dims, ...metrics].forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col;
    headRow.appendChild(th);
  });
  customReportTableHeadEl.innerHTML = "";
  customReportTableHeadEl.appendChild(headRow);
  customReportTableBodyEl.innerHTML = "";
  report.rows.forEach((row) => {
    const tr = document.createElement("tr");
    [...dims, ...metrics].forEach((col) => {
      const td = document.createElement("td");
      td.textContent = row[col] ?? "";
      tr.appendChild(td);
    });
    customReportTableBodyEl.appendChild(tr);
  });
  customReportResultEl.hidden = false;
}

function openCustomReportDialog() {
  if (!customReportDialog) {
    return;
  }
  if (!customReportDialog.open) {
    customReportDialog.showModal();
  }
}

function renderSkillCenter() {
  if (!skillList || !skillSummary) {
    return;
  }
  renderRuntimePrerequisitesBar();
  const getter = window.getSkillCatalog;
  const catalog = typeof getter === "function" ? getter() : [];
  if (!catalog.length) {
    skillSummary.innerHTML =
      "未检测到技能脚本。请确认安装包包含 <code>skills.js</code>，并重新安装最新版本。";
    skillList.innerHTML = "";
    return;
  }
  const enabled = catalog.filter((s) => s.status === "enabled");
  const disabled = catalog.filter((s) => s.status === "disabled");
  const planned = catalog.filter((s) => s.status === "planned");
  skillSummary.innerHTML = `已加载 <strong>${enabled.length}</strong> 项可用技能，已关闭 <strong>${disabled.length}</strong> 项，规划中 <strong>${planned.length}</strong> 项。`;

  skillList.innerHTML = "";
  catalog.forEach((s) => {
    const card = document.createElement("article");
    card.className = "skill-card";
    const canToggle = s.status !== "planned";
    card.innerHTML = `
      <div class="skill-card-head">
        <h3>${escapeHtml(s.name || "未命名技能")}</h3>
        <span class="skill-badge ${s.status === "enabled" ? "is-on" : s.status === "disabled" ? "is-off" : "is-plan"}">${
      s.status === "enabled" ? "已启用" : s.status === "disabled" ? "已关闭" : "规划中"
    }</span>
      </div>
      <div class="skill-meta">优先级：${escapeHtml(s.priority || "-")}</div>
      ${
        s.id === "lunar-calendar"
          ? `<div class="skill-deploy-tag" title="6tail/lunar-javascript MIT">已部署：lunar-javascript（本地 npm）· 工具 <code>lunar_calendar_query</code></div>`
          : ""
      }
      ${
        s.id === "cnlunar-calendar"
          ? `<div class="skill-deploy-tag skill-deploy-tag--py" title="OPN48/cnlunar">已部署：cnlunar（Python 脚本 + pip）· 工具 <code>cnlunar_calendar_query</code> · 需 <code>pip install cnlunar</code></div>`
          : ""
      }
      <p class="skill-desc">${escapeHtml(s.description || "")}</p>
      ${
        canToggle
          ? `<label class="skill-toggle"><input type="checkbox" data-skill-toggle="${escapeHtmlAttr(s.id)}" ${
              s.status === "enabled" ? "checked" : ""
            } /> 允许大模型调用该技能</label>`
          : `<div class="skill-plan-note">该技能尚未上线，暂不可调用。</div>`
      }
      <div class="skill-cap-list">${(s.capabilities || []).map((x) => `<code>${escapeHtml(x)}</code>`).join("")}</div>
    `;
    skillList.appendChild(card);
  });

  skillList.querySelectorAll("input[data-skill-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-skill-toggle");
      const setter = window.setSkillEnabled;
      if (typeof setter === "function") {
        setter(id, el.checked);
      }
      renderSkillCenter();
    });
  });

}

window.renderSkillCenter = renderSkillCenter;

function renderReminderContent() {
  const { completed, incomplete, dai, doing } = getTaskSummaryCounts();
  reminderBody.innerHTML = `
    <p>当前完成任务${completed}条</p>
    <p>当前未完成任务${incomplete}条</p>
    <p>待处理任务${dai}条</p>
    <p>处理中任务${doing}条</p>
  `;
}

function showStartupReminder() {
  renderReminderContent();
  if (reminderDialog && !reminderDialog.open) {
    reminderDialog.showModal();
  }
}

function remindOpenTasks(forceModal = false) {
  const { completed, incomplete, dai, doing } = getTaskSummaryCounts();
  const line = `当前完成任务${completed}条，未完成任务${incomplete}条，待处理${dai}条，处理中${doing}条`;

  if (forceModal) {
    showStartupReminder();
    return;
  }
  console.log(`[鲸落AI 任务跟进提示 ${nowString()}] ${line}`);
}

reminderOkBtn.addEventListener("click", () => {
  reminderDialog.close();
});

function setHashRoute(route) {
  const next = `#/${route}`;
  if (window.location.hash !== next) {
    window.history.replaceState(null, "", next);
  }
}

function parseHashRoute() {
  const h = (window.location.hash || "").replace(/^#\/?/, "").split("/")[0];
  if (h === "local-models") {
    queueMicrotask(() => {
      if (typeof window.openCapabilityLocalModels === "function") {
        window.openCapabilityLocalModels();
      }
    });
    return "list";
  }
  if (h === "skills") {
    queueMicrotask(() => {
      if (typeof window.openCapabilitySkills === "function") {
        window.openCapabilitySkills();
      } else {
        document.getElementById("topbarCapabilityBtn")?.click();
      }
    });
    return "list";
  }
  if (h && ROUTES[h]) {
    return h;
  }
  return "list";
}

function updateBreadcrumb(route) {
  const meta = ROUTES[route];
  breadcrumbEl.innerHTML = `<strong>${meta.breadcrumb}</strong>`;
}

function updateSidebarActive(route) {
  document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.route === route);
  });
  const dailyWorkToggle = document.getElementById("dailyWorkNavToggle");
  if (dailyWorkToggle) {
    dailyWorkToggle.classList.toggle("is-active", DAILY_WORK_CHILD_ROUTES.has(route));
  }
}

function applyDailyWorkExpanded(expanded) {
  const sidebar = document.getElementById("sidebar");
  const group = document.getElementById("dailyWorkNavGroup");
  const toggle = document.getElementById("dailyWorkNavToggle");
  const children = document.getElementById("dailyWorkNavChildren");
  if (!group || !toggle || !children) {
    return;
  }
  const forceCollapsed = sidebar?.classList.contains("sidebar-collapsed");
  const shouldExpand = !forceCollapsed && expanded;
  dailyWorkExpanded = shouldExpand;
  group.classList.toggle("is-expanded", shouldExpand);
  toggle.setAttribute("aria-expanded", shouldExpand ? "true" : "false");
  children.style.maxHeight = shouldExpand ? `${children.scrollHeight}px` : "0px";
}

function syncDailyWorkExpandedByRoute(route) {
  if (DAILY_WORK_CHILD_ROUTES.has(route)) {
    applyDailyWorkExpanded(true);
  }
}

function hideAllPanels() {
  document.querySelectorAll(".tab-panels > .tab-panel").forEach((el) => {
    el.hidden = true;
  });
}

function activateRoute(route, { syncHash = true } = {}) {
  if (!ROUTES[route]) {
    route = "list";
  }
  activeRoute = route;
  hideAllPanels();
  const panel = document.getElementById(ROUTES[route].panelId);
  if (panel) {
    panel.hidden = false;
  }
  updateBreadcrumb(route);
  updateSidebarActive(route);
  syncDailyWorkExpandedByRoute(route);
  renderTabsStrip();
  if (syncHash) {
    setHashRoute(route);
  }
  if (route === "list") {
    render();
  }
  if (route === "dashboard") {
    renderDashboard();
  }
  if (route === "ai" && typeof window.onAIPanelVisible === "function") {
    window.onAIPanelVisible();
  }
  if (route === "knowledge-base" && typeof window.onKnowledgeBasePanelVisible === "function") {
    void window.onKnowledgeBasePanelVisible();
  }
}

function renderTabsStrip() {
  openTabs = openTabs.filter((route) => ROUTES[route]);
  tabsStrip.innerHTML = "";
  openTabs.forEach((route) => {
    const meta = ROUTES[route];
    if (!meta) {
      return;
    }
    const chip = document.createElement("div");
    chip.className = "tab-chip" + (route === activeRoute ? " is-active" : "");
    chip.setAttribute("role", "tab");
    chip.setAttribute("aria-selected", route === activeRoute ? "true" : "false");
    chip.dataset.route = route;

    const label = document.createElement("span");
    label.textContent = meta.title;
    chip.appendChild(label);

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tab-close";
    closeBtn.setAttribute("aria-label", "关闭标签");
    closeBtn.textContent = "\u00d7";
    closeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(route);
    });
    chip.appendChild(closeBtn);

    chip.addEventListener("click", () => {
      activateRoute(route);
    });

    tabsStrip.appendChild(chip);
  });
}

function openOrFocusTab(route) {
  if (!ROUTES[route]) {
    return;
  }
  if (!openTabs.includes(route)) {
    openTabs.push(route);
  }
  activateRoute(route);
}

window.openOrFocusTab = openOrFocusTab;

/** 从任意位置打开 AI 能力中的本地模型部署，并可选滚动到推理算力设置 */
function openOllamaInferenceSettings() {
  if (typeof window.openCapabilityLocalModels === "function") {
    window.openCapabilityLocalModels({ view: "overview", scrollToInference: true });
    return;
  }
  document.getElementById("topbarCapabilityBtn")?.click();
}

window.openOllamaInferenceSettings = openOllamaInferenceSettings;

function aiFindTaskForTool(ref) {
  if (!ref || typeof ref !== "object") {
    return null;
  }
  if (ref.id) {
    const t = tasks.find((x) => x.id === ref.id);
    if (t) {
      return t;
    }
  }
  if (ref.taskId) {
    const tid = String(ref.taskId).trim();
    return tasks.find((x) => x.taskId === tid) || null;
  }
  return null;
}

window.runAITaskTool = async function runAITaskTool(name, args) {
  const a = args && typeof args === "object" ? args : {};
  try {
    if (name === "task_list_snapshot") {
      return {
        ok: true,
        tasks: tasks.map((t) => ({
          id: t.id,
          taskId: t.taskId,
          status: t.status,
          issueType: t.issueType,
          contentPreview: String(t.content || "").slice(0, 120),
          reporter: t.reporter,
          handler: t.handler,
        })),
      };
    }
    if (name === "task_create") {
      const TE = te();
      let taskId = String(a.taskId || "").trim();
      if (!taskId && TE.generateTaskId) {
        taskId = TE.generateTaskId(tasks);
      }
      if (!taskId) {
        return { ok: false, error: "无法生成 taskId" };
      }
      if (tasks.some((t) => t.taskId === taskId)) {
        taskId = TE.generateTaskId ? TE.generateTaskId(tasks) : taskId;
      }
      const statuses = taskStatusList();
      const data = {
        taskId,
        issueType: String(a.issueType || "").trim() || "其他",
        content: String(a.content || "").trim() || "（无描述）",
        reporter: String(a.reporter || "").trim() || "未填",
        handler: String(a.handler || "").trim() || "未填",
        status: statuses.includes(a.status) ? a.status : "待处理",
        priority: a.priority,
        deadline: a.deadline,
        remark: String(a.remark || "").trim(),
        blockReason: a.blockReason,
        blockDependency: a.blockDependency,
      };
      const task = createTask(data);
      TE.recordChangeLog?.(task, { at: nowString(), operator: "AI", field: "create", oldValue: "", newValue: task.taskId });
      const hadComposerFiles = (window.getAiComposerPendingFiles?.() || []).length > 0;
      const attachOut = await window.saveAiAttachmentsToTask?.(task);
      if (attachOut?.ok && attachOut.attachmentDir) {
        task.attachmentDir = attachOut.attachmentDir;
      }
      if (hadComposerFiles && attachOut?.ok) {
        window.clearAiComposerPendingFiles?.();
      }
      tasks.unshift(task);
      saveTasks();
      render();
      resetListPagination();
      openOrFocusTab("list");
      return { ok: true, message: "已创建任务", id: task.id, taskId: task.taskId };
    }
    if (name === "task_update") {
      const task = aiFindTaskForTool(a);
      if (!task) {
        return { ok: false, error: "未找到任务，请核对 id（UUID）或 taskId（登记事物ID）" };
      }
      if (a.issueType !== undefined) {
        task.issueType = String(a.issueType).trim();
      }
      if (a.content !== undefined) {
        task.content = String(a.content).trim();
      }
      if (a.reporter !== undefined) {
        task.reporter = String(a.reporter).trim();
      }
      if (a.handler !== undefined) {
        task.handler = String(a.handler).trim();
      }
      if (a.priority !== undefined) {
        applyTaskFieldChange(task, "priority", te().normalizePriority ? te().normalizePriority(a.priority) : a.priority, "AI");
      }
      if (a.deadline !== undefined) {
        applyTaskFieldChange(task, "deadline", te().normalizeDeadline ? te().normalizeDeadline(a.deadline) : a.deadline, "AI");
      }
      if (a.status !== undefined) {
        const ns = String(a.status);
        const statuses = taskStatusList();
        if (!statuses.includes(ns)) {
          return { ok: false, error: `status 须为 ${statuses.join(" / ")} 之一` };
        }
        if ((task.status === "已完结" || task.status === "已取消") && ns !== task.status) {
          return { ok: false, error: "终态任务不可再改状态" };
        }
        applyTaskFieldChange(task, "status", ns, "AI");
        if (ns === "已完结") {
          task.completedAt = nowString();
        }
        if (ns === "已取消") {
          task.cancelledAt = nowString();
        }
        if (ns === "已挂起") {
          task.suspendedAt = nowString();
        }
      }
      saveTasks();
      render();
      openOrFocusTab("list");
      return { ok: true, message: "已更新任务", id: task.id, taskId: task.taskId };
    }
    if (name === "task_delete") {
      const task = aiFindTaskForTool(a);
      if (!task) {
        return { ok: false, error: "未找到任务" };
      }
      if (task.status === "已取消") {
        return { ok: false, error: "已取消任务须保留历史，不可删除" };
      }
      const deleted = await deleteTaskWithAttachments(task);
      if (!deleted) {
        return { ok: false, error: "已取消删除" };
      }
      openOrFocusTab("list");
      return { ok: true, message: "已删除任务及关联附件目录", id: task.id };
    }
    if (name === "task_complete") {
      const task = aiFindTaskForTool(a);
      if (!task) {
        return { ok: false, error: "未找到任务" };
      }
      task.status = "已完结";
      task.completedAt = nowString();
      saveTasks();
      render();
      openOrFocusTab("list");
      return { ok: true, message: "已完结任务", id: task.id, taskId: task.taskId };
    }
    if (name === "task_bulk_update_status") {
      const toStatus = String(a.toStatus || "");
      if (!taskStatusList().includes(toStatus)) {
        return { ok: false, error: `toStatus 须为 ${taskStatusList().join(" / ")}` };
      }
      const ids = Array.isArray(a.ids) ? a.ids.map((x) => String(x).trim()).filter(Boolean) : [];
      const taskIds = Array.isArray(a.taskIds) ? a.taskIds.map((x) => String(x).trim()).filter(Boolean) : [];
      let selected = [];
      if (ids.length) {
        selected = tasks.filter((t) => ids.includes(t.id));
      } else if (taskIds.length) {
        selected = tasks.filter((t) => taskIds.includes(t.taskId));
      } else {
        selected = tasks.filter((t) => t.status !== "已完结");
      }
      if (!selected.length) {
        return { ok: false, error: "未找到可批量更新的任务" };
      }
      let updated = 0;
      selected.forEach((t) => {
        if (t.status === "已完结" && toStatus !== "已完结") {
          return;
        }
        t.status = toStatus;
        if (toStatus === "已完结") {
          t.completedAt = nowString();
        }
        updated += 1;
      });
      saveTasks();
      render();
      openOrFocusTab("list");
      return { ok: true, message: `已批量更新 ${updated} 条任务`, updated, toStatus };
    }
    if (name === "task_append_remark") {
      const task = aiFindTaskForTool(a);
      if (!task) {
        return { ok: false, error: "未找到任务" };
      }
      const content = String(a.content || "").trim();
      if (!content) {
        return { ok: false, error: "备注内容不能为空" };
      }
      if (!Array.isArray(task.remarks)) {
        task.remarks = [];
      }
      task.remarks.push({ id: crypto.randomUUID(), content, remarkTime: nowString() });
      saveTasks();
      render();
      openOrFocusTab("list");
      return { ok: true, message: "已追加备注", id: task.id, taskId: task.taskId };
    }
    if (name === "task_query") {
      const st = String(a.status || "").trim();
      const reporter = String(a.reporter || "").trim();
      const handler = String(a.handler || "").trim();
      const keyword = String(a.keyword || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(100, Number(a.limit || 20)));
      const rows = tasks.filter((t) => {
        if (st && t.status !== st) {
          return false;
        }
        if (reporter && String(t.reporter || "") !== reporter) {
          return false;
        }
        if (handler && String(t.handler || "") !== handler) {
          return false;
        }
        if (!keyword) {
          return true;
        }
        const text = `${t.issueType || ""} ${t.content || ""} ${
          Array.isArray(t.remarks) ? t.remarks.map((r) => r?.content || "").join(" ") : ""
        }`.toLowerCase();
        return text.includes(keyword);
      });
      return {
        ok: true,
        total: rows.length,
        tasks: rows.slice(0, limit).map((t) => ({
          id: t.id,
          taskId: t.taskId,
          status: t.status,
          issueType: t.issueType,
          content: t.content,
          reporter: t.reporter,
          handler: t.handler,
          createdAt: t.createdAt,
          latestUpdateAt: toLocalTime(getTaskLatestUpdateMs(t) || Date.now()),
        })),
      };
    }
    if (name === "task_stats") {
      const byStatus = Object.fromEntries(taskStatusList().map((s) => [s, 0]));
      const byHandler = {};
      const byReporter = {};
      tasks.forEach((t) => {
        byStatus[t.status] = (byStatus[t.status] || 0) + 1;
        byHandler[t.handler || "未填"] = (byHandler[t.handler || "未填"] || 0) + 1;
        byReporter[t.reporter || "未填"] = (byReporter[t.reporter || "未填"] || 0) + 1;
      });
      const topRisks = tasks
        .map((t) => ({ t, risk: calcTaskRisk(t) }))
        .sort((a, b) => b.risk.score - a.risk.score)
        .slice(0, 5)
        .map((x) => ({ taskId: x.t.taskId, status: x.t.status, score: x.risk.score, reasons: x.risk.reasons }));
      return { ok: true, total: tasks.length, byStatus, byHandler, byReporter, topRisks };
    }
    if (name === "task_top_risks") {
      const topN = Math.max(1, Math.min(20, Number(a.topN || 5)));
      const rows = tasks
        .map((t) => ({ t, risk: calcTaskRisk(t, a) }))
        .filter((x) => x.risk.score > 0)
        .sort((a1, b1) => b1.risk.score - a1.risk.score)
        .slice(0, topN)
        .map((x) => ({
          id: x.t.id,
          taskId: x.t.taskId,
          status: x.t.status,
          priority: x.t.priority,
          deadline: x.t.deadline,
          score: x.risk.score,
          tier: x.risk.tier,
          tierLabel: x.risk.tierLabel,
          reasons: x.risk.reasons,
          handler: x.t.handler,
          reporter: x.t.reporter,
        }));
      return { ok: true, total: rows.length, risks: rows };
    }
    if (name === "report_generate") {
      const period = String(a.period || "daily");
      const focus = Array.isArray(a.statusFocus) && a.statusFocus.length ? a.statusFocus : ["待处理", "处理中", "已完结"];
      const reporter = String(a.reporter || "").trim();
      const handler = String(a.handler || "").trim();
      const list = tasks.filter((t) => {
        if (!focus.includes(t.status)) {
          return false;
        }
        if (reporter && String(t.reporter || "") !== reporter) {
          return false;
        }
        if (handler && String(t.handler || "") !== handler) {
          return false;
        }
        return true;
      });
      const done = list.filter((t) => t.status === "已完结");
      const processing = list.filter((t) => t.status === "处理中");
      const pending = list.filter((t) => t.status === "待处理");
      const riskItems = list
        .map((t) => ({ taskId: t.taskId, content: t.content, risk: calcTaskRisk(t) }))
        .filter((x) => x.risk.score > 0)
        .slice(0, 10);
      const title = period === "weekly" ? "周报" : "日报";
      return {
        ok: true,
        title: `${title}（${nowString()}）`,
        completed: done.map((t) => `【${t.taskId}】${t.content}`),
        inProgress: processing.map((t) => `【${t.taskId}】${t.content}`),
        pending: pending.map((t) => `【${t.taskId}】${t.content}`),
        risks: riskItems.map((x) => `【${x.taskId}】${x.content}（${x.risk.reasons.join("；")}）`),
        nextPlan: pending.slice(0, 5).map((t) => `推进【${t.taskId}】${t.content}`),
      };
    }
    if (name === "risk_scan" || name === "risk_report") {
      if (te().buildRiskReport) {
        return te().buildRiskReport(tasks, a, { parseAnyTimeToMs, getTaskLatestUpdateMs });
      }
      const rows = tasks
        .map((t) => ({ t, risk: calcTaskRisk(t, a) }))
        .filter((x) => x.risk.score > 0)
        .sort((a1, b1) => b1.risk.score - a1.risk.score)
        .map((x) => ({
          id: x.t.id,
          taskId: x.t.taskId,
          status: x.t.status,
          score: x.risk.score,
          tier: x.risk.tier,
          reasons: x.risk.reasons,
        }));
      return { ok: true, total: rows.length, risks: rows };
    }
    if (name === "task_export_excel") {
      const api = window.electronAPI;
      if (!api?.taskExportExcel) {
        return { ok: false, error: "需要桌面版客户端导出 Excel" };
      }
      const rows = te().tasksToExcelRows ? te().tasksToExcelRows(tasks) : [];
      return api.taskExportExcel({ rows, target: a.target || "desktop", fileName: a.fileName || "任务列表导出" });
    }
    if (name === "dashboard_snapshot") {
      const TA = ta();
      if (!TA.aggregateStatus) {
        return { ok: false, error: "看板模块未加载" };
      }
      return {
        ok: true,
        total: tasks.length,
        statusDistribution: TA.aggregateStatus(tasks, taskStatusList()),
        handlerLoad: TA.aggregateHandlerLoad(tasks, ["待处理", "处理中", "已阻塞", "已挂起"]),
        trend14d: TA.aggregateTrendByDay(tasks, 14),
      };
    }
    if (name === "custom_report_generate") {
      const TA = ta();
      if (!TA.buildCustomReport) {
        return { ok: false, error: "报表模块未加载" };
      }
      const report = TA.buildCustomReport(tasks, a, customReportHelpers());
      if (a.format === "markdown" && TA.customReportToMarkdown) {
        report.markdown = TA.customReportToMarkdown(report);
      }
      return report;
    }
    if (name === "task_template_list") {
      const list = ta().readTemplates?.() || [];
      return {
        ok: true,
        templates: list.map((t) => ({
          id: t.id,
          name: t.name,
          issueType: t.issueType,
          priority: t.priority,
          status: t.status,
        })),
      };
    }
    if (name === "text_polish") {
      const text = String(a.text || "").trim();
      if (!text) {
        return { ok: false, error: "text 不能为空" };
      }
      const tone = String(a.tone || "正式");
      const output = String(a.output || "全文");
      let polished = text.replace(/\s+/g, " ").trim();
      if (tone === "对外" || tone === "正式") {
        polished = `您好，关于该事项，当前进展如下：${polished}。后续将持续跟进并及时同步。`;
      } else if (tone === "对内") {
        polished = `内部同步：${polished}；请相关同事按计划推进，如遇阻塞请及时反馈。`;
      } else {
        polished = `已处理：${polished}`;
      }
      if (output === "要点") {
        return { ok: true, tone, output, bullets: polished.split(/[；。]/).map((x) => x.trim()).filter(Boolean) };
      }
      return { ok: true, tone, output, text: polished };
    }
    if (name === "logic_structured_answer") {
      return {
        ok: true,
        template: [
          "结论：先用 1-2 句直接回答用户核心问题。",
          "依据：列出 2-4 条关键事实/前提，标注已知与未知。",
          "行动项：给出最多 3 条可执行下一步。",
          "边界与风险：说明适用范围、潜在风险与兜底方案。",
        ],
        note: "高逻辑模式已启用，回答优先采用结构化推理。",
      };
    }
    if (name === "bazi_analyze") {
      const calendarRaw = String(a.calendar || "").trim().toLowerCase();
      const calendar = calendarRaw === "lunar" ? "农历" : calendarRaw === "solar" ? "阳历" : "";
      const birthDate = String(a.birth_date || a.birthDate || "").trim();
      const birthTime = String(a.birth_time || a.birthTime || "").trim();
      if (!calendar || !birthDate || !birthTime) {
        return {
          ok: false,
          error: "缺少必要参数：calendar、birth_date、birth_time。",
          required: ["calendar", "birth_date", "birth_time"],
          hint: "示例：calendar=solar, birth_date=1995-08-12, birth_time=09:30",
        };
      }
      const personName = String(a.name || "").trim() || "未署名";
      const genderMap = { male: "男", female: "女", other: "其他" };
      const gender = genderMap[String(a.gender || "").trim().toLowerCase()] || "未说明";
      const birthPlace = String(a.birth_place || a.birthPlace || "").trim() || "未说明";
      const focus = String(a.focus || "").trim() || "综合";
      const prompt =
        [
          "请按传统命理分析框架输出八字解读，结构化呈现：",
          "1) 四柱基础信息与五行概览",
          "2) 日主强弱与格局判断",
          "3) 事业/财运/感情/健康建议（按用户关注方向优先）",
          "4) 大运流年提醒（给出近三年）",
          "5) 风险与边界说明",
          "并在结尾明确：仅供传统文化学习与娱乐参考。",
          "",
          `用户信息：姓名=${personName}；历法=${calendar}；出生日期=${birthDate}；出生时间=${birthTime}；性别=${gender}；出生地=${birthPlace}；关注方向=${focus}。`,
        ].join("\n");
      return {
        ok: true,
        profile: {
          name: personName,
          calendar,
          birthDate,
          birthTime,
          gender,
          birthPlace,
          focus,
        },
        prompt,
        note: "已生成八字分析调用模板，可由大模型据此继续输出详细解读。",
      };
    }
    if (name === "export_word_desktop") {
      const api = window.electronAPI;
      if (!api || typeof api.aiExportDocument !== "function") {
        return { ok: false, error: "导出 Word 仅支持桌面版（Electron）。" };
      }
      const content = String(a.content || "").trim();
      if (!content) {
        return { ok: false, error: "content 不能为空" };
      }
      const fileName = String(a.file_name || a.fileName || "").trim();
      return api.aiExportDocument({
        format: "word",
        target: "desktop",
        fileName,
        content,
      }).then((out) => {
        if (!out?.ok) {
          return { ok: false, error: out?.error || "导出失败" };
        }
        return {
          ok: true,
          filePath: out.filePath || "",
          message: `Word 已保存到桌面：${out.filePath || ""}`,
        };
      });
    }
    if (name === "export_pdf_desktop") {
      const api = window.electronAPI;
      if (!api || typeof api.aiExportDocument !== "function") {
        return { ok: false, error: "导出 PDF 仅支持桌面版（Electron）。" };
      }
      const content = String(a.content || "").trim();
      if (!content) {
        return { ok: false, error: "content 不能为空" };
      }
      const fileName = String(a.file_name || a.fileName || "").trim();
      return api.aiExportDocument({
        format: "pdf",
        target: "desktop",
        fileName,
        content,
      }).then((out) => {
        if (!out?.ok) {
          return { ok: false, error: out?.error || "导出失败" };
        }
        return {
          ok: true,
          filePath: out.filePath || "",
          message: `PDF 已保存到桌面：${out.filePath || ""}`,
        };
      });
    }
    if (name === "lunar_calendar_query") {
      const api = window.electronAPI;
      if (!api || typeof api.lunarCalendarQuery !== "function") {
        return { ok: false, error: "农历历法查询仅支持桌面版（Electron）。" };
      }
      return api.lunarCalendarQuery(a);
    }
    if (name === "cnlunar_calendar_query") {
      const api = window.electronAPI;
      if (!api || typeof api.cnlunarCalendarQuery !== "function") {
        return { ok: false, error: "cnlunar 黄历查询仅支持桌面版（Electron）。" };
      }
      return api.cnlunarCalendarQuery(a);
    }
    if (name === "runtime_prerequisites_evaluate") {
      const api = window.electronAPI;
      if (!api || typeof api.runtimePrerequisitesEvaluate !== "function") {
        return { ok: false, error: "运行环境评估仅支持桌面版（Electron）。" };
      }
      const doAuto = a.auto_remediate === true && typeof api.runtimePrerequisitesRemediateAuto === "function";
      return api.runtimePrerequisitesEvaluate().then(async (report) => {
        if (!report || report.ok === false) {
          return report;
        }
        if (!doAuto) {
          return report;
        }
        const need = (report.issues || []).some((i) => i.autoAvailable);
        if (!need) {
          return { ...report, autoRemediate: { skipped: true, note: "无可应用内自动修复项" } };
        }
        const fix = await api.runtimePrerequisitesRemediateAuto();
        return {
          ...report,
          autoRemediate: fix,
          issuesAfter: fix?.after?.issues,
          healthyAfter: fix?.after?.healthy,
        };
      });
    }
    if (name === "kb_search") {
      const api = window.electronAPI;
      if (!api || typeof api.kbSearch !== "function") {
        return { ok: false, error: "知识库检索仅支持桌面版（Electron）。" };
      }
      const query = String(a.query || "").trim();
      if (!query) {
        return { ok: false, error: "缺少 query" };
      }
      const KB_EVIDENCE_TEXT_MAX = 12000;
      const KB_EVIDENCE_SNIPPET_MAX = 1500;
      const topK = Math.max(1, Math.min(15, Number(a.top_k ?? a.topK) || 12));
      const wantsApiSpec = /入参|报文|请求|响应|字段|JSON|json|格式|样例|参数表/.test(query);
      const isTocLikeChunk = (text) => {
        const body = String(text || "").replace(/^[\s\S]*?\n---\n/, "");
        const headings = body.match(/\d+\.\d+(?:\.\d+)?\s*(?:请求|响应)/g);
        return (headings?.length || 0) >= 6;
      };
      const isRevisionHistoryLikeChunk = (text) => {
        const body = String(text || "").replace(/^[\s\S]*?\n---\n/, "");
        if (/字段名称|报文样例|"head"\s*:|bizString|img\d+Url/.test(body)) {
          return false;
        }
        if (/(?:新增|修改)\s*3\.\d+/.test(body) && (body.match(/0\.\d+/g)?.length || 0) >= 2) {
          return true;
        }
        return (body.match(/\d{4}[\s\-­]+\d{2}/g)?.length || 0) >= 2 && /马单|石咏|杨鑫|徐锐/.test(body);
      };
      const inferSectionRefsForQuery = (q) => {
        const query = String(q || "");
        let refs = (query.match(/\b(\d+(?:\.\d+){1,3})\b/g) || []).sort(
          (a, b) => b.length - a.length || b.localeCompare(a, undefined, { numeric: true })
        );
        const out = [];
        refs.forEach((m) => {
          if (!out.some((o) => m.startsWith(`${o}.`) || o.startsWith(`${m}.`))) {
            out.push(m);
          }
        });
        if (/\b3\.16\b/.test(query)) {
          if (/请求|入参|报文|样例/.test(query) && !out.includes("3.16.1")) {
            out.push("3.16.1");
          }
          if (/响应|出参|字段/.test(query) && !out.includes("3.16.2")) {
            out.push("3.16.2");
          }
          if (/实名制信息查询|3\.16\s*实名制/.test(query) && out.length <= 1) {
            if (!out.includes("3.16.1")) {
              out.push("3.16.1");
            }
            if (!out.includes("3.16.2")) {
              out.push("3.16.2");
            }
          }
        }
        return [...new Set(out)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      };
      const resolvePrimarySectionRef = (q) => inferSectionRefsForQuery(q)[0] || null;
      const sectionEndMarkers = (sectionRef) => {
        const parts = String(sectionRef || "").split(".").map(Number);
        if (parts.length >= 3) {
          if (parts[2] === 1) {
            return [`${parts[0]}.${parts[1]}.2`];
          }
          return [`${parts[0]}.${parts[1] + 1}`];
        }
        if (parts.length === 2) {
          return [`${parts[0]}.${parts[1] + 1}`];
        }
        return [];
      };
      const extractApiFieldNames = (text) => {
        const names = [];
        const s = String(text || "");
        const re = /([a-zA-Z][a-zA-Z0-9_]*?)bizString/g;
        let m = re.exec(s);
        while (m) {
          names.push(m[1]);
          m = re.exec(s);
        }
        return [...new Set(names)];
      };
      const mergeConsecutiveEvidence = (hits) => {
        const groups = new Map();
        hits.forEach((h, rank) => {
          const docKey = `${h.libraryId || ""}:${h.docId || h.sourcePath || h.sourceFile || h.document || ""}`;
          if (!groups.has(docKey)) {
            groups.set(docKey, []);
          }
          groups.get(docKey).push({ ...h, _rank: rank });
        });
        const merged = [];
        groups.forEach((items) => {
          const sorted = [...items].sort(
            (x, y) => Number(x.chunkIndex ?? 0) - Number(y.chunkIndex ?? 0)
          );
          let batch = [sorted[0]];
          const flush = () => {
            if (!batch.length) {
              return;
            }
            if (batch.length === 1) {
              merged.push(batch[0]);
            } else {
              const text = batch.map((b) => String(b.text || "")).join("\n");
              merged.push({
                ...batch[0],
                text,
                chunkIndexEnd: batch[batch.length - 1].chunkIndex,
                mergedChunkCount: batch.length,
              });
            }
            batch = [];
          };
          for (let i = 1; i < sorted.length; i += 1) {
            const prev = batch[batch.length - 1];
            const cur = sorted[i];
            const prevIdx = Number(prev.chunkIndex);
            const curIdx = Number(cur.chunkIndex);
            if (Number.isFinite(prevIdx) && Number.isFinite(curIdx) && curIdx <= prevIdx + 5) {
              batch.push(cur);
            } else {
              flush();
              batch = [cur];
            }
          }
          flush();
        });
        merged.sort((a, b) => a._rank - b._rank);
        return merged.map(({ _rank, ...rest }) => rest);
      };
      const pickEvidenceText = (text, q) => {
        const raw = String(text || "");
        if (raw.length <= KB_EVIDENCE_TEXT_MAX) {
          return raw;
        }
        const refs = inferSectionRefsForQuery(q);
        if (refs.length && wantsApiSpec) {
          const parts = [];
          refs.forEach((sectionRef) => {
            const sec = sectionRef.replace(/\./g, "\\.");
            const startRe = new RegExp(`(?:^|[\\n\\r])\\s*${sec}\\s*(?:请求|响应|入参|出参)?`, "i");
            let startIdx = raw.search(startRe);
            if (startIdx < 0) {
              startIdx = raw.indexOf(sectionRef);
            }
            if (startIdx < 0) {
              return;
            }
            let endIdx = raw.length;
            sectionEndMarkers(sectionRef).forEach((marker) => {
              const endRe = new RegExp(`(?:^|[\\n\\r])\\s*${marker.replace(/\./g, "\\.")}\\s`, "i");
              const rel = raw.slice(startIdx + sectionRef.length).search(endRe);
              if (rel >= 0) {
                endIdx = Math.min(endIdx, startIdx + sectionRef.length + rel);
              }
            });
            parts.push(raw.slice(Math.max(0, startIdx - 120), endIdx).trim());
          });
          if (parts.length) {
            return parts.join("\n\n---\n\n").slice(0, KB_EVIDENCE_TEXT_MAX);
          }
        }
        const sections = String(q || "")
          .match(/\b(\d+(?:\.\d+){1,3})\b/g)
          ?.sort((a, b) => b.length - a.length);
        if (sections) {
          for (const sec of sections) {
            const idx = raw.indexOf(sec);
            if (idx >= 0) {
              const start = Math.max(0, idx - 240);
              return raw.slice(start, start + KB_EVIDENCE_TEXT_MAX);
            }
          }
        }
        if (wantsApiSpec) {
          const anchor = raw.search(/报文样例|"head"\s*:|字段名称/);
          if (anchor >= 0) {
            const start = Math.max(0, anchor - 240);
            return raw.slice(start, start + KB_EVIDENCE_TEXT_MAX);
          }
        }
        return raw.slice(0, KB_EVIDENCE_TEXT_MAX);
      };
      const formatGrounding = (out) => {
        const rawHits = (out.hits || [])
          .filter((h) => !wantsApiSpec || (!isTocLikeChunk(h.text) && !isRevisionHistoryLikeChunk(h.text)))
          .sort((a, b) => {
            const sa = a.recallSource === "section_range" ? 1 : /字段名称|bizString/.test(String(a.text || "")) ? 0.5 : 0;
            const sb = b.recallSource === "section_range" ? 1 : /字段名称|bizString/.test(String(b.text || "")) ? 0.5 : 0;
            if (sa !== sb) {
              return sb - sa;
            }
            return Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0);
          })
          .slice(0, topK);
        const hits = mergeConsecutiveEvidence(rawHits);
        const evidence = hits.map((h, i) => {
          const fullText = pickEvidenceText(h.text, query);
          const fieldNames = wantsApiSpec ? extractApiFieldNames(fullText) : [];
          return {
            rank: i + 1,
            document: h.sourceFile || h.docName || "",
            chunkIndex: h.chunkIndex != null ? Number(h.chunkIndex) + 1 : null,
            chunkIndexEnd:
              h.chunkIndexEnd != null ? Number(h.chunkIndexEnd) + 1 : h.chunkIndex != null ? Number(h.chunkIndex) + 1 : null,
            mergedChunkCount: h.mergedChunkCount || 1,
            sourcePath: h.sourcePath || "",
            recallSource: h.recallSource || "",
            finalScore: Number(h.finalScore ?? h.score ?? 0),
            vectorScore: h.vectorScore,
            keywordScore: h.keywordScore,
            metadataScore: h.metadataScore,
            ftsScore: h.ftsScore,
            snippet: fullText.slice(0, KB_EVIDENCE_SNIPPET_MAX),
            text: fullText,
            fieldNames,
          };
        });
        const allFieldNames = [...new Set(evidence.flatMap((e) => e.fieldNames || []))];
        const confidence =
          out.lowConfidence || out.noAnswer ? "低" : Number(out.bestScore || 0) >= 0.75 ? "高" : "中";
        let answerInstruction =
          "请仅基于 evidence 中的 text 字段回答，并在回答中引用文档名与分块序号作为依据。";
        if (out.noAnswer) {
          answerInstruction = "本地知识库未找到可靠依据。请明确告知用户不确定，不要编造内容。";
        } else if (wantsApiSpec) {
          const sectionRefs = inferSectionRefsForQuery(query);
          const sectionHint =
            sectionRefs.length > 1
              ? ` query 涉及 ${sectionRefs.join("、")}，须分别输出各小节字段表与 JSON（例如 3.16.1 请求 3 字段 + 3.16.2 响应全字段），不可只写其中一节。`
              : "";
          const fieldHint = allFieldNames.length
            ? ` 各小节字段表行数须与 evidence 中「字段名称」表一致（当前解析字段：${allFieldNames.join("、")}），不得增减行。`
            : "";
          answerInstruction =
            `用户询问接口入参/响应/报文/字段格式。${sectionHint}字段表仅列 evidence 中实际出现的行；禁止用修订历史代替字段表（修订史最多一句脚注）；禁止虚构 outOrderId 等未出现字段；JSON 样例逐字复述 evidence。${fieldHint}「二选一」等说明写入 orderId 备注，不新增字段行。`;
        }
        return {
          confidence,
          shouldAnswer: !out.noAnswer,
          queryType: out.queryType,
          searchMode: out.searchMode,
          evidence,
          allFieldNames,
          answerInstruction,
        };
      };
      const isLocalSmallChatModel = async () => {
        try {
          if (typeof api.getAIState !== "function") {
            return false;
          }
          const st = await api.getAIState();
          const p = (st?.profiles || []).find((x) => x.id === st.activeId);
          if (!p) {
            return false;
          }
          const bu = String(p.baseUrl || "").toLowerCase();
          const isLocal = p.localInference === true || bu.includes("11434") || bu.includes("ollama");
          if (!isLocal) {
            return false;
          }
          const m = String(p.model || "").toLowerCase();
          return /:0\.5b|:0\.6b|:1\.5b|:1\.7b|:3b|:4b|:7b\b/.test(m);
        } catch {
          return false;
        }
      };
      const buildKbToolPayload = (out, grounding, localSmall) => {
        const g = grounding || {};
        const maxText = localSmall ? 9000 : 12000;
        let evidence = Array.isArray(g.evidence) ? g.evidence : [];
        if (wantsApiSpec && evidence.length > 1) {
          const mergedText = evidence
            .map((e) => String(e.text || "").trim())
            .filter(Boolean)
            .join("\n\n---\n\n")
            .slice(0, maxText);
          const fieldNames = g.allFieldNames || [...new Set(evidence.flatMap((e) => e.fieldNames || []))];
          evidence = [
            {
              rank: 1,
              document: evidence[0]?.document || "",
              chunkIndex: evidence[0]?.chunkIndex ?? null,
              chunkIndexEnd: evidence[evidence.length - 1]?.chunkIndexEnd ?? evidence[evidence.length - 1]?.chunkIndex ?? null,
              mergedChunkCount: evidence.reduce((n, e) => n + (e.mergedChunkCount || 1), 0),
              text: mergedText,
              fieldNames,
            },
          ];
        } else {
          evidence = evidence.map((e) => ({
            rank: e.rank,
            document: e.document,
            chunkIndex: e.chunkIndex,
            chunkIndexEnd: e.chunkIndexEnd,
            text: String(e.text || "").slice(0, maxText),
            fieldNames: e.fieldNames,
          }));
        }
        return {
          ok: true,
          hitCount: out.hitCount ?? evidence.length,
          lowConfidence: out.lowConfidence,
          noAnswer: out.noAnswer,
          queryType: out.queryType,
          searchMode: out.searchMode,
          note: out.note,
          grounding: {
            confidence: g.confidence,
            shouldAnswer: g.shouldAnswer,
            answerInstruction: g.answerInstruction,
            allFieldNames: g.allFieldNames || [],
            evidence,
          },
        };
      };
      return isLocalSmallChatModel().then((localSmall) =>
        api.kbSearch({ query, topK, forAgent: true, expandAdjacent: true }).then(async (out) => {
        if (!out?.ok) {
          return out;
        }
        const needVerify = out.lowConfidence === true;
        if (needVerify && typeof api.kbWebVerifyQuery === "function") {
          const agreed = window.confirm(
            "检测到本地知识库命中置信度较低，结果可能不准确或已过期。\n是否授权本次联网核验，以帮助确认并纠正内容？"
          );
          if (agreed) {
            const hit0 = Array.isArray(out.hits) && out.hits.length ? out.hits[0] : null;
            const web = await api.kbWebVerifyQuery({
              query,
              chunkId: hit0?.chunkId || "",
              docId: hit0?.docId || "",
            });
          return {
            ...buildKbToolPayload(out, formatGrounding(out), localSmall),
            webVerification: web?.ok
                ? {
                    enabled: true,
                    query,
                    summary: web.summary || web.block || "",
                    writebackEnabled: web.writebackEnabled === true,
                    writebackApplied: web.writebackApplied === true,
                  }
                : {
                    enabled: false,
                    error: web?.error || "联网核验失败",
                  },
            };
          }
          return {
            ...buildKbToolPayload(out, formatGrounding(out), localSmall),
            webVerification: {
              enabled: false,
              denied: true,
              note: "用户拒绝了本次联网核验授权，仅返回本地知识库结果。",
            },
          };
        }
        return buildKbToolPayload(out, formatGrounding(out), localSmall);
      })
      );
    }
    if (name === "baai_embedding_m3") {
      const api = window.electronAPI;
      if (!api || typeof api.embeddingOpenAi !== "function") {
        return { ok: false, error: "向量嵌入仅支持桌面版（Electron）。" };
      }
      const texts = [];
      if (Array.isArray(a.texts) && a.texts.length) {
        a.texts.forEach((x) => {
          const s = String(x ?? "").trim();
          if (s) {
            texts.push(s);
          }
        });
      }
      const single = String(a.text || "").trim();
      if (single) {
        texts.push(single);
      }
      if (!texts.length) {
        return { ok: false, error: "请提供 texts 数组或 text，至少一段非空文本。" };
      }
      const model = String(a.model || "BAAI/bge-m3").trim();
      return api.embeddingOpenAi({ texts, model });
    }
    return { ok: false, error: `未知工具: ${name}` };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
};

function closeTab(route) {
  const idx = openTabs.indexOf(route);
  if (idx === -1) {
    return;
  }
  if (openTabs.length <= 1) {
    return;
  }
  openTabs.splice(idx, 1);
  if (activeRoute === route) {
    const next = openTabs[Math.min(idx, openTabs.length - 1)] || openTabs[0];
    activateRoute(next);
  } else {
    renderTabsStrip();
  }
}

document.querySelectorAll(".nav-item[data-route]").forEach((btn) => {
  btn.addEventListener("click", () => {
    openOrFocusTab(btn.dataset.route);
  });
});

const dailyWorkNavToggle = document.getElementById("dailyWorkNavToggle");
if (dailyWorkNavToggle) {
  dailyWorkNavToggle.addEventListener("click", () => {
    const nextExpanded = !dailyWorkExpanded;
    applyDailyWorkExpanded(nextExpanded);
    if (nextExpanded && !DAILY_WORK_CHILD_ROUTES.has(activeRoute)) {
      openOrFocusTab("list");
    }
  });
}

window.addEventListener("hashchange", () => {
  const route = parseHashRoute();
  if (!openTabs.includes(route)) {
    openTabs.push(route);
  }
  activateRoute(route, { syncHash: false });
});

taskIdInput.addEventListener("input", () => {
  clearTaskIdDuplicateError();
});

taskForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearTaskIdDuplicateError();

  refreshAutoTaskId();
  const formData = {
    taskId: document.getElementById("taskId").value,
    issueType: document.getElementById("issueType").value,
    content: document.getElementById("content").value,
    reporter: document.getElementById("reporter").value,
    handler: document.getElementById("handler").value,
    status: document.getElementById("status").value,
    priority: document.getElementById("priority")?.value || "中",
    deadline: document.getElementById("deadline")?.value || "",
    remark: document.getElementById("remark").value,
  };

  const trimmedId = formData.taskId.trim();
  const duplicated = tasks.some((task) => task.taskId === trimmedId);
  if (duplicated) {
    refreshAutoTaskId();
    showTaskIdDuplicateError("登记事物ID冲突，已刷新为新 ID，请再次点击「登记任务」。");
    return;
  }

  const similar = te().findSimilarTasks ? te().findSimilarTasks(tasks, formData.content, 0.85) : [];
  if (similar.length) {
    const top = similar[0];
    const pct = Math.round(top.similarity * 100);
    const go = window.confirm(
      `检测到与「${top.task.taskId}」内容相似度约 ${pct}%，可能为重复任务。仍要创建吗？`,
    );
    if (!go) {
      return;
    }
  }

  if (formData.status === "已阻塞") {
    const reason = window.prompt("请填写阻塞原因（必填）", "")?.trim();
    const dep = window.prompt("请填写依赖方（可选）", "")?.trim() || "";
    if (!reason) {
      alert("已阻塞状态须填写阻塞原因。");
      return;
    }
    formData.blockReason = reason;
    formData.blockDependency = dep;
  }

  const draftTask = {
    taskId: trimmedId,
    issueType: formData.issueType,
    createdAtIsoDate: localDateKeyFromDate(new Date()),
  };
  const attachUi = window.TaskAttachmentsUI;
  let attachmentDir = "";
  if (attachUi?.prepareTaskWithAttachments) {
    const prep = await attachUi.prepareTaskWithAttachments(draftTask);
    if (!prep?.ok) {
      if (!prep?.canceled) {
        alert(prep?.error || "任务附件目录创建失败。");
      }
      return;
    }
    attachmentDir = prep.attachmentDir || "";
  }

  formData.attachmentDir = attachmentDir;
  const task = createTask(formData);
  te().recordChangeLog?.(task, {
    at: nowString(),
    operator: "用户",
    field: "create",
    oldValue: "",
    newValue: task.taskId,
  });
  tasks.unshift(task);
  saveTasks();
  taskForm.reset();
  attachUi?.clearPending?.();
  const priorityEl = document.getElementById("priority");
  if (priorityEl) {
    priorityEl.value = "中";
  }
  resetTaskNewFormUi();
  refreshAutoTaskId();
  clearTaskIdDuplicateError();
  resetListPagination();
  render();
});

resetFormBtn.addEventListener("click", () => {
  taskForm.reset();
  window.TaskAttachmentsUI?.clearPending?.();
  const priorityEl = document.getElementById("priority");
  if (priorityEl) {
    priorityEl.value = "中";
  }
  resetTaskNewFormUi();
  refreshAutoTaskId();
  clearTaskIdDuplicateError();
});

filterForm.addEventListener("submit", (event) => {
  event.preventDefault();
  resetListPagination();
  render();
  openOrFocusTab("list");
});

clearFilterBtn.addEventListener("click", () => {
  filterForm.reset();
  resetListPagination();
  render();
});

if (taskListQuickSearchEl) {
  taskListQuickSearchEl.addEventListener("input", () => {
    resetListPagination();
    render();
  });
}

if (taskListSortByEl) {
  taskListSortByEl.addEventListener("change", () => {
    resetListPagination();
    render();
  });
}

if (taskExportExcelBtn) {
  taskExportExcelBtn.addEventListener("click", async () => {
    const api = window.electronAPI;
    if (!api?.taskExportExcel) {
      showTaskListToast("导出需要桌面版客户端", true);
      return;
    }
    const rows = te().tasksToExcelRows ? te().tasksToExcelRows(filterTasks(tasks)) : [];
    setTaskTableLoading(true);
    try {
      const out = await api.taskExportExcel({ rows, fileName: `任务列表导出-${te().localDateKey?.() || "export"}` });
      if (out?.canceled) {
        return;
      }
      if (out?.ok) {
        showTaskListToast("文件正在生成，下载已开始");
      }
    } catch (err) {
      showTaskListToast(err.message || String(err), true);
    } finally {
      setTaskTableLoading(false);
    }
  });
}

if (dashboardRefreshBtn) {
  dashboardRefreshBtn.addEventListener("click", () => renderDashboard());
}
if (openCustomReportBtn) {
  openCustomReportBtn.addEventListener("click", () => openCustomReportDialog());
}
if (listCustomReportBtn) {
  listCustomReportBtn.addEventListener("click", () => openCustomReportDialog());
}
if (customReportGenerateBtn) {
  customReportGenerateBtn.addEventListener("click", () => {
    const spec = buildCustomReportSpecFromForm();
    const report = ta().buildCustomReport?.(tasks, spec, customReportHelpers());
    if (!report) {
      alert("报表模块未加载。");
      return;
    }
    lastCustomReport = report;
    renderCustomReportTable(report);
  });
}
if (customReportExportBtn) {
  customReportExportBtn.addEventListener("click", async () => {
    if (!lastCustomReport?.rows?.length) {
      alert("请先生成报表。");
      return;
    }
    const api = window.electronAPI;
    if (!api?.taskExportExcel) {
      alert("导出需要桌面版客户端。");
      return;
    }
    const dims = lastCustomReport.dimensions || [];
    const metrics = lastCustomReport.metrics || [];
    const headers = [...dims, ...metrics];
    const rows = lastCustomReport.rows.map((r) => {
      const obj = {};
      headers.forEach((h) => {
        obj[h] = r[h] ?? "";
      });
      return obj;
    });
    try {
      const out = await api.taskExportExcel({
        rows,
        fileName: `${lastCustomReport.title || "自定义报表"}-${te().localDateKey?.() || "export"}`,
      });
      if (out?.canceled) {
        return;
      }
      if (out?.ok) {
        showTaskListToast("文件正在生成，下载已开始");
      }
    } catch (err) {
      showTaskListToast(err.message || String(err), true);
    }
  });
}
if (applyTaskTemplateBtn) {
  applyTaskTemplateBtn.addEventListener("click", () => {
    const id = taskTemplateSelectEl?.value || "";
    if (!id) {
      alert("请先选择模板。");
      return;
    }
    if (!applyTaskTemplateById(id)) {
      alert("模板不存在或已删除。");
    }
  });
}
if (saveTaskTemplateBtn) {
  saveTaskTemplateBtn.addEventListener("click", () => {
    const name = window.prompt("模板名称", document.getElementById("issueType")?.value || "我的模板")?.trim();
    if (!name) {
      return;
    }
    const tpl = {
      id: `tpl-${Date.now()}`,
      name,
      issueType: document.getElementById("issueType")?.value?.trim() || "",
      content: document.getElementById("content")?.value?.trim() || "",
      priority: document.getElementById("priority")?.value || "中",
      status: document.getElementById("status")?.value || "待处理",
    };
    ta().upsertTemplate?.(tpl);
    renderTaskTemplateSelect();
    if (taskTemplateSelectEl) {
      taskTemplateSelectEl.value = tpl.id;
    }
    alert("模板已保存。");
  });
}
if (deleteTaskTemplateBtn) {
  deleteTaskTemplateBtn.addEventListener("click", () => {
    const id = taskTemplateSelectEl?.value || "";
    if (!id) {
      alert("请先选择要删除的自定义模板（内置模板不可删）。");
      return;
    }
    const tpl = ta().getTemplateById?.(id);
    if (!tpl || ta().DEFAULT_TEMPLATES?.some((d) => d.id === id)) {
      alert("内置模板不可删除，请选择自定义模板。");
      return;
    }
    if (!window.confirm(`确定删除模板「${tpl.name}」？`)) {
      return;
    }
    ta().deleteTemplate?.(id);
    renderTaskTemplateSelect();
  });
}
if (taskTemplateSelectEl) {
  taskTemplateSelectEl.addEventListener("change", () => {
    const id = taskTemplateSelectEl.value;
    if (id) {
      applyTaskTemplateById(id);
    }
  });
}

let dashboardResizeTimer = 0;
window.addEventListener("resize", () => {
  if (activeRoute !== "dashboard") {
    return;
  }
  clearTimeout(dashboardResizeTimer);
  dashboardResizeTimer = window.setTimeout(() => renderDashboard(), 150);
});

function handleTaskListActionClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const btn = target.closest("[data-action][data-id]");
  if (!btn) {
    return;
  }
  const action = btn.dataset.action;
  const id = btn.dataset.id;
  if (!action || !id) {
    return;
  }
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    return;
  }

  if (action === "complete") {
    applyTaskFieldChange(task, "status", "已完结");
    task.completedAt = nowString();
    te().appendSystemRemark?.(task, "任务已标记为已完结", nowString());
    saveTasks();
    render();
    return;
  }

  if (action === "cancelTask") {
    if (!confirm(`确定将「${task.taskId}」标记为已取消？将保留历史记录。`)) {
      return;
    }
    applyTaskFieldChange(task, "status", "已取消");
    task.cancelledAt = nowString();
    te().appendSystemRemark?.(task, "任务已取消", nowString());
    saveTasks();
    render();
    return;
  }

  if (action === "delete") {
    if (task.status === "已取消") {
      alert("已取消任务须保留历史记录，不可删除。");
      return;
    }
    if (
      !confirm(
        `确定删除登记事物「${task.taskId}」？\n将同时删除该任务在「每日任务」下的附件目录及目录内所有文档与图片，此操作不可恢复。`
      )
    ) {
      return;
    }
    void deleteTaskWithAttachments(task);
    return;
  }

  if (action === "changeStatus") {
    if (task.status === "已完结" || task.status === "已取消") {
      return;
    }
    const next = te().nextStatusInCycle ? te().nextStatusInCycle(task.status) : "处理中";
    if (next === "已阻塞" && !task.blockReason) {
      const reason = window.prompt("请填写阻塞原因（必填）", "")?.trim();
      const dep = window.prompt("请填写依赖方（可选）", "")?.trim() || "";
      if (!reason) {
        return;
      }
      task.blockReason = reason;
      task.blockDependency = dep;
    }
    if (next === "已挂起") {
      task.suspendedAt = nowString();
    }
    applyTaskFieldChange(task, "status", next);
    if (next === "已完结") {
      task.completedAt = nowString();
    }
    saveTasks();
    render();
    return;
  }

  if (action === "openRemark") {
    openRemarkModal(id);
    return;
  }

  if (action === "viewTaskContent") {
    openTaskContentModal(id);
  }
}

taskTableBody.addEventListener("click", handleTaskListActionClick);
if (taskCardListEl) {
  taskCardListEl.addEventListener("click", handleTaskListActionClick);
}

function handleTaskListActionKeydown(event) {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const el = target.closest('[data-action="viewTaskContent"][data-id]');
  if (!el) {
    return;
  }
  event.preventDefault();
  openTaskContentModal(el.dataset.id);
}

taskTableBody.addEventListener("keydown", handleTaskListActionKeydown);
if (taskCardListEl) {
  taskCardListEl.addEventListener("keydown", handleTaskListActionKeydown);
}

remarkCancelBtn.addEventListener("click", () => {
  remarkNewInput.value = "";
  activeRemarkTaskId = null;
  remarkDialog.close();
});

remarkSubmitBtn.addEventListener("click", () => {
  if (!activeRemarkTaskId) {
    return;
  }
  const text = remarkNewInput.value.trim();
  if (!text) {
    alert("备注内容不能为空。");
    return;
  }
  const task = tasks.find((item) => item.id === activeRemarkTaskId);
  if (!task) {
    return;
  }
  if (!Array.isArray(task.remarks)) {
    task.remarks = [];
  }
  task.remarks.push({
    id: crypto.randomUUID(),
    content: text,
    remarkTime: nowString(),
  });
  saveTasks();
  remarkNewInput.value = "";
  activeRemarkTaskId = null;
  remarkDialog.close();
  render();
});

remarkDialog.addEventListener("close", () => {
  remarkNewInput.value = "";
  activeRemarkTaskId = null;
});

if (taskContentCloseBtn && taskContentDialog) {
  taskContentCloseBtn.addEventListener("click", () => {
    taskContentDialog.close();
  });
}

function initShell() {
  const fromHash = parseHashRoute();
  openTabs = [fromHash];
  activateRoute(fromHash, { syncHash: true });
}

function initSidebarCollapse() {
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebarToggle");
  if (!sidebar || !sidebarToggle) {
    return;
  }
  const textEl = sidebarToggle.querySelector(".sidebar-toggle-text");
  function applySidebarCollapsed(collapsed) {
    sidebar.classList.toggle("sidebar-collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (textEl) {
      textEl.textContent = collapsed ? "展开侧栏" : "收起侧栏";
    }
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    if (collapsed) {
      applyDailyWorkExpanded(false);
    } else {
      syncDailyWorkExpandedByRoute(activeRoute);
    }
  }
  sidebarToggle.addEventListener("click", () => {
    applySidebarCollapsed(!sidebar.classList.contains("sidebar-collapsed"));
  });
  if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
    applySidebarCollapsed(true);
  }
}

initShell();
initSidebarCollapse();
void initStartupWarmupBar();
applyDailyWorkExpanded(false);
initTasksFromStorage();
renderTaskTemplateSelect();
render();
setTimeout(() => remindOpenTasks(true), 500);
setInterval(() => remindOpenTasks(false), 60 * 1000);
setInterval(() => {
  const TE = te();
  if (!TE.runTaskMaintenance) {
    return;
  }
  const m = TE.runTaskMaintenance(tasks, { nowString, getTaskLatestUpdateMs, parseAnyTimeToMs });
  if (m.notes || m.suspended) {
    saveTasks();
    render();
  }
}, 60 * 60 * 1000);
