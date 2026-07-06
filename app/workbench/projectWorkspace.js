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
      </div>
      <button type="button" id="wbNewTaskBtn" class="primary wb-project-workspace__new-task">新建任务</button>
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
  const title = window.prompt("任务标题", "新开发任务");
  if (!title?.trim()) {
    return;
  }
  const api = wbApi();
  await api.wbProjectTaskCreate({ projectId, title: title.trim() });
  await loadProjectWorkspace(projectId);
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
  } catch (err) {
    out.textContent = err?.message || "生成失败";
  }
}

function bindProjectWorkspace() {
  ensureWorkspaceRoot();
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
