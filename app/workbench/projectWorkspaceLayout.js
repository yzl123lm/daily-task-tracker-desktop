const WB_PWS_LAYOUT_VERSION = "29";

const WB_PWS_PROJECT_COL_HTML = `
    <aside class="wb-pws-project-col wb-pws-sidebar" id="wbPwsProjectCol" aria-label="项目上下文" hidden>
      <nav class="wb-pws-sidebar-tabs" id="wbPwsSidebarTabs" role="tablist" aria-label="侧栏模块">
        <button type="button" class="wb-pws-sidebar-tab is-active" data-tab="tasks" role="tab" aria-selected="true">任务</button>
        <button type="button" class="wb-pws-sidebar-tab" data-tab="files" role="tab" aria-selected="false">文件</button>
        <button type="button" class="wb-pws-sidebar-tab" data-tab="search" role="tab" aria-selected="false">搜索</button>
        <button type="button" class="wb-pws-sidebar-tab" data-tab="git" role="tab" aria-selected="false">Git</button>
      </nav>
      <div class="wb-pws-sidebar-body" id="wbPwsSidebarBody">
        <div class="wb-pws-sidebar-pane is-active" data-pane="tasks" role="tabpanel">
          <div class="wb-pws-project-col__head">
            <h3>项目与任务</h3>
            <div class="wb-pws-project-col__head-actions">
              <button type="button" id="wbNewTaskBtn" class="wb-pws-btn wb-pws-btn--ghost" title="新建任务">新建任务</button>
              <button type="button" id="wbPwsProjectNewBtn" class="wb-pws-btn wb-pws-btn--ghost wb-pws-icon-btn" title="新建项目" aria-label="新建项目">+</button>
            </div>
          </div>
          <div class="wb-pws-project-switcher">
            <div id="wbPwsProjectList" class="wb-pws-project-list scroll-tech" role="list" aria-label="项目列表"></div>
          </div>
          <div class="wb-pws-task-filters" id="wbPwsTaskFilters" role="tablist" aria-label="任务筛选">
            <button type="button" class="wb-pws-task-filter is-active" data-filter="all">全部</button>
            <button type="button" class="wb-pws-task-filter" data-filter="active">进行中</button>
            <button type="button" class="wb-pws-task-filter" data-filter="waiting">等待审批</button>
            <button type="button" class="wb-pws-task-filter" data-filter="done">已完成</button>
            <button type="button" class="wb-pws-task-filter" data-filter="failed">失败</button>
          </div>
          <div class="wb-pws-project-list-wrap">
            <div id="wbTaskList" class="wb-task-list wb-pws-task-list" role="list"></div>
          </div>
          <section class="wb-pws-project-col__sessions" aria-label="会话记录">
            <header class="wb-pws-project-col__sessions-head">
              <h4>会话记录</h4>
              <button type="button" id="wbPwsSessionNewBtn" class="wb-pws-btn wb-pws-btn--ghost wb-pws-icon-btn" title="新建对话" aria-label="新建对话">+</button>
            </header>
            <div id="wbPwsSessionList" class="wb-pws-session-list scroll-tech" role="list"></div>
          </section>
        </div>
        <div class="wb-pws-sidebar-pane" data-pane="files" role="tabpanel" hidden>
          <div id="wbPwsFileTreeMount" class="wb-pws-file-tree-mount"></div>
        </div>
        <div class="wb-pws-sidebar-pane" data-pane="search" role="tabpanel" hidden>
          <div id="wbPwsSearchMount" class="wb-pws-search-mount"></div>
        </div>
        <div class="wb-pws-sidebar-pane" data-pane="git" role="tabpanel" hidden>
          <div id="wbPwsSidebarGitMount" class="wb-pws-sidebar-git-mount"></div>
        </div>
      </div>
    </aside>
`;

