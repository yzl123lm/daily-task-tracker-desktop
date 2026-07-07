const WB_PWS_LAYOUT_VERSION = "4";

const WB_PWS_LAYOUT_HTML = `
  <div class="wb-pws-layout">
    <header class="wb-pws-topbar wb-pws-status-bar" id="wbPwsStatusBar">
      <div class="wb-pws-status-bar__left">
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
      <div class="wb-pws-project-card" id="wbPwsProjectCard">
        <h3 class="wb-pws-project-card__title" id="wbPwsProjectCardTitle">当前项目</h3>
        <p class="wb-pws-project-card__meta" id="wbPwsProjectCardMeta"></p>
      </div>
      <div class="wb-pws-task-filters" id="wbPwsTaskFilters" role="tablist" aria-label="任务筛选">
        <button type="button" class="wb-pws-task-filter is-active" data-filter="all" role="tab">全部</button>
        <button type="button" class="wb-pws-task-filter" data-filter="active" role="tab">进行中</button>
        <button type="button" class="wb-pws-task-filter" data-filter="waiting" role="tab">等待审批</button>
        <button type="button" class="wb-pws-task-filter" data-filter="done" role="tab">已完成</button>
      </div>
      <div id="wbTaskList" class="wb-task-list wb-pws-task-list" role="list"></div>
      <button type="button" id="wbPwsBackToChatBtn" class="wb-pws-chat-entry">返回会话区</button>
    </aside>
    <section class="wb-pws-agent-col" id="wbPwsAgentCol" aria-label="Agent 执行区">
      <header class="wb-pws-agent-header" id="wbPwsAgentHeader">
        <div id="wbTaskDetail" class="wb-pws-user-card wb-pws-agent-header__card">
          <h4 class="wb-pws-user-card__title" id="wbPwsAgentTaskTitle">当前任务</h4>
          <p id="wbTaskDetailDesc" class="wb-pws-user-card__desc">选择左侧任务开始 Agent 执行</p>
          <p id="wbTaskDetailStep" class="wb-pws-user-card__step"></p>
        </div>
      </header>
      <div class="wb-pws-agent-scroll" id="wbPwsAgentScroll">
        <div class="wb-pws-panel wb-pws-panel--timeline">
          <header class="wb-pws-panel__head">
            <h3>Agent 执行 Timeline</h3>
          </header>
          <ol id="wbAgentRuns" class="wb-pws-timeline" role="list"></ol>
          <p id="wbPwsAgentEmpty" class="wb-pws-empty-hint" hidden>暂无 Agent 执行记录</p>
        </div>
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
      <footer class="wb-pws-agent-composer" id="wbPwsAgentComposer">
        <header class="wb-pws-panel__head">
          <h3>任务描述 / 追问</h3>
          <select id="wbPwsSceneTemplate" class="wb-pws-template-select" aria-label="场景模板"></select>
        </header>
        <p id="wbPwsTemplateHint" class="wb-pws-template-hint" hidden></p>
        <textarea id="wbAgentInput" class="wb-pws-composer__input" rows="3" placeholder="描述开发需求，生成 PLAN_ONLY 方案…"></textarea>
        <div class="wb-pws-composer__actions">
          <button type="button" id="wbAgentRunBtn" class="wb-pws-btn wb-pws-btn--primary">生成开发方案</button>
          <button type="button" id="wbTaskConfirmBtn" class="wb-pws-btn wb-pws-btn--ghost" hidden>确认方案</button>
        </div>
      </footer>
    </section>
    <section class="wb-pws-code-col" id="wbPwsCodeCol" aria-label="代码审查区">
      <div class="wb-pws-code-body" id="wbPwsCodeBody">
        <div id="wbPwsCodeEmpty" class="wb-pws-code-empty" hidden>
          <p>请设置项目代码目录后在此审阅 Diff 与变更。</p>
        </div>
        <div id="wbPwsCodeMount" class="wb-pws-code-mount"></div>
      </div>
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
        <div class="wb-pws-terminal-pane" data-pane="shell">
          <div id="wbPwsShellMount" class="wb-pws-shell-mount"></div>
          <pre id="wbPwsTerminalShell" class="wb-pws-terminal-shell-output">终端输出将在此显示。</pre>
        </div>
        <pre id="wbPwsTerminalTest" class="wb-pws-terminal-pane" data-pane="test">测试输出将在此显示。</pre>
        <pre id="wbPwsTerminalTools" class="wb-pws-terminal-pane" data-pane="tools">工具调用记录将在此显示。</pre>
      </div>
    </footer>
    <div id="wbPwsHiddenPanels" class="wb-pws-hidden-panels" hidden aria-hidden="true"></div>
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

function bindTerminalDrawer() {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  const toggle = document.getElementById("wbPwsTerminalToggle");
  if (!drawer || drawer.dataset.bound === "1") {
    return;
  }
  drawer.dataset.bound = "1";
  const setCollapsed = (collapsed) => {
    drawer.dataset.collapsed = collapsed ? "1" : "0";
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
  if (!drawer) {
    return;
  }
  drawer.dataset.collapsed = "0";
  drawer.classList.remove("is-collapsed");
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
window.__wbSyncTerminalDrawer = syncTerminalDrawerFromPanels;
window.__wbExpandTerminalDrawer = expandTerminalDrawer;
