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

const PROJECT_STATUS_LABELS = {
  ACTIVE: "进行中",
  ARCHIVED: "已归档",
  DELETED: "已删除",
};

const PROJECT_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>`;

function statusPillClass(status) {
  if (status === "ACTIVE") {
    return "wb-status-pill--active";
  }
  if (status === "ARCHIVED") {
    return "wb-status-pill--archived";
  }
  return "wb-status-pill--muted";
}

function ensureNewProjectModal() {
  let modal = document.getElementById("wbNewProjectModal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "wbNewProjectModal";
  modal.className = "wb-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-close="1"></div>
    <div class="wb-modal__panel" role="dialog" aria-labelledby="wbNewProjectTitle">
      <header class="wb-modal__head">
        <h2 id="wbNewProjectTitle">新建项目</h2>
        <button type="button" class="wb-modal__close" data-wb-close="1" aria-label="关闭">×</button>
      </header>
      <form id="wbNewProjectForm" class="wb-modal__body">
        <label class="wb-field">
          <span>项目名称</span>
          <input id="wbProjectNameInput" type="text" maxlength="120" required placeholder="例如：知识库升级项目" />
        </label>
        <label class="wb-field">
          <span>项目描述</span>
          <textarea id="wbProjectDescInput" rows="3" placeholder="可选"></textarea>
        </label>
        <label class="wb-field">
          <span>技术栈（逗号分隔）</span>
          <input id="wbProjectStackInput" type="text" placeholder="Electron, JavaScript" />
        </label>
        <label class="wb-field">
          <span>代码目录（可选）</span>
          <div class="wb-field__row">
            <input id="wbProjectPathInput" type="text" readonly placeholder="未选择则使用默认工作区" />
            <button type="button" id="wbProjectPickPathBtn" class="secondary">选择目录</button>
          </div>
        </label>
        <p id="wbNewProjectError" class="wb-form-error" hidden></p>
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

function ensureEditProjectModal() {
  let modal = document.getElementById("wbEditProjectModal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "wbEditProjectModal";
  modal.className = "wb-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-close="1"></div>
    <div class="wb-modal__panel" role="dialog" aria-labelledby="wbEditProjectTitle">
      <header class="wb-modal__head">
        <h2 id="wbEditProjectTitle">编辑项目</h2>
        <button type="button" class="wb-modal__close" data-wb-close="1" aria-label="关闭">×</button>
      </header>
      <form id="wbEditProjectForm" class="wb-modal__body">
        <input type="hidden" id="wbEditProjectId" value="" />
        <label class="wb-field">
          <span>项目名称</span>
          <input id="wbEditProjectNameInput" type="text" maxlength="120" required />
        </label>
        <label class="wb-field">
          <span>项目描述</span>
          <textarea id="wbEditProjectDescInput" rows="3"></textarea>
        </label>
        <label class="wb-field">
          <span>技术栈（逗号分隔）</span>
          <input id="wbEditProjectStackInput" type="text" />
        </label>
        <label class="wb-field">
          <span>代码目录</span>
          <div class="wb-field__row">
            <input id="wbEditProjectPathInput" type="text" readonly />
            <button type="button" id="wbEditProjectPickPathBtn" class="secondary">选择</button>
          </div>
        </label>
        <p id="wbEditProjectError" class="wb-form-error" hidden></p>
        <footer class="wb-modal__foot">
          <button type="button" class="secondary" data-wb-close="1">取消</button>
          <button type="submit" class="primary">保存</button>
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

function openNewProjectModal() {
  const modal = ensureNewProjectModal();
  const err = document.getElementById("wbNewProjectError");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  modal.hidden = false;
  document.getElementById("wbProjectNameInput")?.focus();
}

async function openEditProjectModal(project) {
  const modal = ensureEditProjectModal();
  const err = document.getElementById("wbEditProjectError");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  document.getElementById("wbEditProjectId").value = project.id;
  document.getElementById("wbEditProjectNameInput").value = project.name || "";
  document.getElementById("wbEditProjectDescInput").value = project.description || "";
  document.getElementById("wbEditProjectStackInput").value = (project.techStack || []).join(", ");
  document.getElementById("wbEditProjectPathInput").value = project.localPath || "";
  modal.hidden = false;
  document.getElementById("wbEditProjectNameInput")?.focus();
}

async function submitNewProject(ev) {
  ev.preventDefault();
  const api = wbApi();
  if (typeof api.wbProjectCreate !== "function") {
    return;
  }
  const name = document.getElementById("wbProjectNameInput")?.value?.trim();
  const description = document.getElementById("wbProjectDescInput")?.value?.trim() || "";
  const stackRaw = document.getElementById("wbProjectStackInput")?.value?.trim() || "";
  const techStack = stackRaw
    ? stackRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const localPath = document.getElementById("wbProjectPathInput")?.value?.trim() || null;
  const errEl = document.getElementById("wbNewProjectError");
  try {
    const project = await api.wbProjectCreate({ name, description, techStack, localPath });
    document.getElementById("wbNewProjectModal").hidden = true;
    await window.__wbRefreshProjects?.();
    if (project?.id) {
      selectProject(project.id);
    }
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err?.message || "创建失败";
    }
  }
}

async function submitEditProject(ev) {
  ev.preventDefault();
  const api = wbApi();
  const projectId = document.getElementById("wbEditProjectId")?.value?.trim();
  const name = document.getElementById("wbEditProjectNameInput")?.value?.trim();
  const description = document.getElementById("wbEditProjectDescInput")?.value?.trim() || "";
  const stackRaw = document.getElementById("wbEditProjectStackInput")?.value?.trim() || "";
  const techStack = stackRaw
    ? stackRaw.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
    : [];
  const localPath = document.getElementById("wbEditProjectPathInput")?.value?.trim() || null;
  const errEl = document.getElementById("wbEditProjectError");
  if (!projectId || !name) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "请填写项目名称";
    }
    return;
  }
  try {
    await api.wbProjectUpdate({ projectId, name, description, techStack, localPath });
    document.getElementById("wbEditProjectModal").hidden = true;
    await window.__wbRefreshProjects?.();
    if (window.__wbStore?.getState?.().selectedProjectId === projectId) {
      await window.__wbShowProjectWorkspace?.(projectId);
    }
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err?.message || "保存失败";
    }
  }
}

async function afterProjectRemoved(projectId) {
  const store = window.__wbStore?.getState?.() || {};
  if (store.selectedProjectId === projectId) {
    window.__wbStore?.clearSelection?.();
    window.__wbHideProjectWorkspace?.();
    const aiMain = document.getElementById("aiPanelMain");
    if (aiMain) {
      aiMain.hidden = false;
    }
  }
  await window.__wbRefreshProjects?.();
}

async function archiveProject(project) {
  const api = wbApi();
  if (!project?.id || typeof api.wbProjectArchive !== "function") {
    return;
  }
  const ok = await window.__wbConfirm?.({
    title: "归档项目",
    message: `确定归档项目「${project.name}」吗？`,
    detail:
      "归档后该项目将不再显示在「项目区域」列表中。任务、开发记忆与备份数据仍保留在本机，需要时可联系管理员恢复。",
    confirmLabel: "归档",
  });
  if (!ok) {
    return;
  }
  await api.wbProjectArchive({ projectId: project.id });
  await afterProjectRemoved(project.id);
}

async function deleteProject(project) {
  const api = wbApi();
  if (!project?.id || typeof api.wbProjectDelete !== "function") {
    return;
  }
  const ok = await window.__wbConfirm?.({
    title: "删除项目",
    message: `确定删除项目「${project.name}」吗？`,
    detail:
      "删除后该项目将从「项目区域」移除，并关闭当前项目工作区。项目下的任务、开发记忆与文件备份仍保留在本机，不会自动清空。",
    confirmLabel: "删除",
    danger: true,
  });
  if (!ok) {
    return;
  }
  await api.wbProjectDelete({ projectId: project.id });
  await afterProjectRemoved(project.id);
}

function selectProject(projectId) {
  const prevChat = window.__wbStore?.getState?.().selectedChatId;
  window.__wbPersistActiveChatSnapshot?.();
  if (prevChat) {
    window.__wbPersistActiveChatId?.(prevChat);
  }
  window.__wbStore?.selectProject?.(projectId);
  void window.__wbShowProjectWorkspace?.(projectId);
  if (typeof window.activateRoute === "function") {
    window.activateRoute("project-dev", {
      syncHash: true,
      projectId,
      skipWorkbenchGuard: true,
      skipProjectLoad: true,
    });
  }
}

function buildProjectListCard(project, store) {
  const card = document.createElement("div");
  card.className = "wb-list-card wb-list-card--project";
  card.dataset.projectId = project.id;
  const statusLabel = PROJECT_STATUS_LABELS[project.status] || project.status;
  card.innerHTML = `
    <div class="wb-list-card__surface">
      <button type="button" class="wb-project-card jl-ai-session-item wb-list-card__body">
        <span class="wb-project-card__icon">${PROJECT_ICON_SVG}</span>
        <span class="wb-project-card__main">
          <span class="wb-project-card__name" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>
          <span class="wb-status-pill ${statusPillClass(project.status)}">
            <span class="wb-status-pill__dot" aria-hidden="true"></span>
            ${escapeHtml(statusLabel)}
          </span>
        </span>
      </button>
      <div class="wb-list-card__actions wb-list-card__actions--overlay" role="group" aria-label="项目操作">
        <button type="button" class="wb-icon-btn" data-action="edit" title="编辑" aria-label="编辑">✎</button>
        <button type="button" class="wb-icon-btn" data-action="archive" title="归档" aria-label="归档">📦</button>
        <button type="button" class="wb-icon-btn wb-icon-btn--danger" data-action="delete" title="删除" aria-label="删除">🗑</button>
      </div>
    </div>
  `;
  card.classList.toggle("is-active", project.id === store.selectedProjectId);
  return card;
}

function mountProjectListCard(card, list) {
  const projectId = card.dataset.projectId;
  card.querySelector(".wb-list-card__body")?.addEventListener("click", () => {
    list.querySelectorAll(".wb-list-card").forEach((el) => el.classList.remove("is-active"));
    card.classList.add("is-active");
    selectProject(projectId);
  });
  const project = (window.__wbStore?.getState?.().projects || []).find((p) => p.id === projectId);
  card.querySelector('[data-action="edit"]')?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (project) {
      void openEditProjectModal(project);
    }
  });
  card.querySelector('[data-action="archive"]')?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (project) {
      void archiveProject(project);
    }
  });
  card.querySelector('[data-action="delete"]')?.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (project) {
      void deleteProject(project);
    }
  });
  list.appendChild(card);
}

function renderProjectListToContainer(listEl, emptyEl, compact = false) {
  if (!listEl) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const projects = store.projects || [];
  listEl.querySelectorAll(".wb-list-card").forEach((el) => el.remove());
  if (emptyEl) {
    emptyEl.hidden = projects.length > 0;
  }
  projects.forEach((project) => {
    const card = buildProjectListCard(project, store);
    if (compact) {
      card.classList.add("wb-list-card--compact");
    }
    mountProjectListCard(card, listEl);
  });
}

function renderProjectList() {
  const list = document.getElementById("jlProjectList");
  const empty = document.getElementById("jlProjectListEmpty");
  renderProjectListToContainer(list, empty, false);
  const colList = document.getElementById("wbPwsProjectList");
  if (colList) {
    renderProjectListToContainer(colList, null, true);
  }
}

function bindProjectArea() {
  ensureNewProjectModal();
  ensureEditProjectModal();
  const newBtn = document.getElementById("jlProjectNewBtn");
  if (newBtn && newBtn.dataset.wbBound !== "1") {
    newBtn.dataset.wbBound = "1";
    newBtn.addEventListener("click", openNewProjectModal);
  }
  const form = document.getElementById("wbNewProjectForm");
  if (form && form.dataset.wbBound !== "1") {
    form.dataset.wbBound = "1";
    form.addEventListener("submit", submitNewProject);
  }
  const editForm = document.getElementById("wbEditProjectForm");
  if (editForm && editForm.dataset.wbBound !== "1") {
    editForm.dataset.wbBound = "1";
    editForm.addEventListener("submit", submitEditProject);
  }
  document.getElementById("wbProjectPickPathBtn")?.addEventListener("click", async () => {
    const api = wbApi();
    if (typeof api.wbProjectChooseRoot !== "function") {
      return;
    }
    const dir = await api.wbProjectChooseRoot();
    if (dir) {
      document.getElementById("wbProjectPathInput").value = dir;
    }
  });
  document.getElementById("wbEditProjectPickPathBtn")?.addEventListener("click", async () => {
    const api = wbApi();
    if (typeof api.wbProjectChooseRoot !== "function") {
      return;
    }
    const dir = await api.wbProjectChooseRoot();
    if (dir) {
      document.getElementById("wbEditProjectPathInput").value = dir;
    }
  });
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", renderProjectList);
}

window.__wbRenderProjects = renderProjectList;
window.__wbRenderProjectList = renderProjectList;
window.__wbOpenNewProjectModal = openNewProjectModal;
window.__wbBindProjectArea = bindProjectArea;
