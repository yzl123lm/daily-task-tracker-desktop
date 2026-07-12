function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderRiskStrip(change) {
  const findings = Array.isArray(change?.reviewFindings) ? change.reviewFindings : [];
  if (!findings.length && !change?.reviewVerdict) {
    return "";
  }
  const chips = findings
    .map((f) => {
      const sev = String(f.severity || "medium").toLowerCase();
      return `<span class="wb-diff-risk__chip wb-diff-risk__chip--${escapeHtml(sev)}" title="${escapeHtml(f.message || "")}">${escapeHtml(f.code || sev)}</span>`;
    })
    .join("");
  const msg = findings[0]?.message || (change.reviewVerdict === "needs_approval" ? "存在需确认的审查项" : "");
  return `<div class="wb-diff-risk" data-verdict="${escapeHtml(change.reviewVerdict || "")}">
    ${chips || `<span class="wb-diff-risk__chip">${escapeHtml(change.reviewVerdict || "review")}</span>`}
    ${msg ? `<span class="wb-diff-risk__msg">${escapeHtml(msg)}</span>` : ""}
  </div>`;
}

/** 最近一次成功打开 Diff 的上下文，防止后续空态重绘盖掉已加载内容 */
const lastDiffContext = { projectId: null, taskId: null };

function rememberDiffContext(projectId, taskId) {
  if (projectId && taskId) {
    lastDiffContext.projectId = String(projectId);
    lastDiffContext.taskId = String(taskId);
  }
}

function findLoadedReviewContext() {
  const reviewStore = window.__wbCodeReviewStore;
  if (!reviewStore?.getState) {
    return null;
  }
  const store = window.__wbStore?.getState?.() || {};
  const tasks = Array.isArray(store.tasks) ? store.tasks : [];
  const projects = Array.isArray(store.projects) ? store.projects : [];
  const projectIds = [
    store.selectedProjectId,
    lastDiffContext.projectId,
    document.getElementById("wbTaskDetail")?.dataset?.projectId,
    ...projects.map((p) => p?.id),
    ...tasks.map((t) => t?.projectId),
  ].filter(Boolean);
  const taskIds = [
    store.selectedTaskId,
    lastDiffContext.taskId,
    document.getElementById("wbTaskDetail")?.dataset?.taskId,
    document.getElementById("wbTaskList")?.dataset?.selectedTaskId,
    ...tasks.map((t) => t?.id),
  ].filter(Boolean);
  for (const pid of [...new Set(projectIds.map(String))]) {
    for (const tid of [...new Set(taskIds.map(String))]) {
      const st = reviewStore.getState(pid, tid);
      if (st?.changes?.length) {
        return { projectId: pid, taskId: tid, state: st };
      }
    }
  }
  return null;
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
  const fromLast = lastDiffContext.taskId ? String(lastDiffContext.taskId) : "";
  const tasks = Array.isArray(store.tasks) ? store.tasks : [];
  let taskId = fromStore || fromDataset || fromActive || fromHeader || fromLast || null;
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
  const loaded = !taskId ? findLoadedReviewContext() : null;
  if (loaded) {
    taskId = loaded.taskId;
  }
  let projectId =
    store.selectedProjectId ||
    detail?.dataset?.projectId ||
    agentCol?.dataset?.projectId ||
    lastDiffContext.projectId ||
    loaded?.projectId ||
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
  rememberDiffContext(projectId, taskId);
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
    return { ok: !change?.stagedPatchId, skipped: !change?.stagedPatchId };
  }
  const patchStatus = uiStatus === "accepted" ? "ACCEPTED" : uiStatus === "rejected" ? "REJECTED" : null;
  if (!patchStatus) {
    return { ok: true, skipped: true };
  }
  // 已写入的补丁不可再标 ACCEPTED/REJECTED
  const backendStatus = String(change.raw?.status || change.patchStatus || "").toUpperCase();
  if (backendStatus === "APPLIED") {
    return { ok: true, skipped: true, alreadyApplied: true };
  }
  try {
    await api.wbProjectPatchStatus({
      projectId,
      taskId,
      patchId: change.stagedPatchId,
      status: patchStatus,
    });
    return { ok: true };
  } catch (err) {
    const msg = String(err?.message || err || "");
    // 幂等 / 已写入：不打断后续写入或续跑
    if (
      msg.includes("ACCEPTED → ACCEPTED") ||
      msg.includes("APPLIED → ACCEPTED") ||
      msg.includes("APPLIED → REJECTED") ||
      /APPLIED\s*→\s*ACCEPTED/.test(msg)
    ) {
      return { ok: true, skipped: true, alreadyApplied: msg.includes("APPLIED") };
    }
    if (uiStatus === "accepted" || uiStatus === "rejected") {
      throw err;
    }
    return { ok: false, error: msg };
  }
}

