function wbApi() {
  return window.electronAPI || {};
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 统一解析当前任务 ID：store > DOM dataset > 激活项 > 执行流头部 > 唯一任务回退 */
function resolveCurrentTaskId({ preferTaskId = null } = {}) {
  const store = window.__wbStore?.getState?.() || {};
  const list = document.getElementById("wbTaskList");
  const detail = document.getElementById("wbTaskDetail");
  const agentCol = document.getElementById("wbPwsAgentCol");
  const fromPrefer = preferTaskId ? String(preferTaskId) : "";
  const fromStore = store.selectedTaskId ? String(store.selectedTaskId) : "";
  const fromDataset = list?.dataset?.selectedTaskId ? String(list.dataset.selectedTaskId) : "";
  const fromActive = list?.querySelector?.(".wb-task-item.is-active")?.dataset?.taskId || "";
  const fromHeader =
    detail?.dataset?.taskId ||
    agentCol?.dataset?.taskId ||
    document.getElementById("wbAgentRunTitle")?.dataset?.taskId ||
    "";
  const tasks = Array.isArray(store.tasks) ? store.tasks : [];
  const candidates = [fromPrefer, fromStore, fromDataset, fromActive, fromHeader].filter(Boolean);
  for (const id of candidates) {
    // 即使 tasks 暂未加载，也信任已同步的选中 ID（避免 Diff 打开瞬间被清空）
    if (!tasks.length || tasks.some((t) => t && t.id === id)) {
      return id;
    }
    // tasks 已加载但不含该 id：仍返回候选，交给调用方再校验（防止误报无任务）
    if (fromPrefer === id || fromHeader === id) {
      return id;
    }
  }
  if (tasks.length === 1 && tasks[0]?.id) {
    return String(tasks[0].id);
  }
  const waiting = tasks.find(
    (t) =>
      t &&
      (t.status === "WAITING_APPROVAL" ||
        String(t.currentStep || "").includes("变更待审阅") ||
        String(t.currentStep || "").includes("方案待确认"))
  );
  return waiting?.id ? String(waiting.id) : null;
}

function resolveCurrentProjectId({ preferProjectId = null } = {}) {
  const store = window.__wbStore?.getState?.() || {};
  const detail = document.getElementById("wbTaskDetail");
  const agentCol = document.getElementById("wbPwsAgentCol");
  const fromPrefer = preferProjectId ? String(preferProjectId) : "";
  const fromStore = store.selectedProjectId ? String(store.selectedProjectId) : "";
  const fromHeader = detail?.dataset?.projectId || agentCol?.dataset?.projectId || "";
  return fromPrefer || fromStore || fromHeader || null;
}

function syncSelectedTaskId(taskId, { emitStore = true, projectId = null } = {}) {
  const id = taskId ? String(taskId) : null;
  const list = document.getElementById("wbTaskList");
  const detail = document.getElementById("wbTaskDetail");
  const agentCol = document.getElementById("wbPwsAgentCol");
  const pid =
    projectId ||
    window.__wbStore?.getState?.().selectedProjectId ||
    detail?.dataset?.projectId ||
    null;
  if (list) {
    if (id) {
      list.dataset.selectedTaskId = id;
      list.querySelectorAll(".wb-task-item").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.taskId === id);
      });
    } else {
      delete list.dataset.selectedTaskId;
      list.querySelectorAll(".wb-task-item").forEach((el) => el.classList.remove("is-active"));
    }
  }
  if (detail) {
    if (id) {
      detail.dataset.taskId = id;
      if (pid) {
        detail.dataset.projectId = String(pid);
      }
    } else {
      delete detail.dataset.taskId;
      delete detail.dataset.projectId;
    }
  }
  if (agentCol) {
    if (id) {
      agentCol.dataset.taskId = id;
      if (pid) {
        agentCol.dataset.projectId = String(pid);
      }
    } else {
      delete agentCol.dataset.taskId;
      delete agentCol.dataset.projectId;
    }
  }
  const titleEl = document.getElementById("wbAgentRunTitle");
  if (titleEl) {
    if (id) {
      titleEl.dataset.taskId = id;
    } else {
      delete titleEl.dataset.taskId;
    }
  }
  if (emitStore && typeof window.__wbStore?.selectTask === "function") {
    window.__wbStore.selectTask(id);
  }
  return id;
}

function taskStatusLabel(status, currentStep = "") {
  if (window.__wbTaskStatus?.labelForTaskStatus) {
    return window.__wbTaskStatus.labelForTaskStatus(status, currentStep);
  }
  const labels = window.__wbTaskStatus?.TASK_STATUS_LABELS || {};
  return labels[status] || status;
}

function statusChipClass(status) {
  const normalized = window.__wbTaskStatus?.normalizeTaskStatus?.(status) || status;
  if (
    normalized === "REVIEWING" ||
    normalized === "PLANNING" ||
    normalized === "WAITING_APPROVAL"
  ) {
    return "wb-task-status--active";
  }
  if (normalized === "FIXING" || normalized === "TESTING") {
    return "wb-task-status--active";
  }
  if (status === "DONE") {
    return "wb-task-status--done";
  }
  if (status === "FAILED") {
    return "wb-task-status--fail";
  }
  return "wb-task-status--default";
}

function ensureWorkspaceRoot() {
  if (typeof window.__wbEnsureProjectWorkspaceLayout === "function") {
    return window.__wbEnsureProjectWorkspaceLayout();
  }
  let root = document.getElementById("wbProjectWorkspace");
  if (root) {
    return root;
  }
  const panelAi = document.getElementById("panel-ai");
  if (!panelAi) {
    return null;
  }
  root = document.createElement("div");
  root.id = "wbProjectWorkspace";
  root.className = "wb-project-workspace";
  root.hidden = true;
  panelAi.prepend(root);
  return root;
}

