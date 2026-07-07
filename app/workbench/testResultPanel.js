function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getContext() {
  const store = window.__wbStore?.getState?.() || {};
  const taskId =
    document.getElementById("wbTaskList")?.dataset?.selectedTaskId || null;
  return { projectId: store.selectedProjectId, taskId };
}

function ensureTestResultPanel() {
  let panel = document.getElementById("wbTestResultPanel");
  if (panel) {
    return panel;
  }
  const mount = document.getElementById("wbPwsCodeMount");
  if (!mount) {
    return null;
  }
  panel = document.createElement("section");
  panel.id = "wbTestResultPanel";
  panel.className = "wb-test-result-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <header class="wb-test-result-panel__head">
      <div>
        <h3>测试结果</h3>
        <p id="wbTestResultMeta" class="wb-test-result-panel__meta">白名单命令 · 失败时生成修复建议</p>
      </div>
      <div class="wb-test-result-panel__stats">
        <span id="wbTestStatLast" class="wb-test-stat wb-test-stat--idle">最近：未运行</span>
        <span id="wbTestStatPass" class="wb-test-stat">通过率：—</span>
      </div>
    </header>
    <div class="wb-test-result-panel__controls">
      <select id="wbTestCommand" class="wb-test-result-panel__select"></select>
      <button type="button" id="wbRunTestBtn" class="wb-pws-btn wb-pws-btn--ghost">运行</button>
      <button type="button" id="wbRunTestFixBtn" class="wb-pws-btn wb-pws-btn--primary">运行并分析</button>
    </div>
    <pre id="wbTestOutput" class="wb-test-result-panel__output scroll-tech">选择命令后运行，输出将同步到底部终端抽屉。</pre>
    <ul id="wbFixSuggestions" class="wb-fix-suggestions wb-test-result-panel__fixes" hidden></ul>
    <section class="wb-test-result-panel__history">
      <header class="wb-test-result-panel__history-head">
        <h4>运行历史</h4>
        <span id="wbTestHistoryCount" class="wb-test-result-panel__count">0 条</span>
      </header>
      <ul id="wbTestHistoryList" class="wb-test-history-list scroll-tech"></ul>
    </section>
  `;
  const codePanel = document.getElementById("wbCodePanel");
  if (codePanel) {
    mount.insertBefore(panel, codePanel);
  } else {
    mount.appendChild(panel);
  }
  return panel;
}

function renderTestResultPanel() {
  ensureTestResultPanel();
  const { projectId, taskId } = getContext();
  const store = window.__wbTestResultStore;
  if (!store || !projectId) {
    return;
  }
  const stats = store.getStats(projectId, taskId);
  const runs = store.getRuns(projectId, taskId);
  const lastEl = document.getElementById("wbTestStatLast");
  const passEl = document.getElementById("wbTestStatPass");
  const countEl = document.getElementById("wbTestHistoryCount");
  const listEl = document.getElementById("wbTestHistoryList");

  if (lastEl) {
    if (!stats.last) {
      lastEl.textContent = "最近：未运行";
      lastEl.className = "wb-test-stat wb-test-stat--idle";
    } else {
      lastEl.textContent = `最近：${stats.last.success ? "通过" : "失败"} · exit ${stats.last.exitCode}`;
      lastEl.className = `wb-test-stat wb-test-stat--${stats.last.success ? "pass" : "fail"}`;
    }
  }
  if (passEl) {
    passEl.textContent =
      stats.total > 0 ? `通过率：${stats.passRate}% (${stats.passed}/${stats.total})` : "通过率：—";
  }
  if (countEl) {
    countEl.textContent = `${runs.length} 条`;
  }
  if (listEl) {
    listEl.replaceChildren();
    if (!runs.length) {
      listEl.innerHTML = '<li class="wb-test-history-list__empty">暂无测试记录</li>';
    } else {
      runs.forEach((run) => {
        const li = document.createElement("li");
        li.className = `wb-test-history-list__item wb-test-history-list__item--${run.success ? "pass" : "fail"}`;
        li.innerHTML = `
          <div class="wb-test-history-list__head">
            <code>${escapeHtml(run.command)}</code>
            <span class="wb-test-history-list__badge">${run.success ? "PASS" : "FAIL"}</span>
          </div>
          <p class="wb-test-history-list__meta">exit ${escapeHtml(run.exitCode)} · ${escapeHtml(run.createdAt)}${run.fixCount ? ` · ${run.fixCount} 条建议` : ""}</p>
        `;
        li.addEventListener("click", () => {
          const out = document.getElementById("wbTestOutput");
          if (out) {
            out.textContent = [
              `command: ${run.command}`,
              `exitCode: ${run.exitCode}`,
              `success: ${run.success}`,
              "--- stdout ---",
              run.stdout || "",
              "--- stderr ---",
              run.stderr || "",
            ].join("\n");
          }
          window.__wbSyncTerminalDrawer?.();
        });
        listEl.appendChild(li);
      });
    }
  }
}

function bindTestResultPanel() {
  ensureTestResultPanel();
  const eventName = window.__wbTestResultStore?.WB_TEST_RESULT_EVENT || "wb:test-result-change";
  window.addEventListener(eventName, renderTestResultPanel);
  const panel = document.getElementById("wbTestResultPanel");
  if (panel && panel.dataset.bound !== "1") {
    panel.dataset.bound = "1";
    document.getElementById("wbRunTestBtn")?.addEventListener("click", () => {
      void window.__wbRunWhitelistedTest?.();
    });
    document.getElementById("wbRunTestFixBtn")?.addEventListener("click", () => {
      void window.__wbRunTestWithFix?.();
    });
  }
  renderTestResultPanel();
}

window.__wbEnsureTestResultPanel = ensureTestResultPanel;
window.__wbRenderTestResultPanel = renderTestResultPanel;
window.__wbBindTestResultPanel = bindTestResultPanel;
