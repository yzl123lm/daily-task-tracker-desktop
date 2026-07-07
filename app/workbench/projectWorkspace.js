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

const TASK_STATUS_LABELS = {
  DRAFT: "草稿",
  REQUIREMENT: "需求确认",
  PLANNING: "方案生成",
  WAIT_CONFIRM: "待确认",
  DEVELOPING: "开发中",
  TESTING: "测试中",
  REVIEWING: "待审阅",
  DONE: "已完成",
  PAUSED: "已暂停",
  FAILED: "失败",
  ARCHIVED: "已归档",
};

function statusChipClass(status) {
  if (status === "REVIEWING" || status === "PLANNING") {
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
  const confirmBtn = document.getElementById("wbTaskConfirmBtn");
  if (!card || !output) {
    return;
  }
  if (raw) {
    raw.hidden = true;
  }
  card.hidden = false;
  if (confirmBtn) {
    confirmBtn.hidden = false;
  }
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
  const desc = document.getElementById("wbTaskDetailDesc");
  const step = document.getElementById("wbTaskDetailStep");
  if (!panel || !task) {
    return;
  }
  panel.hidden = false;
  if (desc) {
    desc.textContent = task.description || "（无任务描述）";
  }
  if (step) {
    const statusLabel = TASK_STATUS_LABELS[task.status] || task.status;
    step.textContent = `状态：${statusLabel}${task.currentStep ? ` · 当前步骤：${task.currentStep}` : ""}`;
  }
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
        li.className = "wb-task-memories__item";
        li.innerHTML = `<span class="wb-task-memories__type">${escapeHtml(m.memoryType)}</span><span>${escapeHtml(m.content)}</span>`;
        memList.appendChild(li);
      });
    }
  }
  if (typeof api.wbProjectAgentRunsList === "function" && runsList) {
    const runs = await api.wbProjectAgentRunsList({ projectId, taskId, limit: 8 });
    runsList.replaceChildren();
    if (!runs?.length) {
      runsList.innerHTML = '<li class="wb-agent-runs__empty">暂无 Agent 记录</li>';
    } else {
      runs.forEach((run, index) => {
        const li = document.createElement("li");
        li.className = "wb-pws-timeline__item";
        const summary = run.output?.summary || run.inputText?.slice(0, 80) || run.agentType;
        const status = run.status || "success";
        li.innerHTML = `
          <span class="wb-pws-timeline__dot" aria-hidden="true"></span>
          <div class="wb-pws-timeline__body">
            <div class="wb-pws-timeline__head">
              <span class="wb-pws-timeline__type">${escapeHtml(run.agentType || "Agent")}</span>
              <span class="wb-pws-timeline__status wb-pws-timeline__status--${escapeHtml(status)}">${escapeHtml(status)}</span>
            </div>
            <p class="wb-pws-timeline__summary">${escapeHtml(summary)}</p>
            <time class="wb-pws-timeline__time">${escapeHtml(run.createdAt || "")}</time>
          </div>
        `;
        li.addEventListener("click", () => {
          if (run.output?.plan) {
            renderPlanCard(run.output);
          }
        });
        runsList.appendChild(li);
      });
    }
  }
  await refreshProjectContextHealth(projectId, taskId);
  await window.__wbRefreshCodePanel?.(projectId, taskId);
}