function renderPlanCard(output) {
  const card = document.getElementById("wbPlanCard");
  const raw = document.getElementById("wbAgentOutput");
  const safe = window.__wbSanitizeAgentOutputForUi?.(output) || output;
  if (!card || !safe) {
    return;
  }
  if (raw) {
    raw.hidden = true;
  }
  card.hidden = false;
  const clarifying =
    Boolean(safe.openQuestions?.length) &&
    (safe.executionReady === false ||
      safe.taskSpec?.status === "CLARIFYING" ||
      String(safe.note || "").includes("澄清"));
  composerPhase = clarifying ? "clarifying" : "plan_ready";
  updateComposerUi(composerPhase);
  const planItems = (safe.plan || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const fileItems = (safe.affectedFiles || []).map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("");
  const riskItems = (safe.risks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  const testItems = (safe.testPlan || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  const questionItems = (safe.openQuestions || [])
    .map(
      (q) =>
        `<li data-qid="${escapeHtml(q.id || "")}"><strong>${escapeHtml(q.text || "")}</strong></li>`
    )
    .join("");
  const nextLine = clarifying
    ? "请先回答澄清问题并点击「确认规格」，确认前不会生成代码变更。"
    : "点击「生成代码变更」，AI 将生成可审阅 Diff。";
  const badge = clarifying ? "需求澄清中" : "方案待确认";
  card.innerHTML = `
    <header class="wb-plan-card__head">
      <h4>${escapeHtml(safe.summary || "开发方案")}</h4>
      <span class="wb-plan-card__badge">${badge}</span>
    </header>
    <p class="wb-plan-card__req"><strong>需求理解：</strong>${escapeHtml(safe.requirementUnderstanding || "")}</p>
    ${
      clarifying
        ? `<div class="wb-plan-card__clarify"><h5>澄清问题</h5><ol>${questionItems}</ol>
           <label class="wb-plan-card__answers">回答（可选，每行：问题ID=答案）
           <textarea id="wbSpecAnswers" rows="3" placeholder="auth=本地账号&#10;storage=SQLite"></textarea></label></div>`
        : ""
    }
    <div class="wb-plan-card__grid">
      <div><h5>实施方案</h5><ol>${planItems}</ol></div>
      <div><h5>预计文件</h5><ul class="wb-plan-card__files">${fileItems}</ul></div>
      <div><h5>风险说明</h5><ul>${riskItems}</ul></div>
      <div><h5>测试计划</h5><ul>${testItems}</ul></div>
    </div>
    <p class="wb-plan-card__next"><strong>下一步：</strong>${nextLine}</p>
  `;
  window.__wbRenderPlanCodeExtras?.(safe);
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (output.diffPreviews?.length && projectId && taskId) {
    syncSelectedTaskId(taskId);
    window.__wbCodeReviewStore?.setFromDiffPreviews?.(
      projectId,
      taskId,
      output.diffPreviews,
      "plan"
    );
    window.__wbRenderDiffReviewPanel?.();
    window.__wbSwitchCodeTab?.("diff", { loadDiff: false });
  }
}

function renderTaskDetail(task, planOutput = null) {
  const panel = document.getElementById("wbTaskDetail");
  const emptyHint = document.getElementById("wbPwsAgentEmpty");
  if (!panel) {
    return;
  }
  if (!task) {
    panel.hidden = true;
    if (emptyHint) {
      emptyHint.hidden = false;
    }
    window.__wbActivityFeed?.updateHeader?.({
      title: "当前任务",
      status: "",
      mode: "",
    });
    return;
  }
  panel.hidden = false;
  if (emptyHint) {
    emptyHint.hidden = true;
  }
  syncSelectedTaskId(task.id, {
    projectId: task.projectId || window.__wbStore?.getState?.().selectedProjectId,
  });
  const safePlan = planOutput ? window.__wbSanitizeAgentOutputForUi?.(planOutput) || planOutput : null;
  const statusText = resolveTaskDisplayStatus(task);
  const modeText =
    composerPhase === "diff_ready" || composerPhase === "diff_accepted"
      ? "PATCH_PROPOSE"
      : composerPhase === "plan_ready"
        ? "PLAN_ONLY"
        : composerPhase === "running"
          ? "执行中"
          : composerPhase === "written"
            ? "已写入"
            : "PLAN_ONLY / 受控写入";
  const nextHint =
    composerPhase === "plan_ready"
      ? "下一步：生成代码变更"
      : composerPhase === "diff_ready"
        ? "下一步：查看 Diff / 审阅变更"
        : composerPhase === "diff_accepted"
          ? "下一步：接受并写入"
          : composerPhase === "written"
            ? "下一步：运行验证或完成任务"
            : composerPhase === "patch_empty"
              ? "下一步：生成代码变更"
              : composerPhase === "running" || agentRunStarting
                ? "正在执行…"
                : composerPhase === "done"
                  ? "任务已完成"
                  : isUnfinishedComposerTask(task)
                    ? "下一步：继续执行未完成环节"
                    : "下一步：开始执行";
  const titleEl = document.getElementById("wbAgentRunTitle");
  const statusEl = document.getElementById("wbAgentRunStatus");
  const modeEl = document.getElementById("wbAgentRunMode");
  const descEl = document.getElementById("wbTaskDetailDesc");
  if (titleEl) {
    titleEl.textContent = task.title || "当前任务";
  }
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = `${statusText} · ${nextHint}`;
  }
  if (modeEl) {
    modeEl.hidden = false;
    modeEl.textContent = modeText;
  }
  if (descEl) {
    const descBits = [];
    if (safePlan?.summary) {
      descBits.push(window.__wbStripModelThinking?.(safePlan.summary) || safePlan.summary);
    } else if (task.description) {
      descBits.push(window.__wbStripModelThinking?.(task.description) || task.description);
    }
    descEl.textContent = descBits.join(" · ").slice(0, 160);
    descEl.hidden = !descBits.length;
  }
  window.__wbActivityFeed?.updateHeader?.({
    title: task.title || "当前任务",
    status: `${statusText} · ${nextHint}`,
    mode: modeText,
  });
}

function renderProjectColCard(_project) {
  /* 侧栏项目摘要已取消展示；保留函数以免旧调用报错 */
}

let taskFilterMode = "all";
let activeAgentRunId = null;
let agentRunStarting = false;
let composerPhase = "idle";
let composerLiveSteps = [];
let unsubscribeAgentEvents = null;
let agentEventPollTimer = null;
const WB_AUTO_VERIFY_KEY = "wb_auto_verify_v1";

const COMPOSER_STEP_LABELS = {
  create_task: "创建任务",
  check_source: "检查项目路径",
  analyze_req: "分析需求",
  analyze_structure: "扫描项目结构",
  search_files: "搜索相关文件",
  read_code: "读取关键代码",
  generate_plan: "生成开发方案",
  plan_ready: "方案待确认",
  clarifying: "需求澄清中",
  generate_patch: "生成代码变更",
  await_diff: "等待用户审阅 Diff",
  write_code: "写入代码",
  run_verify: "运行验证",
  fix_failure: "失败修复",
  complete: "任务完成",
  failed: "执行失败",
  canceled: "已取消",
};

const PHASE_TO_STEP = {
  CHECKING_PATH: "check_source",
  ANALYZING: "analyze_req",
  SCANNING: "analyze_structure",
  SEARCHING: "search_files",
  READING: "read_code",
  PLANNING: "generate_plan",
  PATCHING: "generate_patch",
  WAITING_REVIEW: "await_diff",
  APPLYING: "write_code",
  VERIFYING: "run_verify",
  FIXING: "fix_failure",
  COMPLETED: "complete",
  FAILED: "failed",
  CANCELED: "canceled",
};

function mapEventStatusToStep(status) {
  const s = String(status || "").toLowerCase();
  if (s === "success" || s === "done" || s === "completed" || s === "skipped") {
    return "done";
  }
  if (s === "failed" || s === "error") {
    return "error";
  }
  if (s === "waiting") {
    return "waiting";
  }
  if (s === "canceled" || s === "cancelled") {
    return "error";
  }
  if (s === "queued" || s === "pending") {
    return "pending";
  }
  return "running";
}

function appendAgentLogLine(text) {
  const out = document.getElementById("wbAgentOutput");
  if (!out) {
    return;
  }
  const cleaned = window.__wbStripModelThinking?.(text) || text;
  if (!cleaned) {
    return;
  }
  out.hidden = false;
  const stamp = new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const line = `${stamp} ${cleaned}`;
  const prev = out.textContent && out.textContent !== "Agent 分析项目中…" ? out.textContent : "";
  out.textContent = prev ? `${prev}\n${line}` : line;
  out.scrollTop = out.scrollHeight;
}

function applyAgentEventToUi(payload) {
  if (!payload || payload.visible === false || payload.debugOnly) {
    return;
  }
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (payload.projectId && projectId && payload.projectId !== projectId) {
    return;
  }
  if (payload.taskId && taskId && payload.taskId !== taskId) {
    return;
  }
  // 丢弃明确过期的 run 事件（取消后 activeAgentRunId 已清空或指向新 run）
  if (
    payload.agentRunId &&
    activeAgentRunId &&
    payload.agentRunId !== activeAgentRunId &&
    !agentRunStarting
  ) {
    return;
  }
  if (payload.agentRunId && (agentRunStarting || !activeAgentRunId || payload.agentRunId === activeAgentRunId)) {
    activeAgentRunId = payload.agentRunId;
  }

  const stepKey =
    payload.stepKey ||
    PHASE_TO_STEP[payload.phase] ||
    payload.phase ||
    "analyze_req";
  const stepStatus = mapEventStatusToStep(payload.status);
  const title = COMPOSER_STEP_LABELS[stepKey] || payload.title || stepKey;
  const summary = window.__wbStripModelThinking?.(payload.summary || payload.error || "") || "";
  upsertComposerStep(stepKey, stepStatus, summary || title);
  // 工具级 / 带 eventId 的事件写入 Activity Feed（append-only）；粗粒度步骤由 upsertComposerStep 同步
  if (payload.toolName || payload.eventId || payload.phase === "WAITING_REVIEW") {
    window.__wbActivityFeed?.pushEvent?.({
      ...payload,
      stepKey,
      title: payload.title || title,
      summary: summary || payload.summary || title,
    });
  }

  if (payload.status === "running" || payload.status === "queued") {
    if (composerPhase !== "running") {
      updateComposerUi("running");
    }
  } else if (payload.status === "waiting") {
    if (payload.phase === "WAITING_REVIEW" || stepKey === "await_diff" || stepKey === "plan_ready") {
      const nextPhase = stepKey === "plan_ready" ? "plan_ready" : "diff_ready";
      updateComposerUi(nextPhase);
    }
  } else if (payload.status === "failed" && stepKey === "failed") {
    updateComposerUi("failed");
  } else if (payload.status === "success" && stepKey === "complete") {
    updateComposerUi("done");
  }

  if (summary && (payload.status === "success" || payload.status === "failed" || payload.status === "waiting")) {
    appendAgentLogLine(`${payload.title || title}：${summary}`);
  } else if (payload.status === "running" && payload.title) {
    appendAgentLogLine(`${payload.title}…`);
  }
}

function stopAgentEventPolling() {
  if (agentEventPollTimer) {
    window.clearInterval(agentEventPollTimer);
    agentEventPollTimer = null;
  }
}

function startAgentEventPolling(projectId, taskId) {
  stopAgentEventPolling();
  const api = wbApi();
  if (typeof api.wbProjectAgentEventsList !== "function") {
    return;
  }
  agentEventPollTimer = window.setInterval(() => {
    if (!agentRunStarting && !activeAgentRunId) {
      stopAgentEventPolling();
      return;
    }
    void api
      .wbProjectAgentEventsList({
        projectId,
        taskId,
        agentRunId: activeAgentRunId || undefined,
      })
      .then((events) => {
        (events || []).forEach((ev) => applyAgentEventToUi(ev));
      })
      .catch(() => {});
  }, 1000);
}

function subscribeAgentEvents() {
  const api = wbApi();
  if (unsubscribeAgentEvents) {
    return;
  }
  if (typeof api.onWbProjectAgentEvent === "function") {
    unsubscribeAgentEvents = api.onWbProjectAgentEvent((payload) => {
      applyAgentEventToUi(payload);
    });
  }
}

function unsubscribeAgentEventListener() {
  if (typeof unsubscribeAgentEvents === "function") {
    unsubscribeAgentEvents();
  }
  unsubscribeAgentEvents = null;
  stopAgentEventPolling();
}

function showComposerError(message) {
  const el = document.getElementById("wbComposerError");
  if (!el) {
    return;
  }
  if (message) {
    el.hidden = false;
    el.textContent = String(message);
  } else {
    el.hidden = true;
    el.textContent = "";
  }
}

function showComposerToast(message, { type = "info", timeoutMs = 4200 } = {}) {
  const el = document.getElementById("wbComposerToast");
  if (!el) {
    return;
  }
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    el.className = "wb-composer-toast";
    return;
  }
  el.hidden = false;
  el.textContent = String(message);
  el.className = `wb-composer-toast wb-composer-toast--${type}`;
  window.clearTimeout(showComposerToast._timer);
  showComposerToast._timer = window.setTimeout(() => {
    if (el.textContent === String(message)) {
      showComposerToast("");
    }
  }, timeoutMs);
}

function getAutoVerifyChecked() {
  const el = document.getElementById("wbAutoVerifyAfterWrite");
  if (!el) {
    return true;
  }
  return Boolean(el.checked);
}

function getComposerSceneId() {
  return window.__wbSceneTemplates?.getActiveTemplate?.()?.id || "";
}

function getComposerRawInput() {
  return document.getElementById("wbAgentInput")?.value?.trim() || "";
}

function getComposerMessage() {
  return window.__wbSceneTemplates?.enrichAgentMessage?.(getComposerRawInput()) || "";
}

async function fetchProjectPathStatus(projectId) {
  const api = wbApi();
  if (!projectId || typeof api.wbProjectCodeRoot !== "function") {
    return { valid: false, reason: "api_unavailable" };
  }
  const info = await api.wbProjectCodeRoot({ projectId });
  const valid = Boolean(info.valid);
  let gitIsRepo = null;
  if (valid && typeof api.wbProjectGitStatus === "function") {
    try {
      const git = await api.wbProjectGitStatus({ projectId });
      gitIsRepo = Boolean(git?.isRepo);
    } catch {
      gitIsRepo = null;
    }
  }
  return { ...info, valid, gitIsRepo };
}

async function syncComposerPathState(projectId) {
  const hint = document.getElementById("wbComposerPathHint");
  const primaryBtn = document.getElementById("wbPrimaryActionBtn");
  if (!projectId) {
    if (hint) {
      hint.hidden = true;
    }
    if (primaryBtn) {
      primaryBtn.disabled = true;
    }
    return { valid: false };
  }
  try {
    const status = await fetchProjectPathStatus(projectId);
    const blocked = !status.valid;
    if (hint) {
      if (blocked) {
        hint.hidden = false;
        hint.textContent =
          status.reason === "PROJECT_PATH_NOT_FOUND"
            ? "当前项目路径不可用，请先在左侧项目卡片中修复路径。"
            : "当前项目未配置路径，请在项目设置中补充项目路径。";
      } else {
        hint.hidden = true;
        hint.textContent = "";
      }
    }
    if (primaryBtn) {
      primaryBtn.disabled = blocked || composerPhase === "running" || agentRunStarting;
    }
    return status;
  } catch (err) {
    if (hint) {
      hint.hidden = false;
      hint.textContent = "无法检查项目路径，请稍后重试。";
    }
    if (primaryBtn) {
      primaryBtn.disabled = true;
    }
    return { valid: false };
  }
}

window.__wbSyncComposerSourceGate = syncComposerPathState;

function resetComposerLiveSteps() {
  composerLiveSteps = [];
  window.__wbActivityFeed?.reset?.();
}

function upsertComposerStep(id, status, detail = "") {
  const label = COMPOSER_STEP_LABELS[id] || id;
  const existing = composerLiveSteps.find((s) => s.id === id);
  const entry = {
    id,
    label,
    status,
    detail: window.__wbStripModelThinking?.(String(detail || "")) || String(detail || ""),
    at: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    composerLiveSteps.push(entry);
  }
  window.__wbActivityFeed?.pushStep?.(entry);
  renderComposerTimeline();
}

function renderComposerTimeline(historicalRuns = null) {
  const runsList = document.getElementById("wbAgentRuns");
  if (!runsList) {
    return;
  }
  runsList.replaceChildren();
  runsList.classList.add("wb-agent-progress");
  if (composerLiveSteps.length) {
    composerLiveSteps.forEach((step) => {
      runsList.appendChild(buildTimelineItem(step.label, step.status, step.detail, step.at, true));
    });
  }
  const runs = historicalRuns;
  if (runs === null) {
    return;
  }
  if (!runs?.length && !composerLiveSteps.length) {
    runsList.innerHTML = '<li class="wb-agent-runs__empty">暂无 Agent 记录</li>';
    return;
  }
  if (!composerLiveSteps.length) {
    runs.forEach((run) => {
      const rawSummary = run.output?.summary || run.inputText?.slice(0, 80) || run.agentType;
      const summary = window.__wbStripModelThinking?.(rawSummary) || rawSummary;
      const status = run.status || "success";
      const li = buildTimelineItem(run.agentType || "Agent", status, summary, run.createdAt || "", false);
      li.addEventListener("click", () => {
        if (run.output?.plan) {
          renderPlanCard(run.output);
        }
      });
      runsList.appendChild(li);
    });
  }
}

function buildTimelineItem(title, status, detail, time, isStep) {
  const li = document.createElement("li");
  li.className = "wb-pws-timeline__item wb-agent-step";
  const normalized = String(status || "pending").toLowerCase();
  const statusClass =
    normalized === "done" || normalized === "completed" || normalized === "success"
      ? "success"
      : normalized === "error" || normalized === "failed"
        ? "failed"
        : normalized === "waiting"
          ? "waiting"
          : normalized === "running" || normalized === "pending" || normalized === "queued"
            ? "running"
            : normalized;
  li.classList.add(`is-${statusClass}`);
  const icon =
    statusClass === "success"
      ? "✓"
      : statusClass === "failed"
        ? "✕"
        : statusClass === "waiting"
          ? "!"
          : statusClass === "running"
            ? ""
            : "·";
  const statusLabel =
    statusClass === "success"
      ? "完成"
      : statusClass === "failed"
        ? "失败"
        : statusClass === "waiting"
          ? "等待确认"
          : statusClass === "running"
            ? "运行中"
            : status;
  const safeDetail = window.__wbStripModelThinking?.(detail) || detail || "";
  li.innerHTML = `
    <span class="wb-agent-step__icon ${statusClass === "running" ? "wb-agent-step__spinner" : ""}" aria-hidden="true">${escapeHtml(icon)}</span>
    <div class="wb-pws-timeline__body wb-agent-step__content">
      <div class="wb-pws-timeline__head">
        <span class="wb-pws-timeline__type">${escapeHtml(title)}</span>
        <span class="wb-pws-timeline__status wb-pws-timeline__status--${escapeHtml(statusClass)}">${escapeHtml(statusLabel)}</span>
      </div>
      ${safeDetail ? `<p class="wb-pws-timeline__summary">${escapeHtml(safeDetail)}</p>` : ""}
      ${time && !isStep ? `<time class="wb-pws-timeline__time">${escapeHtml(time)}</time>` : ""}
    </div>
  `;
  return li;
}

function detectComposerPhaseFromContext(projectId, taskId, task = null) {
  if (composerPhase === "running" || agentRunStarting) {
    return "running";
  }
  const reviewStore = window.__wbCodeReviewStore;
  const changes = reviewStore?.getChanges?.(projectId, taskId) || [];
  if (changes.length) {
    const accepted = reviewStore?.getAcceptedChanges?.(projectId, taskId) || [];
    if (accepted.length > 0 && accepted.length === changes.length) {
      return "diff_accepted";
    }
    if (accepted.length > 0) {
      return "diff_accepted";
    }
    return "diff_ready";
  }
  const status = String(
    window.__wbTaskStatus?.normalizeTaskStatus?.(task?.status) || task?.status || ""
  ).toUpperCase();
  const step = String(task?.currentStep || "");
  if (status === "COMPLETED" || status === "DONE" || status === "ARCHIVED") {
    return "done";
  }
  if (status === "FAILED" || status === "CANCELED") {
    return "failed";
  }
  if (
    status === "TESTING" ||
    status === "FIXING" ||
    step.includes("验证") ||
    step.includes("已写入") ||
    step.includes("写入完成")
  ) {
    return "written";
  }
  if (step.includes("未生成变更") || step.includes("生成代码变更失败")) {
    return "patch_empty";
  }
  if (step.includes("变更待审阅") || status === "WAITING_APPROVAL" || status === "REVIEWING") {
    // 状态声称有 Diff，但 store 为空：交给 openDiff 再拉一次；UI 先按可续跑处理
    return "patch_empty";
  }
  if (status === "APPLYING" || step.includes("等待写入") || step.includes("已接受")) {
    return "diff_accepted";
  }
  const planCard = document.getElementById("wbPlanCard");
  const hasPlan = planCard && !planCard.hidden;
  if (hasPlan || step.includes("方案待确认") || status === "PLANNING") {
    return "plan_ready";
  }
  return "idle";
}

function isUnfinishedComposerTask(task) {
  if (!task?.id) {
    return false;
  }
  if (typeof window.__wbTaskStatus?.isActiveTaskStatus === "function") {
    return window.__wbTaskStatus.isActiveTaskStatus(task.status);
  }
  const status = String(task.status || "").toUpperCase();
  return !["COMPLETED", "DONE", "FAILED", "CANCELED", "ARCHIVED"].includes(status);
}

function resolveTaskResumeMessage(task) {
  const fromInput = getComposerRawInput();
  if (fromInput) {
    return fromInput;
  }
  const fromDesc = String(task?.description || "").trim();
  if (fromDesc) {
    return fromDesc;
  }
  const fromTitle = String(task?.title || "").trim();
  if (fromTitle) {
    return fromTitle;
  }
  return "继续执行未完成的开发任务";
}

function getSelectedComposerTask() {
  const taskId = resolveCurrentTaskId();
  if (!taskId) {
    return null;
  }
  return (window.__wbStore?.getState?.().tasks || []).find((t) => t.id === taskId) || null;
}

function resolveTaskDisplayStatus(task, phase = composerPhase) {
  const step = String(task?.currentStep || "");
  if (phase === "running" || agentRunStarting) {
    return "运行中";
  }
  if (phase === "plan_ready" || step.includes("方案待确认")) {
    return "方案待确认";
  }
  if (phase === "diff_accepted") {
    return "Diff 已接受";
  }
  if (phase === "diff_ready" || step.includes("变更待审阅")) {
    return "变更待审阅";
  }
  if (phase === "patch_empty" || step.includes("未生成变更")) {
    return "未生成变更";
  }
  if (phase === "written") {
    return "已写入";
  }
  if (step.includes("等待写入") || step.includes("已接受")) {
    return "等待写入";
  }
  if (step.includes("验证")) {
    return "测试中";
  }
  return taskStatusLabel(task?.status, step);
}

function resolveComposerActionConfig(phase = composerPhase) {
  switch (phase) {
    case "running":
      return { primary: "停止任务", secondary: "", showSecondary: false, showMore: false };
    case "plan_ready":
      return { primary: "生成代码变更", secondary: "调整需求", showSecondary: true, showMore: true };
    case "clarifying":
      return { primary: "确认规格", secondary: "调整需求", showSecondary: true, showMore: true };
    case "diff_ready":
      return { primary: "查看 Diff", secondary: "需修改", showSecondary: true, showMore: true };
    case "diff_accepted":
      return { primary: "接受并写入", secondary: "查看 Diff", showSecondary: true, showMore: true };
    case "patch_empty":
      return {
        primary: "生成代码变更",
        secondary: "调整需求",
        showSecondary: true,
        showMore: true,
      };
    case "written":
      return { primary: "运行验证", secondary: "完成任务", showSecondary: true, showMore: true };
    case "done":
      return { primary: "完成任务", secondary: "", showSecondary: false, showMore: true };
    case "failed":
      return { primary: "重新生成方案", secondary: "查看错误", showSecondary: true, showMore: true };
    default: {
      const task = getSelectedComposerTask();
      if (isUnfinishedComposerTask(task)) {
        return { primary: "继续执行", secondary: "", showSecondary: false, showMore: true };
      }
      return { primary: "开始执行", secondary: "", showSecondary: false, showMore: true };
    }
  }
}

function hideComposerMoreMenu() {
  const menu = document.getElementById("wbComposerMoreMenu");
  if (menu) {
    menu.hidden = true;
    menu.setAttribute("hidden", "");
    menu.setAttribute("aria-hidden", "true");
  }
  const moreBtn = document.getElementById("wbMoreActionsBtn");
  if (moreBtn) {
    moreBtn.setAttribute("aria-expanded", "false");
  }
}

function toggleComposerMoreMenu() {
  const menu = document.getElementById("wbComposerMoreMenu");
  if (!menu) {
    return;
  }
  const willOpen = menu.hidden || menu.hasAttribute("hidden");
  if (willOpen) {
    menu.hidden = false;
    menu.removeAttribute("hidden");
    menu.setAttribute("aria-hidden", "false");
    document.getElementById("wbMoreActionsBtn")?.setAttribute("aria-expanded", "true");
  } else {
    hideComposerMoreMenu();
  }
}

function setComposerButtonVisible(btn, visible, label = "") {
  if (!btn) {
    return;
  }
  const isIconOnly = btn.id === "wbMoreActionsBtn" || btn.classList.contains("wb-ai-command__more");
  if (visible) {
    btn.hidden = false;
    btn.removeAttribute("hidden");
    btn.setAttribute("aria-hidden", "false");
    if (isIconOnly) {
      // 图标按钮：禁止用 textContent 覆盖，避免清空三点图标
      ensureMoreActionsIcon(btn);
    } else if (label) {
      btn.textContent = label;
    }
  } else {
    btn.hidden = true;
    btn.setAttribute("hidden", "");
    btn.setAttribute("aria-hidden", "true");
    if (!isIconOnly && !label) {
      btn.textContent = "";
    }
  }
}

/** 更多操作按钮：水平三点（⋯），与知识库等处一致 */
function ensureMoreActionsIcon(btn) {
  if (!btn) return;
  const icon = "⋯";
  if (btn.textContent.trim() !== icon || btn.querySelector("svg")) {
    btn.textContent = icon;
  }
}

function updateComposerUi(phase = composerPhase) {
  const requested = phase == null || phase === "" ? composerPhase || "idle" : phase;
  // 执行中禁止被 loadTaskContext 等回写成「生成代码变更」；终态调用方须先清 agentRunStarting
  const running = requested === "running" || (agentRunStarting && requested !== "failed");
  composerPhase = running ? "running" : requested;
  const primaryBtn = document.getElementById("wbPrimaryActionBtn");
  const secondaryBtn = document.getElementById("wbSecondaryActionBtn");
  const moreBtn = document.getElementById("wbMoreActionsBtn");
  const input = document.getElementById("wbAgentInput");
  const cfg = resolveComposerActionConfig(composerPhase);

  if (primaryBtn) {
    primaryBtn.textContent = cfg.primary;
    primaryBtn.classList.toggle("wb-pws-btn--danger", running);
    primaryBtn.disabled = false;
    setComposerButtonVisible(primaryBtn, true, cfg.primary);
  }
  setComposerButtonVisible(secondaryBtn, Boolean(cfg.showSecondary), cfg.secondary || "");
  if (secondaryBtn) {
    secondaryBtn.disabled = running;
  }
  setComposerButtonVisible(moreBtn, Boolean(cfg.showMore));
  if (input) {
    input.disabled = running;
  }
  hideComposerMoreMenu();
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  const task = (window.__wbStore?.getState?.().tasks || []).find((t) => t.id === taskId);
  if (task) {
    renderTaskDetail(task);
  }
  void syncComposerPathState(projectId);
}

async function confirmTaskSpecFromUi() {
  const api = window.desktopAPI;
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!api?.wbProjectTaskSpecConfirm || !projectId || !taskId) {
    showComposerToast("无法确认规格", { type: "error" });
    return;
  }
  const answers = {};
  const raw = document.getElementById("wbSpecAnswers")?.value || "";
  for (const line of raw.split(/\n+/)) {
    const m = line.match(/^\s*([^=]+)=(.*)$/);
    if (m) answers[m[1].trim()] = m[2].trim();
  }
  // If no typed answers, mark each open question as acknowledged with a default
  const cardQs = [...document.querySelectorAll("#wbPlanCard [data-qid]")];
  for (const el of cardQs) {
    const id = el.getAttribute("data-qid");
    if (id && !answers[id]) {
      answers[id] = "采用默认假设（用户确认）";
    }
  }
  try {
    const spec = await api.wbProjectTaskSpecConfirm({ projectId, taskId, answers });
    if (spec?.status === "APPROVED" || spec?.executionReady) {
      showComposerToast("规格已确认，可生成代码变更", { type: "success" });
      composerPhase = "plan_ready";
      updateComposerUi("plan_ready");
      const badge = document.querySelector("#wbPlanCard .wb-plan-card__badge");
      if (badge) badge.textContent = "方案待确认";
      const clarify = document.querySelector("#wbPlanCard .wb-plan-card__clarify");
      if (clarify) clarify.remove();
    } else {
      showComposerToast("仍有未关闭的澄清问题", { type: "warn" });
      renderPlanCard({
        summary: "需求澄清中",
        openQuestions: spec?.openQuestions || [],
        executionReady: false,
        taskSpec: spec,
        plan: [],
        note: "澄清",
      });
    }
  } catch (err) {
    showComposerToast(err?.message || "确认规格失败", { type: "error" });
  }
}

