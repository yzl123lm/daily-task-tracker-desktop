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
  const errEl = document.getElementById("wbNewProjectError");
  try {
    await api.wbProjectCreate({ name, description, techStack });
    document.getElementById("wbNewProjectModal").hidden = true;
    await window.__wbRefreshProjects?.();
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err?.message || "创建失败";
    }
  }
}

function renderProjectList() {
  const list = document.getElementById("jlProjectList");
  const empty = document.getElementById("jlProjectListEmpty");
  if (!list) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const projects = store.projects || [];
  list.querySelectorAll(".wb-project-card").forEach((el) => el.remove());
  if (empty) {
    empty.hidden = projects.length > 0;
  }
  projects.forEach((project) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wb-project-card jl-ai-session-item";
    btn.dataset.projectId = project.id;
    btn.setAttribute("role", "listitem");
    btn.classList.toggle("is-active", project.id === store.selectedProjectId);
    btn.innerHTML = `
      <span class="wb-project-card__name">${escapeHtml(project.name)}</span>
      <span class="wb-project-card__meta">${escapeHtml(project.status || "ACTIVE")}</span>
    `;
    btn.addEventListener("click", () => {
      window.__wbPersistActiveChatSnapshot?.();
      window.__wbStore?.selectProject?.(project.id);
      window.__wbShowProjectWorkspace?.(project.id);
      if (typeof window.activateRoute === "function") {
        window.activateRoute("ai", { syncHash: true, skipWorkbenchGuard: true });
      }
    });
    list.appendChild(btn);
  });
}

function bindProjectArea() {
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
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", renderProjectList);
}

window.__wbRenderProjects = renderProjectList;
window.__wbBindProjectArea = bindProjectArea;
