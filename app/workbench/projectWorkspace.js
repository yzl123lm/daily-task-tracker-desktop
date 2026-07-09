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

function taskStatusLabel(status) {
  if (window.__wbTaskStatus?.labelForTaskStatus) {
    return window.__wbTaskStatus.labelForTaskStatus(status);
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
  if (!card || !output) {
    return;
  }
  if (raw) {
    raw.hidden = true;
  }
  card.hidden = false;
  composerPhase = "plan_ready";
  updateComposerUi("plan_ready");
  const planItems = (output.plan || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const fileItems = (output.affectedFiles || []).map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join("");
  const riskItems = (output.risks || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  const testItems = (output.testPlan || []).map((t) => `<li>${escapeHtml(t)}</li>`).join("");
  card.innerHTML = `
    <header class="wb-plan-card__head">
      <h4>${escapeHtml(output.summary || "开发方案")}</h4>
      ${output.needUserConfirm ? '<span class="wb-plan-card__badge">待确认</span>' : ""}
    </header>
    <p class="wb-plan-card__req"><strong>需求理解：</strong>${escapeHtml(output.requirementUnderstanding || "")}</p>
    <div class="wb-plan-card__grid">
      <div><h5>实施步骤</h5><ol>${planItems}</ol></div>
      <div><h5>影响文件</h5><ul class="wb-plan-card__files">${fileItems}</ul></div>
      <div><h5>风险</h5><ul>${riskItems}</ul></div>
      <div><h5>测试计划</h5><ul>${testItems}</ul></div>
    </div>
  `;
  window.__wbRenderPlanCodeExtras?.(output);
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
  if (output.diffPreviews?.length && projectId && taskId) {
    window.__wbCodeReviewStore?.setFromDiffPreviews?.(
      projectId,
      taskId,
      output.diffPreviews,
      "plan"
    );
    window.__wbRenderDiffReviewPanel?.();
    window.__wbSwitchCodeTab?.("diff");
  }
}

function renderTaskDetail(task) {
  const panel = document.getElementById("wbTaskDetail");
  const empty = document.getElementById("wbPwsAgentEmpty");
  const desc = document.getElementById("wbTaskDetailDesc");
  const step = document.getElementById("wbTaskDetailStep");
  if (!panel) {
    return;
  }
  if (!task) {
    panel.hidden = true;
    if (empty) {
      empty.hidden = false;
    }
    return;
  }
  panel.hidden = false;
  if (empty) {
    empty.hidden = true;
  }
  if (desc) {
    desc.textContent = task.description || "（无任务描述）";
  }
  if (step) {
    const statusLabel = taskStatusLabel(task.status);
    step.textContent = `状态：${statusLabel}${task.currentStep ? ` · 当前步骤：${task.currentStep}` : ""}`;
  }
}

function renderProjectColCard(project) {
  const card = document.getElementById("wbPwsProjectCard");
  if (!card) {
    return;
  }
  if (!project) {
    card.innerHTML =
      '<p class="wb-pws-project-card__placeholder">选择项目后显示详情</p>';
    return;
  }
  const path = project.localPath || project.local_path || "未配置项目源码目录";
  card.innerHTML = `
    <h4>${escapeHtml(project.name)}</h4>
    <p class="wb-pws-project-card__ns">${escapeHtml(project.namespace || `project:${project.id}`)}</p>
    <p class="wb-pws-project-card__meta">状态 ${escapeHtml(project.status || "active")} · ${escapeHtml(String(path).slice(-56))}</p>
  `;
}

let taskFilterMode = "all";
let activeAgentRunId = null;
let agentRunStarting = false;
let composerPhase = "idle";
let composerLiveSteps = [];
const WB_AUTO_VERIFY_KEY = "wb_auto_verify_v1";

const COMPOSER_STEP_LABELS = {
  create_task: "创建任务",
  check_source: "检查源码目录",
  analyze_structure: "分析项目结构",
  search_files: "搜索相关文件",
  read_code: "读取关键代码",
  generate_plan: "生成开发方案",
  generate_patch: "生成代码变更",
  await_diff: "等待用户审阅 Diff",
  write_code: "写入代码",
  run_verify: "运行验证",
  fix_failure: "修复失败",
  complete: "任务完成",
};

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
  return Boolean(document.getElementById("wbAutoVerifyAfterWrite")?.checked);
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

async function fetchSourceRootStatus(projectId) {
  const api = wbApi();
  if (!projectId || typeof api.wbProjectCodeRoot !== "function") {
    return { ready: false, reason: "api_unavailable" };
  }
  const info = await api.wbProjectCodeRoot({ projectId });
  const localPath = String(info.localPath || "").trim();
  const codeRoot = String(info.codeRoot || "").trim();
  const isAsar = /app\.asar/i.test(codeRoot);
  const isFallback = Boolean(info.isFallback);
  const ready = Boolean(localPath && codeRoot && !isFallback && !isAsar);
  let gitIsRepo = null;
  if (ready && typeof api.wbProjectGitStatus === "function") {
    try {
      const git = await api.wbProjectGitStatus({ projectId });
      gitIsRepo = Boolean(git?.isRepo);
    } catch {
      gitIsRepo = null;
    }
  }
  return { ready, localPath, codeRoot, isAsar, isFallback, gitIsRepo, ...info };
}

async function syncComposerSourceGate(projectId) {
  const gate = document.getElementById("wbComposerSourceGate");
  const runBtn = document.getElementById("wbAgentRunBtn");
  const regenBtn = document.getElementById("wbAgentRegenBtn");
  if (!projectId) {
    if (gate) {
      gate.hidden = true;
    }
    if (runBtn) {
      runBtn.disabled = true;
    }
    if (regenBtn) {
      regenBtn.disabled = true;
    }
    return { ready: false };
  }
  try {
    const status = await fetchSourceRootStatus(projectId);
    const blocked = !status.ready;
    if (gate) {
      gate.hidden = !blocked;
    }
    if (runBtn) {
      runBtn.disabled = blocked || composerPhase === "running" || agentRunStarting;
    }
    if (regenBtn) {
      regenBtn.disabled = blocked || composerPhase === "running" || agentRunStarting;
    }
    return status;
  } catch (err) {
    if (gate) {
      gate.hidden = false;
    }
    if (runBtn) {
      runBtn.disabled = true;
    }
    showComposerError(err?.message || "无法检查源码目录");
    return { ready: false };
  }
}

function resetComposerLiveSteps() {
  composerLiveSteps = [];
}

function upsertComposerStep(id, status, detail = "") {
  const label = COMPOSER_STEP_LABELS[id] || id;
  const existing = composerLiveSteps.find((s) => s.id === id);
  const entry = {
    id,
    label,
    status,
    detail: String(detail || ""),
    at: new Date().toISOString(),
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    composerLiveSteps.push(entry);
  }
  renderComposerTimeline();
}

function renderComposerTimeline(historicalRuns = null) {
  const runsList = document.getElementById("wbAgentRuns");
  if (!runsList) {
    return;
  }
  runsList.replaceChildren();
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
  runs.forEach((run) => {
    const summary = run.output?.summary || run.inputText?.slice(0, 80) || run.agentType;
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

function buildTimelineItem(title, status, detail, time, isStep) {
  const li = document.createElement("li");
  li.className = "wb-pws-timeline__item";
  const normalized = String(status || "pending").toLowerCase();
  const statusClass =
    normalized === "done" || normalized === "completed" || normalized === "success"
      ? "success"
      : normalized === "error" || normalized === "failed"
        ? "failed"
        : normalized === "running" || normalized === "pending"
          ? "running"
          : normalized;
  li.innerHTML = `
    <span class="wb-pws-timeline__dot" aria-hidden="true"></span>
    <div class="wb-pws-timeline__body">
      <div class="wb-pws-timeline__head">
        <span class="wb-pws-timeline__type">${escapeHtml(title)}</span>
        <span class="wb-pws-timeline__status wb-pws-timeline__status--${escapeHtml(statusClass)}">${escapeHtml(status)}</span>
      </div>
      ${detail ? `<p class="wb-pws-timeline__summary">${escapeHtml(detail)}</p>` : ""}
      ${time && !isStep ? `<time class="wb-pws-timeline__time">${escapeHtml(time)}</time>` : ""}
    </div>
  `;
  return li;
}

function detectComposerPhaseFromContext(projectId, taskId) {
  if (composerPhase === "running" || agentRunStarting) {
    return "running";
  }
  const planCard = document.getElementById("wbPlanCard");
  const hasPlan = planCard && !planCard.hidden;
  const reviewStore = window.__wbCodeReviewStore;
  const changes = reviewStore?.getChanges?.(projectId, taskId) || [];
  if (changes.length) {
    return "diff_ready";
  }
  if (hasPlan) {
    return "plan_ready";
  }
  return "idle";
}

function updateComposerUi(phase = composerPhase) {
  composerPhase = phase || "idle";
  const running = composerPhase === "running" || agentRunStarting;
  const runBtn = document.getElementById("wbAgentRunBtn");
  const cancelBtn = document.getElementById("wbAgentCancelBtn");
  const confirmBtn = document.getElementById("wbTaskConfirmBtn");
  const regenBtn = document.getElementById("wbAgentRegenBtn");
  const viewDiffBtn = document.getElementById("wbAgentViewDiffBtn");
  const verifyBtn = document.getElementById("wbAgentRunVerifyBtn");
  const completeBtn = document.getElementById("wbAgentCompleteBtn");
  const input = document.getElementById("wbAgentInput");

  if (runBtn) {
    runBtn.hidden = running || composerPhase === "plan_ready" || composerPhase === "diff_ready";
    runBtn.textContent = "开始执行";
    runBtn.disabled = running;
  }
  if (cancelBtn) {
    cancelBtn.hidden = !running;
    cancelBtn.textContent = "停止任务";
  }
  if (confirmBtn) {
    confirmBtn.hidden = composerPhase !== "plan_ready";
    confirmBtn.textContent = "生成代码变更";
    confirmBtn.disabled = running;
  }
  if (regenBtn) {
    regenBtn.hidden = composerPhase !== "plan_ready";
    regenBtn.disabled = running;
  }
  if (viewDiffBtn) {
    viewDiffBtn.hidden = composerPhase !== "diff_ready";
  }
  if (verifyBtn) {
    verifyBtn.hidden = composerPhase !== "written";
  }
  if (completeBtn) {
    completeBtn.hidden = composerPhase !== "written" && composerPhase !== "done";
  }
  if (input) {
    input.disabled = running;
  }
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  void syncComposerSourceGate(projectId);
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
      showComposerToast("没有生成任何 Diff", { type: "error" });
    }
  }
}

async function ensureComposerTask(projectId, userInput) {
  const list = document.getElementById("wbTaskList");
  let taskId = list?.dataset?.selectedTaskId;
  if (taskId) {
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

async function startAgentExecution(projectId) {
  const api = wbApi();
  showComposerError("");
  const rawInput = getComposerRawInput();
  if (!rawInput) {
    showComposerError("请输入开发需求。");
    showComposerToast("请输入开发需求", { type: "error" });
    return;
  }
  if (agentRunStarting || activeAgentRunId) {
    showComposerToast("Agent 正在运行，不能重复启动", { type: "warn" });
    return;
  }
  resetComposerLiveSteps();
  upsertComposerStep("check_source", "running");
  const sourceStatus = await syncComposerSourceGate(projectId);
  if (!sourceStatus.ready) {
    upsertComposerStep(
      "check_source",
      "error",
      "未配置有效源码目录（不能使用 app.asar 或默认工作区）"
    );
    showComposerError(
      "请先设置项目源码目录，AI 需要在源码目录内读取、搜索、生成 Diff 和受控修改代码。"
    );
    showComposerToast("请先设置项目源码目录", { type: "error" });
    return;
  }
  upsertComposerStep("check_source", "done", sourceStatus.codeRoot);
  if (sourceStatus.gitIsRepo === false) {
    showComposerToast("当前源码目录不是 Git 仓库，部分 Git 功能可能不可用", { type: "warn" });
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
  const message = getComposerMessage();
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
    renderTasks(tasks, taskId);
    await loadTaskContext(projectId, taskId);
    if (!result.output?.plan?.length) {
      showComposerToast("没有生成任何计划", { type: "warn" });
    } else {
      showComposerToast("开发方案已生成，可继续生成代码变更", { type: "success" });
    }
    if (out) {
      out.textContent = result.output?.summary || "方案生成完成";
    }
    updateComposerUi("plan_ready");
  } catch (err) {
    upsertComposerStep("generate_plan", "error", err?.message || "Agent 执行失败");
    if (err?.code === "AGENT_RUN_MUTEX") {
      showComposerToast("Agent 正在运行，不能重复启动", { type: "warn" });
    } else if (err?.message?.includes("WB_AGENT_LLM")) {
      showComposerToast("LLM Agent 已禁用（WB_AGENT_LLM=0）", { type: "error" });
    } else {
      showComposerToast(err?.message || "Agent 执行失败", { type: "error" });
    }
    showComposerError(err?.message || "Agent 执行失败");
    if (out) {
      out.textContent = err?.message || "生成失败";
    }
    updateComposerUi("idle");
  } finally {
    agentRunStarting = false;
    activeAgentRunId = null;
    setAgentRunning(false);
  }
}

async function proposeCodePatches() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
  if (!projectId || !taskId) {
    showComposerToast("请先输入指令并开始执行", { type: "error" });
    return;
  }
  const message =
    getComposerMessage() ||
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
    if (result.output?.plan?.length) {
      renderPlanCard(result.output);
    }
    mapAgentOutputToSteps(result.output, "PATCH_PROPOSE");
    await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
    window.__wbRenderDiffReviewPanel?.();
    window.__wbSwitchCodeTab?.("diff");
    const modePill = document.getElementById("wbPwsModePill");
    if (modePill) {
      modePill.textContent = "PATCH_PROPOSE / 受控写入";
    }
    const tasks = await wbApi().wbProjectTasksList({ projectId });
    window.__wbStore?.setTasks?.(tasks);
    renderTasks(tasks, taskId);
    await loadTaskContext(projectId, taskId);
    if (out) {
      out.textContent = result.output?.diffPreviews?.length
        ? `已生成 ${result.output.diffPreviews.length} 个文件 Diff，请在审阅面板确认`
        : result.output?.note || "补丁生成完成";
    }
    updateComposerUi(composerPhase);
  } catch (err) {
    upsertComposerStep("generate_patch", "error", err?.message || "补丁生成失败");
    showComposerError(err?.message || "补丁生成失败");
    showComposerToast(err?.message || "补丁生成失败", { type: "error" });
    if (out) {
      out.textContent = err?.message || "补丁生成失败";
    }
    updateComposerUi("plan_ready");
  } finally {
    agentRunStarting = false;
    activeAgentRunId = null;
    setAgentRunning(false);
  }
}

async function runComposerVerification() {
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
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
    if (result.output?.fixResult?.ok) {
      upsertComposerStep("run_verify", "done", "验证通过");
      upsertComposerStep("complete", "done");
      updateComposerUi("done");
      showComposerToast("验证通过，任务完成", { type: "success" });
    } else if (result.output?.fixResult?.waitingApproval) {
      upsertComposerStep("run_verify", "error", "验证失败，已生成修复 Diff");
      upsertComposerStep("fix_failure", "pending");
      await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
      window.__wbRenderDiffReviewPanel?.();
      window.__wbSwitchCodeTab?.("diff");
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
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
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
  try {
    el.checked = localStorage.getItem(WB_AUTO_VERIFY_KEY) === "1";
  } catch {
    el.checked = false;
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
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
  if (!projectId || !taskId) {
    return;
  }
  if (!activeAgentRunId) {
    if (agentRunStarting) {
      showComposerToast("Agent 启动中，请稍候再试停止", { type: "warn" });
    } else {
      showComposerToast("当前没有运行中的 Agent", { type: "info" });
    }
    return;
  }
  if (typeof api.wbProjectAgentCancel !== "function") {
    return;
  }
  try {
    await api.wbProjectAgentCancel({
      projectId,
      taskId,
      agentRunId: activeAgentRunId,
    });
    upsertComposerStep("generate_plan", "error", "用户已停止任务");
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
    const selectedId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
    renderTasks(tasks, selectedId);
  });
}

async function loadTaskContext(projectId, taskId) {
  const api = wbApi();
  const namespace = `task:${projectId}:${taskId}`;
  const tasks = window.__wbStore?.getState?.().tasks || [];
  const task = tasks.find((t) => t.id === taskId);
  if (task) {
    renderTaskDetail(task);
  }
  const memList = document.getElementById("wbTaskMemories");
  const runsList = document.getElementById("wbAgentRuns");
  if (typeof api.wbMemorySearch === "function" && memList) {
    const memories = await api.wbMemorySearch({
      namespace,
      projectId,
      taskId,
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
        li.innerHTML = `<span class="wb-task-memories__type">${escapeHtml(m.memoryType)}</span><span>${escapeHtml(m.content)}</span>`;
        memList.appendChild(li);
      });
    }
  }
  if (typeof api.wbProjectAgentRunsList === "function" && runsList) {
    const runs = await api.wbProjectAgentRunsList({ projectId, taskId, limit: 8 });
    renderComposerTimeline(runs);
  }
  composerPhase = detectComposerPhaseFromContext(projectId, taskId);
  updateComposerUi(composerPhase);
  await syncComposerSourceGate(projectId);
  await refreshProjectContextHealth(projectId, taskId);
  await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
  window.__wbRenderDiffReviewPanel?.();
  await window.__wbRefreshCodePanel?.(projectId, taskId);
}

function renderTasks(tasks, selectedTaskId, { autoSelectFirst = true } = {}) {
  const list = document.getElementById("wbTaskList");
  if (!list) {
    return;
  }
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
    renderTaskDetail(null);
    return;
  }
  filtered.forEach((task) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "wb-task-item";
    item.dataset.taskId = task.id;
    item.classList.toggle("is-active", task.id === selectedTaskId);
    const statusLabel = taskStatusLabel(task.status);
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
      list.querySelectorAll(".wb-task-item").forEach((el) => el.classList.remove("is-active"));
      item.classList.add("is-active");
      list.dataset.selectedTaskId = task.id;
      const projectId = window.__wbStore?.getState?.().selectedProjectId;
      if (projectId) {
        void loadTaskContext(projectId, task.id);
      }
    });
    list.appendChild(item);
  });
  if (
    autoSelectFirst &&
    (!selectedTaskId || !filtered.some((t) => t.id === selectedTaskId))
  ) {
    const first = filtered[0];
    if (first) {
      list.dataset.selectedTaskId = first.id;
      list.querySelector(`[data-task-id="${first.id}"]`)?.classList.add("is-active");
      renderTaskDetail(first);
    }
  } else if (selectedTaskId) {
    list.dataset.selectedTaskId = selectedTaskId;
    renderTaskDetail(filtered.find((t) => t.id === selectedTaskId) || null);
  } else {
    delete list.dataset.selectedTaskId;
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
  document.getElementById("wbProjectWorkspaceTitle").textContent = project.name;
  window.__wbSyncProjectTopChrome?.(true, project.name);
  document.getElementById("wbProjectWorkspaceNs").textContent = project.namespace || `project:${id}`;
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
  const selectedId = null;
  renderTasks(tasks, selectedId, { autoSelectFirst: false });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  root.dataset.wbReady = "1";
  root.dataset.wbProjectId = id;
  showProjectWorkspaceView(id, gen);
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
  await syncComposerSourceGate(id);
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
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
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
  document.getElementById("wbComposerChooseRootBtn")?.addEventListener("click", () => {
    void window.__wbChooseProjectRoot?.();
  });
  document.getElementById("wbAgentRegenBtn")?.addEventListener("click", () => {
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (projectId) {
      void startAgentExecution(projectId);
    }
  });
  document.getElementById("wbAgentViewDiffBtn")?.addEventListener("click", () => {
    window.__wbSwitchCodeTab?.("diff");
    window.__wbRenderDiffReviewPanel?.();
  });
  document.getElementById("wbAgentRunVerifyBtn")?.addEventListener("click", () => {
    void runComposerVerification();
  });
  document.getElementById("wbAgentCompleteBtn")?.addEventListener("click", () => {
    void completeComposerTask();
  });
}

window.__wbSyncComposerSourceGate = syncComposerSourceGate;
window.__wbUpsertComposerStep = upsertComposerStep;
window.__wbOnComposerDiffApplied = function onComposerDiffApplied() {
  upsertComposerStep("write_code", "done");
  upsertComposerStep("await_diff", "done");
  composerPhase = "written";
  updateComposerUi("written");
  showComposerToast("代码已写入，可运行验证或完成任务", { type: "success" });
};

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
    if (p && window.electronAPI?.shellOpenPath) {
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
  document.getElementById("wbNewTaskBtn")?.addEventListener("click", () => {
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (projectId) {
      void createTaskForProject(projectId);
    }
  });
  document.getElementById("wbAgentCancelBtn")?.addEventListener("click", () => {
    void cancelActiveAgent();
  });
  initAutoVerifyCheckbox();
  bindComposerActions();
  document.getElementById("wbAgentRunBtn")?.addEventListener("click", () => {
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (projectId) {
      void runProjectAgent(projectId);
    }
  });
  document.getElementById("wbTaskConfirmBtn")?.addEventListener("click", () => {
    void confirmTaskPlan();
  });
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
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
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