async function handlePrimaryComposerAction() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  if (!projectId) {
    return;
  }
  switch (composerPhase) {
    case "running":
      await cancelActiveAgent();
      break;
    case "plan_ready":
      await proposeCodePatches();
      break;
    case "clarifying":
      await confirmTaskSpecFromUi();
      break;
    case "diff_ready":
      await openDiffReviewForCurrentTask();
      break;
    case "diff_accepted":
      await window.__wbApplyAcceptedDiffs?.({ projectId, autoApprove: true });
      break;
    case "patch_empty":
      await proposeCodePatches();
      break;
    case "written":
      await runComposerVerification();
      break;
    case "done":
      await completeComposerTask();
      break;
    case "failed":
      await startAgentExecution(projectId);
      break;
    default: {
      const task = getSelectedComposerTask();
      const rawInput = getComposerRawInput();
      if (!rawInput && isUnfinishedComposerTask(task)) {
        await resumeUnfinishedComposerTask(projectId, task);
      } else {
        await startAgentExecution(projectId);
      }
      break;
    }
  }
}

async function handleSecondaryComposerAction() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  switch (composerPhase) {
    case "plan_ready":
    case "patch_empty":
      document.getElementById("wbAgentInput")?.focus();
      showComposerToast("可在输入框补充需求后重新执行", { type: "info" });
      break;
    case "diff_ready":
      await openDiffReviewForCurrentTask();
      showComposerToast("请在 Diff 审阅面板标记「需修改」并填写意见", { type: "info" });
      break;
    case "diff_accepted":
      await openDiffReviewForCurrentTask();
      break;
    case "written":
      await completeComposerTask();
      break;
    case "failed":
      window.__wbExpandTerminalDrawer?.("log");
      break;
    default:
      break;
  }
}

