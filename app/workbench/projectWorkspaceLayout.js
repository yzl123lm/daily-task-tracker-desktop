const WB_PWS_LAYOUT_VERSION = "5";

const WB_PWS_LAYOUT_HTML = `
  <div class="wb-pws-layout" data-terminal-collapsed="1">
    <header class="wb-pws-topbar wb-pws-status-bar" id="wbPwsTopbar">
      <div class="wb-pws-status-bar__left">
        <button type="button" id="wbPwsOpenProjectDrawer" class="wb-pws-btn wb-pws-btn--ghost wb-pws-mobile-only" title="项目与任务">项目</button>
        <span class="wb-pws-status-bar__badge">项目开发</span>
        <h2 id="wbProjectWorkspaceTitle" class="wb-pws-status-bar__title">项目工作区</h2>
        <span id="wbPwsModePill" class="wb-pws-status-bar__mode">PLAN_ONLY</span>
      </div>
      <div class="wb-pws-status-bar__meta">
        <span id="wbProjectWorkspaceNs" class="wb-pws-status-bar__ns"></span>
        <div id="wbProjectContextHealth" class="wb-pws-status-bar__health"></div>
      </div>
      <div class="wb-pws-status-bar__actions">
        <div class="wb-pws-status-bar__layout-actions">
          <button type="button" id="wbPwsLayoutResetBtn" class="wb-pws-btn wb-pws-btn--ghost wb-pws-layout-reset" title="恢复默认栏宽与终端高度">重置布局</button>
        </div>
        <button type="button" id="wbCompressBtn" class="wb-pws-btn wb-pws-btn--ghost">手动压缩</button>
        <button type="button" id="wbNewTaskBtn" class="wb-pws-btn wb-pws-btn--primary">新建任务</button>
      </div>
    </header>
    <aside class="wb-pws-project-col" id="wbPwsProjectCol" aria-label="项目与任务">
      <div class="wb-pws-project-col__head">
        <h3>项目与任务</h3>
        <button type="button" id="wbPwsProjectNewBtn" class="wb-pws-btn wb-pws-btn--ghost wb-pws-icon-btn" title="新建项目" aria-label="新建项目">+</button>
      </div>
      <div class="wb-pws-project-switcher">
        <div id="wbPwsProjectList" class="wb-pws-project-list scroll-tech" role="list" aria-label="项目列表"></div>
      </div>
      <div id="wbPwsProjectCard" class="wb-pws-project-card">
        <p class="wb-pws-project-card__placeholder">选择项目后显示详情</p>
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
      <div class="wb-pws-project-col__foot">
        <button type="button" id="wbPwsBackToChat" class="wb-pws-btn wb-pws-btn--ghost">返回会话区</button>
        <button type="button" id="wbPwsOpenProjectDir" class="wb-pws-btn wb-pws-btn--ghost" hidden>打开目录</button>
      </div>
    </aside>
    <section class="wb-pws-agent-col" id="wbPwsAgentCol" aria-label="Agent 执行区">
      <header class="wb-pws-agent-header">
        <div id="wbTaskDetail" class="wb-pws-agent-header__task" hidden>
          <h4 class="wb-pws-user-card__title">当前任务</h4>
          <p id="wbTaskDetailDesc" class="wb-pws-user-card__desc"></p>
          <p id="wbTaskDetailStep" class="wb-pws-user-card__step"></p>
        </div>
        <p id="wbPwsAgentEmpty" class="wb-pws-agent-empty">暂无任务，请在左侧创建或选择任务。</p>
      </header>
      <div class="wb-pws-agent-scroll">
        <div class="wb-pws-panel wb-pws-panel--timeline">
          <header class="wb-pws-panel__head">
            <h3>Agent 执行 Timeline</h3>
          </header>
          <ol id="wbAgentRuns" class="wb-pws-timeline" role="list"></ol>
        </div>
        <div id="wbPwsApprovalMount" class="wb-pws-approval-mount"></div>
        <div id="wbPlanCard" class="wb-plan-card wb-pws-plan-card" hidden></div>
        <details class="wb-pws-panel wb-pws-panel--context">
          <summary>任务上下文记忆</summary>
          <ul id="wbTaskMemories" class="wb-task-memories"></ul>
        </details>
        <details class="wb-pws-panel wb-pws-panel--snapshots">
          <summary>压缩快照历史</summary>
          <div id="wbSnapshotHistory" class="wb-snapshot-history-panel"></div>
        </details>
      </div>
      <div class="wb-pws-agent-composer">
        <header class="wb-pws-panel__head">
          <h3>任务描述 / 追问</h3>
          <select id="wbPwsSceneTemplate" class="wb-pws-template-select" aria-label="场景模板"></select>
        </header>
        <p id="wbPwsTemplateHint" class="wb-pws-template-hint" hidden></p>
        <textarea id="wbAgentInput" class="wb-pws-composer__input" rows="3" placeholder="描述开发需求，生成 PLAN_ONLY 方案…"></textarea>
        <div class="wb-pws-composer__actions">
          <button type="button" id="wbPwsOpenCodeDrawer" class="wb-pws-btn wb-pws-btn--ghost wb-pws-mobile-only">查看代码变更</button>
          <button type="button" id="wbAgentRunBtn" class="wb-pws-btn wb-pws-btn--primary">生成开发方案</button>
          <button type="button" id="wbTaskConfirmBtn" class="wb-pws-btn wb-pws-btn--ghost" hidden>确认方案</button>
        </div>
      </div>
    </section>
    <div id="wbPwsDrawerBackdrop" class="wb-pws-drawer-backdrop" hidden aria-hidden="true"></div>
    <section class="wb-pws-code-col" id="wbPwsCodeCol" aria-label="代码审查区">
      <header class="wb-pws-code-col__drawer-head wb-pws-mobile-only" id="wbPwsCodeDrawerHead">
        <h3>代码变更</h3>
        <button type="button" id="wbPwsCodeDrawerClose" class="wb-pws-btn wb-pws-btn--ghost">关闭</button>
      </header>
      <div class="wb-pws-code-body" id="wbPwsCodeMount"></div>
    </section>
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
        <pre id="wbPwsTerminalTools" class="wb-pws-terminal-pane" data-pane="tools">工具调用记录将在此显示。</pre>
      </div>
    </footer>
  </div>
`;

