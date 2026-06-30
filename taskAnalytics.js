/**
 * 任务分析：Canvas 图表、自定义报表、任务模板
 */
(function initTaskAnalytics(global) {
  const TEMPLATE_STORAGE_KEY = "daily_task_tracker_task_templates_v1";
  const DEFAULT_TEMPLATES = [
    {
      id: "tpl-daily-follow",
      name: "日常跟进",
      issueType: "日常跟进",
      content: "请描述需跟进的事项与当前进展",
      priority: "中",
      status: "待处理",
    },
    {
      id: "tpl-bugfix",
      name: "缺陷修复",
      issueType: "缺陷修复",
      content: "现象：\n影响范围：\n复现步骤：",
      priority: "高",
      status: "待处理",
    },
    {
      id: "tpl-requirement",
      name: "需求评审",
      issueType: "需求评审",
      content: "需求背景：\n验收标准：\n相关方：",
      priority: "中",
      status: "待处理",
    },
  ];

  const CHART_COLORS = [
    "#5b50ff",
    "#34d399",
    "#fbbf24",
    "#f87171",
    "#a855f7",
    "#00e5ff",
    "#94a3b8",
    "#f472b6",
  ];

  const CHART_THEME = {
    title: "#c9d1e0",
    axis: "rgba(148, 163, 184, 0.28)",
    label: "#94a3b8",
    empty: "#64748b",
    line: "#00e5ff",
    lineDot: "#5b50ff",
  };

  function readTemplates() {
    try {
      const raw = localStorage.getItem(TEMPLATE_STORAGE_KEY);
      const custom = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(custom) ? custom : [];
      const map = new Map(DEFAULT_TEMPLATES.map((t) => [t.id, t]));
      list.forEach((t) => {
        if (t && t.id) {
          map.set(t.id, t);
        }
      });
      return [...map.values()];
    } catch {
      return DEFAULT_TEMPLATES.slice();
    }
  }

  function saveTemplates(list) {
    const customOnly = (Array.isArray(list) ? list : []).filter(
      (t) => t && t.id && !DEFAULT_TEMPLATES.some((d) => d.id === t.id),
    );
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(customOnly));
  }

  function upsertTemplate(tpl) {
    const all = readTemplates();
    const idx = all.findIndex((x) => x.id === tpl.id);
    if (idx >= 0) {
      all[idx] = tpl;
    } else {
      all.push(tpl);
    }
    saveTemplates(all);
    return all;
  }

  function deleteTemplate(id) {
    if (DEFAULT_TEMPLATES.some((d) => d.id === id)) {
      return readTemplates();
    }
    const all = readTemplates().filter((t) => t.id !== id);
    saveTemplates(all);
    return all;
  }

  function getTemplateById(id) {
    return readTemplates().find((t) => t.id === id) || null;
  }

  function aggregateStatus(tasks, statusList) {
    const counts = Object.fromEntries((statusList || []).map((s) => [s, 0]));
    (tasks || []).forEach((t) => {
      const st = t.status || "待处理";
      counts[st] = (counts[st] || 0) + 1;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([label, value]) => ({ label, value }));
  }

  function aggregateHandlerLoad(tasks, activeStatuses) {
    const active = new Set(activeStatuses || ["待处理", "处理中", "已阻塞", "已挂起"]);
    const map = {};
    (tasks || []).forEach((t) => {
      if (!active.has(t.status)) {
        return;
      }
      const h = String(t.handler || "未填").trim() || "未填";
      map[h] = (map[h] || 0) + 1;
    });
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([label, value]) => ({ label, value }));
  }

  function aggregateTrendByDay(tasks, days = 14) {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      out.push({ label: key.slice(5), value: 0, fullKey: key });
    }
    const index = Object.fromEntries(out.map((x, i) => [x.fullKey, i]));
    (tasks || []).forEach((t) => {
      const key = t.createdAtIsoDate || "";
      if (index[key] !== undefined) {
        out[index[key]].value += 1;
      }
    });
    return out.map(({ label, value }) => ({ label, value }));
  }

  function setupCanvas(canvas, height = 220) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 360;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, height);
    return { ctx, w, h: height };
  }

  function drawTitle(ctx, text, w) {
    ctx.fillStyle = CHART_THEME.title;
    ctx.font = "600 13px Microsoft YaHei, Segoe UI, sans-serif";
    ctx.fillText(text, 12, 18);
    ctx.strokeStyle = CHART_THEME.axis;
    ctx.beginPath();
    ctx.moveTo(12, 24);
    ctx.lineTo(w - 12, 24);
    ctx.stroke();
  }

  function drawPieChart(canvas, data, title) {
    const { ctx, w, h } = setupCanvas(canvas, 240);
    drawTitle(ctx, title, w);
    const total = data.reduce((s, x) => s + x.value, 0);
    if (!total) {
      ctx.fillStyle = CHART_THEME.empty;
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText("暂无数据", w / 2 - 24, h / 2);
      return;
    }
    const cx = w * 0.36;
    const cy = h * 0.58;
    const r = Math.min(w, h) * 0.28;
    let start = -Math.PI / 2;
    data.forEach((item, i) => {
      const slice = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fill();
      start += slice;
    });
    let ly = 52;
    const lx = w * 0.62;
    data.forEach((item, i) => {
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fillRect(lx, ly, 10, 10);
      ctx.fillStyle = CHART_THEME.label;
      ctx.font = "11px Microsoft YaHei, sans-serif";
      const pct = Math.round((item.value / total) * 100);
      ctx.fillText(`${item.label} ${item.value} (${pct}%)`, lx + 16, ly + 9);
      ly += 18;
    });
  }

  function drawBarChart(canvas, data, title) {
    const { ctx, w, h } = setupCanvas(canvas, 240);
    drawTitle(ctx, title, w);
    if (!data.length) {
      ctx.fillStyle = CHART_THEME.empty;
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText("暂无数据", w / 2 - 24, h / 2);
      return;
    }
    const max = Math.max(...data.map((x) => x.value), 1);
    const left = 40;
    const right = w - 16;
    const top = 36;
    const bottom = h - 36;
    const barW = Math.max(12, (right - left) / data.length - 8);
    data.forEach((item, i) => {
      const bh = ((bottom - top) * item.value) / max;
      const x = left + i * (barW + 8);
      const y = bottom - bh;
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = CHART_THEME.label;
      ctx.font = "10px Microsoft YaHei, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(item.value), x + barW / 2, y - 4);
      const label = item.label.length > 4 ? `${item.label.slice(0, 4)}…` : item.label;
      ctx.save();
      ctx.translate(x + barW / 2, bottom + 4);
      ctx.rotate(-0.35);
      ctx.fillText(label, 0, 10);
      ctx.restore();
      ctx.textAlign = "left";
    });
  }

  function drawLineChart(canvas, data, title) {
    const { ctx, w, h } = setupCanvas(canvas, 240);
    drawTitle(ctx, title, w);
    if (!data.length) {
      ctx.fillStyle = CHART_THEME.empty;
      ctx.font = "12px Microsoft YaHei, sans-serif";
      ctx.fillText("暂无数据", w / 2 - 24, h / 2);
      return;
    }
    const max = Math.max(...data.map((x) => x.value), 1);
    const left = 36;
    const right = w - 12;
    const top = 36;
    const bottom = h - 32;
    const step = (right - left) / Math.max(1, data.length - 1);
    ctx.strokeStyle = CHART_THEME.axis;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    ctx.strokeStyle = CHART_THEME.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((item, i) => {
      const x = left + i * step;
      const y = bottom - ((bottom - top) * item.value) / max;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
    data.forEach((item, i) => {
      const x = left + i * step;
      const y = bottom - ((bottom - top) * item.value) / max;
      ctx.fillStyle = CHART_THEME.lineDot;
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
      if (i % 2 === 0 || i === data.length - 1) {
        ctx.fillStyle = CHART_THEME.label;
        ctx.font = "10px Microsoft YaHei, sans-serif";
        ctx.fillText(item.label, x - 10, bottom + 14);
      }
    });
  }

  function renderMetricCards(container, taskList, helpers) {
    if (!container) {
      return;
    }
    const counts = typeof helpers?.getSummaryCounts === "function" ? helpers.getSummaryCounts() : {};
    const today = typeof helpers?.localDateKey === "function" ? helpers.localDateKey() : "";
    const calcRisk = helpers?.calcTaskRisk;
    const overdue = (taskList || []).filter(
      (t) =>
        t.deadline &&
        t.deadline < today &&
        t.status !== "已完结" &&
        t.status !== "已取消",
    ).length;
    const highRisk = (taskList || []).filter((t) => {
      const r = typeof calcRisk === "function" ? calcRisk(t) : { tier: "none" };
      return r.tier === "red" || r.tier === "orange";
    }).length;
    const cards = [
      { label: "全部任务", value: (taskList || []).length, tone: "default" },
      { label: "进行中", value: counts.incomplete ?? 0, tone: "default" },
      { label: "待处理", value: counts.dai ?? 0, tone: "default" },
      { label: "已阻塞", value: counts.blocked ?? 0, tone: counts.blocked > 0 ? "danger" : "default" },
      { label: "逾期", value: overdue, tone: overdue > 0 ? "warning" : "default" },
      { label: "高风险", value: highRisk, tone: highRisk > 0 ? "danger" : "default" },
    ];
    container.innerHTML = cards
      .map(
        (c) => `
      <article class="jl-metric-card" data-tone="${c.tone}">
        <span class="jl-metric-card__label">${c.label}</span>
        <span class="jl-metric-card__value">${c.value}</span>
      </article>`,
      )
      .join("");
  }

  function mountDashboard(root, tasks, helpers) {
    if (!root) {
      return;
    }
    renderMetricCards(helpers?.metricsEl, tasks, helpers);
    const statusList = helpers?.statusList || [];
    const activeStatuses = helpers?.activeStatuses || [];
    const statusData = aggregateStatus(tasks, statusList);
    const handlerData = aggregateHandlerLoad(tasks, activeStatuses);
    const trendData = aggregateTrendByDay(tasks, 14);
    const pie = root.querySelector('[data-chart="pie"]');
    const bar = root.querySelector('[data-chart="bar"]');
    const line = root.querySelector('[data-chart="line"]');
    if (pie) {
      drawPieChart(pie, statusData, "任务状态分布");
    }
    if (bar) {
      drawBarChart(bar, handlerData, "处理人待办负载（柱状）");
    }
    if (line) {
      drawLineChart(line, trendData, "近 14 日登记趋势（折线）");
    }
  }

  function filterTasksForReport(tasks, filters) {
    const f = filters || {};
    return (tasks || []).filter((t) => {
      if (f.status && t.status !== f.status) {
        return false;
      }
      if (f.priority && (t.priority || "中") !== f.priority) {
        return false;
      }
      if (f.handler && String(t.handler || "") !== f.handler) {
        return false;
      }
      if (f.reporter && String(t.reporter || "") !== f.reporter) {
        return false;
      }
      if (f.issueType && String(t.issueType || "") !== f.issueType) {
        return false;
      }
      if (f.keyword) {
        const hay = `${t.issueType} ${t.content}`.toLowerCase();
        if (!hay.includes(String(f.keyword).toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }

  function buildCustomReport(tasks, spec, helpers) {
    const dimensions = Array.isArray(spec?.dimensions) && spec.dimensions.length ? spec.dimensions : ["status"];
    const metrics = Array.isArray(spec?.metrics) && spec.metrics.length ? spec.metrics : ["count"];
    const filtered = filterTasksForReport(tasks, spec?.filters);
    const calcRisk = helpers?.calcTaskRisk;
    const today = helpers?.localDateKey ? helpers.localDateKey() : "";

    const rows = [];
    const groupKey = (t) =>
      dimensions.map((d) => `${d}=${String(t[d] ?? (d === "priority" ? "中" : ""))}`).join("|");

    const buckets = new Map();
    filtered.forEach((t) => {
      const key = groupKey(t);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push(t);
    });

    buckets.forEach((list, key) => {
      const parts = Object.fromEntries(
        key.split("|").map((p) => {
          const i = p.indexOf("=");
          return [p.slice(0, i), p.slice(i + 1)];
        }),
      );
      const row = { ...parts };
      if (metrics.includes("count")) {
        row.count = list.length;
      }
      if (metrics.includes("overdue")) {
        row.overdue = list.filter(
          (t) => t.deadline && t.deadline < today && t.status !== "已完结" && t.status !== "已取消",
        ).length;
      }
      if (metrics.includes("high_risk")) {
        row.high_risk = list.filter((t) => {
          const r = typeof calcRisk === "function" ? calcRisk(t) : { tier: "none" };
          return r.tier === "red" || r.tier === "orange";
        }).length;
      }
      if (metrics.includes("avg_age_days")) {
        const ages = list.map((t) => {
          const ms = helpers?.parseCreatedMs?.(t.createdAt) || 0;
          return ms ? (Date.now() - ms) / 86400000 : 0;
        });
        row.avg_age_days = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
      }
      rows.push(row);
    });

    rows.sort((a, b) => (b.count || 0) - (a.count || 0));

    return {
      ok: true,
      title: spec?.title || "自定义报表",
      dimensions,
      metrics,
      totalRows: rows.length,
      totalTasks: filtered.length,
      rows: rows.slice(0, Number(spec?.limit) || 50),
    };
  }

  function customReportToMarkdown(report) {
    if (!report?.rows?.length) {
      return `${report?.title || "报表"}：无匹配数据。`;
    }
    const dims = report.dimensions || [];
    const metrics = report.metrics || ["count"];
    const head = ["|", ...dims, ...metrics, "|"].join(" ");
    const sep = ["|", ...dims.map(() => "---"), ...metrics.map(() => "---"), "|"].join(" ");
    const body = report.rows
      .map((r) => {
        const cells = [...dims.map((d) => r[d] ?? ""), ...metrics.map((m) => r[m] ?? 0)];
        return `| ${cells.join(" | ")} |`;
      })
      .join("\n");
    return `## ${report.title}\n\n筛选后共 ${report.totalTasks} 条，${report.totalRows} 个分组。\n\n${head}\n${sep}\n${body}`;
  }

  global.TaskAnalytics = {
    TEMPLATE_STORAGE_KEY,
    DEFAULT_TEMPLATES,
    readTemplates,
    saveTemplates,
    upsertTemplate,
    deleteTemplate,
    getTemplateById,
    aggregateStatus,
    aggregateHandlerLoad,
    aggregateTrendByDay,
    mountDashboard,
    buildCustomReport,
    customReportToMarkdown,
    filterTasksForReport,
  };
})(typeof window !== "undefined" ? window : globalThis);