function handleComposerMoreAction(action) {
  hideComposerMoreMenu();
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  switch (action) {
    case "regen-plan":
      if (projectId) {
        void startAgentExecution(projectId);
      }
      break;
    case "regen-patch":
      void proposeCodePatches();
      break;
    case "open-log":
      window.__wbExpandTerminalDrawer?.("log");
      break;
    case "open-tools":
      window.__wbExpandTerminalDrawer?.("tools");
      break;
    case "cancel":
      void cancelActiveAgent();
      break;
    case "complete":
      void completeComposerTask();
      break;
    case "new-task":
      if (projectId) {
        void createTaskForProject(projectId);
      }
      break;
    case "reset-layout":
      window.__wbResetPwsLayout?.();
      break;
    case "manual-compress":
      void manualCompressProject();
      break;
    case "open-path": {
      const store = window.__wbStore?.getState?.() || {};
      const project = (store.projects || []).find((p) => p.id === projectId);
      const p = project?.localPath || project?.local_path;
      if (typeof window.__wbOpenProjectPath === "function") {
        void window.__wbOpenProjectPath(p, projectId);
      } else if (p && window.electronAPI?.wbProjectOpenPath) {
        void window.electronAPI.wbProjectOpenPath({ path: p, projectId });
      } else if (p && window.electronAPI?.shellOpenPath) {
        void window.electronAPI.shellOpenPath(p);
      }
      break;
    }
    case "edit-path":
      window.__wbOpenEditProjectModal?.(projectId);
      break;
    default:
      break;
  }
}

function mapAgentOutputToSteps(output, mode) {
  if (!output) {
    return;
  }
  if (output.codeAnalysis?.snippets?.length) {
    upsertComposerStep("analyze_structure", "done");
    upsertComposerStep("search_files", "done", `命中 ${output.codeAnalysis.snippets.length} 个相关文件`);
    upsertComposerStep("read_code", "done");
  }
  if (mode === "PLAN_ONLY") {
    if (output.plan?.length) {
      upsertComposerStep("generate_plan", "done", output.summary || `共 ${output.plan.length} 步`);
    } else {
      upsertComposerStep("generate_plan", "error", "未生成任何计划");
    }
    if (output.fallbackReason) {
      if (output.fallbackReason.includes("WB_AGENT_LLM=0")) {
        showComposerToast("LLM Agent 已禁用（WB_AGENT_LLM=0），已回退规则方案", { type: "warn" });
      } else {
        showComposerToast(`LLM 调用失败，已回退规则方案：${output.fallbackReason}`, { type: "warn" });
      }
    }
  }
  if (mode === "PATCH_PROPOSE") {
    const diffCount = output.diffPreviews?.length || 0;
    if (diffCount) {
      upsertComposerStep("generate_patch", "done", `生成 ${diffCount} 个文件 Diff`);
      upsertComposerStep("await_diff", "pending", "请在 Diff 审阅面板确认");
      composerPhase = "diff_ready";
    } else {
      upsertComposerStep("generate_patch", "error", output.note || "没有生成任何 Diff");
      showComposerToast(output.note || "AI 未生成代码变更，请重新生成", { type: "error" });
      composerPhase = "patch_empty";
    }
  }
}

async function ensureComposerTask(projectId, userInput) {
  let taskId = resolveCurrentTaskId();
  if (taskId) {
    syncSelectedTaskId(taskId);
    return taskId;
  }
  const api = wbApi();
  const title = (userInput || "新任务").slice(0, 20);
  const description = userInput || "";
  const extras = window.__wbSceneTemplates?.getTaskCreateExtras?.() || {};
  upsertComposerStep("create_task", "running");
  try {
    const task = await api.wbProjectTaskCreate({
      projectId,
      title,
      description,
      priority: 3,
      currentStep: extras.currentStep || "AI 指令创建",
    });
    if (typeof api.wbProjectTaskUpdate === "function") {
      await api.wbProjectTaskUpdate({
        projectId,
        taskId: task.id,
        status: "PLANNING",
        currentStep: "分析项目中…",
      });
    }
    upsertComposerStep("create_task", "done", title);
    const tasks = await api.wbProjectTasksList({ projectId });
    window.__wbStore?.setTasks?.(tasks);
    syncSelectedTaskId(task.id);
    renderTasks(tasks, task.id);
    renderTaskDetail(tasks.find((t) => t.id === task.id) || task);
    return task.id;
  } catch (err) {
    upsertComposerStep("create_task", "error", err?.message || "任务创建失败");
    throw err;
  }
}

async function invokeProjectAgent(payload) {
  const api = wbApi();
  if (typeof api.wbProjectAgentRun !== "function") {
    throw new Error("Agent API 不可用");
  }
  return api.wbProjectAgentRun(payload);
}

function buildAgentPayload(projectId, taskId, mode, extras = {}) {
  const scene = getComposerSceneId();
  const message =
    extras.message ||
    getComposerMessage() ||
    document.querySelector(".wb-plan-card__req")?.textContent?.trim() ||
    "继续执行";
  return {
    projectId,
    taskId,
    mode,
    message,
    scene,
    autoVerify: getAutoVerifyChecked(),
    source: extras.source || "command_composer",
    basedOnLastPlan: Boolean(extras.basedOnLastPlan),
    ...extras,
  };
}

function isAgentRunMutexError(err) {
  return (
    err?.code === "AGENT_RUN_MUTEX" ||
    /任务已有进行中的 Agent/.test(String(err?.message || ""))
  );
}

async function startAgentExecution(projectId, { mutexRetry = false, resumeMessage = null, autoContinueToPatch = false } = {}) {
  const api = wbApi();
  showComposerError("");
  const task = getSelectedComposerTask();
  const rawInput = getComposerRawInput() || resumeMessage || "";
  if (!rawInput) {
    if (isUnfinishedComposerTask(task)) {
      await resumeUnfinishedComposerTask(projectId, task);
      return;
    }
    showComposerError("请输入开发需求。");
    showComposerToast("请输入开发需求", { type: "error" });
    return;
  }
  if (agentRunStarting) {
    showComposerToast("Agent 正在启动，请稍候", { type: "warn" });
    return;
  }
  // Clear stale run id left from a previous waiting/review hand-off so regen is allowed.
  if (activeAgentRunId && composerPhase !== "running") {
    activeAgentRunId = null;
  }
  resetComposerLiveSteps();
  upsertComposerStep("check_source", "running");
  const pathStatus = await syncComposerPathState(projectId);
  if (!pathStatus.valid) {
    upsertComposerStep("check_source", "error", "项目路径不可用");
    showComposerError("当前项目路径不可用，请先在左侧项目卡片中修复路径。");
    showComposerToast("当前项目路径不可用", { type: "error" });
    return;
  }
  upsertComposerStep("check_source", "done", pathStatus.localPath || pathStatus.codeRoot);
  if (pathStatus.gitIsRepo === false) {
    showComposerToast("Git：非仓库，分支保护不可用，将使用备份保护", { type: "warn" });
  }
  let taskId;
  try {
    taskId = await ensureComposerTask(projectId, rawInput);
  } catch (err) {
    showComposerError(err?.message || "任务创建失败");
    showComposerToast(err?.message || "任务创建失败", { type: "error" });
    updateComposerUi("idle");
    return;
  }
  const message =
    window.__wbSceneTemplates?.enrichAgentMessage?.(rawInput) ||
    rawInput ||
    getComposerMessage();
  const out = document.getElementById("wbAgentOutput");
  if (out) {
    out.hidden = false;
    out.textContent = "Agent 分析项目中…";
  }
  window.__wbExpandTerminalDrawer?.("log");
  document.getElementById("wbPlanCard").hidden = true;
  document.getElementById("wbTaskConfirmBtn").hidden = true;
  agentRunStarting = true;
  updateComposerUi("running");
  upsertComposerStep("analyze_structure", "running");
  upsertComposerStep("generate_plan", "pending");
  subscribeAgentEvents();
  startAgentEventPolling(projectId, taskId);
  try {
    const result = await invokeProjectAgent(
      buildAgentPayload(projectId, taskId, "PLAN_ONLY", { message })
    );
    if (result.agentRunId) {
      activeAgentRunId = result.agentRunId;
    }
    upsertComposerStep("analyze_structure", "done");
    mapAgentOutputToSteps(result.output, "PLAN_ONLY");
    if (result.output?.toolTrace?.length) {
      upsertComposerStep(
        "search_files",
        "done",
        `Agent 调用 ${result.output.toolTrace.length} 次工具`
      );
    }
    renderPlanCard(result.output);
    const tasks = await api.wbProjectTasksList({ projectId });
    window.__wbStore?.setTasks?.(tasks);
    const currentTask = tasks.find((t) => t.id === taskId);
    renderTasks(tasks, taskId);
    renderTaskDetail(currentTask, result.output);
    if (!result.output?.plan?.length) {
      showComposerToast("没有生成任何计划", { type: "warn" });
    } else {
      showComposerToast(
        autoContinueToPatch ? "方案已生成，正在继续生成代码变更…" : "开发方案已生成，可继续生成代码变更",
        { type: "success" }
      );
    }
    if (out) {
      out.textContent =
        window.__wbFormatUserAgentLog?.(result.output?.summary || "方案生成完成") ||
        "方案生成完成";
    }
    agentRunStarting = false;
    const needsClarify =
      Boolean(result.output?.openQuestions?.length) && result.output?.executionReady === false;
    updateComposerUi(needsClarify ? "clarifying" : "plan_ready");
    if (autoContinueToPatch && result.output?.plan?.length && !needsClarify) {
      await proposeCodePatches();
    }
  } catch (err) {
    upsertComposerStep("generate_plan", "error", err?.message || "Agent 执行失败");
    if (isAgentRunMutexError(err) && !mutexRetry) {
      activeAgentRunId = err?.activeRunId || activeAgentRunId;
      showComposerToast("检测到未结束的 Agent，正在停止后重试…", { type: "warn" });
      try {
        await cancelActiveAgent();
      } catch {
        /* ignore */
      }
      activeAgentRunId = null;
      agentRunStarting = false;
      showComposerError("");
      return startAgentExecution(projectId, {
        mutexRetry: true,
        resumeMessage,
        autoContinueToPatch,
      });
    }
    if (isAgentRunMutexError(err)) {
      showComposerToast("Agent 仍在运行，请先点「停止任务」后再试", { type: "warn" });
    } else if (err?.message?.includes("WB_AGENT_LLM")) {
      showComposerToast("LLM Agent 已禁用（WB_AGENT_LLM=0）", { type: "error" });
    } else {
      showComposerToast(err?.message || "Agent 执行失败", { type: "error" });
    }
    showComposerError(err?.message || "Agent 执行失败");
    if (out) {
      out.textContent = window.__wbStripModelThinking?.(err?.message) || err?.message || "生成失败";
    }
    agentRunStarting = false;
    updateComposerUi("failed");
  } finally {
    agentRunStarting = false;
    stopAgentEventPolling();
    setAgentRunning(false);
  }
}

