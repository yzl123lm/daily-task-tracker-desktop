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
  root.innerHTML = `
    <header class="wb-project-workspace__head">
      <div>
        <p class="wb-project-workspace__eyebrow">项目开发模式 · PLAN_ONLY / 受控写入</p>
        <h2 id="wbProjectWorkspaceTitle">项目工作区</h2>
        <p id="wbProjectWorkspaceNs" class="wb-project-workspace__ns"></p>
        <div id="wbProjectContextHealth" class="wb-project-workspace__health"></div>
      </div>
      <div class="wb-project-workspace__head-actions">
        <button type="button" id="wbCompressBtn" class="secondary">手动压缩</button>
        <button type="button" id="wbNewTaskBtn" class="primary wb-project-workspace__new-task">新建任务</button>
      </div>
    </header>
    <section class="wb-project-workspace__tasks">
      <h3>项目任务</h3>
      <div id="wbTaskList" class="wb-task-list"></div>
    </section>
    <section id="wbTaskDetail" class="wb-task-detail" hidden>
      <h3>任务详情</h3>
      <p id="wbTaskDetailDesc" class="wb-task-detail__desc"></p>
      <p id="wbTaskDetailStep" class="wb-task-detail__step"></p>
    </section>
    <section class="wb-project-workspace__agent">
      <h3>ProjectAgent（仅方案，不改文件）</h3>
      <textarea id="wbAgentInput" rows="4" placeholder="描述开发需求，生成 PLAN_ONLY 方案…"></textarea>
      <div class="wb-project-workspace__agent-actions">
        <button type="button" id="wbAgentRunBtn" class="primary">生成开发方案</button>
        <button type="button" id="wbTaskConfirmBtn" class="secondary" hidden>确认方案</button>
      </div>
      <div id="wbPlanCard" class="wb-plan-card" hidden></div>
      <pre id="wbAgentOutput" class="wb-agent-output scroll-tech" hidden></pre>
    </section>
    <section class="wb-project-workspace__context">
      <h3>任务上下文记忆</h3>
      <ul id="wbTaskMemories" class="wb-task-memories"></ul>
    </section>
    <section class="wb-project-workspace__runs">
      <h3>Agent 执行记录</h3>
      <ul id="wbAgentRuns" class="wb-agent-runs"></ul>
    </section>
    <section class="wb-project-workspace__snapshots">
      <h3>压缩快照历史</h3>
      <div id="wbSnapshotHistory" class="wb-snapshot-history-panel"></div>
    </section>
  `;
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
      runs.forEach((run) => {
        const li = document.createElement("li");
        li.className = "wb-agent-runs__item";
        const summary = run.output?.summary || run.inputText?.slice(0, 60) || run.agentType;
        li.innerHTML = `
          <span class="wb-agent-runs__type">${escapeHtml(run.agentType)}</span>
          <span class="wb-agent-runs__summary">${escapeHtml(summary)}</span>
          <time class="wb-agent-runs__time">${escapeHtml(run.createdAt || "")}</time>
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

async function loadProjectWorkspace(projectId) {
  const api = wbApi();
  const root = ensureWorkspaceRoot();
  const aiMain = document.getElementById("aiPanelMain");
  if (!root || typeof api.wbProjectGet !== "function") {
    return;
  }
  const project = await api.wbProjectGet({ projectId });
  const tasks = await api.wbProjectTasksList({ projectId });
  window.__wbStore?.setTasks?.(tasks);
  document.getElementById("wbProjectWorkspaceTitle").textContent = project.name;
  document.getElementById("wbProjectWorkspaceNs").textContent = project.namespace || `project:${projectId}`;
  const selectedId = tasks[0]?.id;
  renderTasks(tasks, selectedId);
  root.hidden = false;
  syncProjectViewChrome(true);
  if (aiMain) {
    aiMain.hidden = true;
  }
  document.getElementById("wbPlanCard").hidden = true;
  document.getElementById("wbAgentOutput").hidden = true;
  document.getElementById("wbAgentOutput").textContent = "";
  document.getElementById("wbTaskConfirmBtn").hidden = true;
  if (selectedId) {
    await loadTaskContext(projectId, selectedId);
  }
  window.__wbBindCodePanel?.();
  await window.__wbRefreshCodePanel?.(projectId, selectedId);
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
  await refreshProjectContextHealth(projectId, taskId);
}

function hideProjectWorkspace() {
  const root = document.getElementById("wbProjectWorkspace");
  const aiMain = document.getElementById("aiPanelMain");
  if (root) {
    root.hidden = true;
  }
  syncProjectViewChrome(false);
  if (aiMain) {
    aiMain.hidden = false;
  }
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
    await api.wbProjectTaskCreate({ projectId, title, description, priority });
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
  const message = document.getElementById("wbAgentInput")?.value?.trim();
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
  document.getElementById("wbTaskConfirmBtn").hidden = true;
  const tasks = await api.wbProjectTasksList({ projectId });
  window.__wbStore?.setTasks?.(tasks);
  renderTasks(tasks, taskId);
  await loadTaskContext(projectId, taskId);
}

function bindProjectWorkspace() {
  ensureWorkspaceRoot();
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
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", (ev) => {
    const detail = ev.detail || {};
    if (detail.mode !== "project" || !detail.selectedProjectId) {
      hideProjectWorkspace();
    }
  });
}

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
