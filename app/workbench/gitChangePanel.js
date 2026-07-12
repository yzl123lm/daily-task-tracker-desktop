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
  return {
    projectId: store.selectedProjectId,
    taskId: store.selectedTaskId || store.activeTaskId || null,
  };
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
    <div id="wbGitHeadMeta" class="wb-git-head-meta" hidden></div>
    <div id="wbGitSummary" class="wb-git-summary"></div>
    <ul id="wbGitChangeList" class="wb-git-change-list scroll-tech"></ul>
    <details id="wbGitPrDraft" class="wb-git-pr-draft" hidden>
      <summary>Draft PR（本机 gh）</summary>
      <pre id="wbGitPrDraftBody" class="wb-git-pr-draft__body scroll-tech"></pre>
      <div class="wb-git-pr-draft__actions">
        <button type="button" id="wbGitPrCopyBtn" class="wb-pws-btn wb-pws-btn--ghost">复制命令</button>
        <button type="button" id="wbGitPrCreateBtn" class="wb-pws-btn wb-pws-btn--primary">创建 Draft PR</button>
      </div>
      <p id="wbGitPrCreateStatus" class="wb-git-pr-draft__status" hidden></p>
    </details>
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

function renderSidebarGitSummary(snap) {
  const mount = document.getElementById("wbPwsSidebarGitMount");
  if (!mount) {
    return;
  }
  if (!snap?.isRepo) {
    mount.innerHTML = `
      <p class="wb-pws-sidebar-git__status">非 Git 仓库</p>
      <p class="wb-pws-sidebar-git__hint">可在左侧「任务」中设置项目源码目录后查看 Git 状态。</p>
    `;
    return;
  }
  const changes = snap.changes || [];
  const changeItems = changes.length
    ? changes
        .slice(0, 40)
        .map(
          (chg) =>
            `<li class="wb-pws-sidebar-git__item"><code>${escapeHtml(chg.path)}</code><span>${escapeHtml(changeTypeLabel(chg.changeType))}</span></li>`
        )
        .join("")
    : '<li class="wb-pws-sidebar-git__empty">工作区干净</li>';
  mount.innerHTML = `
    <div class="wb-pws-sidebar-git__head">
      <p class="wb-pws-sidebar-git__branch">分支 <strong>${escapeHtml(snap.branch || "detached")}</strong></p>
      <p class="wb-pws-sidebar-git__status">${snap.clean ? "无待提交变更" : `${snap.changeCount} 项变更`}</p>
      <button type="button" id="wbSidebarGitOpenBtn" class="wb-pws-btn wb-pws-btn--ghost">在主区查看</button>
    </div>
    <ul class="wb-pws-sidebar-git__list scroll-tech">${changeItems}</ul>
  `;
  mount.querySelector("#wbSidebarGitOpenBtn")?.addEventListener("click", () => {
    window.__wbSwitchCodeTab?.("git");
  });
  mount.querySelectorAll(".wb-pws-sidebar-git__item code").forEach((codeEl) => {
    codeEl.addEventListener("click", () => {
      const path = codeEl.textContent?.trim();
      if (path) {
        window.__wbSwitchSidebarTab?.("files", { persist: false });
        window.__wbSwitchCodeTab?.("code");
        void window.__wbLoadFilePreview?.(path);
      }
    });
  });
}