async function resumeUnfinishedComposerTask(projectId, task) {
  if (!projectId || !task?.id) {
    showComposerError("请输入开发需求。");
    showComposerToast("请输入开发需求", { type: "error" });
    return;
  }
  showComposerError("");
  syncSelectedTaskId(task.id, { projectId });
  const pathStatus = await syncComposerPathState(projectId);
  if (!pathStatus.valid) {
    showComposerError("当前项目路径不可用，请先在左侧项目卡片中修复路径。");
    showComposerToast("当前项目路径不可用", { type: "error" });
    return;
  }

  showComposerToast("继续推进未完成任务…", { type: "info" });
  const synced =
    (await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, task.id)) || [];
  window.__wbActivityFeed?.pushDiffSummary?.(synced);

  const latestTasks = window.__wbStore?.getState?.()?.tasks || [];
  const latestTask = latestTasks.find((t) => t.id === task.id) || task;
  let phase = detectComposerPhaseFromContext(projectId, task.id, latestTask);
  if (synced.length) {
    const accepted = window.__wbCodeReviewStore?.getAcceptedChanges?.(projectId, task.id) || [];
    phase =
      accepted.length > 0 && accepted.length === synced.length ? "diff_accepted" : "diff_ready";
  }
  composerPhase = phase;
  updateComposerUi(phase);

  switch (phase) {
    case "diff_ready":
      await openDiffReviewForCurrentTask({ forceReload: true });
      showComposerToast("已恢复待审阅变更，请确认 Diff 后继续", { type: "success" });
      return;
    case "diff_accepted":
      await window.__wbApplyAcceptedDiffs?.({
        projectId,
        taskId: task.id,
        autoApprove: true,
      });
      return;
    case "written":
      await runComposerVerification();
      return;
    case "plan_ready":
    case "patch_empty":
      await proposeCodePatches({ resumeMessage: resolveTaskResumeMessage(latestTask) });
      return;
    case "done":
      showComposerToast("任务已完成", { type: "success" });
      return;
    case "failed":
      await startAgentExecution(projectId, {
        resumeMessage: resolveTaskResumeMessage(latestTask),
        autoContinueToPatch: true,
      });
      return;
    default:
      // 无明确阶段：沿用任务标题/描述续跑，方案生成后自动进入补丁
      await startAgentExecution(projectId, {
        resumeMessage: resolveTaskResumeMessage(latestTask),
        autoContinueToPatch: true,
      });
  }
}

async function openDiffReviewForCurrentTask({ forceReload = false } = {}) {
  let projectId = resolveCurrentProjectId();
  let taskId = resolveCurrentTaskId();
  if (taskId) {
    syncSelectedTaskId(taskId, { projectId });
  }
  const reviewStore = window.__wbCodeReviewStore;
  // 先切 Tab，避免 switchTab 再递归调用本函数
  window.__wbSwitchCodeTab?.("diff", { loadDiff: false });
  if (!projectId || !taskId) {
    // 再尝试从任务列表唯一/待审阅任务回退一次
    const tasks = window.__wbStore?.getState?.().tasks || [];
    const projects = window.__wbStore?.getState?.().projects || [];
    taskId =
      taskId ||
      tasks.find(
        (t) =>
          t?.status === "WAITING_APPROVAL" ||
          String(t?.currentStep || "").includes("变更待审阅")
      )?.id ||
      (tasks.length === 1 ? tasks[0]?.id : null) ||
      null;
    if (!projectId && taskId) {
      projectId =
        tasks.find((t) => t.id === taskId)?.projectId ||
        window.__wbStore?.getState?.().selectedProjectId ||
        projects[0]?.id ||
        null;
    }
    if (taskId) {
      syncSelectedTaskId(taskId, { projectId });
    }
  }
  projectId = resolveCurrentProjectId({ preferProjectId: projectId });
  taskId = resolveCurrentTaskId({ preferTaskId: taskId });
  if (!projectId || !taskId) {
    window.__wbRenderDiffReviewPanel?.();
    showComposerToast(
      !projectId ? "请先选择项目" : "请先选择或创建开发任务",
      { type: "warn" }
    );
    appendAgentLogLine(
      `DiffReview open blocked: projectId=${projectId || "(empty)"} taskId=${taskId || "(empty)"}`
    );
    return [];
  }
  syncSelectedTaskId(taskId, { projectId });
  let patches = [];
  try {
    patches =
      (await reviewStore?.syncFromStagedPatches?.(projectId, taskId, {
        // 仅加载可审阅补丁；已 APPLIED 的不应再出现在 Diff 待写入列表
        statuses: ["STAGED", "ACCEPTED", "REVISION_REQUESTED"],
      })) || [];
  } catch (err) {
    reviewStore?.setLoadError?.(projectId, taskId, err?.message || "Diff 加载失败");
    window.__wbRenderDiffReviewPanel?.();
    showComposerToast(err?.message || "Diff 加载失败", { type: "error" });
    appendAgentLogLine(`DiffReviewPanel load failed: ${err?.message || err}`);
    return [];
  }
  appendAgentLogLine(`DiffReviewPanel loaded patch count=${patches.length} taskId=${taskId}`);
  // 显式传入上下文渲染，避免 getContext 竞态把已加载 Diff 盖成空态
  window.__wbRenderDiffReviewPanel?.({ projectId, taskId });
  if (patches.length) {
    window.__wbActivityFeed?.pushDiffSummary?.(patches);
  } else {
    // 无 STAGED 可审阅补丁：强制清掉 Activity Feed「等待审阅」卡
    window.__wbActivityFeed?.pushDiffSummary?.([]);
    let rejectedCount = 0;
    try {
      const rejected =
        (await wbApi().wbProjectPatchesList?.({
          projectId,
          taskId,
          statuses: ["REJECTED"],
        })) || [];
      rejectedCount = rejected.length;
    } catch {
      rejectedCount = 0;
    }
    if (rejectedCount > 0) {
      reviewStore?.setEmptyReason?.(
        projectId,
        taskId,
        "rejected",
        "上次变更已拒绝，请重新生成代码变更后再审阅。"
      );
      window.__wbRenderDiffReviewPanel?.({ projectId, taskId });
    }
  }
  if (!patches.length) {
    const task = (window.__wbStore?.getState?.().tasks || []).find((t) => t.id === taskId);
    const step = String(task?.currentStep || "");
    if (step.includes("方案待确认") || task?.status === "PLANNING") {
      updateComposerUi("plan_ready");
    } else {
      updateComposerUi("patch_empty");
    }
    const emptyState = reviewStore?.getState?.(projectId, taskId);
    const toastMsg =
      emptyState?.emptyReason === "rejected"
        ? "上次变更已拒绝，请重新生成"
        : "当前任务还没有可审阅的 Diff";
    showComposerToast(toastMsg, { type: "warn" });
    return [];
  }
  const accepted = reviewStore?.getAcceptedChanges?.(projectId, taskId) || [];
  if (accepted.length > 0) {
    updateComposerUi("diff_accepted");
  } else {
    updateComposerUi("diff_ready");
  }
  if (!forceReload) {
    showComposerToast(`已加载 ${patches.length} 个代码变更，请审阅`, { type: "success" });
  }
  return patches;
}

async function proposeCodePatches({ mutexRetry = false, resumeMessage = null } = {}) {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  const task = getSelectedComposerTask();
  if (!projectId || !taskId) {
    showComposerToast("请先输入指令并开始执行", { type: "error" });
    return;
  }
  if (
    composerPhase === "clarifying" ||
    task?.status === "CLARIFYING" ||
    String(task?.currentStep || "").includes("澄清")
  ) {
    showComposerToast("请先确认规格（回答澄清问题）后再生成代码变更", { type: "warn" });
    updateComposerUi("clarifying");
    return;
  }
  syncSelectedTaskId(taskId);
  const resumeText = resumeMessage || resolveTaskResumeMessage(task);
  const message =
    getComposerMessage() ||
    (resumeText
      ? window.__wbSceneTemplates?.enrichAgentMessage?.(resumeText) || resumeText
      : "") ||
    document.querySelector(".wb-plan-card__req")?.textContent?.trim() ||
    "继续生成补丁";
  const out = document.getElementById("wbAgentOutput");
  if (out) {
    out.hidden = false;
    out.textContent = "生成代码变更中…";
  }
  upsertComposerStep("generate_patch", "running");
  agentRunStarting = true;
  updateComposerUi("running");
  subscribeAgentEvents();
  startAgentEventPolling(projectId, taskId);
  try {
    const result = await invokeProjectAgent(
      buildAgentPayload(projectId, taskId, "PATCH_PROPOSE", {
        message,
        basedOnLastPlan: true,
      })
    );
    if (result.agentRunId) {
      activeAgentRunId = result.agentRunId;
    }
    if (result.output?.code === "SPEC_CLARIFYING" || result.output?.code === "SPEC_REQUIRED") {
      showComposerToast(result.output?.note || result.output?.summary || "请先确认规格", {
        type: "warn",
      });
      renderPlanCard({
        ...(result.output || {}),
        openQuestions: result.output?.openQuestions || [],
        executionReady: false,
        note: "澄清",
      });
      agentRunStarting = false;
      updateComposerUi("clarifying");
      return;
    }
    if (result.output?.plan?.length) {
      renderPlanCard(result.output);
    }
    mapAgentOutputToSteps(result.output, "PATCH_PROPOSE");
    const synced = await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
    const diffCount = Math.max(result.output?.diffPreviews?.length || 0, synced?.length || 0);
    appendAgentLogLine(
      `PATCH_PROPOSE done; staged_patches count=${synced?.length || 0}; patch ids=${(synced || [])
        .map((c) => c.stagedPatchId || c.id)
        .join(",") || "(none)"}`
    );
    if (diffCount > 0) {
      composerPhase = "diff_ready";
      window.__wbActivityFeed?.pushDiffSummary?.(synced || []);
      await openDiffReviewForCurrentTask({ forceReload: true });
      showComposerToast(`已生成 ${diffCount} 个代码变更，请审阅 Diff`, { type: "success" });
    } else {
      composerPhase = "patch_empty";
      window.__wbActivityFeed?.pushDiffSummary?.([]);
      window.__wbSwitchCodeTab?.("diff", { loadDiff: false });
      window.__wbRenderDiffReviewPanel?.();
      showComposerToast(result.output?.note || "AI 未生成代码变更，请重新生成", { type: "error" });
    }
    const modePill = document.getElementById("wbPwsModePill");
    if (modePill) {
      modePill.textContent = "PATCH_PROPOSE / 受控写入";
    }
    const tasks = await wbApi().wbProjectTasksList({ projectId });
    window.__wbStore?.setTasks?.(tasks);
    renderTasks(tasks, taskId);
    await loadTaskContext(projectId, taskId);
    if (out) {
      const logText = diffCount
        ? `已生成 ${diffCount} 个文件 Diff，请在审阅面板确认`
        : result.output?.note || "补丁生成完成，但未产生可审阅 Diff";
      out.textContent = window.__wbStripModelThinking?.(logText) || logText;
    }
    agentRunStarting = false;
    updateComposerUi(diffCount ? "diff_ready" : "patch_empty");
  } catch (err) {
    if (isAgentRunMutexError(err) && !mutexRetry) {
      activeAgentRunId = err?.activeRunId || activeAgentRunId;
      showComposerToast("检测到未结束的 Agent，正在停止后重试…", { type: "warn" });
      try {
        await cancelActiveAgent();
      } catch {
        /* ignore */
      }
      activeAgentRunId = null;
      agentRunStarting = false;
      showComposerError("");
      return proposeCodePatches({ mutexRetry: true, resumeMessage });
    }
    upsertComposerStep("generate_patch", "error", err?.message || "补丁生成失败");
    showComposerError(err?.message || "补丁生成失败");
    showComposerToast(
      isAgentRunMutexError(err)
        ? "Agent 仍在运行，请先点「停止任务」后再试"
        : err?.message || "补丁生成失败",
      { type: "error" }
    );
    if (out) {
      out.textContent = window.__wbStripModelThinking?.(err?.message) || err?.message || "补丁生成失败";
    }
    agentRunStarting = false;
    updateComposerUi("failed");
  } finally {
    agentRunStarting = false;
    stopAgentEventPolling();
    setAgentRunning(false);
  }
}