const WB_PWS_LAYOUT_HTML = `
  <div class="wb-pws-layout wb-ai-workbench-layout wb-pws-layout--cursor-main" data-terminal-collapsed="1" data-code-drawer="0">
    <header class="wb-pws-topbar wb-pws-status-bar wb-pws-mobile-toolbar" id="wbPwsTopbar" aria-label="移动端工具栏">
      <button type="button" id="wbPwsOpenProjectDrawer" class="wb-pws-btn wb-pws-btn--ghost" title="项目与任务">项目</button>
      <span class="wb-pws-mobile-toolbar__spacer"></span>
      <button type="button" id="wbPwsOpenCodeDrawer" class="wb-pws-btn wb-pws-btn--ghost" title="代码与 Diff">代码</button>
      <button type="button" id="wbNewTaskBtnMobile" class="wb-pws-btn wb-pws-btn--primary">新建任务</button>
    </header>
    <div class="wb-pws-sr-only" aria-hidden="true">
      <span id="wbProjectWorkspaceTitle"></span>
      <span id="wbPwsModePill"></span>
      <span id="wbProjectWorkspaceNs"></span>
      <div id="wbPwsProjectCard"></div>
      <button type="button" id="wbPwsLayoutResetBtn" tabindex="-1"></button>
      <button type="button" id="wbCompressBtn" tabindex="-1"></button>
    </div>
    <section class="wb-pws-agent-col wb-pws-assistant-col wb-agent-run-view" id="wbPwsAgentCol" aria-label="AI 助手">
      <header class="wb-pws-agent-header wb-agent-run-header">
        <div id="wbTaskDetail" class="wb-pws-agent-header__task wb-agent-run-header__task" hidden>
          <div class="wb-agent-run-header__top">
            <h4 id="wbAgentRunTitle" class="wb-agent-run-header__title">当前任务</h4>
            <span id="wbAgentRunMode" class="wb-agent-run-header__mode" hidden></span>
          </div>
          <p id="wbAgentRunStatus" class="wb-agent-run-header__status" hidden></p>
          <p id="wbTaskDetailDesc" class="wb-pws-user-card__desc wb-agent-run-header__desc"></p>
          <p id="wbTaskDetailStep" class="wb-pws-user-card__step" hidden></p>
        </div>
        <p id="wbPwsAgentEmpty" class="wb-pws-agent-empty">描述开发需求并开始执行；过程将以 Cursor 式执行流展示。</p>
        <div class="wb-pws-agent-header__tools">
          <button type="button" id="wbPwsOpenCodeDrawerDesktop" class="wb-pws-btn wb-pws-btn--ghost" title="打开代码 / Diff">代码 / Diff</button>
        </div>
      </header>
      <div class="wb-pws-agent-scroll wb-agent-activity-scroll">
        <div class="wb-agent-activity-panel" aria-label="Agent 执行流">
          <header class="wb-agent-activity-panel__head">
            <h3>执行流</h3>
            <button type="button" id="wbActivityOpenLogBtn" class="wb-pws-btn wb-pws-btn--ghost" title="打开执行日志">日志</button>
          </header>
          <div id="wbAgentActivityFeed" class="wb-agent-activity-feed" role="log" aria-live="polite"></div>
          <!-- 兼容旧 Timeline 挂载点：隐藏但保留 ID，供历史逻辑写入 -->
          <ol id="wbAgentRuns" class="wb-pws-timeline wb-agent-runs-legacy" hidden aria-hidden="true"></ol>
        </div>
        <div id="wbPwsApprovalMount" class="wb-pws-approval-mount"></div>
        <div id="wbPlanCard" class="wb-plan-card wb-pws-plan-card" hidden aria-hidden="true"></div>
        <details id="wbAsyncRunsPanel" class="wb-async-runs-panel wb-pws-aux-panel" hidden>
          <summary class="wb-async-runs-panel__summary">
            <span class="wb-async-runs-panel__summary-title">异步任务中心</span>
            <span id="wbAsyncCenterMeta" class="wb-async-runs-panel__meta"></span>
          </summary>
          <div class="wb-async-center__toolbar">
            <select id="wbAsyncFilterStatus" class="wb-pws-template-select" aria-label="状态筛选">
              <option value="">全部状态</option>
              <option value="RUNNING">运行中</option>
              <option value="PAUSED">已暂停</option>
              <option value="COMPLETED">已完成</option>
              <option value="FAILED">失败</option>
              <option value="CANCELED">已取消</option>
              <option value="BUDGET_EXCEEDED">超预算</option>
            </select>
            <button type="button" id="wbAsyncRunsRefreshBtn" class="wb-pws-btn wb-pws-btn--ghost">刷新</button>
            <button type="button" id="wbAsyncEnqueueBtn" class="wb-pws-btn wb-pws-btn--ghost">后台运行当前指令</button>
          </div>
          <ul id="wbAsyncRunsList" class="wb-async-runs-list scroll-tech"></ul>
        </details>
        <details id="wbSkillsCatalogPanel" class="wb-skills-catalog-panel wb-pws-aux-panel" hidden>
          <summary class="wb-skills-catalog-panel__summary">
            <span class="wb-skills-catalog-panel__summary-title">指令 &amp; Skills</span>
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
        </details>
        <!-- 任务上下文记忆 / 压缩快照：仅后台记录，不在 Agent 列展示 -->
        <details class="wb-pws-panel wb-pws-panel--context" hidden aria-hidden="true">
          <summary>任务上下文记忆</summary>
          <ul id="wbTaskMemories" class="wb-task-memories"></ul>
        </details>
        <details class="wb-pws-panel wb-pws-panel--snapshots" hidden aria-hidden="true">
          <summary>压缩快照历史</summary>
          <div id="wbSnapshotHistory" class="wb-snapshot-history-panel"></div>
        </details>
      </div>
      <div class="wb-pws-agent-composer wb-ai-command wb-agent-run-actions">
        <div class="wb-ai-command__shell">
          <div class="wb-ai-command__surface">
            <textarea id="wbAgentInput" class="wb-pws-composer__input wb-ai-command__input" rows="3" placeholder="描述你希望 AI 完成的开发任务，例如：开发一个贪吃蛇小游戏"></textarea>
            <div class="wb-ai-command__toolbar">
              <div class="wb-ai-command__toolbar-start">
                <div class="wb-agent-mode-module" id="wbAgentModeModule">
                  <select id="wbComposerAgentMode" class="wb-pws-template-select wb-ai-command__mode-select" aria-label="Agent 模式"></select>
                </div>
                <button type="button" id="wbImportRequirementBtn" class="wb-pws-btn wb-pws-btn--ghost wb-ai-command__upload" hidden title="上传外部需求文档">上传需求文档</button>
              </div>
              <div class="wb-ai-command__toolbar-end">
                <label class="wb-auto-verify-switch wb-pws-auto-verify" for="wbAutoVerifyAfterWrite" hidden aria-hidden="true">
                  <input type="checkbox" id="wbAutoVerifyAfterWrite" checked />
                  自动验证
                </label>
                <button type="button" id="wbSecondaryActionBtn" class="wb-pws-btn wb-pws-btn--ghost" hidden>调整需求</button>
                <button type="button" id="wbPrimaryActionBtn" class="wb-pws-btn wb-pws-btn--primary">开始执行</button>
                <button type="button" id="wbMoreActionsBtn" class="wb-pws-btn wb-pws-btn--ghost wb-ai-command__more" aria-label="更多操作" title="更多操作" aria-haspopup="menu" aria-expanded="false">⋯</button>
              </div>
            </div>
          </div>
          <div id="wbComposerMoreMenu" class="wb-composer-more-menu" hidden role="menu" aria-label="更多操作">
            <button type="button" data-wb-more-action="regen-plan">重新生成方案</button>
            <button type="button" data-wb-more-action="regen-patch">重新生成变更</button>
            <button type="button" data-wb-more-action="open-log">查看执行日志</button>
            <button type="button" data-wb-more-action="open-tools">查看工具记录</button>
            <button type="button" data-wb-more-action="new-task">新建任务</button>
            <button type="button" data-wb-more-action="reset-layout">重置布局</button>
            <button type="button" data-wb-more-action="manual-compress">手动压缩</button>
            <button type="button" data-wb-more-action="open-path">打开项目路径</button>
            <button type="button" data-wb-more-action="open-game">打开游戏</button>
            <button type="button" data-wb-more-action="skip-verify">跳过验证</button>
            <button type="button" data-wb-more-action="continue-verify">继续验证</button>
            <button type="button" data-wb-more-action="edit-path">编辑项目路径</button>
            <button type="button" data-wb-more-action="parallel-merge">并行合并面板</button>
            <button type="button" data-wb-more-action="skills-catalog">指令 &amp; Skills</button>
            <button type="button" data-wb-more-action="complete">标记完成</button>
            <button type="button" data-wb-more-action="cancel">取消任务</button>
          </div>
          <button type="button" id="wbProjectContextHealth" class="wb-ctx-health-mount" hidden aria-hidden="true" title="上下文健康度"></button>
          <select id="wbPwsSceneTemplate" class="wb-pws-template-select" hidden aria-hidden="true" tabindex="-1"></select>
          <p id="wbComposerPathHint" class="wb-composer-path-hint" hidden></p>
          <p id="wbComposerError" class="wb-composer-error" role="alert" hidden></p>
          <div id="wbComposerToast" class="wb-composer-toast" role="status" hidden></div>
        </div>
        <div class="wb-ai-command__legacy-actions" hidden aria-hidden="true">
          <button type="button" id="wbAgentRunBtn"></button>
          <button type="button" id="wbTaskConfirmBtn"></button>
          <button type="button" id="wbAgentCancelBtn"></button>
        </div>
      </div>
    </section>
    <section class="wb-pws-code-col wb-pws-main-col main-workspace" id="wbPwsCodeCol" aria-label="代码工作区" hidden>
      <header class="wb-pws-code-col__drawer-head" id="wbPwsCodeDrawerHead">
        <h3>代码 / Diff</h3>
        <button type="button" id="wbPwsCodeDrawerClose" class="wb-pws-btn wb-pws-btn--ghost">关闭</button>
      </header>
      <div class="wb-pws-code-body main-editor-body" id="wbPwsCodeMount"></div>
    </section>
    <div id="wbPwsDrawerBackdrop" class="wb-pws-drawer-backdrop" hidden aria-hidden="true"></div>
    <footer class="wb-pws-terminal-drawer" id="wbPwsTerminalDrawer" data-collapsed="1">
      <header class="wb-pws-terminal-drawer__head">
        <div class="wb-pws-terminal-drawer__tabs" role="tablist">
          <button type="button" class="wb-pws-terminal-tab is-active" data-tab="log" role="tab">执行日志</button>
          <button type="button" class="wb-pws-terminal-tab" data-tab="shell" role="tab">终端</button>
          <button type="button" class="wb-pws-terminal-tab" data-tab="test" role="tab">测试</button>
          <button type="button" class="wb-pws-terminal-tab" data-tab="tools" role="tab">工具记录</button>
        </div>
        <button type="button" id="wbPwsTerminalToggle" class="wb-pws-btn wb-pws-btn--ghost" aria-expanded="false">展开</button>
      </header>
      <div class="wb-pws-terminal-drawer__body">
        <pre id="wbAgentOutput" class="wb-pws-terminal-pane is-active" data-pane="log" hidden></pre>
        <pre id="wbPwsTerminalShell" class="wb-pws-terminal-pane" data-pane="shell">终端输出将在此显示（运行受控 Shell 后同步）。</pre>
        <pre id="wbPwsTerminalTest" class="wb-pws-terminal-pane" data-pane="test">测试输出将在此显示。</pre>
        <div id="wbPwsTerminalToolsMount" class="wb-pws-terminal-pane" data-pane="tools">
          <p class="wb-pws-terminal-tools-placeholder">工具记录与写入备份将在此显示。</p>
        </div>
      </div>
    </footer>
  </div>
`;

