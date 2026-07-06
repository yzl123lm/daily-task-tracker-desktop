(function initKbDashboard(global) {
  const QUICK_ACTIONS = [
    { id: "search", icon: "🔍", label: "智能搜索", desc: "打开知识检索", route: "kb-search" },
    { id: "upload", icon: "📤", label: "上传文档", desc: "目录与入库", route: "kb-libraries" },
    { id: "graph", icon: "🕸", label: "新建节点", desc: "知识图谱", route: "kb-graph" },
    { id: "ops", icon: "📋", label: "操作日志", desc: "查看运行记录", action: "ops-log" },
    { id: "settings", icon: "⚙", label: "设置", desc: "知识库配置", action: "settings" },
  ];

  const NAV_ROUTES = {
    overview: null,
    "kb-search": "kb-search",
    "kb-libraries": "kb-libraries",
    "kb-graph": "kb-graph",
    "auto-learn": "kb-libraries",
    settings: "settings",
    "ops-log": "ops-log",
  };

  let mounted = false;

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

  function mountSettingsPanel() {
    const scroll = document.getElementById("kbDashboardSettingsScroll");
    const foot = document.getElementById("kbDashboardSettingsFoot");
    const sections = document.getElementById("kbConfigSections");
    const footer = document.querySelector("#kbConfigDialog .kb-footer-actions");
    if (!scroll || !sections) {
      return;
    }
    if (scroll.contains(sections) && (!footer || foot?.contains(footer))) {
      mounted = true;
      return;
    }
    if (!scroll.contains(sections)) {
      scroll.appendChild(sections);
      scroll.classList.add("kb-dashboard-settings-panel");
    }
    if (foot && footer && !foot.contains(footer)) {
      foot.appendChild(footer);
    }
    mounted = true;
  }

  function focusSettingsPanel(section) {
    const root = document.getElementById("kbDashboard");
    root?.classList.add("is-settings-open");
    if (section && typeof global.kbScrollToConfigSection === "function") {
      global.kbScrollToConfigSection(section);
    } else {
      const scroll = document.getElementById("kbDashboardSettingsScroll");
      scroll?.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function closeSettingsDrawer() {
    document.getElementById("kbDashboard")?.classList.remove("is-settings-open");
  }

  function fileTypeIcon(name) {
    const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
    if (ext === "pdf") return "📕";
    if (ext === "doc" || ext === "docx") return "📘";
    if (ext === "xls" || ext === "xlsx") return "📗";
    if (ext === "md" || ext === "txt") return "📝";
    return "📄";
  }

  function buildTrendSvg(groups) {
    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}`, docs: 0, nodes: 0 });
    }
    const dayMap = Object.fromEntries(days.map((d) => [d.key, d]));
    (groups || []).forEach((g) => {
      (g.documents || []).forEach((doc) => {
        const raw = String(doc.createdAt || "").replace(/\//g, "-");
        const ts = Date.parse(raw);
        if (!ts) return;
        const key = new Date(ts).toISOString().slice(0, 10);
        if (dayMap[key]) {
          dayMap[key].docs += 1;
        }
      });
    });
    const docSeries = days.map((d) => d.docs);
    const nodeSeries = days.map((d, i) => Math.max(0, Math.round((docSeries[i] || 0) * 1.6 + i * 2)));
    const max = Math.max(1, ...docSeries, ...nodeSeries, 1);
    const w = 520;
    const h = 140;
    const pad = 16;
    const step = (w - pad * 2) / Math.max(1, days.length - 1);
    const toPoints = (series) =>
      series
        .map((v, i) => {
          const x = pad + i * step;
          const y = h - pad - (v / max) * (h - pad * 2);
          return `${x},${y}`;
        })
        .join(" ");
    const docPoints = toPoints(docSeries);
    const nodePoints = toPoints(nodeSeries);
    const docArea = `${pad},${h - pad} ${docPoints} ${pad + (days.length - 1) * step},${h - pad}`;
    const labels = days
      .map((d, i) => {
        const x = pad + i * step;
        return `<text x="${x}" y="${h - 2}" font-size="9" fill="#8A97AB" text-anchor="middle">${esc(d.label)}</text>`;
      })
      .join("");
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="近7天增长趋势">
      <defs><linearGradient id="kbTrendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#1677FF" stop-opacity="0.22"/><stop offset="100%" stop-color="#1677FF" stop-opacity="0.02"/></linearGradient></defs>
      <polygon points="${docArea}" fill="url(#kbTrendFill)"/>
      <polyline points="${docPoints}" fill="none" stroke="#1677FF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      <polyline points="${nodePoints}" fill="none" stroke="#7eb8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>
      ${labels}
      <g transform="translate(${pad}, 8)">
        <rect x="0" y="0" width="8" height="8" rx="2" fill="#1677FF"/><text x="12" y="8" font-size="9" fill="#5F6F89">入库文档</text>
        <rect x="68" y="0" width="8" height="8" rx="2" fill="#7eb8ff"/><text x="80" y="8" font-size="9" fill="#5F6F89">知识节点</text>
      </g>
    </svg>`;
  }

  function renderRecentUpdates(groups) {
    const list = document.getElementById("kbDashboardRecent");
    if (!list) return;
    const items = [];
    (groups || []).forEach((g) => {
      (g.documents || []).forEach((doc) => {
        items.push({
          name: doc.name || doc.sourceFile || "未命名文档",
          lib: g.name || g.id || "",
          time: doc.createdAt || "",
          ts: Date.parse(String(doc.createdAt || "").replace(/\//g, "-")) || 0,
        });
      });
    });
    items.sort((a, b) => b.ts - a.ts);
    const top = items.slice(0, 5);
    if (!top.length) {
      list.innerHTML = `<li class="kb-dashboard-recent-item"><span class="kb-dashboard-recent-item__title">暂无最近更新</span></li>`;
      return;
    }
    const tags = ["is-update", "is-new", "is-link", "is-update", "is-new"];
    const tagText = ["更新", "新增", "关联", "更新", "新增"];
    list.innerHTML = top
      .map((item, i) => {
        const tagCls = tags[i % tags.length];
        return `<li class="kb-dashboard-recent-item">
          <span class="kb-dashboard-recent-item__icon" aria-hidden="true">${fileTypeIcon(item.name)}</span>
          <div>
            <div class="kb-dashboard-recent-item__title">${esc(item.name)}</div>
            <div class="kb-dashboard-recent-item__meta">${esc(item.lib)} · ${esc(item.time || "—")}</div>
          </div>
          <span class="kb-dashboard-recent-item__tag ${tagCls}">${tagText[i % tagText.length]}</span>
        </li>`;
      })
      .join("");
  }

  function renderTrend(groups) {
    const host = document.getElementById("kbDashboardTrend");
    if (host) {
      host.innerHTML = buildTrendSvg(groups);
    }
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

  function renderQuickActions() {
    const grid = document.getElementById("kbDashboardQuick");
    if (!grid || grid.dataset.wired === "1") {
      return;
    }
    grid.innerHTML = QUICK_ACTIONS.map(
      (a) => `<button type="button" class="kb-dashboard-quick-card" data-kb-quick="${a.id}">
        <span class="kb-dashboard-quick-card__label">${esc(a.label)}</span>
        <span class="kb-dashboard-quick-card__desc">${esc(a.desc)}</span>
        <span class="kb-dashboard-quick-card__icon" aria-hidden="true">${a.icon}</span>
      </button>`,
    ).join("");
    grid.dataset.wired = "1";
    grid.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-kb-quick]");
      if (!btn) return;
      const id = btn.getAttribute("data-kb-quick");
      const item = QUICK_ACTIONS.find((x) => x.id === id);
      if (!item) return;
      if (item.route) {
        global.FloatDesktop?.focusOrOpen(item.route);
        return;
      }
      if (item.action === "ops-log" && typeof global.kbOpenOpsLog === "function") {
        global.kbOpenOpsLog("all");
        return;
      }
      if (item.action === "settings") {
        focusSettingsPanel("basic");
      }
    });
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
      if (route === "settings") {
        focusSettingsPanel("basic");
        return;
      }
      if (route === "ops-log") {
        global.kbOpenOpsLog?.("all");
        return;
      }
      if (route === null) {
        return;
      }
      if (route) {
        global.FloatDesktop?.focusOrOpen(route);
      }
      if (key === "auto-learn" && typeof global.kbScrollToConfigSection === "function") {
        setTimeout(() => global.kbScrollToConfigSection("retrieval"), 300);
      }
    });
  }

  function wireChrome() {
    const fab = document.getElementById("kbDashboardSettingsFab");
    if (fab && fab.dataset.wired !== "1") {
      fab.dataset.wired = "1";
      fab.addEventListener("click", () => focusSettingsPanel("basic"));
    }
    const closeBtn = document.getElementById("kbDashboardSettingsClose");
    if (closeBtn && closeBtn.dataset.wired !== "1") {
      closeBtn.dataset.wired = "1";
      closeBtn.addEventListener("click", closeSettingsDrawer);
    }
    const refreshBtn = document.getElementById("kbDashboardRefreshBtn");
    if (refreshBtn && refreshBtn.dataset.wired !== "1") {
      refreshBtn.dataset.wired = "1";
      refreshBtn.addEventListener("click", () => {
        global.onKnowledgeBasePanelVisible?.();
      });
    }
  }

  function init() {
    mountSettingsPanel();
    renderQuickActions();
    wireNav();
    wireChrome();
  }

  function refresh(st, groups) {
    if (!document.getElementById("kbDashboard")) {
      return;
    }
    mountSettingsPanel();
    renderTrend(groups);
    renderRecentUpdates(groups);
    renderStorage(st);
  }

  global.KbDashboard = {
    init,
    refresh,
    isDashboardVisible,
    focusSettingsPanel,
    closeSettingsDrawer,
    mountSettingsPanel,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window);
