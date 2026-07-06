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
        <p class="wb-project-workspace__eyebrow">项目开发模式 · PLAN_ONLY</p>
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
    <section class="wb-project-workspace__agent">
      <h3>ProjectAgent（仅方案，不改文件）</h3>
      <textarea id="wbAgentInput" rows="4" placeholder="描述开发需求，生成 PLAN_ONLY 方案…"></textarea>
      <div class="wb-project-workspace__agent-actions">
        <button type="button" id="wbAgentRunBtn" class="primary">生成开发方案</button>
      </div>
      <pre id="wbAgentOutput" class="wb-agent-output scroll-tech"></pre>
    </section>
    <section class="wb-project-workspace__snapshots">
      <h3>压缩快照历史</h3>
      <div id="wbSnapshotHistory" class="wb-snapshot-history-panel"></div>
    </section>
  `;
  panelAi.prepend(root);
  return root;
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
    item.innerHTML = `
      <span class="wb-task-item__title">${escapeHtml(task.title)}</span>
      <span class="wb-task-item__status">${escapeHtml(task.status)}</span>
    `;
    item.addEventListener("click", () => {
      list.querySelectorAll(".wb-task-item").forEach((el) => el.classList.remove("is-active"));
      item.classList.add("is-active");
      list.dataset.selectedTaskId = task.id;
      const projectId = window.__wbStore?.getState?.().selectedProjectId;
      if (projectId) {
        void refreshProjectContextHealth(projectId, task.id);
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
  renderTasks(tasks, tasks[0]?.id);
  root.hidden = false;
  if (aiMain) {
    aiMain.hidden = true;
  }
  document.getElementById("wbAgentOutput").textContent = "";
  await refreshProjectContextHealth(projectId, tasks[0]?.id);
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
    out.textContent = "请先创建并选择一个任务。";
    return;
  }
  if (!message) {
    out.textContent = "请输入开发需求。";
    return;
  }
  out.textContent = "生成中…";
  try {
    const result = await api.wbProjectAgentRun({
      projectId,
      taskId,
      message,
      mode: "PLAN_ONLY",
    });
    out.textContent = JSON.stringify(result.output, null, 2);
    await refreshProjectContextHealth(projectId, taskId);
  } catch (err) {
    out.textContent = err?.message || "生成失败";
  }
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
