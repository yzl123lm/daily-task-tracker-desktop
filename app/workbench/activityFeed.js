/**
 * Codex-style Agent Activity Feed — presentation only.
 * Data comes from agent events / composer steps / staged patches.
 */
(function () {
  const MAX_FEED_ITEMS = 80;
  const DIFF_CARD_ID = "diff_card_current";
  const RUNBOOK_CARD_ID = "runbook_delivery_current";
  /** @type {Map<string, object>} */
  const agentEventMap = new Map();
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
    if (s === "done" || s === "completed" || s === "success" || s === "accepted" || s === "skipped") {
      return "success";
    }
    if (s === "error" || s === "failed") {
      return "failed";
    }
    if (s === "waiting" || s === "await_write") {
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

  function statusLabel(cls, item) {
    if (item?.kind === "diff") {
      if (item.writing) {
        return "写入中";
      }
      if (item.writePending) {
        return "待写入";
      }
      if (cls === "success") {
        return item.title?.includes("写入") ? "已写入" : "已接受";
      }
      if (cls === "waiting") {
        return "等待审阅";
      }
    }
    const map = {
      success: item?.status === "skipped" || String(item?.summary || "").includes("跳过") ? "已跳过" : "完成",
      failed: "失败",
      waiting: "等待审阅",
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
      return "●";
    }
    return "○";
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

  function formatDuration(ms) {
    if (ms == null || Number.isNaN(Number(ms))) {
      return "";
    }
    const n = Number(ms);
    if (n < 1000) {
      return `${Math.max(0, Math.round(n))}ms`;
    }
    return `${(n / 1000).toFixed(1)}s`;
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

  function isDiffWaitingPayload(payload) {
    if (!payload) {
      return false;
    }
    const stepKey = payload.stepKey || "";
    const phase = payload.phase || "";
    const tool = payload.toolName || "";
    if (payload.kind === "diff") {
      return true;
    }
    // 仅 Diff 审阅等待；方案待确认（plan_ready）不是 Diff 卡
    if (stepKey === "await_diff") {
      return true;
    }
    if (stepKey === "generate_patch" && payload.status === "waiting") {
      return true;
    }
    if (phase === "WAITING_REVIEW" && stepKey !== "plan_ready") {
      return true;
    }
    if (tool === "stage_patch" && (payload.status === "success" || payload.status === "waiting")) {
      return true;
    }
    return false;
  }

  function getAgentEventKey(event) {
    if (!event) {
      return `anon_${Date.now()}`;
    }
    if (isDiffWaitingPayload(event) || event.kind === "diff") {
      return DIFF_CARD_ID;
    }
    if (event.id && String(event.id).startsWith("composer_")) {
      // composer steps: stable by step id (strip status so running→success updates)
      return String(event.id);
    }
    if (event.patchId || event.stagedPatchId) {
      return `patch_${event.patchId || event.stagedPatchId}`;
    }
    // 工具调用可多次：保留 eventId；纯步骤/阶段生命周期按 run+stepKey 合并，避免「进行中」与「完成」各占一行
    const step = event.stepKey || event.phase || "";
    if (event.toolName) {
      if (event.eventId) {
        return String(event.eventId);
      }
      return `${event.agentRunId || "local"}:tool:${event.toolName}:${event.eventId || event.at || Date.now()}`;
    }
    if (step) {
      return `${event.agentRunId || "local"}:step:${step}`;
    }
    if (event.eventId) {
      return String(event.eventId);
    }
    return `${event.agentRunId || "local"}:step:unknown`;
  }

  function inferKind(payload) {
    if (isDiffWaitingPayload(payload)) {
      return "diff";
    }
    const stepKey = payload.stepKey || "";
    const tool = payload.toolName || "";
    const phase = payload.phase || "";
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
    const kind = inferKind(payload);
    const title = strip(payload.title || payload.label || stepKey);
    const summary = toolSummary(
      payload.toolName,
      payload.toolInputSummary,
      payload.toolOutputSummary,
      payload.summary || payload.detail || payload.error || ""
    );
    const id = getAgentEventKey({ ...payload, kind, stepKey });
    return {
      id,
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
      agentRunId: payload.agentRunId || null,
      patchId: payload.patchId || payload.stagedPatchId || null,
      eventId: payload.eventId || null,
    };
  }

  function feedItemsFromMap() {
    return [...agentEventMap.values()];
  }

  function preferFeedStatus(oldStatus, newStatus) {
    const rank = {
      failed: 5,
      success: 4,
      waiting: 3,
      running: 2,
      queued: 1,
      canceled: 1,
    };
    const o = rank[statusClass(oldStatus)] || 0;
    const n = rank[statusClass(newStatus)] || 0;
    return n >= o ? newStatus : oldStatus;
  }

  function upsertAgentEvent(event) {
    const item = event?.id ? event : normalizeFeedItem(event);
    if (!item?.id) {
      return;
    }
    let key = item.id;
    // 非工具步骤按 stepKey 折叠，避免 hydrate(eventId) 与 composer_* 各留一行「进行中/完成」
    if (item.stepKey && item.kind !== "tool" && item.kind !== "diff") {
      const canonical = `step:${item.stepKey}`;
      for (const [k, v] of [...agentEventMap.entries()]) {
        if (k === DIFF_CARD_ID) continue;
        if (v.kind === "tool" || v.kind === "diff") continue;
        if (v.stepKey === item.stepKey && k !== canonical) {
          agentEventMap.delete(k);
        }
      }
      key = canonical;
      item.id = canonical;
    }
    const old = agentEventMap.get(key);
    if (old) {
      agentEventMap.set(key, {
        ...old,
        ...item,
        status: preferFeedStatus(old.status, item.status),
        // Keep earliest timestamp for stable sort; refresh status/summary
        at: old.at || item.at,
        files: item.files?.length ? item.files : old.files,
        diffCount: item.diffCount || old.diffCount,
        title: item.title || old.title,
        summary: item.summary || old.summary,
      });
    } else {
      agentEventMap.set(key, item);
      if (agentEventMap.size > MAX_FEED_ITEMS) {
        const keys = [...agentEventMap.keys()];
        keys.slice(0, keys.length - MAX_FEED_ITEMS).forEach((k) => {
          if (k !== DIFF_CARD_ID) {
            agentEventMap.delete(k);
          }
        });
      }
    }
  }

  function resetActivityFeed() {
    agentEventMap.clear();
    renderActivityFeed();
  }

  function upsertDiffCard(partial) {
    const existing = agentEventMap.get(DIFF_CARD_ID);
    const next = {
      id: DIFF_CARD_ID,
      kind: "diff",
      stepKey: "await_diff",
      phase: "WAITING_REVIEW",
      status: "waiting",
      title: partial.title || existing?.title || "已生成代码变更",
      summary: partial.summary || existing?.summary || "请在 Diff 审阅面板确认变更",
      toolName: null,
      toolInputSummary: "",
      toolOutputSummary: "",
      detail: partial.detail || existing?.detail || "",
      error: "",
      at: existing?.at || partial.at || new Date().toISOString(),
      startedAt: existing?.startedAt || partial.startedAt || null,
      endedAt: partial.endedAt || existing?.endedAt || null,
      durationMs: partial.durationMs || existing?.durationMs || null,
      files: Array.isArray(partial.files) && partial.files.length ? partial.files : existing?.files || [],
      diffCount: partial.diffCount || existing?.diffCount || (partial.files?.length || 0),
      patchId: partial.patchId || existing?.patchId || null,
      writePending: partial.writePending != null ? partial.writePending : existing?.writePending || false,
      writing: partial.writing != null ? partial.writing : existing?.writing || false,
    };
    if (partial.status) {
      // Diff 写入中保留 running；其它 running 仍映射为 waiting（审阅态）
      next.status =
        partial.status === "running" && !next.writing ? "waiting" : partial.status;
    }
    upsertAgentEvent(next);
  }

  function markDiffAccepted({ autoWrite = false } = {}) {
    const existing = agentEventMap.get(DIFF_CARD_ID);
    upsertDiffCard({
      title: existing?.title || "代码变更已接受",
      summary: autoWrite ? "正在写入项目目录…" : "下一步：写入项目目录",
      status: autoWrite ? "running" : "accepted",
      writePending: true,
      writing: Boolean(autoWrite),
      files: existing?.files,
      diffCount: existing?.diffCount,
      at: existing?.at,
    });
    renderActivityFeed();
  }

  function markDiffWriting() {
    const existing = agentEventMap.get(DIFF_CARD_ID);
    upsertDiffCard({
      title: existing?.title || "代码变更已接受",
      summary: "正在写入项目目录…",
      status: "running",
      writePending: true,
      writing: true,
      files: existing?.files,
      diffCount: existing?.diffCount,
      at: existing?.at,
    });
    renderActivityFeed();
  }

  function markDiffWritten() {
    const existing = agentEventMap.get(DIFF_CARD_ID);
    if (existing) {
      upsertDiffCard({
        title: "代码已写入",
        summary: "变更已写入项目目录，任务继续执行",
        status: "success",
        writePending: false,
        writing: false,
        files: existing.files,
        diffCount: existing.diffCount,
        at: existing.at,
      });
    }
    // 写入成功后收口仍「进行中」的 stage_patch / 待写入步骤，避免 Feed 残留
    finalizeOpenSteps({
      keepStepKeys: ["run_verify", "complete"],
      markAs: "success",
      detail: "已随写入完成",
    });
    renderActivityFeed();
  }

  function pushAgentEvent(payload) {
    const item = normalizeFeedItem(payload);
    if (!item) {
      return;
    }
    if (item.kind === "diff" || isDiffWaitingPayload(payload)) {
      upsertDiffCard({
        title: item.title?.includes("变更") ? item.title : `已生成代码变更`,
        summary: item.summary,
        status: item.status === "success" ? "waiting" : item.status,
        files: item.files,
        diffCount: item.diffCount,
        at: item.at,
        detail: item.detail,
        patchId: item.patchId,
      });
      renderActivityFeed();
      return;
    }
    upsertAgentEvent(item);
    renderActivityFeed();
  }

  function pushComposerStep(step) {
    if (!step?.id) {
      return;
    }
    if (step.id === "await_diff" || (step.id === "generate_patch" && step.status === "waiting")) {
      upsertDiffCard({
        title: step.label || "等待用户审阅 Diff",
        summary: step.detail || "",
        status: step.status === "done" ? "success" : "waiting",
        at: step.at,
      });
      renderActivityFeed();
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

  /** 收口仍显示「进行中/等待中」的步骤行，与 composer 时间线对齐 */
  function finalizeOpenSteps({
    keepStepKeys = [],
    markAs = "success",
    detail = "",
  } = {}) {
    const keep = new Set(keepStepKeys);
    let changed = false;
    for (const [id, item] of agentEventMap) {
      if (id === DIFF_CARD_ID) continue;
      if (item.kind === "diff") continue;
      if (keep.has(item.stepKey)) continue;
      const cls = statusClass(item.status);
      if (cls !== "running" && cls !== "queued") continue;
      agentEventMap.set(id, {
        ...item,
        status: markAs,
        summary: detail || item.summary,
        endedAt: item.endedAt || new Date().toISOString(),
      });
      changed = true;
    }
    if (changed) {
      renderActivityFeed();
    }
  }

  function clearDiffCard() {
    if (!agentEventMap.has(DIFF_CARD_ID)) {
      return;
    }
    agentEventMap.delete(DIFF_CARD_ID);
    renderActivityFeed();
  }

  function pushDiffSummary(changes) {
    const list = Array.isArray(changes) ? changes : [];
    if (!list.length) {
      // 无 STAGED/ACCEPTED/REVISION 可审阅补丁时，强制去掉「等待审阅」Diff 卡
      clearDiffCard();
      return;
    }
    const lines = list.slice(0, 6).map((c) => {
      const type =
        c.changeType === "add" ? "新增" : c.changeType === "delete" ? "删除" : "修改";
      return `${c.path || "file"} · ${type} (+${c.additions || 0}/-${c.deletions || 0})`;
    });
    const patchKey = list
      .map((c) => c.stagedPatchId || c.id)
      .filter(Boolean)
      .sort()
      .join("_");
    upsertDiffCard({
      title: `已生成 ${list.length} 个代码变更`,
      summary: lines.join("\n"),
      status: "waiting",
      files: list.map((c) => ({
        path: c.path,
        changeType: c.changeType,
        additions: c.additions,
        deletions: c.deletions,
        stagedPatchId: c.stagedPatchId,
        id: c.id,
      })),
      diffCount: list.length,
      patchId: patchKey || null,
      at: new Date().toISOString(),
    });
    renderActivityFeed();
  }

  function hydrateFromEvents(events) {
    (events || []).forEach((ev) => {
      const item = normalizeFeedItem(ev);
      if (!item) {
        return;
      }
      if (item.kind === "diff" || isDiffWaitingPayload(ev)) {
        // hydrate 时不凭历史 WAITING_REVIEW 造 Diff 卡；有真实文件/补丁信息才保留
        const hasFiles =
          (Array.isArray(item.files) && item.files.length > 0) ||
          item.diffCount > 0 ||
          Boolean(item.patchId);
        if (!hasFiles) {
          return;
        }
        upsertDiffCard({
          title: item.title,
          summary: item.summary,
          status: item.status === "success" ? "waiting" : item.status,
          files: item.files,
          diffCount: item.diffCount,
          at: item.at,
          detail: item.detail,
          patchId: item.patchId,
        });
        return;
      }
      upsertAgentEvent(item);
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
    const cls = statusClass(item.status);
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
      : "";
    const primaryAction = item.writing
      ? `<span class="wb-activity-diff__writing">正在写入…</span>`
      : item.writePending
        ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-apply-diff">写入并继续</button>`
        : cls === "success"
          ? ""
          : `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-open-diff">查看 Diff</button>
            <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-revise-diff">需修改</button>`;
    return `
      <article class="wb-activity-item wb-activity-item--diff wb-activity-item--compact is-${escapeHtml(cls)}" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-item__rail"><span class="wb-activity-item__dot">${statusIcon(cls)}</span></div>
        <div class="wb-activity-item__body">
          <header class="wb-activity-item__head">
            <strong class="wb-activity-item__title">${escapeHtml(item.title || "已生成代码变更")}</strong>
            <span class="wb-activity-item__status">${escapeHtml(statusLabel(cls, item))}</span>
            <time class="wb-activity-item__time">${escapeHtml(formatTime(item.at))}</time>
          </header>
          ${fileRows ? `<ul class="wb-activity-diff__files">${fileRows}</ul>` : item.summary ? `<p class="wb-activity-item__summary">${escapeHtml(item.summary)}</p>` : ""}
          ${primaryAction ? `<div class="wb-activity-diff__actions">${primaryAction}</div>` : ""}
        </div>
      </article>
    `;
  }

  function renderStepCard(item) {
    const cls = statusClass(item.status);
    const hasDetail = Boolean(item.toolInputSummary || item.toolOutputSummary || item.detail || item.error);
    const expandDefault = cls === "running" || cls === "waiting" || cls === "failed";
    const dur = formatDuration(item.durationMs);
    const toolLine =
      item.kind === "tool" && item.toolName
        ? `<span class="wb-activity-item__tool">${escapeHtml(item.toolName)}</span>`
        : "";
    const compactSummary =
      item.kind === "tool" && cls === "success"
        ? `<p class="wb-activity-item__summary wb-activity-item__summary--one">${escapeHtml(
            `调用 ${item.toolName}${dur ? ` · ${dur}` : ""}${item.summary ? ` · ${item.summary}` : ""}`
          )}</p>`
        : item.summary && cls !== "success"
          ? `<p class="wb-activity-item__summary">${escapeHtml(item.summary)}</p>`
          : item.summary && item.kind !== "tool"
            ? `<p class="wb-activity-item__summary">${escapeHtml(item.summary)}</p>`
            : "";
    return `
      <article class="wb-activity-item wb-activity-item--${escapeHtml(item.kind)} wb-activity-item--compact is-${escapeHtml(cls)}" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-item__rail">
          <span class="wb-activity-item__dot ${cls === "running" ? "is-spin" : ""}">${statusIcon(cls)}</span>
        </div>
        <div class="wb-activity-item__body">
          <header class="wb-activity-item__head">
            <strong class="wb-activity-item__title">${escapeHtml(item.title)}</strong>
            ${toolLine}
            <span class="wb-activity-item__status">${escapeHtml(statusLabel(cls))}${dur && cls === "success" ? ` · ${escapeHtml(dur)}` : ""}</span>
            <time class="wb-activity-item__time">${escapeHtml(formatTime(item.at))}</time>
          </header>
          ${item.kind === "tool" && cls === "success" ? compactSummary : item.kind !== "tool" ? compactSummary : ""}
          ${
            hasDetail
              ? `<details class="wb-activity-item__details"${expandDefault ? " open" : ""}>
                  <summary>详情</summary>
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

  function renderUserBubble(item) {
    return `
      <div class="wb-activity-user" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-user__bubble">${escapeHtml(item.summary || item.title || "")}</div>
      </div>
    `;
  }

  function renderPlanInlineCard(item) {
    const steps = Array.isArray(item.planSteps) ? item.planSteps : [];
    const stepLis = steps
      .slice(0, 12)
      .map((s, i) => {
        const text = typeof s === "string" ? s : s.text || s.title || "";
        return `<li>${escapeHtml(`${i + 1}. ${text}`)}</li>`;
      })
      .join("");
    const badge = item.clarifying ? "需求澄清" : item.confirmed ? "计划已确认" : "待确认计划";
    const actions = item.clarifying
      ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-confirm-plan">确认规格</button>
         <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-adjust-plan">调整需求</button>`
      : item.confirmed
        ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-run-next-step">执行第 ${escapeHtml(String(item.nextStepIndex || 1))} 步</button>`
        : `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-confirm-plan">确认计划</button>
           <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-adjust-plan">调整需求</button>`;
    return `
      <article class="wb-activity-plan" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-plan__head">
          <h4>${escapeHtml(item.title || "开发计划")}</h4>
          <span class="wb-activity-plan__badge">${escapeHtml(badge)}</span>
        </div>
        ${item.summary ? `<p class="wb-activity-item__summary">${escapeHtml(item.summary)}</p>` : ""}
        ${stepLis ? `<ol class="wb-activity-plan__steps">${stepLis}</ol>` : ""}
        <div class="wb-activity-plan__actions">${actions}</div>
      </article>
    `;
  }

  function renderRunbookCard(item) {
    const guardOk = item.guardOk !== false;
    const badge = guardOk ? (item.completed ? "交付完成" : "交付摘要") : "守卫未通过";
    const badgeClass = guardOk ? "is-ok" : "is-warn";
    const md = String(item.markdown || "");
    const preview = md
      .split("\n")
      .map((line) => line.replace(/^#+\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(" · ");
    const summary = strip(item.summary || preview || item.meta || "任务交付说明");
    return `
      <article class="wb-activity-runbook" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-runbook__head">
          <h4>${escapeHtml(item.title || "交付 Runbook")}</h4>
          <span class="wb-activity-runbook__badge ${badgeClass}">${escapeHtml(badge)}</span>
        </div>
        ${item.meta ? `<p class="wb-activity-runbook__meta">${escapeHtml(item.meta)}</p>` : ""}
        <p class="wb-activity-item__summary">${escapeHtml(summary)}</p>
        ${
          md
            ? `<details class="wb-activity-runbook__details" open>
                <summary>查看完整 Runbook</summary>
                <pre class="wb-activity-runbook__body scroll-tech">${escapeHtml(md)}</pre>
              </details>`
            : ""
        }
        <div class="wb-activity-runbook__actions">
          ${
            md
              ? `<button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-copy-runbook">复制 Markdown</button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function renderGoalStepCard(item) {
    const badge =
      item.status === "done" || item.status === "success"
        ? "本步完成"
        : item.status === "running"
          ? "执行中"
          : "待执行";
    const actions =
      item.status === "done" || item.status === "success"
        ? item.allDone
          ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-complete-goals">确认完成任务</button>`
          : `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-run-next-step">执行下一步</button>
             <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-activity-pause-goals">稍后继续</button>`
        : item.status === "ready"
          ? `<button type="button" class="wb-pws-btn wb-pws-btn--primary wb-activity-run-next-step">执行本步</button>`
          : "";
    return `
      <article class="wb-activity-goal" data-feed-id="${escapeHtml(item.id)}">
        <div class="wb-activity-goal__head">
          <h4>${escapeHtml(item.title || "目标步骤")}</h4>
          <span class="wb-activity-goal__badge">${escapeHtml(badge)}</span>
        </div>
        ${item.summary ? `<p class="wb-activity-goal__meta">${escapeHtml(item.summary)}</p>` : ""}
        ${actions ? `<div class="wb-activity-goal__actions">${actions}</div>` : ""}
      </article>
    `;
  }

  function renderActivityFeed() {
    const mount = getFeedMount();
    if (!mount) {
      return;
    }
    const feedItems = feedItemsFromMap();
    if (!feedItems.length) {
      renderEmpty(mount);
      return;
    }
    const sorted = [...feedItems].sort((a, b) => String(a.at).localeCompare(String(b.at)));
    mount.innerHTML = sorted
      .map((item) => {
        if (item.kind === "user") return renderUserBubble(item);
        if (item.kind === "plan_card") return renderPlanInlineCard(item);
        if (item.kind === "goal_step") return renderGoalStepCard(item);
        if (item.kind === "runbook_card") return renderRunbookCard(item);
        if (item.kind === "diff") return renderDiffCard(item);
        return renderStepCard(item);
      })
      .join("");
    bindFeedActions(mount);
    mount.scrollTop = mount.scrollHeight;
  }

  function pushUserMessage(text) {
    const content = strip(text).trim();
    if (!content) return;
    const id = `user_${Date.now().toString(36)}`;
    agentEventMap.set(id, {
      id,
      kind: "user",
      title: "用户",
      summary: content,
      status: "success",
      at: new Date().toISOString(),
    });
    // trim
    while (agentEventMap.size > MAX_FEED_ITEMS) {
      const first = agentEventMap.keys().next().value;
      agentEventMap.delete(first);
    }
    renderActivityFeed();
  }

  function pushPlanInline(payload = {}) {
    const id = "plan_card_current";
    agentEventMap.set(id, {
      id,
      kind: "plan_card",
      title: payload.title || payload.summary || "开发计划",
      summary: strip(payload.requirementUnderstanding || payload.summary || ""),
      planSteps: payload.plan || payload.planSteps || [],
      clarifying: Boolean(payload.clarifying),
      confirmed: Boolean(payload.confirmed),
      nextStepIndex: payload.nextStepIndex || 1,
      status: payload.confirmed ? "success" : "waiting",
      at: new Date().toISOString(),
    });
    renderActivityFeed();
  }

  function pushRunbookInline(payload = {}) {
    agentEventMap.set(RUNBOOK_CARD_ID, {
      id: RUNBOOK_CARD_ID,
      kind: "runbook_card",
      title: payload.title || "交付 Runbook",
      summary: strip(payload.summary || ""),
      meta: strip(payload.meta || ""),
      markdown: String(payload.markdown || ""),
      guardOk: payload.guardOk !== false,
      completed: Boolean(payload.completed),
      status: payload.guardOk === false ? "failed" : "success",
      at: new Date().toISOString(),
    });
    renderActivityFeed();
  }

  function pushGoalStepCard(payload = {}) {
    const id = payload.id || `goal_${payload.stepId || Date.now().toString(36)}`;
    agentEventMap.set(id, {
      id,
      kind: "goal_step",
      stepId: payload.stepId || null,
      title: payload.title || "目标步骤",
      summary: strip(payload.summary || ""),
      status: payload.status || "ready",
      allDone: Boolean(payload.allDone),
      at: new Date().toISOString(),
    });
    renderActivityFeed();
  }

  function bindFeedActions(mount) {
    mount.querySelectorAll(".wb-activity-open-diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbOpenDiffReviewForCurrentTask?.({ forceReload: true });
      });
    });
    mount.querySelectorAll(".wb-activity-apply-diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        const store = window.__wbStore?.getState?.() || {};
        void window.__wbApplyAcceptedDiffs?.({
          projectId: store.selectedProjectId,
          taskId: store.selectedTaskId,
          autoApprove: true,
        });
      });
    });
    mount.querySelectorAll(".wb-activity-revise-diff").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbOpenDiffReviewForCurrentTask?.({ forceReload: true });
        window.__wbShowComposerToast?.("请在 Diff 审阅面板标记「需修改」", { type: "info" });
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
        void window.__wbOpenDiffReviewForCurrentTask?.({ forceReload: true });
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
    mount.querySelectorAll(".wb-activity-confirm-plan").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbConfirmGoalPlan?.();
      });
    });
    mount.querySelectorAll(".wb-activity-adjust-plan").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("wbAgentInput")?.focus();
        window.__wbShowComposerToast?.("可在输入框补充需求后重新生成计划", { type: "info" });
      });
    });
    mount.querySelectorAll(".wb-activity-run-next-step").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbRunNextGoalStep?.();
      });
    });
    mount.querySelectorAll(".wb-activity-pause-goals").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.__wbSetComposerPhase?.("goal_step_done");
        window.__wbShowComposerToast?.("已暂停。需要时点击「执行下一步」继续。", { type: "info" });
      });
    });
    mount.querySelectorAll(".wb-activity-complete-goals").forEach((btn) => {
      btn.addEventListener("click", () => {
        void window.__wbCompleteComposerTask?.();
      });
    });
    mount.querySelectorAll(".wb-activity-copy-runbook").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest(".wb-activity-runbook");
        const text = card?.querySelector(".wb-activity-runbook__body")?.textContent || "";
        if (!text.trim()) {
          window.__wbShowComposerToast?.("暂无 Runbook 可复制", { type: "warn" });
          return;
        }
        try {
          await navigator.clipboard.writeText(text);
          window.__wbShowComposerToast?.("Runbook 已复制", { type: "success" });
        } catch {
          window.__wbShowComposerToast?.("复制失败，请手动选择文本", { type: "warn" });
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
    if (mount && !agentEventMap.size) {
      renderEmpty(mount);
    }
  }

  window.__wbActivityFeed = {
    reset: resetActivityFeed,
    pushEvent: pushAgentEvent,
    pushStep: pushComposerStep,
    finalizeOpenSteps,
    pushDiffSummary,
    clearDiffCard,
    markDiffAccepted,
    markDiffWriting,
    markDiffWritten,
    hydrateFromEvents,
    render: renderActivityFeed,
    updateHeader: updateRunHeader,
    bind: bindActivityFeed,
    pushUserMessage,
    pushPlanInline,
    pushRunbookInline,
    pushGoalStepCard,
    getItems: () => feedItemsFromMap(),
    getAgentEventKey,
  };
})();