async function runComposerVerification() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId || !taskId) {
    return;
  }
  upsertComposerStep("run_verify", "running");
  agentRunStarting = true;
  updateComposerUi("running");
  try {
    const result = await invokeProjectAgent({
      projectId,
      taskId,
      message: "运行验证",
      mode: "VERIFY_FIX",
      fixContext: { scriptName: "build" },
      source: "command_composer",
    });
    if (result.output?.fixResult?.ok || result.output?.fixResult?.skipped || result.output?.verifySkipped?.skipped) {
      const skipMsg =
        result.output?.fixResult?.message ||
        result.output?.verifySkipped?.message ||
        result.output?.summary ||
        "";
      const skipped = Boolean(
        result.output?.fixResult?.skipped || result.output?.verifySkipped?.skipped
      );
      upsertComposerStep(
        "run_verify",
        "done",
        skipped ? skipMsg || "已跳过验证" : "验证通过"
      );
      upsertComposerStep("complete", "done");
      updateComposerUi("done");
      showComposerToast(
        skipped ? skipMsg || "已跳过验证（无 npm 脚本）" : "验证通过，任务完成",
        { type: "success" }
      );
    } else if (result.output?.fixResult?.waitingApproval) {
      upsertComposerStep("run_verify", "error", "验证失败，已生成修复 Diff");
      upsertComposerStep("fix_failure", "pending");
      await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
      await openDiffReviewForCurrentTask({ forceReload: true });
      updateComposerUi("diff_ready");
      showComposerToast("验证失败，请审阅修复 Diff", { type: "warn" });
    } else {
      upsertComposerStep("run_verify", "error", result.output?.summary || "验证失败");
      showComposerToast(result.output?.summary || "验证失败", { type: "error" });
      updateComposerUi("written");
    }
  } catch (err) {
    upsertComposerStep("run_verify", "error", err?.message || "验证失败");
    showComposerToast(err?.message || "验证失败", { type: "error" });
    updateComposerUi("written");
  } finally {
    agentRunStarting = false;
    activeAgentRunId = null;
    setAgentRunning(false);
  }
}

async function completeComposerTask() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId || !taskId) {
    return;
  }
  const api = wbApi();
  if (typeof api.wbProjectTaskUpdate === "function") {
    await api.wbProjectTaskUpdate({
      projectId,
      taskId,
      status: "COMPLETED",
      currentStep: "任务完成",
    });
  }
  upsertComposerStep("complete", "done");
  const tasks = await api.wbProjectTasksList({ projectId });
  window.__wbStore?.setTasks?.(tasks);
  renderTasks(tasks, taskId);
  updateComposerUi("done");
  showComposerToast("任务已标记完成", { type: "success" });
}

function setAgentRunning(running, agentRunId) {
  if (running && agentRunId) {
    activeAgentRunId = agentRunId;
  } else if (!running) {
    activeAgentRunId = null;
    agentRunStarting = false;
  }
  updateComposerUi(running ? "running" : composerPhase);
}

function initAutoVerifyCheckbox() {
  const el = document.getElementById("wbAutoVerifyAfterWrite");
  if (!el || el.dataset.bound === "1") {
    return;
  }
  el.dataset.bound = "1";
  // 默认勾选；仅当用户曾显式关闭（"0"）时保持关闭
  try {
    const saved = localStorage.getItem(WB_AUTO_VERIFY_KEY);
    el.checked = saved !== "0";
    if (saved == null) {
      localStorage.setItem(WB_AUTO_VERIFY_KEY, "1");
    }
  } catch {
    el.checked = true;
  }
  el.addEventListener("change", () => {
    try {
      localStorage.setItem(WB_AUTO_VERIFY_KEY, el.checked ? "1" : "0");
    } catch {
      /* ignore */
    }
  });
}

async function cancelActiveAgent() {
  const api = wbApi();
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId || !taskId) {
    return;
  }
  if (typeof api.wbProjectAgentCancel !== "function") {
    return;
  }
  try {
    // Prefer known run id; server also resolves the latest open/active run when omitted.
    await api.wbProjectAgentCancel({
      projectId,
      taskId,
      agentRunId: activeAgentRunId || undefined,
    });
    upsertComposerStep("canceled", "error", "用户已停止任务");
    stopAgentEventPolling();
    setAgentRunning(false);
    const out = document.getElementById("wbAgentOutput");
    if (out) {
      out.hidden = false;
      out.textContent = "Agent 任务已停止";
    }
    showComposerToast("Agent 任务已停止", { type: "info" });
    updateComposerUi("idle");
    await loadTaskContext(projectId, taskId);
  } catch (err) {
    showComposerToast(err?.message || "停止失败", { type: "error" });
  }
}

function taskMatchesFilter(task) {
  const step = String(task.currentStep || "");
  switch (taskFilterMode) {
    case "active":
      return ["DRAFT", "DEVELOPING", "RUNNING"].includes(task.status);
    case "waiting":
      return (
        task.status === "WAITING_APPROVAL" ||
        task.status === "REVIEWING" ||
        step.includes("审批") ||
        step.includes("等待") ||
        step.includes("确认")
      );
    case "done":
      return ["DONE", "COMPLETED", "ARCHIVED"].includes(task.status);
    case "failed":
      return task.status === "FAILED" || task.status === "PAUSED";
    default:
      return true;
  }
}

function bindTaskFilters() {
  const bar = document.getElementById("wbPwsTaskFilters");
  if (!bar || bar.dataset.bound === "1") {
    return;
  }
  bar.dataset.bound = "1";
  bar.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".wb-pws-task-filter");
    if (!btn?.dataset?.filter) {
      return;
    }
    taskFilterMode = btn.dataset.filter;
    bar.querySelectorAll(".wb-pws-task-filter").forEach((el) => {
      el.classList.toggle("is-active", el === btn);
    });
    const tasks = window.__wbStore?.getState?.().tasks || [];
    const selectedId = resolveCurrentTaskId();
    renderTasks(tasks, selectedId);
  });
}

async function loadTaskContext(projectId, taskId) {
  const api = wbApi();
  const resolvedTaskId = syncSelectedTaskId(taskId || resolveCurrentTaskId());
  if (!projectId || !resolvedTaskId) {
    window.__wbRenderDiffReviewPanel?.();
    return;
  }
  const namespace = `task:${projectId}:${resolvedTaskId}`;
  const tasks = window.__wbStore?.getState?.().tasks || [];
  const task = tasks.find((t) => t.id === resolvedTaskId);
  if (task) {
    renderTaskDetail(task);
  }
  const memList = document.getElementById("wbTaskMemories");
  const runsList = document.getElementById("wbAgentRuns");
  if (typeof api.wbMemorySearch === "function" && memList) {
    const memories = await api.wbMemorySearch({
      namespace,
      projectId,
      taskId: resolvedTaskId,
      limit: 12,
    });
    memList.replaceChildren();
    if (!memories?.length) {
      memList.innerHTML = '<li class="wb-task-memories__empty">暂无任务记忆</li>';
    } else {
      memories.forEach((m) => {
        const li = document.createElement("li");
        li.className =
          m.memoryType === "fix_loop_event"
            ? "wb-task-memories__item wb-task-memories__item--fix-loop"
            : "wb-task-memories__item";
        li.innerHTML = `<span class="wb-task-memories__type">${escapeHtml(m.memoryType)}</span><span>${escapeHtml(window.__wbStripModelThinking?.(m.content) || m.content)}</span>`;
        memList.appendChild(li);
      });
    }
  }
  if (typeof api.wbProjectAgentRunsList === "function" && runsList) {
    const runs = await api.wbProjectAgentRunsList({
      projectId,
      taskId: resolvedTaskId,
      limit: 8,
    });
    renderComposerTimeline(runs);
  }
  if (typeof api.wbProjectAgentEventsList === "function") {
    try {
      const events = await api.wbProjectAgentEventsList({
        projectId,
        taskId: resolvedTaskId,
        agentRunId: activeAgentRunId || undefined,
      });
      window.__wbActivityFeed?.reset?.();
      window.__wbActivityFeed?.hydrateFromEvents?.(events || []);
      composerLiveSteps.forEach((step) => window.__wbActivityFeed?.pushStep?.(step));
    } catch {
      window.__wbActivityFeed?.render?.();
    }
  } else {
    window.__wbActivityFeed?.render?.();
  }
  await syncComposerPathState(projectId);
  await refreshProjectContextHealth(projectId, resolvedTaskId);
  const synced = await window.__wbCodeReviewStore?.syncFromStagedPatches?.(
    projectId,
    resolvedTaskId
  );
  appendAgentLogLine(
    `DiffReviewPanel loaded patch count=${synced?.length || 0} taskId=${resolvedTaskId}`
  );
  // 有可审阅补丁则展示 Diff 卡；否则强制清除「等待审阅」残留
  window.__wbActivityFeed?.pushDiffSummary?.(synced || []);
  if (!synced?.length) {
    try {
      const rejected =
        (await api.wbProjectPatchesList?.({
          projectId,
          taskId: resolvedTaskId,
          statuses: ["REJECTED"],
        })) || [];
      if (rejected.length) {
        window.__wbCodeReviewStore?.setEmptyReason?.(
          projectId,
          resolvedTaskId,
          "rejected",
          "上次变更已拒绝，请重新生成代码变更后再审阅。"
        );
      }
    } catch {
      /* ignore */
    }
  }
  const latestTasks = window.__wbStore?.getState?.()?.tasks || tasks;
  const latestTask = latestTasks.find((t) => t.id === resolvedTaskId) || task || null;
  if (!(agentRunStarting || composerPhase === "running")) {
    composerPhase = detectComposerPhaseFromContext(projectId, resolvedTaskId, latestTask);
    updateComposerUi(composerPhase);
  } else {
    updateComposerUi("running");
  }
  renderTaskDetail(latestTask);
  window.__wbRenderDiffReviewPanel?.();
  // 有 staged patch 时自动把详情区切到 Diff 并确保 store 已绑定
  if (synced?.length && (composerPhase === "diff_ready" || composerPhase === "diff_accepted")) {
    window.__wbSwitchCodeTab?.("diff", { loadDiff: false });
    window.__wbRenderDiffReviewPanel?.();
  }
  await window.__wbRefreshCodePanel?.(projectId, resolvedTaskId);
}

