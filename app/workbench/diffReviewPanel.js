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
  return {
    projectId: store.selectedProjectId,
    taskId,
  };
}

function statusLabel(status) {
  const map = {
    pending: "待审阅",
    accepted: "已接受",
    rejected: "已拒绝",
    revision: "需修改",
  };
  return map[status] || status;
}

function changeTypeLabel(type) {
  const map = { add: "新增", delete: "删除", modify: "修改" };
  return map[type] || type;
}

function renderDiffLines(diff, viewMode) {
  const lines = String(diff || "").split(/\r?\n/);
  if (viewMode === "split") {
    const oldLines = [];
    const newLines = [];
    lines.forEach((line) => {
      if (line.startsWith("-") && !line.startsWith("---")) {
        oldLines.push(`<span class="wb-diff-line wb-diff-line--del">${escapeHtml(line)}</span>`);
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        newLines.push(`<span class="wb-diff-line wb-diff-line--add">${escapeHtml(line)}</span>`);
      } else if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) {
        const meta = `<span class="wb-diff-line wb-diff-line--meta">${escapeHtml(line)}</span>`;
        oldLines.push(meta);
        newLines.push(meta);
      } else {
        const ctx = `<span class="wb-diff-line wb-diff-line--ctx">${escapeHtml(line)}</span>`;
        oldLines.push(ctx);
        newLines.push(ctx);
      }
    });
    return `
      <div class="wb-diff-split">
        <pre class="wb-diff-split__col wb-diff-split__old">${oldLines.join("\n")}</pre>
        <pre class="wb-diff-split__col wb-diff-split__new">${newLines.join("\n")}</pre>
      </div>
    `;
  }
  return `<pre class="wb-diff-unified">${lines
    .map((line) => {
      let cls = "wb-diff-line--ctx";
      if (line.startsWith("+") && !line.startsWith("+++")) {
        cls = "wb-diff-line--add";
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        cls = "wb-diff-line--del";
      } else if (line.startsWith("@@") || line.startsWith("---") || line.startsWith("+++")) {
        cls = "wb-diff-line--meta";
      }
      return `<span class="wb-diff-line ${cls}">${escapeHtml(line)}</span>`;
    })
    .join("\n")}</pre>`;
}

function ensureDiffReviewMount() {
  let panel = document.getElementById("wbDiffReviewPanel");
  if (panel) {
    return panel;
  }
  const mount = document.getElementById("wbPwsCodeMount");
  if (!mount) {
    return null;
  }
  panel = document.createElement("section");
  panel.id = "wbDiffReviewPanel";
  panel.className = "wb-diff-review-panel";
  panel.hidden = true;
  mount.insertBefore(panel, mount.firstChild);
  return panel;
}