const WB_SIDEBAR_TAB_KEY = "wb_pws_sidebar_tab_v1";

function loadSidebarTab() {
  try {
    const saved = localStorage.getItem(WB_SIDEBAR_TAB_KEY);
    if (saved === "tasks" || saved === "files" || saved === "search" || saved === "git") {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return "tasks";
}

function saveSidebarTab(tabId) {
  try {
    localStorage.setItem(WB_SIDEBAR_TAB_KEY, tabId);
  } catch {
    /* ignore */
  }
}

function switchSidebarTab(tabId, { persist = true } = {}) {
  const tabs = document.getElementById("wbPwsSidebarTabs");
  const body = document.getElementById("wbPwsSidebarBody");
  if (!tabs || !body) {
    return;
  }
  const valid = ["tasks", "files", "search", "git"];
  const active = valid.includes(tabId) ? tabId : "tasks";
  tabs.querySelectorAll(".wb-pws-sidebar-tab").forEach((btn) => {
    const on = btn.dataset.tab === active;
    btn.classList.toggle("is-active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });
  body.querySelectorAll(".wb-pws-sidebar-pane").forEach((pane) => {
    const on = pane.dataset.pane === active;
    pane.classList.toggle("is-active", on);
    pane.hidden = !on;
    pane.setAttribute("aria-hidden", on ? "false" : "true");
  });
  if (persist) {
    saveSidebarTab(active);
  }
  if (active === "files") {
    const projectId = window.__wbStore?.getState?.().selectedProjectId;
    if (projectId) {
      void window.__wbRefreshFileTree?.(projectId);
    }
  }
  if (active === "git") {
    void window.__wbRefreshGitChangePanel?.();
  }
}

function bindSidebarTabs() {
  const tabs = document.getElementById("wbPwsSidebarTabs");
  if (!tabs || tabs.dataset.bound === "1") {
    switchSidebarTab(loadSidebarTab(), { persist: false });
    return;
  }
  tabs.dataset.bound = "1";
  tabs.addEventListener("click", (ev) => {
    const btn = ev.target.closest(".wb-pws-sidebar-tab");
    if (!btn?.dataset?.tab) {
      return;
    }
    switchSidebarTab(btn.dataset.tab);
  });
  switchSidebarTab(loadSidebarTab(), { persist: false });
}

function ensureProjectColInSidebar() {
  const split = document.getElementById("jlWorkbenchSplit");
  if (!split) {
    return null;
  }
  let col = document.getElementById("wbPwsProjectCol");
  if (!col) {
    const holder = document.createElement("div");
    holder.innerHTML = WB_PWS_PROJECT_COL_HTML.trim();
    col = holder.firstElementChild;
    if (!col) {
      return null;
    }
    split.appendChild(col);
  } else if (col.parentElement !== split) {
    split.appendChild(col);
  }
  if (col && !document.body.classList.contains("wb-pws-sidebar-mounted")) {
    col.hidden = true;
    col.setAttribute("hidden", "");
  }
  return col;
}

function ensureProjectWorkspaceLayout() {
  const panelAi = document.getElementById("panel-ai");
  if (!panelAi) {
    return null;
  }
  let root = document.getElementById("wbProjectWorkspace");
  if (root && root.dataset.layoutVersion !== WB_PWS_LAYOUT_VERSION) {
    const existingCol = document.getElementById("wbPwsProjectCol");
    root.remove();
    root = null;
    if (existingCol) {
      existingCol.remove();
    }
  }
  if (root) {
    ensureProjectColInSidebar();
    window.__wbEnsureSourceRootCard?.();
    bindSidebarTabs();
    return root;
  }
  root = document.createElement("div");
  root.id = "wbProjectWorkspace";
  root.className = "wb-project-workspace wb-project-workspace--codex";
  root.dataset.layoutVersion = WB_PWS_LAYOUT_VERSION;
  root.hidden = true;
  root.innerHTML = WB_PWS_LAYOUT_HTML;
  panelAi.appendChild(root);
  ensureProjectColInSidebar();
  window.__wbEnsureSourceRootCard?.();
  bindSidebarTabs();
  return root;
}

function setDrawerState(kind, open) {
  const cls =
    kind === "project" ? "wb-project-drawer-open" : "wb-code-drawer-open";
  document.body.classList.toggle(cls, Boolean(open));
  const layout = document.querySelector(".wb-pws-layout");
  const codeCol = document.getElementById("wbPwsCodeCol");
  if (kind === "code") {
    if (layout) {
      layout.dataset.codeDrawer = open ? "1" : "0";
    }
    if (codeCol) {
      codeCol.hidden = !open;
      codeCol.setAttribute("aria-hidden", open ? "false" : "true");
    }
  }
  const backdrop = document.getElementById("wbPwsDrawerBackdrop");
  if (backdrop) {
    const anyOpen =
      document.body.classList.contains("wb-project-drawer-open") ||
      document.body.classList.contains("wb-code-drawer-open");
    backdrop.hidden = !anyOpen;
    backdrop.setAttribute("aria-hidden", anyOpen ? "false" : "true");
  }
}

function openCodeDrawer(tab = "diff", { loadDiff } = {}) {
  setDrawerState("code", true);
  if (tab) {
    const shouldLoadDiff = loadDiff !== undefined ? Boolean(loadDiff) : tab === "diff";
    window.__wbSwitchCodeTab?.(tab, { loadDiff: shouldLoadDiff });
  }
}

function closeCodeDrawer() {
  setDrawerState("code", false);
}

function bindPwsDrawers() {
  const openers = [
    document.getElementById("wbPwsOpenCodeDrawer"),
    document.getElementById("wbPwsOpenCodeDrawerDesktop"),
  ].filter(Boolean);
  const closeCode = document.getElementById("wbPwsCodeDrawerClose");
  const openProject = document.getElementById("wbPwsOpenProjectDrawer");
  const backdrop = document.getElementById("wbPwsDrawerBackdrop");
  for (const openCode of openers) {
    if (openCode.dataset.bound === "1") continue;
    openCode.dataset.bound = "1";
    openCode.addEventListener("click", () => openCodeDrawer("diff"));
  }
  if (closeCode && closeCode.dataset.bound !== "1") {
    closeCode.dataset.bound = "1";
    closeCode.addEventListener("click", () => closeCodeDrawer());
  }
  if (openProject && openProject.dataset.bound !== "1") {
    openProject.dataset.bound = "1";
    openProject.addEventListener("click", () => setDrawerState("project", true));
  }
  if (backdrop && backdrop.dataset.bound !== "1") {
    backdrop.dataset.bound = "1";
    backdrop.addEventListener("click", () => {
      setDrawerState("project", false);
      setDrawerState("code", false);
    });
  }
  // Cursor 单主区：默认收起代码抽屉
  setDrawerState("code", false);
}

function bindTerminalDrawer() {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  const layout = document.querySelector(".wb-pws-layout");
  const toggle = document.getElementById("wbPwsTerminalToggle");
  if (!drawer || drawer.dataset.bound === "1") {
    return;
  }
  drawer.dataset.bound = "1";
  const setCollapsed = (collapsed) => {
    drawer.dataset.collapsed = collapsed ? "1" : "0";
    if (layout) {
      layout.dataset.terminalCollapsed = collapsed ? "1" : "0";
    }
    drawer.classList.toggle("is-collapsed", collapsed);
    if (toggle) {
      toggle.textContent = collapsed ? "展开" : "收起";
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    }
  };
  setCollapsed(drawer.dataset.collapsed !== "0");
  toggle?.addEventListener("click", () => {
    setCollapsed(drawer.dataset.collapsed !== "1");
  });
  drawer.querySelectorAll(".wb-pws-terminal-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      drawer.querySelectorAll(".wb-pws-terminal-tab").forEach((t) => {
        t.classList.toggle("is-active", t === tab);
      });
      drawer.querySelectorAll(".wb-pws-terminal-pane").forEach((pane) => {
        pane.classList.toggle("is-active", pane.dataset.pane === name);
      });
      setCollapsed(false);
    });
  });
}

