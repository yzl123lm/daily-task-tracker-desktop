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

const NEW_PROJECT_MODAL_VERSION = "2";
const PROJECT_NAME_MAX = 50;
const PROJECT_DESC_MAX = 300;

let newProjectPathManual = false;
let trustedWorkspaceBase = "";

function joinPathSegment(base, name) {
  const root = String(base || "").replace(/[\\/]+$/, "");
  const segment = String(name || "新项目")
    .trim()
    .replace(/[<>:"/\\|?*]/g, "_")
    .slice(0, 80) || "新项目";
  if (!root) {
    return segment;
  }
  const sep = root.includes("\\") ? "\\" : "/";
  return `${root}${sep}${segment}`;
}

async function loadTrustedWorkspaceBase() {
  const api = wbApi();
  if (typeof api.wbProjectTrustedWorkspaceBase === "function") {
    try {
      trustedWorkspaceBase = String(await api.wbProjectTrustedWorkspaceBase()) || "";
      return trustedWorkspaceBase;
    } catch {
      /* ignore */
    }
  }
  trustedWorkspaceBase = "";
  return trustedWorkspaceBase;
}

function bindNewProjectFieldCounters() {
  const nameInput = document.getElementById("wbProjectNameInput");
  const descInput = document.getElementById("wbProjectDescInput");
  const nameCount = document.getElementById("wbProjectNameCount");
  const descCount = document.getElementById("wbProjectDescCount");
  if (nameInput && nameCount && nameInput.dataset.counterBound !== "1") {
    nameInput.dataset.counterBound = "1";
    const syncName = () => {
      nameCount.textContent = `${nameInput.value.length}/${PROJECT_NAME_MAX}`;
      if (!newProjectPathManual) {
        const pathInput = document.getElementById("wbProjectPathInput");
        if (pathInput && trustedWorkspaceBase) {
          pathInput.value = joinPathSegment(
            trustedWorkspaceBase,
            nameInput.value.trim() || "新项目"
          );
        }
      }
    };
    nameInput.addEventListener("input", syncName);
    syncName();
  }
  if (descInput && descCount && descInput.dataset.counterBound !== "1") {
    descInput.dataset.counterBound = "1";
    const syncDesc = () => {
      descCount.textContent = `${descInput.value.length}/${PROJECT_DESC_MAX}`;
    };
    descInput.addEventListener("input", syncDesc);
    syncDesc();
  }
  const pathInput = document.getElementById("wbProjectPathInput");
  if (pathInput && pathInput.dataset.manualBound !== "1") {
    pathInput.dataset.manualBound = "1";
    pathInput.addEventListener("input", () => {
      newProjectPathManual = true;
    });
  }
}

function resetNewProjectForm() {
  newProjectPathManual = false;
  const form = document.getElementById("wbNewProjectForm");
  form?.reset();
  const nameCount = document.getElementById("wbProjectNameCount");
  const descCount = document.getElementById("wbProjectDescCount");
  if (nameCount) {
    nameCount.textContent = `0/${PROJECT_NAME_MAX}`;
  }
  if (descCount) {
    descCount.textContent = `0/${PROJECT_DESC_MAX}`;
  }
  const pathInput = document.getElementById("wbProjectPathInput");
  if (pathInput && trustedWorkspaceBase) {
    pathInput.value = joinPathSegment(trustedWorkspaceBase, "新项目");
  }
}

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
  if (modal && modal.dataset.modalVersion === NEW_PROJECT_MODAL_VERSION) {
    return modal;
  }
  if (modal) {
    modal.remove();
    modal = null;
  }
  modal = document.createElement("div");
  modal.id = "wbNewProjectModal";
  modal.className = "wb-modal";
  modal.dataset.modalVersion = NEW_PROJECT_MODAL_VERSION;
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-close="1"></div>
    <div class="wb-modal__panel wb-new-project-modal" role="dialog" aria-labelledby="wbNewProjectTitle">
      <header class="wb-modal__head wb-new-project-modal__head">
        <h2 id="wbNewProjectTitle">新建项目</h2>
        <button type="button" class="wb-modal__close" data-wb-close="1" aria-label="关闭">×</button>
      </header>
      <form id="wbNewProjectForm" class="wb-modal__body wb-new-project-modal__body">
        <label class="wb-field wb-new-project-field">
          <span class="wb-new-project-field__label">项目名称</span>
          <div class="wb-new-project-field__control">
            <input id="wbProjectNameInput" type="text" maxlength="${PROJECT_NAME_MAX}" required placeholder="输入项目名称…" autocomplete="off" />
            <span id="wbProjectNameCount" class="wb-new-project-field__count" aria-live="polite">0/${PROJECT_NAME_MAX}</span>
          </div>
        </label>
        <label class="wb-field wb-new-project-field">
          <span class="wb-new-project-field__label">项目描述 <em class="wb-new-project-field__opt">（可选）</em></span>
          <div class="wb-new-project-field__control wb-new-project-field__control--area">
            <textarea id="wbProjectDescInput" rows="4" maxlength="${PROJECT_DESC_MAX}" placeholder="输入项目描述…"></textarea>
            <span id="wbProjectDescCount" class="wb-new-project-field__count wb-new-project-field__count--area" aria-live="polite">0/${PROJECT_DESC_MAX}</span>
          </div>
        </label>
        <div class="wb-field wb-new-project-field">
          <span class="wb-new-project-field__label">项目源码目录 <em class="wb-new-project-field__opt">（可选）</em></span>
          <div class="wb-new-project-path">
            <input id="wbProjectPathInput" type="text" placeholder="授信工作区下的项目目录" />
            <button type="button" id="wbProjectPickPathBtn" class="wb-new-project-path__browse">浏览</button>
          </div>
        </div>
        <p id="wbNewProjectError" class="wb-form-error" hidden></p>
        <footer class="wb-modal__foot wb-new-project-modal__foot">
          <button type="button" class="secondary wb-new-project-modal__cancel" data-wb-close="1">取消</button>
          <button type="submit" class="primary wb-new-project-modal__submit">创建</button>
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
  bindNewProjectFieldCounters();
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
          <span>项目源码目录</span>
          <div class="wb-new-project-path">
            <input id="wbEditProjectPathInput" type="text" />
            <button type="button" id="wbEditProjectPickPathBtn" class="wb-new-project-path__browse">浏览</button>
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

async function openNewProjectModal() {
  const modal = ensureNewProjectModal();
  const err = document.getElementById("wbNewProjectError");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  await loadTrustedWorkspaceBase();
  resetNewProjectForm();
  bindNewProjectFieldCounters();
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
  const localPath = document.getElementById("wbProjectPathInput")?.value?.trim() || null;
  const errEl = document.getElementById("wbNewProjectError");
  try {
    const project = await api.wbProjectCreate({
      name,
      description,
      techStack: [],
      localPath,
      permissionMode: "TRUSTED_WORKSPACE",
    });
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
    await api.wbProjectUpdate({
      projectId,
      name,
      description,
      localPath,
      permissionMode: "TRUSTED_WORKSPACE",
    });
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
  const project = (window.__wbStore?.getState?.().projects || []).find(
    (item) => item.id === projectId
  );
  window.__wbEnterProjectWorkspaceShell?.(project?.name || "");
  window.__wbScheduleMainView?.();
  void window.__wbShowProjectWorkspace?.(projectId);
  if (typeof window.activateRoute === "function") {
    window.activateRoute("project-dev", {
      syncHash: true,
      projectId,
      skipWorkbenchGuard: true,
      skipProjectLoad: false,
    });
  }
}

async function openProjectPath(targetPath, projectId) {
  const api = wbApi();
  const path = String(targetPath || "").trim();
  if (!path && !projectId) {
    return;
  }
  try {
    let result = null;
    if (typeof api.wbProjectOpenPath === "function") {
      result = await api.wbProjectOpenPath({ path: path || undefined, projectId });
    } else if (typeof api.shellOpenPath === "function") {
      result = await api.shellOpenPath(path);
    } else {
      return;
    }
    if (result && result.ok === false) {
      window.alert?.(result.error || "无法打开目录");
    }
  } catch (error) {
    window.alert?.(error?.message || "无法打开目录");
  }
}

function buildProjectListCard(project, store, { compact = false } = {}) {
  const card = document.createElement("div");
  card.className = "wb-list-card wb-list-card--project";
  card.dataset.projectId = project.id;
  const statusLabel = PROJECT_STATUS_LABELS[project.status] || project.status;
  const localPath = String(project.localPath || project.local_path || "").trim();
  const openDirBtn = compact
    ? `<button type="button" class="wb-project-card__open-dir" data-action="open-path" title="打开目录" ${
        localPath ? `data-path="${escapeHtml(localPath)}"` : "disabled"
      }>打开目录</button>`
    : "";
  card.innerHTML = `
    <div class="wb-list-card__surface">
      <div class="wb-project-card__row">
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
          ${openDirBtn}
          <button type="button" class="wb-icon-btn" data-action="edit" title="编辑" aria-label="编辑">✎</button>
          <button type="button" class="wb-icon-btn" data-action="archive" title="归档" aria-label="归档">📦</button>
          <button type="button" class="wb-icon-btn wb-icon-btn--danger" data-action="delete" title="删除" aria-label="删除">🗑</button>
        </div>
      </div>
    </div>
  `;
  const module =
    typeof window.__wbResolveActiveModule === "function"
      ? window.__wbResolveActiveModule(store)
      : store.activeModule || store.mode || "chat";
  card.classList.toggle(
    "is-active",
    module === "project" && project.id === store.selectedProjectId
  );
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
  card.querySelectorAll('[data-action="open-path"]').forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const p = btn.dataset.path || project?.localPath || project?.local_path;
      void openProjectPath(p, projectId);
    });
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
    const card = buildProjectListCard(project, store, { compact });
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
  window.__wbReapplySourceRootCard?.();
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
      newProjectPathManual = true;
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
window.__wbOpenProjectPath = openProjectPath;
window.__wbOpenEditProjectModal = async (projectId) => {
  const store = window.__wbStore?.getState?.() || {};
  const project = (store.projects || []).find((p) => p.id === projectId);
  if (project) {
    await openEditProjectModal(project);
  }
};
window.__wbBindProjectArea = bindProjectArea;