function renderDiffReviewPanel() {
  const panel = ensureDiffReviewMount();
  if (!panel) {
    return;
  }
  const { projectId, taskId } = getContext();
  if (!projectId || !taskId) {
    panel.hidden = true;
    return;
  }
  const reviewStore = window.__wbCodeReviewStore;
  const state = reviewStore.getState(projectId, taskId);
  if (!state.changes.length) {
    panel.hidden = false;
    panel.innerHTML = `
      <header class="wb-diff-review__head">
        <div><h3>Diff 审阅</h3><p class="wb-diff-review__meta">暂无待审阅变更</p></div>
      </header>
      <p class="wb-diff-review__empty">生成开发方案后，AI 建议的 Diff 将在此显示。</p>
    `;
    return;
  }
  panel.hidden = false;
  const selected =
    state.changes.find((c) => c.id === state.selectedChangeId) || state.changes[0];
  const pendingCount = state.changes.filter(
    (c) => c.reviewStatus === "pending" || c.reviewStatus === "revision"
  ).length;
  const acceptedCount = state.changes.filter((c) => c.reviewStatus === "accepted").length;
  const fileRows = state.changes
    .map((c) => {
      const active = c.id === selected?.id ? " is-active" : "";
      return `
        <li class="wb-diff-review__file${active}" data-change-id="${escapeHtml(c.id)}">
          <button type="button" class="wb-diff-review__file-btn">
            <code class="wb-diff-review__path">${escapeHtml(c.path)}</code>
            <span class="wb-diff-review__stats">+${c.additions} -${c.deletions}</span>
            <span class="wb-diff-review__type">${escapeHtml(changeTypeLabel(c.changeType))}</span>
            <span class="wb-diff-review__status wb-diff-review__status--${escapeHtml(c.reviewStatus)}">${escapeHtml(statusLabel(c.reviewStatus))}</span>
          </button>
          <div class="wb-diff-review__file-actions">
            <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-accept-one" data-change-id="${escapeHtml(c.id)}">接受</button>
            <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-reject-one" data-change-id="${escapeHtml(c.id)}">拒绝</button>
          </div>
        </li>
      `;
    })
    .join("");
  panel.innerHTML = `
    <header class="wb-diff-review__head">
      <div>
        <h3>Diff 审阅</h3>
        <p class="wb-diff-review__meta">${state.changes.length} 个文件 · 待审 ${pendingCount} · 已接受 ${acceptedCount}</p>
      </div>
      <div class="wb-diff-review__toolbar">
        <div class="wb-diff-review__view-toggle" role="group" aria-label="Diff 视图">
          <button type="button" class="wb-diff-view-btn ${state.viewMode === "unified" ? "is-active" : ""}" data-view="unified">统一视图</button>
          <button type="button" class="wb-diff-view-btn ${state.viewMode === "split" ? "is-active" : ""}" data-view="split">并排视图</button>
        </div>
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-accept-all">全部接受</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-reject-all">全部拒绝</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-diff-apply-batch" ${acceptedCount ? "" : "disabled"}>写入已接受 (${acceptedCount})</button>
      </div>
    </header>
    <div class="wb-diff-review__body">
      <ul class="wb-diff-review__files">${fileRows}</ul>
      <div class="wb-diff-review__detail">
        ${selected ? `<p class="wb-diff-review__summary">${escapeHtml(selected.summary || "")}</p>` : ""}
        <div class="wb-diff-review__diff scroll-tech">${selected ? renderDiffLines(selected.diff, state.viewMode) : ""}</div>
      </div>
    </div>
  `;
  panel.querySelectorAll(".wb-diff-review__file-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const li = btn.closest("[data-change-id]");
      const id = li?.dataset?.changeId;
      if (id) {
        reviewStore.setSelectedChange(projectId, taskId, id);
      }
    });
  });
  panel.querySelectorAll(".wb-diff-accept-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      reviewStore.setReviewStatus(projectId, taskId, btn.dataset.changeId, reviewStore.REVIEW_STATUS.ACCEPTED);
    });
  });
  panel.querySelectorAll(".wb-diff-reject-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      reviewStore.setReviewStatus(projectId, taskId, btn.dataset.changeId, reviewStore.REVIEW_STATUS.REJECTED);
    });
  });
  panel.querySelector(".wb-diff-accept-all")?.addEventListener("click", () => {
    reviewStore.acceptAll(projectId, taskId);
  });
  panel.querySelector(".wb-diff-reject-all")?.addEventListener("click", () => {
    reviewStore.rejectAll(projectId, taskId);
  });
  panel.querySelectorAll(".wb-diff-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      reviewStore.setViewMode(projectId, taskId, btn.dataset.view);
    });
  });
  panel.querySelector(".wb-diff-apply-batch")?.addEventListener("click", () => {
    void window.__wbApplyAcceptedDiffs?.();
  });
  window.__wbBindDiffResizer?.();
}

function bindDiffReviewPanel() {
  ensureDiffReviewMount();
  const eventName = window.__wbCodeReviewStore?.WB_REVIEW_EVENT || "wb:code-review-change";
  window.addEventListener(eventName, renderDiffReviewPanel);
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", renderDiffReviewPanel);
  renderDiffReviewPanel();
}

window.__wbBindDiffReviewPanel = bindDiffReviewPanel;
window.__wbRenderDiffReviewPanel = renderDiffReviewPanel;
