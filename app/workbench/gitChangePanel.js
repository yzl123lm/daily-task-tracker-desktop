function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function changeTypeLabel(type) {
  const map = {
    modified: "修改",
    added: "新增",
    deleted: "删除",
    untracked: "未跟踪",
    renamed: "重命名",
  };
  return map[type] || type;
}

function getContext() {
  const store = window.__wbStore?.getState?.() || {};
  return { projectId: store.selectedProjectId };
}

function ensureGitChangePanel() {
  let panel = document.getElementById("wbGitChangePanel");
  if (panel) {
    return panel;
  }
  const mount = document.getElementById("wbPwsCodeMount");
  if (!mount) {
    return null;
  }
  panel = document.createElement("section");
  panel.id = "wbGitChangePanel";
  panel.className = "wb-git-change-panel";
  panel.hidden = true;
  panel.innerHTML = `
    <header class="wb-git-change-panel__head">
      <div>
        <h3>Git 变更</h3>
        <p id="wbGitStatusLabel" class="wb-git-change-panel__meta">加载中…</p>
      </div>
      <button type="button" id="wbGitRefreshBtn" class="wb-pws-btn wb-pws-btn--ghost">刷新状态</button>
    </header>
    <div id="wbGitSummary" class="wb-git-summary"></div>
    <ul id="wbGitChangeList" class="wb-git-change-list scroll-tech"></ul>
    <footer class="wb-git-change-panel__commit">
      <label class="wb-field">
        <span>Commit 说明（需审批）</span>
        <input id="wbGitCommitMsg" type="text" placeholder="wb: controlled dev" />
      </label>
      <button type="button" id="wbGitCommitBtn" class="wb-pws-btn wb-pws-btn--primary">确认 Commit</button>
    </footer>
  `;
  const codePanel = document.getElementById("wbCodePanel");
  if (codePanel) {
    mount.insertBefore(panel, codePanel);
  } else {
    mount.appendChild(panel);
  }
  return panel;
}

function renderGitChangePanel(status) {
  ensureGitChangePanel();
  const { projectId } = getContext();
  const gitStore = window.__wbGitChangeStore;
  const snap = status || gitStore?.getStatus?.(projectId);
  const label = document.getElementById("wbGitStatusLabel");
  const summary = document.getElementById("wbGitSummary");
  const list = document.getElementById("wbGitChangeList");

  if (label) {
    if (!snap?.isRepo) {
      label.textContent = "非 Git 仓库（受控写入的分支选项将跳过）";
    } else {
      label.textContent = `分支 ${snap.branch || "detached"} · ${snap.clean ? "工作区干净" : `${snap.changeCount} 项变更`}`;
    }
  }

  if (summary) {
    if (!snap?.isRepo) {
      summary.innerHTML = `<p class="wb-git-summary__empty">当前代码目录不是 Git 仓库。可在「代码」Tab 设置代码目录。</p>`;
    } else if (snap.clean) {
      summary.innerHTML = `<p class="wb-git-summary__clean">✓ 无待提交变更</p>`;
    } else {
      const staged = snap.changes.filter((c) => c.staged).length;
      const unstaged = snap.changes.filter((c) => c.unstaged).length;
      summary.innerHTML = `
        <div class="wb-git-summary__counts">
          <span>共 ${snap.changeCount} 个文件</span>
          ${staged ? `<span class="wb-git-summary__staged">已暂存 ${staged}</span>` : ""}
          ${unstaged ? `<span class="wb-git-summary__unstaged">未暂存 ${unstaged}</span>` : ""}
        </div>
      `;
    }
  }

  if (list) {
    list.replaceChildren();
    if (!snap?.isRepo) {
      list.innerHTML = '<li class="wb-git-change-list__empty">—</li>';
      return;
    }
    if (!snap.changes?.length) {
      list.innerHTML = '<li class="wb-git-change-list__empty">工作区干净，无变更文件</li>';
      return;
    }
    snap.changes.forEach((chg) => {
      const li = document.createElement("li");
      li.className = `wb-git-change-list__item wb-git-change-list__item--${escapeHtml(chg.changeType)}`;
      const flags = [];
      if (chg.staged) {
        flags.push("暂存");
      }
      if (chg.unstaged) {
        flags.push("工作区");
      }
      li.innerHTML = `
        <button type="button" class="wb-git-change-list__btn" data-path="${escapeHtml(chg.path)}">
          <code class="wb-git-change-list__path">${escapeHtml(chg.path)}</code>
          <span class="wb-git-change-list__type">${escapeHtml(changeTypeLabel(chg.changeType))}</span>
          <span class="wb-git-change-list__flags">${escapeHtml(flags.join(" · "))}</span>
        </button>
      `;
      li.querySelector(".wb-git-change-list__btn")?.addEventListener("click", () => {
        window.__wbSwitchCodeTab?.("code");
        window.__wbLoadFilePreview?.(chg.path);
      });
      list.appendChild(li);
    });
  }
}

async function refreshGitChangePanel(projectId) {
  const api = window.electronAPI || {};
  const pid = projectId || getContext().projectId;
  if (!pid || typeof api.wbProjectGitStatus !== "function") {
    return;
  }
  try {
    const status = await api.wbProjectGitStatus({ projectId: pid });
    const snap = window.__wbGitChangeStore?.setStatus?.(pid, status);
    renderGitChangePanel(snap);
    const miniLabel = document.querySelector("#wbCodePanel .wb-code-panel__git");
    if (miniLabel) {
      if (!status.isRepo) {
        miniLabel.textContent = "Git：非仓库";
      } else {
        miniLabel.textContent = `Git：${status.branch || "detached"} · ${status.clean ? "干净" : `变更 ${status.lines.length} 项`}`;
      }
    }
  } catch {
    renderGitChangePanel({ isRepo: false, projectId: pid, changes: [], clean: true });
  }
}

function bindGitChangePanel() {
  ensureGitChangePanel();
  const eventName = window.__wbGitChangeStore?.WB_GIT_CHANGE_EVENT || "wb:git-change-update";
  window.addEventListener(eventName, (ev) => {
    renderGitChangePanel(ev.detail?.status);
  });
  document.getElementById("wbGitRefreshBtn")?.addEventListener("click", () => {
    void refreshGitChangePanel();
  });
  if (!document.getElementById("wbGitChangePanel")?.dataset.bound) {
    const panel = document.getElementById("wbGitChangePanel");
    if (panel) {
      panel.dataset.bound = "1";
    }
    document.getElementById("wbGitCommitBtn")?.addEventListener("click", () => {
      void window.__wbGitCommitConfirmed?.();
    });
  }
}

window.__wbEnsureGitChangePanel = ensureGitChangePanel;
window.__wbRenderGitChangePanel = renderGitChangePanel;
window.__wbRefreshGitChangePanel = refreshGitChangePanel;
window.__wbBindGitChangePanel = bindGitChangePanel;
