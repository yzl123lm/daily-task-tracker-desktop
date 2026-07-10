function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getContext() {
  const store = window.__wbStore?.getState?.() || {};
  const list = document.getElementById("wbTaskList");
  const detail = document.getElementById("wbTaskDetail");
  const agentCol = document.getElementById("wbPwsAgentCol");
  const fromStore = store.selectedTaskId ? String(store.selectedTaskId) : "";
  const fromDataset = list?.dataset?.selectedTaskId ? String(list.dataset.selectedTaskId) : "";
  const fromActive = list?.querySelector?.(".wb-task-item.is-active")?.dataset?.taskId || "";
  const fromHeader =
    detail?.dataset?.taskId ||
    agentCol?.dataset?.taskId ||
    document.getElementById("wbAgentRunTitle")?.dataset?.taskId ||
    "";
  const tasks = Array.isArray(store.tasks) ? store.tasks : [];
  let taskId = fromStore || fromDataset || fromActive || fromHeader || null;
  if (!taskId && tasks.length === 1) {
    taskId = tasks[0]?.id || null;
  }
  if (!taskId && tasks.length) {
    taskId =
      tasks.find(
        (t) =>
          t?.status === "WAITING_APPROVAL" ||
          String(t?.currentStep || "").includes("变更待审阅")
      )?.id || null;
  }
  let projectId =
    store.selectedProjectId ||
    detail?.dataset?.projectId ||
    agentCol?.dataset?.projectId ||
    tasks.find((t) => t.id === taskId)?.projectId ||
    null;
  if (taskId && typeof window.__wbStore?.selectTask === "function") {
    if (store.selectedTaskId !== taskId) {
      window.__wbStore.selectTask(taskId);
    }
    if (list && list.dataset.selectedTaskId !== taskId) {
      list.dataset.selectedTaskId = taskId;
    }
    if (detail) {
      detail.dataset.taskId = taskId;
      if (projectId) {
        detail.dataset.projectId = String(projectId);
      }
    }
  }
  return {
    projectId,
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
  const map = { add: "新增文件", delete: "删除", modify: "修改" };
  return map[type] || type;
}

function toast(message, type = "warn") {
  if (typeof window.__wbShowComposerToast === "function") {
    window.__wbShowComposerToast(message, { type });
    return;
  }
  window.alert?.(message);
}

async function syncPatchReviewStatus(projectId, taskId, changeId, uiStatus) {
  const reviewStore = window.__wbCodeReviewStore;
  const api = window.electronAPI || {};
  reviewStore.setReviewStatus(projectId, taskId, changeId, uiStatus);
  const change = reviewStore.getChanges(projectId, taskId).find((c) => c.id === changeId);
  if (!change?.stagedPatchId || typeof api.wbProjectPatchStatus !== "function") {
    return;
  }
  const patchStatus = uiStatus === "accepted" ? "ACCEPTED" : uiStatus === "rejected" ? "REJECTED" : null;
  if (!patchStatus) {
    return;
  }
  try {
    await api.wbProjectPatchStatus({
      projectId,
      taskId,
      patchId: change.stagedPatchId,
      status: patchStatus,
    });
  } catch {
    /* UI state already updated */
  }
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

function resolveEmptyState({ projectId, taskId, state, task }) {
  if (!projectId) {
    return {
      title: "请选择项目",
      desc: "先在左侧选择项目，再打开 Diff 审阅。",
      primaryAction: null,
      primaryLabel: null,
    };
  }
  if (!taskId) {
    return {
      title: "请选择任务",
      desc: "选择或创建开发任务后，AI 会生成可审阅的代码变更。",
      primaryAction: null,
      primaryLabel: null,
    };
  }
  if (state?.loadError || state?.emptyReason === "load_error") {
    return {
      title: "Diff 加载失败",
      desc: state.loadError || "当前任务存在 staged patch，但 Diff 数据加载失败，请刷新或重新生成。",
      primaryAction: "reload",
      primaryLabel: "重新加载",
    };
  }
  const step = String(task?.currentStep || "");
  const status = String(task?.status || "");
  if (step.includes("失败") || status === "FAILED") {
    return {
      title: "代码变更生成失败",
      desc: step || "生成代码变更失败，请重新生成。",
      primaryAction: "regen-patch",
      primaryLabel: "重新生成代码变更",
    };
  }
  if (step.includes("方案待确认") || status === "PLANNING") {
    return {
      title: "尚未生成代码变更",
      desc: "当前任务已生成开发方案，请点击「生成代码变更」生成 Diff。",
      primaryAction: "regen-patch",
      primaryLabel: "生成代码变更",
    };
  }
  return {
    title: "当前任务没有可审阅的代码变更",
    desc: "请先点击「生成代码变更」，AI 会生成 Diff 后再进入审阅。",
    primaryAction: "regen-patch",
    primaryLabel: "生成代码变更",
  };
}

function renderEmptyDiffState(panel, empty) {
  panel.hidden = false;
  panel.innerHTML = `
    <header class="wb-diff-review__head">
      <div>
        <h3>Diff 审阅</h3>
        <p class="wb-diff-review__meta">${escapeHtml(empty.title || "暂无待审阅变更")}</p>
      </div>
    </header>
    <div class="wb-diff-review__empty-card">
      <h4 class="wb-diff-review__empty-title">${escapeHtml(empty.title)}</h4>
      <p class="wb-diff-review__empty-desc">${escapeHtml(empty.desc)}</p>
      ${
        empty.primaryLabel
          ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-diff-empty-action" data-action="${escapeHtml(
              empty.primaryAction || ""
            )}">${escapeHtml(empty.primaryLabel)}</button>`
          : ""
      }
    </div>
  `;
  panel.querySelector(".wb-diff-empty-action")?.addEventListener("click", () => {
    const action = empty.primaryAction;
    if (action === "reload") {
      void window.__wbOpenDiffReviewForCurrentTask?.({ forceReload: true });
      return;
    }
    if (action === "regen-patch") {
      void window.__wbProposeCodePatches?.();
    }
  });
}

function renderDiffReviewPanel() {
  const panel = ensureDiffReviewMount();
  if (!panel) {
    return;
  }
  const { projectId, taskId } = getContext();
  const reviewStore = window.__wbCodeReviewStore;
  const tasks = window.__wbStore?.getState?.().tasks || [];
  const task = tasks.find((t) => t.id === taskId) || null;
  if (!projectId || !taskId) {
    renderEmptyDiffState(panel, resolveEmptyState({ projectId, taskId, state: null, task: null }));
    return;
  }
  const state = reviewStore.getState(projectId, taskId);
  if (!state.changes.length) {
    // 有任务但 store 空：区分「未加载」与「确实无 patch」——优先尝试一次静默同步由 openTaskDiff 负责；
    // 此处只渲染明确空态，避免误报「请选择任务」
    renderEmptyDiffState(panel, resolveEmptyState({ projectId, taskId, state, task }));
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
            <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-revise-one" data-change-id="${escapeHtml(c.id)}">需修改</button>
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
        <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-diff-apply-batch">写入已接受 (${acceptedCount})</button>
      </div>
    </header>
    <div class="wb-diff-review__body">
      <ul class="wb-diff-review__files">${fileRows}</ul>
      <div class="wb-diff-review__detail">
        ${selected ? `<p class="wb-diff-review__summary">${escapeHtml(selected.summary || (selected.changeType === "add" ? "新增文件" : ""))}</p>` : ""}
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
      void syncPatchReviewStatus(
        projectId,
        taskId,
        btn.dataset.changeId,
        reviewStore.REVIEW_STATUS.ACCEPTED
      );
      toast("已接受该文件变更", "success");
    });
  });
  panel.querySelectorAll(".wb-diff-reject-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void syncPatchReviewStatus(
        projectId,
        taskId,
        btn.dataset.changeId,
        reviewStore.REVIEW_STATUS.REJECTED
      );
      toast("已拒绝该文件变更", "info");
    });
  });
  panel.querySelectorAll(".wb-diff-revise-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const changeId = btn.dataset.changeId;
      const change = reviewStore.getChanges(projectId, taskId).find((c) => c.id === changeId);
      const feedback = window.prompt(
        `请描述对 ${change?.path || "该文件"} 的修改意见：`,
        ""
      );
      if (feedback === null) {
        return;
      }
      void (async () => {
        await reviewStore.requestRevisionWithFeedback(projectId, taskId, changeId, feedback);
        const api = window.electronAPI || {};
        if (typeof api.wbProjectAgentRun === "function") {
          await api.wbProjectAgentRun({
            projectId,
            taskId,
            message: [
              `请根据用户修订意见重新生成补丁（stage_patch），文件：${change?.path || ""}`,
              `用户意见：${feedback}`,
              change?.summary ? `原补丁摘要：${change.summary}` : "",
            ].join("\n"),
            mode: "PATCH_PROPOSE",
          });
          await reviewStore.syncFromStagedPatches(projectId, taskId);
        }
        renderDiffReviewPanel();
        toast("已提交修改意见，正在重新生成变更", "info");
      })();
    });
  });
  panel.querySelector(".wb-diff-accept-all")?.addEventListener("click", () => {
    if (!state.changes.length) {
      toast("当前没有可写入的代码变更。", "warn");
      return;
    }
    reviewStore.acceptAll(projectId, taskId);
    state.changes.forEach((c) => {
      if (c.stagedPatchId) {
        void syncPatchReviewStatus(projectId, taskId, c.id, reviewStore.REVIEW_STATUS.ACCEPTED);
      }
    });
    toast("已选择变更，请点击「写入已接受」。", "success");
  });
  panel.querySelector(".wb-diff-reject-all")?.addEventListener("click", () => {
    if (!state.changes.length) {
      toast("当前没有可审阅的代码变更。", "warn");
      return;
    }
    reviewStore.rejectAll(projectId, taskId);
    state.changes.forEach((c) => {
      if (c.stagedPatchId) {
        void syncPatchReviewStatus(projectId, taskId, c.id, reviewStore.REVIEW_STATUS.REJECTED);
      }
    });
    toast("已拒绝全部变更", "info");
  });
  panel.querySelectorAll(".wb-diff-view-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      reviewStore.setViewMode(projectId, taskId, btn.dataset.view);
    });
  });
  panel.querySelector(".wb-diff-apply-batch")?.addEventListener("click", () => {
    const accepted = reviewStore.getAcceptedChanges(projectId, taskId);
    if (!state.changes.length) {
      toast("当前没有可写入的代码变更。", "warn");
      return;
    }
    if (!accepted.length) {
      toast("请选择要审阅的文件，或点击「全部接受」。", "warn");
      return;
    }
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