/** 接受后推进：更新 Feed/主按钮；全部接受则自动进入写入 */
async function progressAfterAccept(projectId, taskId, { autoWrite = false } = {}) {
  const reviewStore = window.__wbCodeReviewStore;
  if (!reviewStore) {
    return;
  }
  const changes = reviewStore.getChanges(projectId, taskId) || [];
  const accepted = reviewStore.getAcceptedChanges(projectId, taskId) || [];
  const allAccepted = changes.length > 0 && accepted.length === changes.length;
  window.__wbActivityFeed?.markDiffAccepted?.({ autoWrite: Boolean(autoWrite && allAccepted) });
  window.__wbUpsertComposerStep?.(
    "await_diff",
    allAccepted ? "done" : "pending",
    allAccepted
      ? "变更已全部接受，准备写入"
      : `已接受 ${accepted.length}/${changes.length}，请继续审阅或写入`
  );
  window.__wbSetComposerPhase?.("diff_accepted");
  window.__wbSyncComposerPhaseFromReview?.();
  renderDiffReviewPanel({ projectId, taskId, writing: Boolean(autoWrite && allAccepted) });
  if (autoWrite && allAccepted) {
    toast("变更已全部接受，正在写入项目…", "success");
    await window.__wbApplyAcceptedDiffs?.({
      projectId,
      taskId,
      autoApprove: true,
    });
  } else if (allAccepted) {
    toast("变更已全部接受，请点击「写入并接受」", "success");
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
  if (state?.emptyReason === "rejected") {
    return {
      title: "上次变更已拒绝",
      desc: state.emptyHint || "当前没有可审阅的 Diff。请重新生成代码变更后再审阅。",
      primaryAction: "regen-patch",
      primaryLabel: "生成代码变更",
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

function renderDiffReviewPanel(explicit = null) {
  const panel = ensureDiffReviewMount();
  if (!panel) {
    return;
  }
  const reviewStore = window.__wbCodeReviewStore;
  let projectId = explicit?.projectId || null;
  let taskId = explicit?.taskId || null;
  if (!projectId || !taskId) {
    const ctx = getContext();
    projectId = projectId || ctx.projectId;
    taskId = taskId || ctx.taskId;
  }
  // 已加载过 Diff 时，禁止被空 context 的重绘盖回「请选择任务」
  if (!projectId || !taskId) {
    const loaded = findLoadedReviewContext();
    if (loaded) {
      projectId = loaded.projectId;
      taskId = loaded.taskId;
      rememberDiffContext(projectId, taskId);
    }
  }
  const tasks = window.__wbStore?.getState?.().tasks || [];
  const task = tasks.find((t) => t.id === taskId) || null;
  if (!projectId || !taskId) {
    renderEmptyDiffState(panel, resolveEmptyState({ projectId, taskId, state: null, task: null }));
    return;
  }
  rememberDiffContext(projectId, taskId);
  const state = reviewStore.getState(projectId, taskId);
  if (!state.changes.length) {
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
  const allAccepted = state.changes.length > 0 && acceptedCount === state.changes.length;
  const writing = Boolean(explicit?.writing);
  const reviewLocked = writing || allAccepted;
  const viewMode = state.viewMode === "split" ? "split" : "unified";
  const fileCards = state.changes
    .map((c) => {
      const active = c.id === selected?.id ? " is-active" : "";
      const collapsed = c.id !== selected?.id ? " is-collapsed" : "";
      const typeBadge =
        c.changeType === "add" ? "新增" : c.changeType === "delete" ? "删除" : "修改";
      const statusText = writing && c.reviewStatus === "accepted" ? "写入中" : statusLabel(c.reviewStatus);
      const actionsHtml = reviewLocked
        ? ""
        : `<div class="wb-diff-card__actions">
              <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-accept-one" data-change-id="${escapeHtml(c.id)}">接受</button>
              <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-reject-one" data-change-id="${escapeHtml(c.id)}">拒绝</button>
              <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-revise-one" data-change-id="${escapeHtml(c.id)}">需修改</button>
            </div>`;
      return `
        <article class="wb-diff-card${active}${collapsed}${writing ? " is-writing" : ""}" data-change-id="${escapeHtml(c.id)}">
          <header class="wb-diff-card__head">
            <button type="button" class="wb-diff-card__toggle" aria-expanded="${c.id === selected?.id ? "true" : "false"}">
              <span class="wb-diff-card__file-icon" aria-hidden="true"></span>
              <code class="wb-diff-card__path">${escapeHtml(c.path)}</code>
              <span class="wb-diff-review__status wb-diff-review__status--${escapeHtml(writing ? "accepted" : c.reviewStatus)}">${escapeHtml(statusText)}</span>
              <span class="wb-diff-card__type">${escapeHtml(typeBadge)}</span>
              <span class="wb-diff-card__stats"><span class="is-add">+${c.additions}</span> <span class="is-del">-${c.deletions}</span></span>
            </button>
            ${actionsHtml}
          </header>
          ${c.summary ? `<p class="wb-diff-card__summary">${escapeHtml(c.summary)}</p>` : ""}
          ${renderRiskStrip(c)}
          <div class="wb-diff-card__body">
            <div class="wb-diff-card__diff scroll-tech">${renderDiffLines(c.diff, viewMode)}</div>
          </div>
        </article>
      `;
    })
    .join("");
  const toolbarLeft = reviewLocked
    ? `<div class="wb-diff-review__view-toggle" role="group" aria-label="Diff 视图">
            <button type="button" class="wb-diff-view-btn ${viewMode === "unified" ? "is-active" : ""}" data-view="unified">逐文件查看</button>
            <button type="button" class="wb-diff-view-btn ${viewMode === "split" ? "is-active" : ""}" data-view="split">并排视图</button>
          </div>`
    : `<button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-accept-all">全部接受</button>
          <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-diff-reject-all">全部拒绝</button>
          <div class="wb-diff-review__view-toggle" role="group" aria-label="Diff 视图">
            <button type="button" class="wb-diff-view-btn ${viewMode === "unified" ? "is-active" : ""}" data-view="unified">逐文件查看</button>
            <button type="button" class="wb-diff-view-btn ${viewMode === "split" ? "is-active" : ""}" data-view="split">并排视图</button>
          </div>`;
  const toolbarRight = writing
    ? `<span class="wb-diff-review__meta">正在写入 ${acceptedCount} 个已接受文件…</span>`
    : allAccepted
      ? `<span class="wb-diff-review__meta">${state.changes.length} 个文件 · 已全部接受</span>
          <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-diff-apply-batch">写入并继续</button>`
      : `<span class="wb-diff-review__meta">${state.changes.length} 个文件 · 待审 ${pendingCount} · 已接受 ${acceptedCount}</span>
          <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-diff-apply-batch">写入并接受 (${acceptedCount})</button>`;
  panel.innerHTML = `
    <header class="wb-diff-review__head wb-diff-review__head--codex">
      <div class="wb-diff-review__toolbar wb-diff-review__toolbar--codex">
        <div class="wb-diff-review__toolbar-left">
          ${toolbarLeft}
        </div>
        <div class="wb-diff-review__toolbar-right">
          ${toolbarRight}
        </div>
      </div>
    </header>
    <div class="wb-diff-review__stack scroll-tech" role="list">
      ${fileCards}
    </div>
  `;
  panel.querySelectorAll(".wb-diff-card__toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const card = btn.closest("[data-change-id]");
      const id = card?.dataset?.changeId;
      if (id) {
        reviewStore.setSelectedChange(projectId, taskId, id);
      }
    });
  });
  panel.querySelectorAll(".wb-diff-accept-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void (async () => {
        try {
          await syncPatchReviewStatus(
            projectId,
            taskId,
            btn.dataset.changeId,
            reviewStore.REVIEW_STATUS.ACCEPTED
          );
          await progressAfterAccept(projectId, taskId, { autoWrite: true });
        } catch (err) {
          toast(err?.message || "接受补丁失败，请重试", "error");
          renderDiffReviewPanel({ projectId, taskId });
        }
      })();
    });
  });
  panel.querySelectorAll(".wb-diff-reject-one").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void (async () => {
        try {
          await syncPatchReviewStatus(
            projectId,
            taskId,
            btn.dataset.changeId,
            reviewStore.REVIEW_STATUS.REJECTED
          );
          toast("已拒绝该文件变更", "info");
        } catch (err) {
          toast(err?.message || "拒绝补丁失败", "error");
        }
      })();
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
        renderDiffReviewPanel({ projectId, taskId });
        toast("已提交修改意见，正在重新生成变更", "info");
      })();
    });
  });
  panel.querySelector(".wb-diff-accept-all")?.addEventListener("click", () => {
    if (!state.changes.length) {
      toast("当前没有可写入的代码变更。", "warn");
      return;
    }
    void (async () => {
      try {
        reviewStore.acceptAll(projectId, taskId);
        for (const c of state.changes) {
          if (c.stagedPatchId) {
            await syncPatchReviewStatus(projectId, taskId, c.id, reviewStore.REVIEW_STATUS.ACCEPTED);
          }
        }
        await progressAfterAccept(projectId, taskId, { autoWrite: true });
      } catch (err) {
        toast(err?.message || "接受补丁失败，请重试", "error");
        renderDiffReviewPanel({ projectId, taskId });
      }
    })();
  });
  panel.querySelector(".wb-diff-reject-all")?.addEventListener("click", () => {
    if (!state.changes.length) {
      toast("当前没有可审阅的代码变更。", "warn");
      return;
    }
    void (async () => {
      try {
        reviewStore.rejectAll(projectId, taskId);
        for (const c of state.changes) {
          if (c.stagedPatchId) {
            await syncPatchReviewStatus(projectId, taskId, c.id, reviewStore.REVIEW_STATUS.REJECTED);
          }
        }
        toast("已拒绝全部变更", "info");
      } catch (err) {
        toast(err?.message || "拒绝补丁失败", "error");
      }
    })();
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
    renderDiffReviewPanel({ projectId, taskId, writing: true });
    void window.__wbApplyAcceptedDiffs?.({
      projectId,
      taskId,
      autoApprove: true,
    });
  });
  window.__wbBindDiffResizer?.();
  window.__wbRefreshDiffTabBadge?.();
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