function renderTasks(tasks, selectedTaskId, { autoSelectFirst = true } = {}) {
  const list = document.getElementById("wbTaskList");
  if (!list) {
    return;
  }
  const preferred =
    selectedTaskId ||
    resolveCurrentTaskId() ||
    null;
  const filtered = (tasks || []).filter(taskMatchesFilter);
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "wb-task-empty";
    empty.textContent =
      tasks?.length && taskFilterMode !== "all"
        ? "当前筛选下暂无任务。"
        : "暂无任务，可直接在右侧 AI 指令窗口开始执行。";
    list.appendChild(empty);
    // 筛选为空时不要清掉全局选中任务，避免 Diff 面板误判「请选择任务」
    renderTaskDetail(null);
    return;
  }
  let activeId = preferred && filtered.some((t) => t.id === preferred) ? preferred : null;
  if (autoSelectFirst && !activeId) {
    activeId = filtered[0]?.id || null;
  }
  filtered.forEach((task) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "wb-task-item";
    item.dataset.taskId = task.id;
    item.classList.toggle("is-active", task.id === activeId);
    const statusLabel = taskStatusLabel(task.status, task.currentStep);
    item.innerHTML = `
      <div class="wb-task-item__main">
        <span class="wb-task-item__title">${escapeHtml(task.title)}</span>
        ${task.description ? `<span class="wb-task-item__desc">${escapeHtml(task.description.slice(0, 48))}</span>` : ""}
      </div>
      <div class="wb-task-item__meta">
        <span class="wb-task-status ${statusChipClass(task.status)}">${escapeHtml(statusLabel)}</span>
        <span class="wb-task-item__priority">P${task.priority || 3}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      syncSelectedTaskId(task.id);
      const projectId = window.__wbStore?.getState?.().selectedProjectId;
      if (projectId) {
        void loadTaskContext(projectId, task.id);
      }
    });
    list.appendChild(item);
  });
  if (activeId) {
    syncSelectedTaskId(activeId);
    renderTaskDetail(filtered.find((t) => t.id === activeId) || null);
  } else {
    renderTaskDetail(null);
  }
}

let projectWorkspaceLoadGen = 0;

function isProjectViewActive(projectId, gen) {
  const id = String(projectId || "").trim();
  const store = window.__wbStore?.getState?.() || {};
  const module =
    typeof window.__wbResolveActiveModule === "function"
      ? window.__wbResolveActiveModule(store)
      : store.activeModule || store.mode;
  return (
    gen === projectWorkspaceLoadGen &&
    module === "project" &&
    store.selectedProjectId === id
  );
}

function syncLegacyAiPanelVisibility(active) {
  const hasElectron = Boolean(window.electronAPI);
  const aiMain = document.getElementById("aiPanelMain");
  const fallback = document.getElementById("aiWebFallback");
  if (active) {
    [aiMain, fallback].forEach((el) => {
      if (!el) {
        return;
      }
      el.hidden = true;
      el.setAttribute("hidden", "");
      el.setAttribute("aria-hidden", "true");
    });
    return;
  }
  if (aiMain) {
    aiMain.hidden = !hasElectron;
    if (hasElectron) {
      aiMain.removeAttribute("hidden");
      aiMain.setAttribute("aria-hidden", "false");
    } else {
      aiMain.setAttribute("hidden", "");
      aiMain.setAttribute("aria-hidden", "true");
    }
  }
  if (fallback) {
    fallback.hidden = hasElectron;
    if (hasElectron) {
      fallback.setAttribute("hidden", "");
      fallback.setAttribute("aria-hidden", "true");
    } else {
      fallback.removeAttribute("hidden");
      fallback.setAttribute("aria-hidden", "false");
    }
  }
}

function syncProjectViewChrome(active, projectName = "") {
  document.body.classList.toggle("jl-project-workspace-active", Boolean(active));
  document.documentElement.classList.toggle(
    "jl-project-workspace-active",
    Boolean(active)
  );
  syncLegacyAiPanelVisibility(Boolean(active));
  window.__wbSyncPwsSidebarMount?.(Boolean(active));
  window.__wbSyncProjectTopChrome?.(Boolean(active), projectName);
  const dock = document.getElementById("jlPromptDock");
  if (active) {
    if (dock) {
      dock.hidden = true;
      dock.setAttribute("aria-hidden", "true");
    }
    return;
  }
  if (typeof window.syncJlPromptDock === "function") {
    window.syncJlPromptDock("ai");
  }
}

function enterProjectWorkspaceShell(projectName = "") {
  const panelAi = document.getElementById("panel-ai");
  const root = ensureWorkspaceRoot();
  if (panelAi) {
    panelAi.hidden = false;
    panelAi.removeAttribute("hidden");
  }
  if (root) {
    root.hidden = false;
    root.removeAttribute("hidden");
    if (panelAi && root.parentElement !== panelAi) {
      panelAi.appendChild(root);
    } else if (panelAi) {
      panelAi.appendChild(root);
    }
  }
  syncProjectViewChrome(true, projectName);
}

function showProjectWorkspaceView(projectId, gen) {
  if (projectId != null && gen != null && !isProjectViewActive(projectId, gen)) {
    return;
  }
  const panelAi = document.getElementById("panel-ai");
  const root = document.getElementById("wbProjectWorkspace");
  const aiMain = document.getElementById("aiPanelMain");
  if (root) {
    root.hidden = false;
    root.removeAttribute("hidden");
    if (panelAi && root.parentElement !== panelAi) {
      panelAi.appendChild(root);
    } else if (panelAi) {
      panelAi.appendChild(root);
    }
  }
  const projectName =
    document.getElementById("wbProjectWorkspaceTitle")?.textContent?.trim() || "";
  syncProjectViewChrome(true, projectName);
  if (aiMain) {
    aiMain.hidden = true;
    aiMain.setAttribute("hidden", "");
  }
}

function showChatView(options = {}) {
  const force = Boolean(options?.force);
  if (!force) {
    const store = window.__wbStore?.getState?.() || {};
    const module =
      typeof window.__wbResolveActiveModule === "function"
        ? window.__wbResolveActiveModule(store)
        : store.activeModule || store.mode;
    if (module === "project" && store.selectedProjectId) {
      window.__wbShowProjectView?.(store.selectedProjectId);
      return;
    }
  }
  projectWorkspaceLoadGen += 1;
  window.__wbApprovalStore?.clearPending?.();
  window.__wbClosePwsDrawers?.();
  const root = document.getElementById("wbProjectWorkspace");
  const aiMain = document.getElementById("aiPanelMain");
  const fallback = document.getElementById("aiWebFallback");
  const panelAi = document.getElementById("panel-ai");
  const hasElectron = Boolean(window.electronAPI);
  document.body.classList.remove("jl-project-workspace-active");
  document.documentElement.classList.remove("jl-project-workspace-active");
  if (root) {
    root.hidden = true;
    root.setAttribute("hidden", "");
    root.dataset.wbReady = "0";
    delete root.dataset.wbProjectId;
  }
  syncProjectViewChrome(false);
  if (panelAi) {
    panelAi.hidden = false;
    panelAi.removeAttribute("hidden");
  }
  if (aiMain) {
    aiMain.hidden = !hasElectron;
    if (hasElectron) {
      aiMain.removeAttribute("hidden");
    } else {
      aiMain.setAttribute("hidden", "");
    }
  }
  if (fallback) {
    fallback.hidden = hasElectron;
    if (hasElectron) {
      fallback.setAttribute("hidden", "");
    } else {
      fallback.removeAttribute("hidden");
    }
  }
}

function showProjectView(projectId) {
  const id = String(projectId || "").trim();
  const store = window.__wbStore?.getState?.() || {};
  const module =
    typeof window.__wbResolveActiveModule === "function"
      ? window.__wbResolveActiveModule(store)
      : store.activeModule || store.mode;
  if (!id || module !== "project" || store.selectedProjectId !== id) {
    return;
  }
  showProjectWorkspaceView(id, projectWorkspaceLoadGen);
}

async function loadProjectWorkspace(projectId) {
  const id = String(projectId || "").trim();
  const gen = ++projectWorkspaceLoadGen;
  if (!id) {
    return;
  }
  const storeProject = (window.__wbStore?.getState?.().projects || []).find(
    (item) => item.id === id
  );
  enterProjectWorkspaceShell(storeProject?.name || "");
  const api = wbApi();
  const root = ensureWorkspaceRoot();
  if (!root || typeof api.wbProjectGet !== "function") {
    return;
  }
  root.dataset.wbReady = "0";
  delete root.dataset.wbProjectId;
  window.__wbApprovalStore?.clearPending?.();
  showProjectWorkspaceView(id, gen);
  const project = await api.wbProjectGet({ projectId: id });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  const tasks = await api.wbProjectTasksList({ projectId: id });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  window.__wbStore?.setTasks?.(tasks);
  renderProjectColCard(project);
  window.__wbRenderProjectList?.();
  const titleEl = document.getElementById("wbProjectWorkspaceTitle");
  if (titleEl) {
    titleEl.textContent = project.name;
  }
  window.__wbSyncProjectTopChrome?.(true, project.name);
  const nsEl = document.getElementById("wbProjectWorkspaceNs");
  if (nsEl) {
    nsEl.textContent = project.namespace || `project:${id}`;
  }
  const modePill = document.getElementById("wbPwsModePill");
  if (modePill) {
    modePill.textContent = "PLAN_ONLY / 受控写入";
  }
  const openDirBtn = document.getElementById("wbPwsOpenProjectDir");
  const projectPath = project.localPath || project.local_path;
  if (openDirBtn) {
    openDirBtn.hidden = !projectPath;
    openDirBtn.dataset.path = projectPath || "";
  }
  const preferredTaskId =
    resolveCurrentTaskId() ||
    tasks.find((t) => t.status === "WAITING_APPROVAL" || String(t.currentStep || "").includes("变更待审阅"))
      ?.id ||
    tasks[0]?.id ||
    null;
  syncSelectedTaskId(preferredTaskId);
  renderTasks(tasks, preferredTaskId, { autoSelectFirst: Boolean(preferredTaskId) });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  root.dataset.wbReady = "1";
  root.dataset.wbProjectId = id;
  showProjectWorkspaceView(id, gen);
  if (preferredTaskId) {
    await loadTaskContext(id, preferredTaskId);
  }
  window.__wbBindTerminalDrawer?.();
  window.__wbBindPwsDrawers?.();
  window.__wbBindWorkspaceResizers?.();
  window.__wbApplyPwsLayoutPrefs?.();
  window.__wbApplyMainView?.();
  renderProjectColSessions();
  document.getElementById("wbPlanCard").hidden = true;
  document.getElementById("wbAgentOutput").hidden = true;
  document.getElementById("wbAgentOutput").textContent = "";
  document.getElementById("wbTaskConfirmBtn").hidden = true;
  if (selectedId) {
    await loadTaskContext(id, selectedId);
    if (!isProjectViewActive(id, gen)) {
      return;
    }
  }
  window.__wbBindCodePanel?.();
  await window.__wbRefreshCodePanel?.(id, selectedId);
  window.__wbSyncTerminalDrawer?.();
  resetComposerLiveSteps();
  composerPhase = "idle";
  updateComposerUi("idle");
  await syncComposerPathState(id);
  if (!isProjectViewActive(id, gen)) {
    return;
  }
}

async function refreshProjectContextHealth(projectId, taskId) {
  const healthEl = document.getElementById("wbProjectContextHealth");
  const historyEl = document.getElementById("wbSnapshotHistory");
  if (!taskId || !window.__wbContextHealth) {
    return;
  }
  const namespace = `task:${projectId}:${taskId}`;
  const health = await window.__wbContextHealth.fetchHealth(namespace, []);
  window.__wbContextHealth.renderHealthBadge(healthEl, health);
  const snaps = await window.__wbContextHealth.listSnapshots(namespace);
  window.__wbContextHealth.renderSnapshotHistory(historyEl, snaps, namespace);
}

async function manualCompressProject() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId || !taskId || !window.__wbContextHealth) {
    return;
  }
  const namespace = `task:${projectId}:${taskId}`;
  const result = await window.__wbContextHealth.manualCompress(namespace, []);
  const out = document.getElementById("wbAgentOutput");
  if (out) {
    out.hidden = false;
    document.getElementById("wbPlanCard").hidden = true;
    out.textContent = JSON.stringify(result, null, 2);
  }
  window.__wbExpandTerminalDrawer?.("log");
  await refreshProjectContextHealth(projectId, taskId);
}

function hideProjectWorkspace() {
  showChatView();
}

async function createTaskForProject(projectId) {
  openNewTaskModal(projectId);
}

function ensureNewTaskModal() {
  let modal = document.getElementById("wbNewTaskModal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "wbNewTaskModal";
  modal.className = "wb-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-close="1"></div>
    <div class="wb-modal__panel" role="dialog" aria-labelledby="wbNewTaskTitle">
      <header class="wb-modal__head">
        <h2 id="wbNewTaskTitle">新建任务</h2>
        <button type="button" class="wb-modal__close" data-wb-close="1" aria-label="关闭">×</button>
      </header>
      <form id="wbNewTaskForm" class="wb-modal__body">
        <input type="hidden" id="wbNewTaskProjectId" value="" />
        <label class="wb-field">
          <span>场景模板（P2）</span>
          <select id="wbNewTaskTemplate" class="wb-pws-template-select" aria-label="新建任务场景模板"></select>
        </label>
        <label class="wb-field">
          <span>任务标题</span>
          <input id="wbTaskTitleInput" type="text" maxlength="160" required placeholder="例如：实现项目卡片列表" />
        </label>
        <label class="wb-field">
          <span>任务描述</span>
          <textarea id="wbTaskDescInput" rows="3" placeholder="可选：补充需求背景"></textarea>
        </label>
        <label class="wb-field">
          <span>优先级（1 最高，5 最低）</span>
          <input id="wbTaskPriorityInput" type="number" min="1" max="5" value="3" />
        </label>
        <p id="wbNewTaskError" class="wb-form-error" hidden></p>
        <footer class="wb-modal__foot">
          <button type="button" class="secondary" data-wb-close="1">取消</button>
          <button type="submit" class="primary">创建</button>
        </footer>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (ev) => {
    if (ev.target?.dataset?.wbClose === "1") {
      modal.hidden = true;
    }
  });
  return modal;
}

function openNewTaskModal(projectId) {
  const modal = ensureNewTaskModal();
  document.getElementById("wbNewTaskProjectId").value = String(projectId || "");
  const err = document.getElementById("wbNewTaskError");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  modal.hidden = false;
  const activeTpl = window.__wbSceneTemplates?.getActiveTemplate?.();
  if (activeTpl?.id) {
    window.__wbSceneTemplates?.applyTemplate?.(activeTpl.id, {
      fillComposer: false,
      fillNewTask: true,
    });
  }
  document.getElementById("wbTaskTitleInput")?.focus();
}

async function submitNewTask(ev) {
  ev.preventDefault();
  const api = wbApi();
  const projectId = document.getElementById("wbNewTaskProjectId")?.value?.trim();
  const title = document.getElementById("wbTaskTitleInput")?.value?.trim();
  const description = document.getElementById("wbTaskDescInput")?.value?.trim() || "";
  const priority = Number(document.getElementById("wbTaskPriorityInput")?.value) || 3;
  const errEl = document.getElementById("wbNewTaskError");
  if (!projectId || !title) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "请填写任务标题";
    }
    return;
  }
  try {
    const extras = window.__wbSceneTemplates?.getTaskCreateExtras?.() || {};
    await api.wbProjectTaskCreate({
      projectId,
      title,
      description,
      priority,
      currentStep: extras.currentStep || "",
    });
    document.getElementById("wbNewTaskModal").hidden = true;
    await loadProjectWorkspace(projectId);
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err?.message || "创建失败";
    }
  }
}

async function runProjectAgent(projectId) {
  await startAgentExecution(projectId);
}

async function confirmTaskPlan() {
  await proposeCodePatches();
}

function bindComposerActions() {
  const primaryBtn = document.getElementById("wbPrimaryActionBtn");
  const secondaryBtn = document.getElementById("wbSecondaryActionBtn");
  const moreBtn = document.getElementById("wbMoreActionsBtn");
  const menu = document.getElementById("wbComposerMoreMenu");

  primaryBtn?.addEventListener("click", () => {
    void handlePrimaryComposerAction();
  });
  secondaryBtn?.addEventListener("click", () => {
    void handleSecondaryComposerAction();
  });
  moreBtn?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleComposerMoreMenu();
  });
  menu?.querySelectorAll("[data-wb-more-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleComposerMoreAction(btn.dataset.wbMoreAction);
    });
  });
  hideComposerMoreMenu();
  document.addEventListener("click", (ev) => {
    if (!menu || menu.hidden) {
      return;
    }
    if (ev.target.closest("#wbMoreActionsBtn") || ev.target.closest("#wbComposerMoreMenu")) {
      return;
    }
    hideComposerMoreMenu();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      hideComposerMoreMenu();
    }
  });

  document.getElementById("wbAgentRunBtn")?.addEventListener("click", () => {
    void handlePrimaryComposerAction();
  });
  document.getElementById("wbTaskConfirmBtn")?.addEventListener("click", () => {
    void proposeCodePatches();
  });
  document.getElementById("wbAgentCancelBtn")?.addEventListener("click", () => {
    void cancelActiveAgent();
  });
}
window.__wbUpsertComposerStep = upsertComposerStep;
window.__wbShowComposerToast = showComposerToast;
window.__wbProposeCodePatches = proposeCodePatches;
window.__wbOpenDiffReviewForCurrentTask = openDiffReviewForCurrentTask;
window.__wbOnComposerDiffApplied = function onComposerDiffApplied() {
  upsertComposerStep("write_code", "done");
  upsertComposerStep("await_diff", "done");
  window.__wbActivityFeed?.markDiffWritten?.();
  composerPhase = "written";
  updateComposerUi("written");
  showComposerToast("代码已写入，并已创建备份。", { type: "success" });
};

window.__wbSetComposerPhase = function setComposerPhase(phase) {
  if (!phase || phase === "running") {
    updateComposerUi(phase || "idle");
    return;
  }
  agentRunStarting = false;
  updateComposerUi(phase);
};

function syncComposerPhaseFromReview() {
  if (composerPhase === "running" || agentRunStarting || composerPhase === "written") {
    return;
  }
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId || !taskId) {
    return;
  }
  const next = detectComposerPhaseFromContext(projectId, taskId);
  if (next !== composerPhase) {
    updateComposerUi(next);
  }
}

window.__wbSyncComposerPhaseFromReview = syncComposerPhaseFromReview;

function renderProjectColSessions() {
  const list = document.getElementById("wbPwsSessionList");
  if (!list) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const chats = store.chats || [];
  list.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement("p");
    empty.className = "wb-pws-session-empty";
    empty.textContent = "暂无会话";
    list.appendChild(empty);
    return;
  }
  chats.slice(0, 8).forEach((chat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wb-pws-session-item";
    btn.dataset.chatId = chat.id;
    const time =
      typeof window.__wbFormatChatListTime === "function"
        ? window.__wbFormatChatListTime(chat.updatedAt)
        : "";
    btn.innerHTML = `
      <span class="wb-pws-session-item__title">${escapeHtml(chat.title || "未命名对话")}</span>
      <span class="wb-pws-session-item__time">${escapeHtml(time)}</span>
    `;
    btn.addEventListener("click", () => {
      window.__wbStore?.selectChat?.(chat.id);
      hideProjectWorkspace();
      void window.__wbSwitchChat?.(chat.id);
    });
    list.appendChild(btn);
  });
}

function bindProjectWorkspace() {
  ensureWorkspaceRoot();
  window.__wbActivityFeed?.bind?.();
  window.__wbBindTerminalDrawer?.();
  window.__wbBindPwsDrawers?.();
  window.__wbBindWorkspaceResizers?.();
  window.__wbBindSceneTemplates?.();
  window.__wbBindApprovalCard?.();
  window.__wbBindDiffReviewPanel?.();
  window.__wbBindCodeWorkspaceTabs?.();
  window.__wbBindTestResultPanel?.();
  window.__wbBindGitChangePanel?.();
  bindTaskFilters();
  const openLogBtn = document.getElementById("wbActivityOpenLogBtn");
  if (openLogBtn && openLogBtn.dataset.bound !== "1") {
    openLogBtn.dataset.bound = "1";
    openLogBtn.addEventListener("click", () => {
      window.__wbExpandTerminalDrawer?.("log");
    });
  }
  const reviewEvent = window.__wbCodeReviewStore?.WB_REVIEW_EVENT || "wb:code-review-change";
  if (!window.__wbComposerReviewPhaseBound) {
    window.__wbComposerReviewPhaseBound = true;
    window.addEventListener(reviewEvent, () => {
      window.__wbSyncComposerPhaseFromReview?.();
    });
  }
  document.getElementById("wbPwsBackToChat")?.addEventListener("click", () => {
    void window.__wbSwitchWorkspaceModule?.("chat");
  });
  document.getElementById("wbPwsProjectNewBtn")?.addEventListener("click", () => {
    window.__wbOpenNewProjectModal?.();
  });
  document.getElementById("wbPwsSessionNewBtn")?.addEventListener("click", () => {
    document.getElementById("jlAiNewSessionBtn")?.click();
  });
  document.getElementById("wbPwsOpenProjectDir")?.addEventListener("click", (ev) => {
    const btn = ev.currentTarget;
    const p = btn?.dataset?.path;
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (typeof window.__wbOpenProjectPath === "function") {
      void window.__wbOpenProjectPath(p, projectId);
    } else if (p && window.electronAPI?.wbProjectOpenPath) {
      void window.electronAPI.wbProjectOpenPath({ path: p, projectId });
    } else if (p && window.electronAPI?.shellOpenPath) {
      void window.electronAPI.shellOpenPath(p);
    }
  });
  ensureNewTaskModal();
  const taskForm = document.getElementById("wbNewTaskForm");
  if (taskForm && taskForm.dataset.wbBound !== "1") {
    taskForm.dataset.wbBound = "1";
    taskForm.addEventListener("submit", submitNewTask);
  }
  document.getElementById("wbCompressBtn")?.addEventListener("click", () => {
    void manualCompressProject();
  });
  const openNewTask = () => {
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (projectId) {
      void createTaskForProject(projectId);
    }
  };
  document.getElementById("wbNewTaskBtn")?.addEventListener("click", openNewTask);
  document.getElementById("wbNewTaskBtnMobile")?.addEventListener("click", openNewTask);
  document.getElementById("wbAgentCancelBtn")?.addEventListener("click", () => {
    void cancelActiveAgent();
  });
  initAutoVerifyCheckbox();
  bindComposerActions();
  subscribeAgentEvents();
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", () => {
    window.__wbScheduleMainView?.();
    renderProjectColSessions();
  });
}

window.__wbRenderProjectColSessions = renderProjectColSessions;
window.__wbShowChatView = showChatView;
window.__wbEnterProjectWorkspaceShell = enterProjectWorkspaceShell;
window.__wbShowProjectView = showProjectView;
window.__wbShowProjectWorkspace = loadProjectWorkspace;
window.__wbHideProjectWorkspace = hideProjectWorkspace;
window.__wbLoadTaskContext = loadTaskContext;
window.__wbBindProjectWorkspace = bindProjectWorkspace;
window.__wbAuditProjectLayout = function auditProjectLayout() {
  const pickRect = (el) => {
    if (!el) {
      return null;
    }
    const r = el.getBoundingClientRect();
    return {
      top: Math.round(r.top),
      left: Math.round(r.left),
      width: Math.round(r.width),
      height: Math.round(r.height),
      bottom: Math.round(r.bottom),
    };
  };
  const pick = (id) => pickRect(document.getElementById(id));
  const panel = pick("panel-ai");
  const root = pick("wbProjectWorkspace");
  const layout = document.querySelector(".wb-pws-layout");
  const layoutRect = pickRect(layout);
  const agentCol = pickRect(document.getElementById("wbPwsAgentCol"));
  const codeCol = pickRect(document.getElementById("wbPwsCodeCol"));
  const terminal = pickRect(document.getElementById("wbPwsTerminalDrawer"));
  const composer = pickRect(document.querySelector(".wb-pws-agent-composer"));
  const codeBody = pickRect(document.getElementById("wbPwsCodeMount"));
  const pwsLayoutInner = pickRect(document.querySelector(".wb-pws-layout > .wb-pws-agent-col"));
  const resizeHandles = [...document.querySelectorAll(".wb-pws-resize-handle")].map((el) => ({
    id: el.id,
    visible: el.offsetParent !== null && getComputedStyle(el).display !== "none",
    left: Math.round(el.getBoundingClientRect().left),
    hasDragging: el.classList.contains("is-dragging"),
  }));
  const midAligned =
    agentCol &&
    codeCol &&
    agentCol.top === codeCol.top &&
    Math.abs(agentCol.height - codeCol.height) <= 2;
  const terminalAligned =
    agentCol && terminal && Math.abs(terminal.top - agentCol.bottom) <= 3;
  const composerInsideAgent =
    agentCol && composer && composer.bottom <= agentCol.bottom + 2;
  const codeBodyInsideCol =
    codeCol && codeBody && codeBody.bottom <= codeCol.bottom + 2;
  const report = {
    panelAi: panel,
    wbProjectWorkspace: root,
    wbPwsLayout: layoutRect,
    wbPwsAgentCol: agentCol,
    wbPwsCodeCol: codeCol,
    wbPwsTerminalDrawer: terminal,
    wbPwsAgentComposer: composer,
    wbPwsCodeBody: codeBody,
    resizeHandles,
    checks: {
      fullBleed:
        panel &&
        root &&
        layoutRect &&
        root.top === panel.top &&
        Math.abs(root.height - panel.height) <= 2,
      midColumnsAligned: midAligned,
      terminalBelowMid: terminalAligned,
      composerInsideAgent,
      codeBodyInsideCol,
    },
    projectMode: document.body.classList.contains("jl-project-workspace-active"),
  };
  console.table(
    [panel, root, layoutRect, agentCol, codeCol, terminal, composer, codeBody].filter(Boolean)
  );
  console.log("[wb layout audit]", report);
  return report;
};
window.__wbRefreshTaskList = async () => {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = resolveCurrentTaskId();
  if (!projectId) {
    return;
  }
  const api = wbApi();
  const tasks = await api.wbProjectTasksList({ projectId });
  window.__wbStore?.setTasks?.(tasks);
  renderTasks(tasks, taskId);
  if (taskId) {
    await loadTaskContext(projectId, taskId);
  }
};
