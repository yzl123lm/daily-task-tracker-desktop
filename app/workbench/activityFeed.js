/**
 * Codex-style Agent Activity Feed — presentation only.
 * Data comes from agent events / composer steps / staged patches.
 */
(function () {
  const MAX_FEED_ITEMS = 120;
  let feedItems = [];
  let feedBound = false;

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function strip(text) {
    return window.__wbStripModelThinking?.(String(text || "")) || String(text || "");
  }

  function statusClass(status) {
    const s = String(status || "pending").toLowerCase();
    if (s === "done" || s === "completed" || s === "success") {
      return "success";
    }
    if (s === "error" || s === "failed") {
      return "failed";
    }
    if (s === "waiting") {
      return "waiting";
    }
    if (s === "canceled" || s === "cancelled") {
      return "canceled";
    }
    if (s === "queued" || s === "pending") {
      return "queued";
    }
    if (s === "running") {
      return "running";
    }
    return s || "queued";
  }

  function statusLabel(cls) {
    const map = {
      success: "完成",
      failed: "失败",
      waiting: "等待确认",
      running: "进行中",
      queued: "等待中",
      canceled: "已取消",
      pending: "等待中",
    };
    return map[cls] || cls;
  }

  function statusIcon(cls) {
    if (cls === "success") {
      return "✓";
    }
    if (cls === "failed") {
      return "✕";
    }
    if (cls === "waiting") {
      return "!";
    }
    if (cls === "canceled") {
      return "–";
    }
    if (cls === "running") {
      return "…";
    }
    return "·";
  }

  function formatTime(isoOrMs) {
    if (!isoOrMs) {
      return "";
    }
    const d = typeof isoOrMs === "number" ? new Date(isoOrMs) : new Date(isoOrMs);
    if (Number.isNaN(d.getTime())) {
      return "";
    }
    return d.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  function toolSummary(toolName, inputSummary, outputSummary, fallback) {
    const name = String(toolName || "").trim();
    const out = strip(outputSummary || "");
    const inp = strip(inputSummary || "");
    if (out) {
      return out;
    }
    if (inp) {
      return inp;
    }
    if (fallback) {
      return strip(fallback);
    }
    const labels = {
      list_files: "扫描项目文件",
      list_project_files: "扫描项目文件",
      read_file: "读取文件",
      search_code: "搜索代码",
      stage_patch: "生成代码变更",
      preview_diff: "生成 Diff 预览",
      git_status: "检查 Git 状态",
      run_verification: "运行验证",
      compress_context: "压缩上下文",
    };
    return labels[name] || (name ? `调用 ${name}` : "");
  }

  function inferKind(payload) {
    const stepKey = payload.stepKey || "";
    const tool = payload.toolName || "";
    const phase = payload.phase || "";
    if (tool === "stage_patch" || stepKey === "generate_patch" || stepKey === "await_diff") {
      return "diff";
    }
    if (stepKey === "plan_ready" || stepKey === "generate_plan" || phase === "PLANNING") {
      return "plan";
    }
    if (tool) {
      return "tool";
    }
    return "step";
  }

  function normalizeFeedItem(payload) {
    if (!payload || payload.visible === false || payload.debugOnly) {
      return null;
    }
    const stepKey =
      payload.stepKey ||
      payload.phase ||
      (payload.toolName ? `tool_${payload.toolName}` : "step");
    const eventId =
      payload.eventId ||
      `${payload.agentRunId || "local"}_${stepKey}_${payload.status || ""}_${payload.startedAt || payload.at || Date.now()}`;
    const kind = inferKind(payload);
    const title = strip(payload.title || payload.label || stepKey);
    const summary = toolSummary(
      payload.toolName,
      payload.toolInputSummary,
      payload.toolOutputSummary,
      payload.summary || payload.detail || payload.error || ""
    );
    return {
      id: eventId,
      kind,
      stepKey,
      phase: payload.phase || "",
      status: payload.status || "running",
      title,
      summary,
      toolName: payload.toolName || null,
      toolInputSummary: strip(payload.toolInputSummary || ""),
      toolOutputSummary: strip(payload.toolOutputSummary || ""),
      detail: strip(payload.detail || ""),
      error: strip(payload.error || ""),
      at: payload.at || (payload.startedAt ? new Date(payload.startedAt).toISOString() : new Date().toISOString()),
      startedAt: payload.startedAt || null,
      endedAt: payload.endedAt || null,
      durationMs: payload.durationMs || null,
      files: Array.isArray(payload.files) ? payload.files : [],
      diffCount: payload.diffCount || 0,
    };
  }

  function upsertFeedItem(item) {
    if (!item?.id) {
      return;
    }
    const idx = feedItems.findIndex((x) => x.id === item.id);
    if (idx >= 0) {
      feedItems[idx] = { ...feedItems[idx], ...item };
    } else {
      feedItems.push(item);
      if (feedItems.length > MAX_FEED_ITEMS) {
        feedItems = feedItems.slice(-MAX_FEED_ITEMS);
      }
    }
  }

  function resetActivityFeed() {
    feedItems = [];
    renderActivityFeed();
  }

  function pushAgentEvent(payload) {
    const item = normalizeFeedItem(payload);
    if (!item) {
      return;
    }
    upsertFeedItem(item);
    // Diff waiting: ensure a dedicated card exists
    if (
      item.kind === "diff" ||
      item.stepKey === "await_diff" ||
      (item.status === "waiting" && item.phase === "WAITING_REVIEW")
    ) {
      upsertFeedItem({
        ...item,
        id: `diff_card_${item.stepKey}_${item.at}`,
        kind: "diff",
        title: item.title || "代码变更待审阅",
        summary: item.summary || "请在 Diff 审阅面板确认变更",
        status: item.status === "running" ? "waiting" : item.status,
      });
    }
    renderActivityFeed();
  }

  function pushComposerStep(step) {
    if (!step?.id) {
      return;
    }
    pushAgentEvent({
      eventId: `composer_${step.id}`,
      stepKey: step.id,
      title: step.label || step.id,
      summary: step.detail || "",
      status: step.status,
      at: step.at,
      phase: "",
    });
  }

  function pushDiffSummary(changes) {
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) {
      return;
    }
    const lines = list.slice(0, 6).map((c) => {
      const type =
        c.changeType === "add" ? "新增" : c.changeType === "delete" ? "删除" : "修改";
      return `${c.path || "file"} · ${type} (+${c.additions || 0}/-${c.deletions || 0})`;
    });
    pushAgentEvent({
      eventId: `diff_summary_${list.map((c) => c.stagedPatchId || c.id).join("_")}`,
      stepKey: "await_diff",
      phase: "WAITING_REVIEW",
      status: "waiting",
      title: `已生成 ${list.length} 个代码变更`,
      summary: lines.join("\n"),
      files: list.map((c) => ({
        path: c.path,
        changeType: c.changeType,
        additions: c.additions,
        deletions: c.deletions,
        stagedPatchId: c.stagedPatchId,
        id: c.id,
      })),
      diffCount: list.length,
      at: new Date().toISOString(),
    });
  }

  function hydrateFromEvents(events) {
    (events || []).forEach((ev) => {
      const item = normalizeFeedItem(ev);
      if (item) {
        upsertFeedItem(item);
      }
    });
    renderActivityFeed();
  }

  function getFeedMount() {
    return document.getElementById("wbAgentActivityFeed");
  }

  function renderEmpty(mount) {
    mount.innerHTML = `
      <div class="wb-activity-empty">
        <p class="wb-activity-empty__title">等待开始执行</p>
        <p class="wb-activity-empty__desc">在下方输入开发需求并点击「开始执行」，这里会按时间展示 AI 的分析、工具调用与代码变更。</p>
      </div>
    `;
  }

  function renderDiffCard(item) {
    const files = item.files || [];
    const fileRows = files.length
      ? files
          .map((f) => {
            const type =
              f.changeType === "add" ? "新增" : f.changeType === "delete" ? "删除" : "修改";
            return `<li class="wb-activity-diff__file" data-change-id="${escapeHtml(f.id || "")}" data-path="${escapeHtml(f.path || "")}">
              <code>${escapeHtml(f.path || "")}</code>
              <span class="wb-activity-diff__type">${escapeHtml(type)}</span>
              <span class="wb-activity-diff__stats">+${f.additions || 0} -${f.deletions || 0}</span>
            </li>`;
          })
          .join("")
      : `<li class="wb-activity-diff__file"><span>${escapeHtml(item.summary || "有可审阅 Diff")}</span></li>`;
    return `
      <article class="wb-activity-item wb-activity-item--diff is-${escapeHtml(statusClass(item.status))}" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-item__rail"><span class="wb-activity-item__dot">${statusIcon(statusClass(item.status))}</span></div>
        <div class="wb-activity-item__body">
          <header class="wb-activity-item__head">
            <strong class="wb-activity-item__title">${escapeHtml(item.title)}</strong>
            <span class="wb-activity-item__status">${escapeHtml(statusLabel(statusClass(item.status)))}</span>
            <time class="wb-activity-item__time">${escapeHtml(formatTime(item.at))}</time>
          </header>
          <ul class="wb-activity-diff__files">${fileRows}</ul>
          <div class="wb-activity-diff__actions">
            <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-open-diff">查看完整 Diff</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderStepCard(item) {
    const cls = statusClass(item.status);
    const hasDetail = Boolean(item.toolInputSummary || item.toolOutputSummary || item.detail || item.error);
    const toolBadge = item.toolName
      ? `<span class="wb-activity-item__tool">${escapeHtml(item.toolName)}</span>`
      : "";
    return `
      <article class="wb-activity-item wb-activity-item--${escapeHtml(item.kind)} is-${escapeHtml(cls)}" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-item__rail">
          <span class="wb-activity-item__dot ${cls === "running" ? "is-spin" : ""}">${statusIcon(cls)}</span>
        </div>
        <div class="wb-activity-item__body">
          <header class="wb-activity-item__head">
            <strong class="wb-activity-item__title">${escapeHtml(item.title)}</strong>
            ${toolBadge}
            <span class="wb-activity-item__status">${escapeHtml(statusLabel(cls))}</span>
            <time class="wb-activity-item__time">${escapeHtml(formatTime(item.at))}</time>
          </header>
          ${item.summary ? `<p class="wb-activity-item__summary">${escapeHtml(item.summary)}</p>` : ""}
          ${
            hasDetail
              ? `<details class="wb-activity-item__details">
                  <summary>查看详情</summary>
                  <pre class="wb-activity-item__pre">${escapeHtml(
                    [item.toolInputSummary, item.toolOutputSummary, item.detail, item.error]
                      .filter(Boolean)
                      .join("\n\n")
                  )}</pre>
                </details>`
              : ""
          }
          ${
            item.kind === "plan"
              ? `<div class="wb-activity-item__actions"><button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-open-plan">查看方案</button></div>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderActivityFeed() {
    const mount = getFeedMount();
    if (!mount) {
      return;
    }
    if (!feedItems.length) {
      renderEmpty(mount);
      return;
    }
    const sorted = [...feedItems].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    mount.innerHTML = sorted
      .map((item) => (item.kind === "diff" && (item.files?.length || item.diffCount) ? renderDiffCard(item) : renderStepCard(item)))
      .join("");
    bindFeedActions(mount);
    mount.scrollTop = mount.scrollHeight;
  }

  function bindFeedActions(mount) {
    mount.querySelectorAll(".wb-activity-open-diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbOpenDiffReviewForCurrentTask?.();
      });
    });
    mount.querySelectorAll(".wb-activity-diff__file").forEach((row) => {
      row.addEventListener("click", () => {
        const changeId = row.dataset.changeId;
        const store = window.__wbStore?.getState?.() || {};
        const projectId = store.selectedProjectId;
        const taskId = store.selectedTaskId;
        if (changeId && projectId && taskId) {
          window.__wbCodeReviewStore?.setSelectedChange?.(projectId, taskId, changeId);
        }
        void window.__wbOpenDiffReviewForCurrentTask?.();
      });
    });
    mount.querySelectorAll(".wb-activity-open-plan").forEach((btn) => {
      btn.addEventListener("click", () => {
        const card = document.getElementById("wbPlanCard");
        if (card) {
          card.hidden = false;
          card.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
      });
    });
  }

  function updateRunHeader({ title, status, mode } = {}) {
    const titleEl = document.getElementById("wbAgentRunTitle");
    const statusEl = document.getElementById("wbAgentRunStatus");
    const modeEl = document.getElementById("wbAgentRunMode");
    if (titleEl && title != null) {
      titleEl.textContent = title || "当前任务";
    }
    if (statusEl && status != null) {
      statusEl.textContent = status || "";
      statusEl.hidden = !status;
    }
    if (modeEl && mode != null) {
      modeEl.textContent = mode || "";
      modeEl.hidden = !mode;
    }
  }

  function bindActivityFeed() {
    if (feedBound) {
      return;
    }
    feedBound = true;
    const mount = getFeedMount();
    if (mount && !feedItems.length) {
      renderEmpty(mount);
    }
  }

  window.__wbActivityFeed = {
    reset: resetActivityFeed,
    pushEvent: pushAgentEvent,
    pushStep: pushComposerStep,
    pushDiffSummary,
    hydrateFromEvents,
    render: renderActivityFeed,
    updateHeader: updateRunHeader,
    bind: bindActivityFeed,
    getItems: () => [...feedItems],
  };
})();
