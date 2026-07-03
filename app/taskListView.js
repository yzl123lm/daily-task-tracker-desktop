(function (global) {
  const ISSUE_TYPE_TAG_RULES = [
    { match: "历史订单", cls: "issue-tag--blue" },
    { match: "实名认证", cls: "issue-tag--purple" },
    { match: "CRM", cls: "issue-tag--cyan" },
    { match: "签字", cls: "issue-tag--cyan" },
    { match: "缺陷", cls: "issue-tag--orange" },
    { match: "需求", cls: "issue-tag--green" },
  ];

  let lastPageSignature = "";

  function issueTypeTagClass(name) {
    const n = String(name || "");
    const hit = ISSUE_TYPE_TAG_RULES.find((r) => n.includes(r.match));
    if (hit) {
      return hit.cls;
    }
    const palette = ["issue-tag--blue", "issue-tag--purple", "issue-tag--cyan", "issue-tag--green", "issue-tag--orange"];
    let h = 0;
    for (let i = 0; i < n.length; i += 1) {
      h = (h + n.charCodeAt(i)) % palette.length;
    }
    return palette[h];
  }

  function issueTypeTagHtml(name, taskId) {
    const text = String(name || "—");
    const cls = issueTypeTagClass(text);
    if (taskId) {
      return `<span role="button" tabindex="0" class="issue-tag issue-tag-clickable ${cls}" data-action="viewTaskContent" data-id="${escapeHtmlAttr(taskId)}" title="点击查看完整跟进事物内容">${escapeHtml(text)}</span>`;
    }
    return `<span class="issue-tag ${cls}">${escapeHtml(text)}</span>`;
  }

  function priorityTagHtml(priority) {
    const p = String(priority || "中");
    const cls = p === "高" ? "priority-tag--high" : p === "低" ? "priority-tag--low" : "priority-tag--mid";
    return `<span class="priority-tag ${cls}">${escapeHtml(p)}</span>`;
  }

  function statusTagHtml(status) {
    const s = String(status || "待处理");
    const map = {
      待处理: "status-tag--pending",
      处理中: "status-tag--doing",
      已完结: "status-tag--done",
      已阻塞: "status-tag--blocked",
      已挂起: "status-tag--suspended",
      已取消: "status-tag--cancelled",
    };
    return `<span class="status-tag ${map[s] || "status-tag--pending"}">${escapeHtml(s)}</span>`;
  }

  function splitDateTimeDisplay(str) {
    const s = String(str || "").trim();
    if (!s) {
      return { date: "—", time: "" };
    }
    const idx = s.indexOf(" ");
    if (idx > 0) {
      return { date: s.slice(0, idx), time: s.slice(idx + 1).trim() };
    }
    return { date: s, time: "" };
  }

  function cellEllipsisHtml(text, maxLen = 48, extraClass = "") {
    const raw = String(text == null ? "" : text);
    const truncated = raw.length > maxLen ? `${raw.slice(0, maxLen)}…` : raw;
    const needsTip = raw.length > maxLen;
    const cls = `cell-ellipsis ${extraClass}`.trim();
    if (!needsTip) {
      return `<span class="${cls}">${escapeHtml(truncated)}</span>`;
    }
    return `<span class="${cls} tooltip-host" data-tooltip="${escapeHtmlAttr(raw)}">${escapeHtml(truncated)}</span>`;
  }

  function personMetaHtml(name) {
    return `<span class="person-meta">${escapeHtml(String(name || "—"))}</span>`;
  }

  function createdAtCellHtml(createdAt) {
    const { date, time } = splitDateTimeDisplay(createdAt);
    if (!time) {
      return `<span class="time-stack"><span class="time-stack-date">${escapeHtml(date)}</span></span>`;
    }
    return `<span class="time-stack"><span class="time-stack-date">${escapeHtml(date)}</span><span class="time-stack-time">${escapeHtml(time)}</span></span>`;
  }

  function renderTaskStatsHtml(total, pending, filtered, tierCounts) {
    return `共 <strong>${total}</strong> 条，未完结 <strong>${pending}</strong> 条，筛选 <strong>${filtered}</strong> 条 · 风险 <span class="risk-stat"><span class="risk-dot risk-dot--red" title="红色风险">${tierCounts.red}</span>/<span class="risk-dot risk-dot--orange" title="橙色风险">${tierCounts.orange}</span>/<span class="risk-dot risk-dot--yellow" title="黄色风险">${tierCounts.yellow}</span></span>`;
  }

  function riskTierBadge(risk) {
    if (!risk || !risk.tier || risk.tier === "none") {
      return "<span class='muted'>—</span>";
    }
    const cls =
      risk.tier === "red"
        ? "risk-tier risk-tier--red"
        : risk.tier === "orange"
          ? "risk-tier risk-tier--orange"
          : "risk-tier risk-tier--yellow";
    return `<span class="${cls}" title="${escapeHtml((risk.reasons || []).join("；"))}">${escapeHtml(risk.tierLabel || risk.tier)}</span>`;
  }

  function pageSignature(pageSlice) {
    return pageSlice.map((t) => `${t.id}:${t.status}:${t.updatedAt || ""}`).join("|");
  }

  /**
   * 增量渲染当前页：签名未变时跳过 DOM 重建；否则用 DocumentFragment 批量挂载。
   */
  function renderTaskListPage({
    pageSlice,
    baseIndex,
    taskTableBody,
    taskCardListEl,
    viewMode = "cards",
    calcTaskRisk,
    latestRemark,
    taskRowClass = () => "task-row-v2",
    getLocalDateKey = () => "",
  }) {
    const sig = `${viewMode}|${pageSignature(pageSlice)}`;
    const rowCount = taskTableBody ? taskTableBody.childElementCount : 0;
    const cardCount = taskCardListEl ? taskCardListEl.childElementCount : 0;
    if (
      sig === lastPageSignature &&
      (viewMode === "table" ? rowCount === pageSlice.length : cardCount === pageSlice.length)
    ) {
      return false;
    }
    lastPageSignature = sig;

    const showTable = viewMode === "table";
    const showCards = viewMode === "cards";

    if (taskTableBody) {
      taskTableBody.innerHTML = "";
    }
    if (taskCardListEl) {
      taskCardListEl.innerHTML = "";
    }

    if (showTable && taskTableBody) {
      const frag = document.createDocumentFragment();
      pageSlice.forEach((task, idx) => {
        const remark = latestRemark(task);
        const hasHistory = Array.isArray(task.remarks) && task.remarks.length > 0;
        const risk = calcTaskRisk(task);
        const terminal = task.status === "已完结" || task.status === "已取消";
        const deadlineRaw = task.deadline || "";
        const deadlineHtml = deadlineRaw
          ? task.deadline < getLocalDateKey() && !terminal
            ? `<span class="task-deadline-over">${escapeHtml(deadlineRaw)}</span>`
            : escapeHtml(deadlineRaw)
          : `<span class="placeholder-dash">-</span>`;

        const tr = document.createElement("tr");
        tr.className = taskRowClass();
        tr.dataset.id = task.id;
        tr.innerHTML = `
      <td class="td-center td-seq">${baseIndex + idx + 1}</td>
      <td class="td-id">${cellEllipsisHtml(task.taskId, 22, "mono-id")}</td>
      <td class="td-issue-type">${issueTypeTagHtml(task.issueType, task.id)}</td>
      <td class="td-content">${cellEllipsisHtml(task.content, 80, "cell-content-2l")}</td>
      <td class="td-center">${priorityTagHtml(task.priority)}</td>
      <td class="td-center">${deadlineHtml}</td>
      <td class="td-center">${riskTierBadge(risk)}</td>
      <td class="col-reporter-cell">${personMetaHtml(task.reporter)}</td>
      <td class="col-handler-cell">${personMetaHtml(task.handler)}</td>
      <td class="td-center">${createdAtCellHtml(task.createdAt)}</td>
      <td class="td-center remark-cell-wrap">
        <button type="button" class="remark-icon-btn" data-action="openRemark" data-id="${escapeHtmlAttr(task.id)}" title="${hasHistory ? "查看历史备注" : "添加备注"}" aria-label="备注">📝</button>
      </td>
      <td class="td-center col-status">${statusTagHtml(task.status)}</td>
      <td class="task-ops-cell">
        <div class="task-ops-inline">
          ${
            terminal
              ? `<span class="muted" title="终态任务">—</span>`
              : `<button class="task-ops-btn secondary" type="button" data-action="changeStatus" data-id="${escapeHtmlAttr(task.id)}">状态</button>`
          }
          ${
            !terminal
              ? `<button class="task-ops-btn success" type="button" data-action="complete" data-id="${escapeHtmlAttr(task.id)}">完结</button>`
              : ""
          }
          ${
            task.status !== "已取消"
              ? `<button class="task-ops-btn danger" type="button" data-action="delete" data-id="${escapeHtmlAttr(task.id)}">删除</button>`
              : ""
          }
        </div>
      </td>
    `;
        frag.appendChild(tr);
      });
      taskTableBody.appendChild(frag);
    }

    if (showCards && taskCardListEl) {
      const cardFrag = document.createDocumentFragment();
      pageSlice.forEach((task, cardIndex) => {
        const risk = calcTaskRisk(task);
        const terminal = task.status === "已完结" || task.status === "已取消";
        const deadlineRaw = task.deadline || "";
        const deadlineHtml = deadlineRaw
          ? task.deadline < getLocalDateKey() && !terminal
            ? `<span class="task-deadline-over">${escapeHtml(deadlineRaw)}</span>`
            : escapeHtml(deadlineRaw)
          : `<span class="placeholder-dash">-</span>`;

        const statusKey = String(task.status || "待处理");
        const priorityKey = String(task.priority || "中");
        const card = document.createElement("article");
        card.className = "task-card jl-task-card jl-perf-surface";
        card.dataset.id = task.id;
        card.style.setProperty("--jl-card-index", String(cardIndex));
        card.dataset.priority = priorityKey;
        card.dataset.status = statusKey;
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute("aria-label", `任务 ${task.taskId}，点击查看详情`);
        card.innerHTML = `
        <div class="jl-floating-toolbar" aria-hidden="true">
          <button type="button" class="jl-floating-toolbar__btn" data-action="openRemark" data-id="${escapeHtmlAttr(task.id)}" title="备注">📝</button>
          ${
            !terminal
              ? `<button type="button" class="jl-floating-toolbar__btn" data-action="complete" data-id="${escapeHtmlAttr(task.id)}" title="完结">✓</button>`
              : ""
          }
        </div>
        <header class="task-card-head jl-task-card__head">
          <span class="mono-id">${escapeHtml(task.taskId)}</span>
          ${priorityTagHtml(task.priority)}
          ${statusTagHtml(task.status)}
        </header>
        <h3 class="jl-task-card__title">${escapeHtml(task.content || "（无内容）")}</h3>
        <div class="task-card-type">${issueTypeTagHtml(task.issueType, task.id)}</div>
        <dl class="task-card-meta jl-task-card__meta">
          <div><dt>截止</dt><dd>${deadlineHtml}</dd></div>
          <div><dt>风险</dt><dd>${riskTierBadge(risk)}</dd></div>
          <div><dt>处理人</dt><dd>${personMetaHtml(task.handler)}</dd></div>
          <div><dt>反馈人</dt><dd>${personMetaHtml(task.reporter)}</dd></div>
          <div><dt>登记</dt><dd>${createdAtCellHtml(task.createdAt)}</dd></div>
        </dl>
        <div class="task-card-actions jl-task-card__actions">
          <button type="button" class="task-ops-btn secondary jl-btn jl-btn--ghost" data-action="openTaskDrawer" data-id="${escapeHtmlAttr(task.id)}">详情</button>
          <button type="button" class="task-ops-btn secondary" data-action="openRemark" data-id="${escapeHtmlAttr(task.id)}">备注</button>
          ${
            !terminal
              ? `<button type="button" class="task-ops-btn success" data-action="complete" data-id="${escapeHtmlAttr(task.id)}">完结</button>`
              : ""
          }
        </div>
      `;
        cardFrag.appendChild(card);
      });
      taskCardListEl.appendChild(cardFrag);
    }

    return true;
  }

  function invalidateTaskListCache() {
    lastPageSignature = "";
  }

  global.TaskListView = {
    issueTypeTagHtml,
    priorityTagHtml,
    statusTagHtml,
    cellEllipsisHtml,
    personMetaHtml,
    createdAtCellHtml,
    renderTaskStatsHtml,
    riskTierBadge,
    renderTaskListPage,
    invalidateTaskListCache,
  };
})(typeof window !== "undefined" ? window : global);
