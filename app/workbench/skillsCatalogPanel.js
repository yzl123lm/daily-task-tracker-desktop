/**
 * UX-006 Skills / Instructions catalog panel
 */
(function () {
  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCtx() {
    const s = window.__wbStore?.getState?.() || {};
    return { projectId: s.selectedProjectId };
  }

  function ensureSkillsCatalogPanel() {
    let panel = document.getElementById("wbSkillsCatalogPanel");
    if (panel) return panel;
    // Place in agent column after async panel
    const asyncPanel = document.getElementById("wbAsyncRunsPanel");
    const parent = asyncPanel?.parentElement;
    if (!parent) return null;
    panel = document.createElement("details");
    panel.id = "wbSkillsCatalogPanel";
    panel.className = "wb-skills-catalog-panel";
    panel.innerHTML = `
      <summary class="wb-skills-catalog-panel__summary">
        <span>指令 &amp; Skills</span>
        <span id="wbSkillsCatalogMeta" class="wb-skills-catalog-panel__meta"></span>
      </summary>
      <div class="wb-skills-catalog-panel__tabs" role="tablist">
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost is-active" data-skills-tab="all">全部</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost" data-skills-tab="project_instruction">项目指令</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost" data-skills-tab="mcp_extension">MCP</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost" data-skills-tab="agent_skill">Skills</button>
        <button type="button" id="wbSkillsCatalogRefreshBtn" class="wb-pws-btn wb-pws-btn--ghost">刷新</button>
      </div>
      <ul id="wbSkillsCatalogList" class="wb-skills-catalog-list scroll-tech"></ul>
      <details class="wb-skills-catalog-preview">
        <summary>注入预览</summary>
        <pre id="wbSkillsCatalogPreview" class="scroll-tech"></pre>
      </details>
    `;
    if (asyncPanel.nextSibling) parent.insertBefore(panel, asyncPanel.nextSibling);
    else parent.appendChild(panel);
    return panel;
  }

  let currentTab = "all";
  let cachedItems = [];

  function renderList() {
    const list = document.getElementById("wbSkillsCatalogList");
    if (!list) return;
    const items =
      currentTab === "all" ? cachedItems : cachedItems.filter((i) => i.kind === currentTab);
    if (!items.length) {
      list.innerHTML = '<li class="wb-skills-catalog-list__empty">暂无条目</li>';
      return;
    }
    list.innerHTML = items
      .map((item) => {
        const trust = escapeHtml(item.trust || "");
        return `<li class="wb-skills-catalog-list__item" data-id="${escapeHtml(item.id)}">
          <label class="wb-skills-catalog-list__row">
            <input type="checkbox" data-catalog-toggle="1" data-id="${escapeHtml(item.id)}" data-path="${escapeHtml(item.path || "")}" data-kind="${escapeHtml(item.kind)}" ${item.enabled ? "checked" : ""} />
            <span class="wb-skills-catalog-list__name">${escapeHtml(item.name)}</span>
            <span class="wb-skills-catalog-list__kind">${escapeHtml(item.kind)}</span>
            <span class="wb-skills-catalog-list__trust">${trust}</span>
          </label>
        </li>`;
      })
      .join("");
  }

  async function refreshSkillsCatalog(projectId) {
    ensureSkillsCatalogPanel();
    const api = window.electronAPI || {};
    const meta = document.getElementById("wbSkillsCatalogMeta");
    const preview = document.getElementById("wbSkillsCatalogPreview");
    if (typeof api.wbInstructionCatalogList !== "function") {
      if (meta) meta.textContent = "不可用";
      return;
    }
    try {
      const catalog = await api.wbInstructionCatalogList({ projectId });
      cachedItems = catalog.items || [];
      if (meta) {
        meta.textContent = `${catalog.counts?.enabled || 0}/${catalog.counts?.total || 0}`;
      }
      renderList();
      if (preview && typeof api.wbInstructionCatalogPreview === "function") {
        const p = await api.wbInstructionCatalogPreview({ projectId });
        preview.textContent = p.text || "(空)";
      }
    } catch (err) {
      if (meta) meta.textContent = "错误";
      const list = document.getElementById("wbSkillsCatalogList");
      if (list) list.innerHTML = `<li class="wb-skills-catalog-list__empty">${escapeHtml(err?.message || "加载失败")}</li>`;
    }
  }

  function bindSkillsCatalogPanel() {
    const panel = ensureSkillsCatalogPanel();
    if (!panel || panel.dataset.bound === "1") return;
    panel.dataset.bound = "1";
    document.getElementById("wbSkillsCatalogRefreshBtn")?.addEventListener("click", () => {
      void refreshSkillsCatalog(getCtx().projectId);
    });
    panel.querySelectorAll("[data-skills-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentTab = btn.dataset.skillsTab || "all";
        panel.querySelectorAll("[data-skills-tab]").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        renderList();
      });
    });
    panel.addEventListener("change", (ev) => {
      const input = ev.target?.closest?.("[data-catalog-toggle]");
      if (!input) return;
      const api = window.electronAPI || {};
      void (async () => {
        try {
          await api.wbInstructionCatalogSetEnabled({
            id: input.dataset.id,
            path: input.dataset.path,
            kind: input.dataset.kind,
            enabled: input.checked,
          });
          await refreshSkillsCatalog(getCtx().projectId);
        } catch (err) {
          input.checked = !input.checked;
          window.__wbShowComposerToast?.(err?.message || "保存失败", { type: "error" });
        }
      })();
    });
  }

  window.__wbEnsureSkillsCatalogPanel = ensureSkillsCatalogPanel;
  window.__wbBindSkillsCatalogPanel = bindSkillsCatalogPanel;
  window.__wbRefreshSkillsCatalog = refreshSkillsCatalog;
})();
