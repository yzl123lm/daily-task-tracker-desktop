(function initKbDashboard(global) {
  const NAV_ROUTES = {
    overview: null,
    "kb-search": "kb-search",
    "kb-libraries": "kb-libraries",
    "kb-graph": "kb-graph",
    "auto-learn": "kb-libraries",
  };

  let latestGroups = [];
  let latestState = null;
  let trendRangeDays = 7;

  function esc(text) {
    if (typeof global.escapeHtml === "function") {
      return global.escapeHtml(text);
    }
    return String(text ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isDashboardVisible() {
    const host = document.getElementById("jlKbLauncher");
    if (!host || host.hidden) {
      return false;
    }
    if (host.classList.contains("jl-float-panel-host")) {
      return true;
    }
    return host.closest(".jl-float-win") && host.getBoundingClientRect().height > 0;
  }

  function restoreSettingsToDialog() {
    const sections = document.getElementById("kbConfigSections");
    const mainScroll = document.querySelector("#kbConfigDialog .kb-main-scroll");
    const footer = document.querySelector("#kbConfigDialog .kb-footer-actions");
    const shell = document.querySelector("#kbConfigDialog .kb-config-shell");
    if (sections && mainScroll && !mainScroll.contains(sections)) {
      mainScroll.appendChild(sections);
    }
    if (footer && shell && !shell.contains(footer)) {
      shell.appendChild(footer);
    }
    document.getElementById("kbDashboardSettingsScroll")?.classList.remove("kb-dashboard-settings-panel");
  }

  function openSettingsPage(section) {
    restoreSettingsToDialog();
    if (typeof global.kbOpenConfigDialog === "function") {
      global.kbOpenConfigDialog(section || "basic");
      return;
    }
    document.getElementById("kbConfigOpenBtn")?.click();
  }

  function fileTypeIcon(name) {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "📕";
    if (ext === "doc" || ext === "docx") return "📘";
    if (ext === "xls" || ext === "xlsx") return "📗";
    if (ext === "md" || ext === "txt") return "📝";
    if (ext === "png" || ext === "jpg" || ext === "svg" || ext === "ico") return "🖼";
    if (ext === "yml" || ext === "yaml" || ext === "json") return "⚙";
    return "📄";
  }

  function docCategory(name, lib) {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (["yml", "yaml", "json", "toml"].includes(ext)) return "构建配置";
    if (["png", "jpg", "jpeg", "svg", "ico", "webp"].includes(ext)) return "协议文档";
    if (["md", "txt", "rst"].includes(ext)) return "说明文档";
    if (["pdf", "doc", "docx"].includes(ext)) return "业务文档";
    return lib || "知识文档";
  }

  function parseDocTs(raw) {
    return Date.parse(String(raw || "").replace(/\//g, "-")) || 0;
  }

  function formatPct(current, previous) {
    if (!previous) {
      return current > 0 ? "+100.00%" : "—";
    }
    const pct = ((current - previous) / previous) * 100;
    const sign = pct >= 0 ? "+" : "";
    return `${sign}${pct.toFixed(2)}%`;
  }

  function collectDocEvents(groups) {
    const events = [];
    (groups || []).forEach((g) => {
      (g.documents || []).forEach((doc) => {
        const ts = parseDocTs(doc.createdAt);
        if (!ts) return;
        events.push({
          ts,
          key: new Date(ts).toISOString().slice(0, 10),
          chunks: Number(doc.chunkCount || 0),
        });
      });
    });
    return events;
  }

  function buildTrendBuckets(rangeDays) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const buckets = [];
    if (rangeDays === 90) {
      for (let w = 12; w >= 0; w -= 1) {
        const end = new Date(now);
        end.setDate(now.getDate() - w * 7);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        const key = end.toISOString().slice(0, 10);
        buckets.push({
          key,
          startTs: start.getTime(),
          endTs: end.getTime() + 86400000 - 1,
          label: `${end.getMonth() + 1}/${end.getDate()}`,
        });
      }
      return buckets;
    }
    const count = rangeDays === 30 ? 30 : 7;
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      buckets.push({
        key,
        startTs: d.getTime(),
        endTs: d.getTime() + 86400000 - 1,
        label: `${d.getMonth() + 1}/${d.getDate()}`,
      });
    }
    return buckets;
  }

  function buildTrendSeries(groups, rangeDays, nodeTotal, docTotal) {
    const events = collectDocEvents(groups);
    const buckets = buildTrendBuckets(rangeDays);
    const nodeRatio = docTotal > 0 && nodeTotal > 0 ? nodeTotal / docTotal : 20;
    const docSeries = buckets.map((b) =>
      events.filter((e) => e.ts >= b.startTs && e.ts <= b.endTs).length
    );
    const nodeSeries = buckets.map((b) => {
      const dayDocs = events.filter((e) => e.ts >= b.startTs && e.ts <= b.endTs);
      const chunkSum = dayDocs.reduce((sum, e) => sum + (e.chunks || 0), 0);
      if (chunkSum > 0) return chunkSum;
      return Math.max(0, Math.round(dayDocs.length * nodeRatio));
    });
    return { buckets, docSeries, nodeSeries };
  }

  function sumSeriesInWindow(events, startTs, endTs) {
    return events.filter((e) => e.ts >= startTs && e.ts <= endTs).length;
  }

  function buildTrendSummary(groups, rangeDays, nodeTotal, docTotal) {
    const events = collectDocEvents(groups);
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    const periodMs = rangeDays * 86400000;
    const curEnd = now.getTime();
    const curStart = curEnd - periodMs + 1;
    const prevEnd = curStart - 1;
    const prevStart = prevEnd - periodMs + 1;
    const curDocs = sumSeriesInWindow(events, curStart, curEnd);
    const prevDocs = sumSeriesInWindow(events, prevStart, prevEnd);
    const nodeRatio = docTotal > 0 && nodeTotal > 0 ? nodeTotal / docTotal : 20;
    const curNodes = Math.round(curDocs * nodeRatio);
    const prevNodes = Math.round(prevDocs * nodeRatio);
    const avgDaily = rangeDays > 0 ? curDocs / rangeDays : 0;
    const prevAvgDaily = rangeDays > 0 ? prevDocs / rangeDays : 0;
    const rangeLabel = rangeDays === 7 ? "7天" : rangeDays === 30 ? "30天" : "90天";
    return [
      {
        label: `${rangeLabel}新增文档`,
        value: `+${curDocs} 份`,
        delta: formatPct(curDocs, prevDocs),
      },
      {
        label: `${rangeLabel}新增节点`,
        value: `+${curNodes} 个`,
        delta: formatPct(curNodes, prevNodes),
      },
      {
        label: "平均每日新增文档",
        value: `${avgDaily.toFixed(1)} 份`,
        delta: formatPct(avgDaily, prevAvgDaily),
      },
    ];
  }

  function buildTrendSvg(buckets, docSeries, nodeSeries) {
    const docMax = Math.max(1, ...docSeries);
    const nodeMax = Math.max(1, ...nodeSeries);
    const w = 560;
    const h = 210;
    const padL = 36;
    const padR = 36;
    const padT = 12;
    const padB = 28;
    const innerW = w - padL - padR;
    const innerH = h - padT - padB;
    const step = innerW / Math.max(1, buckets.length - 1);
    const toPoints = (series, max) =>
      series
        .map((v, i) => {
          const x = padL + i * step;
          const y = padT + innerH - (v / max) * innerH;
          return `${x},${y}`;
        })
        .join(" ");
    const docPoints = toPoints(docSeries, docMax);
    const nodePoints = toPoints(nodeSeries, nodeMax);
    const docArea = `${padL},${padT + innerH} ${docPoints} ${padL + (buckets.length - 1) * step},${padT + innerH}`;
    const labelEvery = buckets.length > 14 ? Math.ceil(buckets.length / 7) : 1;
    const labels = buckets
      .map((b, i) => {
        if (i % labelEvery !== 0 && i !== buckets.length - 1) return "";
        const x = padL + i * step;
        return `<text x="${x}" y="${h - 6}" font-size="9" fill="#8A97AB" text-anchor="middle">${esc(b.label)}</text>`;
      })
      .join("");
    const yTicksDocs = [0, 0.5, 1]
      .map((ratio) => {
        const val = Math.round(docMax * ratio);
        const y = padT + innerH - ratio * innerH;
        return `<text x="${padL - 6}" y="${y + 3}" font-size="8" fill="#8A97AB" text-anchor="end">${val}</text>`;
      })
      .join("");
    const yTicksNodes = [0, 0.5, 1]
      .map((ratio) => {
        const val = Math.round(nodeMax * ratio);
        const y = padT + innerH - ratio * innerH;
        return `<text x="${w - padR + 6}" y="${y + 3}" font-size="8" fill="#8A97AB" text-anchor="start">${val}</text>`;
      })
      .join("");
    const gridLines = [0.25, 0.5, 0.75]
      .map((ratio) => {
        const y = padT + innerH - ratio * innerH;
        return `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="#EEF3FB" stroke-width="1"/>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="知识库增长趋势">
      <defs><linearGradient id="kbTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1677FF" stop-opacity="0.18"/><stop offset="100%" stop-color="#1677FF" stop-opacity="0.02"/></linearGradient></defs>
      ${gridLines}
      ${yTicksDocs}
      ${yTicksNodes}
      <polygon points="${docArea}" fill="url(#kbTrendFill)"/>
      <polyline points="${docPoints}" fill="none" stroke="#1677FF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${nodePoints}" fill="none" stroke="#9254DE" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="5 4"/>
      ${labels}
    </svg>`;
  }

  function renderTrendSummary(groups, rangeDays) {
    const host = document.getElementById("kbDashboardTrendSummary");
    if (!host) return;
    const nodeTotal = Number(latestState?.graphSummary?.nodeCount || 0);
    const docTotal = (groups || []).reduce(
      (sum, g) => sum + (Array.isArray(g.documents) ? g.documents.length : Number(g.docCount || 0)),
      0
    );
    const items = buildTrendSummary(groups, rangeDays, nodeTotal, docTotal);
    host.innerHTML = items
      .map(
        (item) => `<div class="kb-dashboard-trend-summary__item">
          <span class="kb-dashboard-trend-summary__label">${esc(item.label)}</span>
          <strong class="kb-dashboard-trend-summary__value">${esc(item.value)}</strong>
          <span class="kb-dashboard-trend-summary__delta">${esc(item.delta)}</span>
        </div>`
      )
      .join("");
  }

  function renderTrend(groups, rangeDays) {
    const host = document.getElementById("kbDashboardTrend");
    if (!host) return;
    const nodeTotal = Number(latestState?.graphSummary?.nodeCount || 0);
    const docTotal = (groups || []).reduce(
      (sum, g) => sum + (Array.isArray(g.documents) ? g.documents.length : Number(g.docCount || 0)),
      0
    );
    const { buckets, docSeries, nodeSeries } = buildTrendSeries(groups, rangeDays, nodeTotal, docTotal);
    host.innerHTML = buildTrendSvg(buckets, docSeries, nodeSeries);
    renderTrendSummary(groups, rangeDays);
  }

  function inferTag(doc, index) {
    if (doc.autoLearn) return { cls: "is-new", text: "新增" };
    if (doc.verification) return { cls: "is-update", text: "更新" };
    const tags = [
      { cls: "is-update", text: "更新" },
      { cls: "is-new", text: "新增" },
      { cls: "is-link", text: "关联" },
    ];
    return tags[index % tags.length];
  }

  function renderRecentUpdates(groups) {
    const list = document.getElementById("kbDashboardRecent");
    if (!list) return;
    const items = [];
    (groups || []).forEach((g) => {
      (g.documents || []).forEach((doc) => {
        items.push({
          doc,
          name: doc.name || doc.sourceFile || "未命名文档",
          lib: g.name || g.id || "",
          time: doc.createdAt || "",
          ts: parseDocTs(doc.createdAt),
        });
      });
    });
    items.sort((a, b) => b.ts - a.ts);
    const top = items.slice(0, 5);
    if (!top.length) {
      list.innerHTML = `<li class="kb-dashboard-recent-item kb-dashboard-recent-item--empty"><span class="kb-dashboard-recent-item__title">暂无最近更新</span></li>`;
      return;
    }
    list.innerHTML = top
      .map((item, i) => {
        const tag = inferTag(item.doc, i);
        const category = docCategory(item.name, item.lib);
        return `<li class="kb-dashboard-recent-item">
          <span class="kb-dashboard-recent-item__icon" aria-hidden="true">${fileTypeIcon(item.name)}</span>
          <div class="kb-dashboard-recent-item__body">
            <div class="kb-dashboard-recent-item__title">${esc(item.name)}</div>
            <div class="kb-dashboard-recent-item__meta">${esc(category)} · ${esc(item.time || "—")} · 由系统触发</div>
          </div>
          <span class="kb-dashboard-recent-item__tag ${tag.cls}">${tag.text}</span>
        </li>`;
      })
      .join("");
  }

  function renderStorage(st) {
    const pctEl = document.getElementById("kbDashboardStoragePct");
    const fillEl = document.getElementById("kbDashboardStorageFill");
    const metaEl = document.getElementById("kbDashboardStorageMeta");
    if (!pctEl || !fillEl || !metaEl) return;
    const chunks = Number(st?.chunkTotal || 0);
    const pct = Math.min(100, Math.round((chunks / 12000) * 100));
    const usedLabel = chunks > 0 ? `${chunks.toLocaleString()} 分片` : "暂无数据";
    pctEl.textContent = `${pct}%`;
    fillEl.style.width = `${Math.max(4, pct)}%`;
    metaEl.textContent = `${usedLabel} · ${st?.storageBackend || "sqlite"}`;
  }

  function wireNav() {
    const menu = document.querySelector("#jlKbLauncher .kb-dashboard-nav__menu");
    if (!menu || menu.dataset.wired === "1") {
      return;
    }
    menu.dataset.wired = "1";
    menu.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-kb-dash-nav]");
      if (!btn) return;
      const key = btn.getAttribute("data-kb-dash-nav");
      menu.querySelectorAll(".kb-dashboard-nav__item").forEach((n) => {
        n.classList.toggle("is-active", n === btn);
      });
      const route = NAV_ROUTES[key];
      if (route === null) {
        return;
      }
      if (route) {
        global.FloatDesktop?.focusOrOpen(route);
      }
      if (key === "auto-learn") {
        setTimeout(() => openSettingsPage("retrieval"), 300);
      }
    });
  }

  function wireTrendRange() {
    const rangeHost = document.querySelector("#jlKbLauncher .kb-dashboard-range");
    if (!rangeHost || rangeHost.dataset.wired === "1") {
      return;
    }
    rangeHost.dataset.wired = "1";
    rangeHost.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-kb-trend-range]");
      if (!btn) return;
      const days = Number(btn.getAttribute("data-kb-trend-range") || "7");
      trendRangeDays = days;
      rangeHost.querySelectorAll(".kb-dashboard-range__btn").forEach((n) => {
        const active = n === btn;
        n.classList.toggle("is-active", active);
        n.setAttribute("aria-selected", active ? "true" : "false");
      });
      renderTrend(latestGroups, trendRangeDays);
    });
  }

  function wireChrome() {
    const refreshBtn = document.getElementById("kbDashboardRefreshBtn");
    if (refreshBtn && refreshBtn.dataset.wired !== "1") {
      refreshBtn.dataset.wired = "1";
      refreshBtn.addEventListener("click", () => {
        global.onKnowledgeBasePanelVisible?.({ route: "kb-main" });
      });
    }
    const viewAllBtn = document.getElementById("kbDashboardViewAllUpdates");
    if (viewAllBtn && viewAllBtn.dataset.wired !== "1") {
      viewAllBtn.dataset.wired = "1";
      viewAllBtn.addEventListener("click", () => {
        global.FloatDesktop?.focusOrOpen?.("kb-libraries");
      });
    }
  }

  function init() {
    restoreSettingsToDialog();
    wireNav();
    wireTrendRange();
    wireChrome();
  }

  function refresh(st, groups) {
    if (!document.getElementById("kbDashboard")) {
      return;
    }
    latestState = st || null;
    latestGroups = groups || [];
    renderTrend(latestGroups, trendRangeDays);
    renderRecentUpdates(latestGroups);
    renderStorage(st);
  }

  global.KbDashboard = {
    init,
    refresh,
    isDashboardVisible,
    restoreSettingsToDialog,
    openSettingsPage,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