function syncTerminalDrawerFromPanels() {
  const shellSrc = document.getElementById("wbShellOutput");
  const testSrc = document.getElementById("wbTestOutput");
  const shellDst = document.getElementById("wbPwsTerminalShell");
  const testDst = document.getElementById("wbPwsTerminalTest");
  if (shellSrc && shellDst) {
    shellDst.textContent = shellSrc.textContent || "暂无终端输出。";
  }
  if (testSrc && testDst) {
    testDst.textContent = testSrc.textContent || "暂无测试输出。";
  }
}

function expandTerminalDrawer(tab = "log") {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  const layout = document.querySelector(".wb-pws-layout");
  if (!drawer) {
    return;
  }
  drawer.dataset.collapsed = "0";
  drawer.classList.remove("is-collapsed");
  if (layout) {
    layout.dataset.terminalCollapsed = "0";
  }
  const toggle = document.getElementById("wbPwsTerminalToggle");
  if (toggle) {
    toggle.textContent = "收起";
    toggle.setAttribute("aria-expanded", "true");
  }
  const tabBtn = drawer.querySelector(`.wb-pws-terminal-tab[data-tab="${tab}"]`);
  tabBtn?.click();
}

function syncPwsSidebarMount(active) {
  const col = ensureProjectColInSidebar();
  const chatPanel = document.getElementById("jlWorkbenchSidePanel");
  if (!col) {
    return;
  }
  document.body.classList.toggle("wb-pws-sidebar-mounted", Boolean(active));
  window.__wbApplyPwsLayoutPrefs?.();
  if (active) {
    col.hidden = false;
    col.removeAttribute("hidden");
    if (chatPanel) {
      chatPanel.hidden = true;
      chatPanel.setAttribute("hidden", "");
      chatPanel.setAttribute("aria-hidden", "true");
    }
    return;
  }
  col.hidden = true;
  col.setAttribute("hidden", "");
  if (chatPanel) {
    chatPanel.hidden = false;
    chatPanel.removeAttribute("hidden");
    chatPanel.setAttribute("aria-hidden", "false");
  }
}

