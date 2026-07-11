const TABS = [
  { id: "code", label: "代码" },
  { id: "diff", label: "Diff 审阅" },
  { id: "test", label: "测试" },
  { id: "git", label: "Git 变更" },
];

const TAB_STORAGE_KEY = "wb_pws_code_tab_v1";

function getPanels() {
  return {
    code: document.getElementById("wbCodePanel"),
    diff: document.getElementById("wbDiffReviewPanel"),
    test: document.getElementById("wbTestResultPanel"),
    git: document.getElementById("wbGitChangePanel"),
  };
}

function loadActiveTab() {
  try {
    return localStorage.getItem(TAB_STORAGE_KEY) || "code";
  } catch {
    return "code";
  }
}

function saveActiveTab(tabId) {
  try {
    localStorage.setItem(TAB_STORAGE_KEY, tabId);
  } catch {
    /* ignore */
  }
}

function ensureTabBar() {
  const mount = document.getElementById("wbPwsCodeMount");
  if (!mount) {
    return null;
  }
  let bar = document.getElementById("wbPwsCodeTabs");
  if (bar) {
    return bar;
  }
  bar = document.createElement("nav");
  bar.id = "wbPwsCodeTabs";
  bar.className = "wb-pws-code-tabs";
  bar.setAttribute("role", "tablist");
  bar.setAttribute("aria-label", "代码工作区");
  bar.innerHTML = TABS.map(
    (t) =>
      `<button type="button" class="wb-pws-code-tab" role="tab" data-tab="${t.id}" aria-selected="false">${t.label}</button>`
  ).join("");
  mount.insertBefore(bar, mount.firstChild);
  return bar;
}

function refreshDiffTabBadge() {
  const btn = document.querySelector('#wbPwsCodeTabs .wb-pws-code-tab[data-tab="diff"]');
  if (!btn) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const projectId = store.selectedProjectId;
  const taskId =
    store.selectedTaskId ||
    document.getElementById("wbTaskList")?.dataset?.selectedTaskId ||
    null;
  const changes =
    projectId && taskId
      ? window.__wbCodeReviewStore?.getChanges?.(projectId, taskId) || []
      : [];
  const pending = changes.filter(
    (c) => c.reviewStatus === "pending" || c.reviewStatus === "revision"
  ).length;
  btn.textContent = pending > 0 ? `Diff 审阅 ${pending}` : changes.length ? `Diff 审阅 ${changes.length}` : "Diff 审阅";
}

function switchTab(tabId, { persist = true, loadDiff = true } = {}) {
  const valid = TABS.some((t) => t.id === tabId);
  const active = valid ? tabId : "code";
  const panels = getPanels();
  const bar = document.getElementById("wbPwsCodeTabs");
  bar?.querySelectorAll(".wb-pws-code-tab").forEach((btn) => {
    const on = btn.dataset.tab === active;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  Object.entries(panels).forEach(([id, el]) => {
    if (!el) {
      return;
    }
    el.hidden = id !== active;
  });
  if (persist) {
    saveActiveTab(active);
  }
  refreshDiffTabBadge();
  if (active === "diff" && loadDiff) {
    if (typeof window.__wbOpenDiffReviewForCurrentTask === "function") {
      void window.__wbOpenDiffReviewForCurrentTask({ forceReload: true });
    } else {
      window.__wbRenderDiffReviewPanel?.();
    }
  }
}

function bindCodeWorkspaceTabs() {
  const bar = ensureTabBar();
  if (!bar || bar.dataset.bound === "1") {
    switchTab(loadActiveTab(), { persist: false, loadDiff: loadActiveTab() === "diff" });
    return;
  }
  bar.dataset.bound = "1";
  bar.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".wb-pws-code-tab");
    if (!btn?.dataset?.tab) {
      return;
    }
    switchTab(btn.dataset.tab, { loadDiff: btn.dataset.tab === "diff" });
    if (btn.dataset.tab === "test") {
      window.__wbRenderTestResultPanel?.();
    }
    if (btn.dataset.tab === "git") {
      void window.__wbRefreshGitChangePanel?.();
    }
  });
  switchTab(loadActiveTab(), { persist: false, loadDiff: loadActiveTab() === "diff" });
}

window.__wbBindCodeWorkspaceTabs = bindCodeWorkspaceTabs;
window.__wbSwitchCodeTab = switchTab;
window.__wbRefreshDiffTabBadge = refreshDiffTabBadge;
