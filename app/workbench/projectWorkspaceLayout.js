const WB_PWS_LAYOUT_VERSION = "2";

const WB_PWS_LAYOUT_HTML = `
  <div class="wb-pws-layout">
    <header class="wb-pws-status-bar" id="wbPwsStatusBar">
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
        <button type="button" id="wbCompressBtn" class="wb-pws-btn wb-pws-btn--ghost">手动压缩</button>
        <button type="button" id="wbNewTaskBtn" class="wb-pws-btn wb-pws-btn--primary">新建任务</button>
      </div>
    </header>
    <div class="wb-pws-main">
      <section class="wb-pws-agent-col" aria-label="Agent 执行区">
        <div class="wb-pws-panel wb-pws-panel--tasks">
          <header class="wb-pws-panel__head">
            <h3>项目任务</h3>
          </header>
          <div id="wbTaskList" class="wb-task-list wb-pws-task-list"></div>
        </div>
        <div id="wbTaskDetail" class="wb-pws-user-card" hidden>
          <h4 class="wb-pws-user-card__title">当前任务</h4>
          <p id="wbTaskDetailDesc" class="wb-pws-user-card__desc"></p>
          <p id="wbTaskDetailStep" class="wb-pws-user-card__step"></p>
        </div>
        <div class="wb-pws-panel wb-pws-panel--timeline">
          <header class="wb-pws-panel__head">
            <h3>Agent 执行 Timeline</h3>
          </header>
          <ol id="wbAgentRuns" class="wb-pws-timeline" role="list"></ol>
        </div>
        <div class="wb-pws-panel wb-pws-panel--composer">
          <header class="wb-pws-panel__head">
            <h3>任务描述 / 追问</h3>
            <span class="wb-pws-panel__hint">默认 PLAN_ONLY，写入需审批</span>
          </header>
          <textarea id="wbAgentInput" class="wb-pws-composer__input" rows="3" placeholder="描述开发需求，生成 PLAN_ONLY 方案…"></textarea>
          <div class="wb-pws-composer__actions">
            <button type="button" id="wbAgentRunBtn" class="wb-pws-btn wb-pws-btn--primary">生成开发方案</button>
            <button type="button" id="wbTaskConfirmBtn" class="wb-pws-btn wb-pws-btn--ghost" hidden>确认方案</button>
          </div>
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
      </section>
      <section class="wb-pws-code-col" id="wbPwsCodeMount" aria-label="代码工作区"></section>
    </div>
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

function bindTerminalDrawer() {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  const toggle = document.getElementById("wbPwsTerminalToggle");
  if (!drawer || drawer.dataset.bound === "1") {
    return;
  }
  drawer.dataset.bound = "1";
  const setCollapsed = (collapsed) => {
    drawer.dataset.collapsed = collapsed ? "1" : "0";
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
    const lines = Array.from(toolsSrc.querySelectorAll("li")).map((li) => li.textContent?.trim()).filter(Boolean);
    toolsDst.textContent = lines.length ? lines.join("\n") : "暂无工具记录。";
  }
}

function expandTerminalDrawer(tab = "log") {
  const drawer = document.getElementById("wbPwsTerminalDrawer");
  if (!drawer) {
    return;
  }
  drawer.dataset.collapsed = "0";
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