function syncProjectTopChrome(active, projectName = "") {
  const chrome = document.getElementById("jlPwsGlobalChrome");
  const label = document.getElementById("jlPwsGlobalWorkspaceLabel");
  const topStatus = document.getElementById("jlTopStatus");
  const trailing = document.getElementById("jlTitlebarTrailing");
  document.body.classList.toggle("jl-pws-top-chrome-active", Boolean(active));
  if (chrome) {
    chrome.hidden = !active;
    chrome.setAttribute("aria-hidden", active ? "false" : "true");
  }
  if (label) {
    const name = String(projectName || "").trim();
    label.textContent = name ? `项目工作区 - ${name}` : "项目工作区";
  }
  if (topStatus && active) {
    topStatus.hidden = false;
    topStatus.removeAttribute("hidden");
    topStatus.setAttribute("aria-hidden", "false");
  }
  if (trailing && active) {
    trailing.hidden = false;
    trailing.removeAttribute("hidden");
  }
}

window.__wbEnsureProjectWorkspaceLayout = ensureProjectWorkspaceLayout;
window.__wbSyncPwsSidebarMount = syncPwsSidebarMount;
window.__wbSyncProjectTopChrome = syncProjectTopChrome;
window.__wbBindTerminalDrawer = bindTerminalDrawer;
window.__wbBindPwsDrawers = bindPwsDrawers;
window.__wbSyncTerminalDrawer = syncTerminalDrawerFromPanels;
window.__wbExpandTerminalDrawer = expandTerminalDrawer;
window.__wbSwitchSidebarTab = switchSidebarTab;
window.__wbOpenCodeDrawer = openCodeDrawer;
window.__wbCloseCodeDrawer = closeCodeDrawer;
window.__wbSetCodeDrawerOpen = (open) => setDrawerState("code", Boolean(open));
window.__wbClosePwsDrawers = () => {
  setDrawerState("project", false);
  setDrawerState("code", false);
};