function ensureProjectWorkspaceLayout() {
  const panelAi = document.getElementById("panel-ai");
  if (!panelAi) {
    return null;
  }
  let root = document.getElementById("wbProjectWorkspace");
  if (root && root.dataset.layoutVersion !== WB_PWS_LAYOUT_VERSION) {
    root.remove();
    root = null;
  }
  if (root) {
    return root;
  }
  root = document.createElement("div");
  root.id = "wbProjectWorkspace";
  root.className = "wb-project-workspace wb-project-workspace--codex";
  root.dataset.layoutVersion = WB_PWS_LAYOUT_VERSION;
  root.hidden = true;
  root.innerHTML = WB_PWS_LAYOUT_HTML;
  panelAi.prepend(root);
  return root;
}

function setDrawerState(kind, open) {
  const cls =
    kind === "project" ? "wb-project-drawer-open" : "wb-code-drawer-open";
  document.body.classList.toggle(cls, Boolean(open));
  const backdrop = document.getElementById("wbPwsDrawerBackdrop");
  if (backdrop) {
    backdrop.hidden = !open;
    backdrop.setAttribute("aria-hidden", open ? "false" : "true");
  }
}

function bindPwsDrawers() {
  const openCode = document.getElementById("wbPwsOpenCodeDrawer");
  const closeCode = document.getElementById("wbPwsCodeDrawerClose");
  const openProject = document.getElementById("wbPwsOpenProjectDrawer");
  const backdrop = document.getElementById("wbPwsDrawerBackdrop");
  if (openCode && openCode.dataset.bound !== "1") {
    openCode.dataset.bound = "1";
    openCode.addEventListener("click", () => {
      setDrawerState("code", true);
      window.__wbSwitchCodeTab?.("diff");
    });
  }
  if (closeCode && closeCode.dataset.bound !== "1") {
    closeCode.dataset.bound = "1";
    closeCode.addEventListener("click", () => setDrawerState("code", false));
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
  const toolsSrc = document.getElementById("wbToolOpsList");
  const shellDst = document.getElementById("wbPwsTerminalShell");
  const testDst = document.getElementById("wbPwsTerminalTest");
  const toolsDst = document.getElementById("wbPwsTerminalTools");
  if (shellSrc && shellDst) {
    shellDst.textContent = shellSrc.textContent || "暂无终端输出。";
  }
  if (testSrc && testDst) {
    testDst.textContent = testSrc.textContent || "暂无测试输出。";
  }
  if (toolsSrc && toolsDst) {
    const lines = Array.from(toolsSrc.querySelectorAll("li"))
      .map((li) => li.textContent?.trim())
      .filter(Boolean);
    toolsDst.textContent = lines.length ? lines.join("\n") : "暂无工具记录。";
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

window.__wbEnsureProjectWorkspaceLayout = ensureProjectWorkspaceLayout;
window.__wbBindTerminalDrawer = bindTerminalDrawer;
window.__wbBindPwsDrawers = bindPwsDrawers;
window.__wbSyncTerminalDrawer = syncTerminalDrawerFromPanels;
window.__wbExpandTerminalDrawer = expandTerminalDrawer;
window.__wbClosePwsDrawers = () => {
  setDrawerState("project", false);
  setDrawerState("code", false);
};