function renderTasks(tasks, selectedTaskId) {
  const list = document.getElementById("wbTaskList");
  if (!list) {
    return;
  }
  list.replaceChildren();
  if (!tasks.length) {
    const empty = document.createElement("p");
    empty.className = "wb-task-empty";
    empty.textContent = "暂无任务，点击「新建任务」开始。";
    list.appendChild(empty);
    return;
  }
  tasks.forEach((task) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "wb-task-item";
    item.dataset.taskId = task.id;
    item.classList.toggle("is-active", task.id === selectedTaskId);
    const statusLabel = TASK_STATUS_LABELS[task.status] || task.status;
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
  if (!selectedTaskId && tasks[0]) {
    list.dataset.selectedTaskId = tasks[0].id;
    list.querySelector(".wb-task-item")?.classList.add("is-active");
  }
}

let projectWorkspaceLoadGen = 0;

function isProjectViewActive(projectId, gen) {
  const id = String(projectId || "").trim();
  const store = window.__wbStore?.getState?.() || {};
  return (
    gen === projectWorkspaceLoadGen &&
    store.mode === "project" &&
    store.selectedProjectId === id
  );
}

function syncProjectViewChrome(active) {
  document.body.classList.toggle("jl-project-workspace-active", Boolean(active));
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

function showProjectWorkspaceView(projectId, gen) {
  if (projectId != null && gen != null && !isProjectViewActive(projectId, gen)) {
    return;
  }
  const root = document.getElementById("wbProjectWorkspace");
  const aiMain = document.getElementById("aiPanelMain");
  if (root) {
    root.hidden = false;
    root.removeAttribute("hidden");
  }
  syncProjectViewChrome(true);
  if (aiMain) {
    aiMain.hidden = true;
    aiMain.setAttribute("hidden", "");
  }
}

function showChatView() {
  projectWorkspaceLoadGen += 1;
  window.__wbApprovalStore?.clearPending?.();
  const root = document.getElementById("wbProjectWorkspace");
  const aiMain = document.getElementById("aiPanelMain");
  const panelAi = document.getElementById("panel-ai");
  document.body.classList.remove("jl-project-workspace-active");
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
    aiMain.hidden = false;
    aiMain.removeAttribute("hidden");
  }
}

function showProjectView(projectId) {
  const id = String(projectId || "").trim();
  const store = window.__wbStore?.getState?.() || {};
  if (!id || store.mode !== "project" || store.selectedProjectId !== id) {
    return;
  }
  showProjectWorkspaceView(id, projectWorkspaceLoadGen);
}

async function loadProjectWorkspace(projectId) {
  const api = wbApi();
  const root = ensureWorkspaceRoot();
  const id = String(projectId || "").trim();
  const gen = ++projectWorkspaceLoadGen;
  if (!root || !id || typeof api.wbProjectGet !== "function") {
    return;
  }
  root.dataset.wbReady = "0";
  delete root.dataset.wbProjectId;
  window.__wbApprovalStore?.clearPending?.();
  const project = await api.wbProjectGet({ projectId: id });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  const tasks = await api.wbProjectTasksList({ projectId: id });
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  window.__wbStore?.setTasks?.(tasks);
  document.getElementById("wbProjectWorkspaceTitle").textContent = project.name;
  document.getElementById("wbProjectWorkspaceNs").textContent = project.namespace || `project:${id}`;
  const modePill = document.getElementById("wbPwsModePill");
  if (modePill) {
    modePill.textContent = "PLAN_ONLY / 受控写入";
  }
  const selectedId = tasks[0]?.id;
  renderTasks(tasks, selectedId);
  if (!isProjectViewActive(id, gen)) {
    return;
  }
  root.dataset.wbReady = "1";
  root.dataset.wbProjectId = id;
  showProjectWorkspaceView(id, gen);
  window.__wbBindTerminalDrawer?.();
  window.__wbBindWorkspaceResizers?.();
  window.__wbApplyPwsLayoutPrefs?.();
  window.__wbApplyMainView?.();
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
  window.__wbContextHealth.renderSnapshotHistory(historyEl, snaps);
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
  const api = wbApi();
  const list = document.getElementById("wbTaskList");
  const taskId = list?.dataset?.selectedTaskId;
  const message = window.__wbSceneTemplates?.enrichAgentMessage?.(
    document.getElementById("wbAgentInput")?.value?.trim()
  );
  const out = document.getElementById("wbAgentOutput");
  if (!taskId) {
    if (out) {
      out.hidden = false;
      out.textContent = "请先创建并选择一个任务。";
    }
    return;
  }
  if (!message) {
    if (out) {
      out.hidden = false;
      out.textContent = "请输入开发需求。";
    }
    return;
  }
  if (out) {
    out.hidden = false;
    out.textContent = "生成中…";
  }
  window.__wbExpandTerminalDrawer?.("log");
  document.getElementById("wbPlanCard").hidden = true;
  try {
    const result = await api.wbProjectAgentRun({
      projectId,
      taskId,
      message,
      mode: "PLAN_ONLY",
    });
    renderPlanCard(result.output);
    const tasks = await api.wbProjectTasksList({ projectId });
    window.__wbStore?.setTasks?.(tasks);
    renderTasks(tasks, taskId);
    await loadTaskContext(projectId, taskId);
  } catch (err) {
    if (out) {
      out.textContent = err?.message || "生成失败";
    }
  }
}

async function confirmTaskPlan() {
  const api = wbApi();
  const projectId = window.__wbStore?.getState?.().selectedProjectId;
  const taskId = document.getElementById("wbTaskList")?.dataset?.selectedTaskId;
  if (!projectId || !taskId || typeof api.wbProjectTaskUpdate !== "function") {
    return;
  }
  await api.wbProjectTaskUpdate({
    projectId,
    taskId,
    status: "DEVELOPING",
    currentStep: "用户已确认方案，可受控写入",
  });
  const modePill = document.getElementById("wbPwsModePill");
  if (modePill) {
    modePill.textContent = "受控写入";
  }
  document.getElementById("wbTaskConfirmBtn").hidden = true;
  const tasks = await api.wbProjectTasksList({ projectId });
  window.__wbStore?.setTasks?.(tasks);
  renderTasks(tasks, taskId);
  await loadTaskContext(projectId, taskId);
}

function bindProjectWorkspace() {
  ensureWorkspaceRoot();
  window.__wbBindTerminalDrawer?.();
  window.__wbBindWorkspaceResizers?.();
  window.__wbBindSceneTemplates?.();
  window.__wbBindApprovalCard?.();
  window.__wbBindDiffReviewPanel?.();
  window.__wbBindCodeWorkspaceTabs?.();
  window.__wbBindTestResultPanel?.();
  window.__wbBindGitChangePanel?.();
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
  });
}

window.__wbShowChatView = showChatView;
window.__wbShowProjectView = showProjectView;
window.__wbShowProjectWorkspace = loadProjectWorkspace;
window.__wbHideProjectWorkspace = hideProjectWorkspace;
window.__wbBindProjectWorkspace = bindProjectWorkspace;
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