function renderGitHeadMeta(head, pr) {
  const metaEl = document.getElementById("wbGitHeadMeta");
  const prEl = document.getElementById("wbGitPrDraft");
  const prBody = document.getElementById("wbGitPrDraftBody");
  if (metaEl) {
    if (head?.isRepo) {
      metaEl.hidden = false;
      metaEl.innerHTML = `
        <span>HEAD <code>${escapeHtml(head.shortHash || "?")}</code></span>
        <span>${escapeHtml(head.subject || "")}</span>
      `;
    } else {
      metaEl.hidden = true;
      metaEl.replaceChildren();
    }
  }
  if (prEl && prBody) {
    if (pr?.commands) {
      const text = `${pr.commands.push}\n${pr.commands.createDraftPr}`;
      prBody.textContent = text;
      prEl.hidden = false;
      prEl.dataset.commands = text;
    } else {
      prEl.hidden = true;
      prBody.textContent = "";
    }
  }
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
      const headBit = snap.head?.shortHash ? ` · ${snap.head.shortHash}` : "";
      label.textContent = `分支 ${snap.branch || "detached"}${headBit} · ${snap.clean ? "工作区干净" : `${snap.changeCount} 项变更`}`;
    }
  }

  renderGitHeadMeta(snap?.head || (snap?.isRepo ? { isRepo: true, shortHash: null, subject: null } : null), snap?.pr);

  if (summary) {
    if (!snap?.isRepo) {
      summary.innerHTML = `<p class="wb-git-summary__empty">当前项目源码目录不是 Git 仓库。可在左侧「任务」设置项目源码目录。</p>`;
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
      renderSidebarGitSummary(snap);
      window.__wbRenderSourceRootGitStatus?.(snap);
      return;
    }
    if (!snap.changes?.length) {
      list.innerHTML = '<li class="wb-git-change-list__empty">工作区干净，无变更文件</li>';
      renderSidebarGitSummary(snap);
      window.__wbRenderSourceRootGitStatus?.(snap);
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
  renderSidebarGitSummary(snap);
  window.__wbRenderSourceRootGitStatus?.(snap);
}

async function refreshGitChangePanel(projectId) {
  const api = window.electronAPI || {};
  const ctx = getContext();
  const pid = projectId || ctx.projectId;
  if (!pid || typeof api.wbProjectGitStatus !== "function") {
    return;
  }
  try {
    const status = await api.wbProjectGitStatus({ projectId: pid });
    let head = null;
    let pr = null;
    if (typeof api.wbProjectGitHead === "function" && status?.isRepo) {
      try {
        const meta = await api.wbProjectGitHead({ projectId: pid });
        head = meta?.head || null;
      } catch {
        /* optional */
      }
    }
    if (typeof api.wbProjectPrDraftGet === "function" && status?.isRepo && ctx.taskId) {
      try {
        const draftRes = await api.wbProjectPrDraftGet({ projectId: pid, taskId: ctx.taskId });
        if (draftRes?.ok && draftRes.draft) {
          pr = draftRes.draft;
          if (!head && draftRes.head) head = draftRes.head;
        }
      } catch {
        /* optional */
      }
    }
    if (!pr && head?.isRepo && head.branch) {
      pr = {
        commands: {
          push: `git push -u origin ${head.branch}`,
          createDraftPr: `gh pr create --draft --title ${JSON.stringify(
            "Workbench delivery"
          )} --body ${JSON.stringify("Generated from Workbench Git panel")}`,
        },
      };
    }
    const enriched = { ...status, head, pr };
    const snap = window.__wbGitChangeStore?.setStatus?.(pid, enriched) || enriched;
    renderGitChangePanel(snap);
    window.__wbRenderSourceRootGitStatus?.(status);
  } catch {
    renderGitChangePanel({ isRepo: false, projectId: pid, changes: [], clean: true });
    window.__wbRenderSourceRootGitStatus?.({ isRepo: false });
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
    document.getElementById("wbGitPrCopyBtn")?.addEventListener("click", async () => {
      const text = document.getElementById("wbGitPrDraft")?.dataset?.commands || "";
      if (!text) {
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        window.__wbShowComposerToast?.("PR 命令已复制", { type: "success" });
      } catch {
        /* ignore */
      }
    });
    document.getElementById("wbGitPrCreateBtn")?.addEventListener("click", () => {
      void createDraftPrFromPanel();
    });
  }
}

async function createDraftPrFromPanel() {
  const api = window.electronAPI || {};
  const { projectId, taskId } = getContext();
  const statusEl = document.getElementById("wbGitPrCreateStatus");
  if (!projectId || !taskId || typeof api.wbProjectPrDraftCreate !== "function") {
    if (statusEl) {
      statusEl.hidden = false;
      statusEl.textContent = "需要选中任务后才能创建 Draft PR";
    }
    return;
  }
  const requestId = `draft-pr:${taskId}:${Date.now()}`;
  let approved = true;
  if (typeof window.__wbRequestApproval === "function") {
    approved = await window.__wbRequestApproval({
      title: "创建 Draft PR",
      purpose: "push 当前分支并用 gh 创建 Draft PR（需本机已登录 gh）",
      risk: "network",
      requestId,
      projectId,
      taskId,
    });
  }
  if (!approved) {
    return;
  }
  if (statusEl) {
    statusEl.hidden = false;
    statusEl.textContent = "正在创建 Draft PR…";
  }
  try {
    const result = await api.wbProjectPrDraftCreate({
      projectId,
      taskId,
      userApproved: true,
      requestId,
      approvalId: requestId,
      push: true,
    });
    if (result?.ok) {
      const url = result.prUrl || "已创建";
      if (statusEl) statusEl.textContent = `Draft PR: ${url}`;
      window.__wbShowComposerToast?.("Draft PR 已创建", { type: "success" });
    } else {
      const msg = result?.message || result?.reason || "创建失败";
      if (statusEl) statusEl.textContent = msg;
      window.__wbShowComposerToast?.(msg, { type: "error" });
    }
  } catch (err) {
    const msg = err?.message || "创建 Draft PR 失败";
    if (statusEl) statusEl.textContent = msg;
    window.__wbShowComposerToast?.(msg, { type: "error" });
  }
}

window.__wbEnsureGitChangePanel = ensureGitChangePanel;
window.__wbRenderGitChangePanel = renderGitChangePanel;
window.__wbRefreshGitChangePanel = refreshGitChangePanel;
window.__wbBindGitChangePanel = bindGitChangePanel;
