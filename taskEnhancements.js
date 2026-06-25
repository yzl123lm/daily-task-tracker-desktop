/**
 * 智能工作助手 · 任务模块增强（对照《可行性优化需求文档》）
 * 由 app.js 在读写任务数据时调用。
 */
(function initTaskEnhancements(global) {
  const TASK_STATUSES = ["待处理", "处理中", "已完结", "已阻塞", "已挂起", "已取消"];
  const TASK_ACTIVE_STATUSES = ["待处理", "处理中", "已阻塞", "已挂起"];
  const TASK_TERMINAL_STATUSES = ["已完结", "已取消"];
  const TASK_PRIORITIES = ["高", "中", "低"];
  const TASK_ID_PATTERN = /^TASK-\d{8}-\d{3}$/;
  const MAINTENANCE_KEY = "daily_task_tracker_task_maintenance_v1";

  function normalizePriority(v) {
    const p = String(v || "").trim();
    return TASK_PRIORITIES.includes(p) ? p : "中";
  }

  function normalizeDeadline(v) {
    const d = String(v || "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }

  function tokenizeForSimilarity(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[^\u4e00-\u9fa5a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);
  }

  function contentSimilarity(a, b) {
    const ta = new Set(tokenizeForSimilarity(a));
    const tb = new Set(tokenizeForSimilarity(b));
    if (!ta.size || !tb.size) {
      return 0;
    }
    let inter = 0;
    ta.forEach((w) => {
      if (tb.has(w)) {
        inter += 1;
      }
    });
    return inter / Math.max(ta.size, tb.size);
  }

  function findSimilarTasks(allTasks, content, threshold = 0.85) {
    const hay = String(content || "").trim();
    if (!hay) {
      return [];
    }
    return (Array.isArray(allTasks) ? allTasks : [])
      .filter((t) => TASK_TERMINAL_STATUSES.indexOf(t.status) === -1)
      .map((t) => ({
        task: t,
        similarity: contentSimilarity(hay, `${t.issueType || ""} ${t.content || ""}`),
      }))
      .filter((x) => x.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity);
  }

  function localDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function generateTaskId(allTasks, dateKey) {
    const day = dateKey || localDateKey();
    const compact = day.replace(/-/g, "");
    const prefix = `TASK-${compact}-`;
    let maxSeq = 0;
    (Array.isArray(allTasks) ? allTasks : []).forEach((t) => {
      const id = String(t.taskId || "");
      if (id.startsWith(prefix)) {
        const n = parseInt(id.slice(prefix.length), 10);
        if (Number.isFinite(n) && n > maxSeq) {
          maxSeq = n;
        }
      }
      const m = id.match(/^(\d{8})-(\d+)$/);
      if (m && m[1] === compact) {
        const n = parseInt(m[2], 10);
        if (Number.isFinite(n) && n > maxSeq) {
          maxSeq = n;
        }
      }
    });
    return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
  }

  function legacyTaskIdToStandard(rawId, allTasks, used) {
    const id = String(rawId || "").trim();
    if (TASK_ID_PATTERN.test(id)) {
      return id;
    }
    const m1 = id.match(/^(\d{8})-(\d+)$/);
    if (m1) {
      return `TASK-${m1[1]}-${String(parseInt(m1[2], 10)).padStart(3, "0")}`;
    }
    const m2 = id.match(/^(\d{8})$/);
    if (m2) {
      return `TASK-${m2[1]}-001`;
    }
    const m3 = id.match(/^TASK-(\d{8})-(\d+)$/i);
    if (m3) {
      return `TASK-${m3[1]}-${String(parseInt(m3[2], 10)).padStart(3, "0")}`;
    }
    let candidate = generateTaskId(allTasks, localDateKey());
    while (used.has(candidate)) {
      const parts = candidate.split("-");
      const seq = parseInt(parts[2], 10) + 1;
      candidate = `TASK-${parts[1]}-${String(seq).padStart(3, "0")}`;
    }
    return candidate;
  }

  function migrateLegacyTaskIds(allTasks) {
    const used = new Set();
    let changed = 0;
    const list = (Array.isArray(allTasks) ? allTasks : []).map((t) => {
      const next = { ...t };
      if (!TASK_ID_PATTERN.test(String(next.taskId || ""))) {
        const std = legacyTaskIdToStandard(next.taskId, allTasks, used);
        let unique = std;
        while (used.has(unique)) {
          const parts = unique.split("-");
          const seq = parseInt(parts[2], 10) + 1;
          unique = `TASK-${parts[1]}-${String(seq).padStart(3, "0")}`;
        }
        next.taskId = unique;
        changed += 1;
      }
      used.add(next.taskId);
      return next;
    });
    return { tasks: list, changed };
  }

  function dedupeExactContentTasks(allTasks) {
    const seen = new Map();
    const out = [];
    let removed = 0;
    (Array.isArray(allTasks) ? allTasks : []).forEach((t) => {
      const key = `${String(t.content || "").trim()}|${String(t.issueType || "").trim()}`;
      if (seen.has(key)) {
        const keep = seen.get(key);
        if (t.status === "处理中" && keep.status === "待处理") {
          seen.set(key, t);
          const idx = out.findIndex((x) => x.id === keep.id);
          if (idx >= 0) {
            out[idx] = t;
          }
        }
        removed += 1;
        return;
      }
      seen.set(key, t);
      out.push(t);
    });
    return { tasks: out, removed };
  }

  function formatSystemRemark(message, nowStr) {
    const ts = nowStr || new Date().toLocaleString("zh-CN", { hour12: false });
    return `[系统] ${ts} ${String(message || "").trim()}`;
  }

  function appendSystemRemark(task, message, nowStr) {
    if (!task) {
      return false;
    }
    if (!Array.isArray(task.remarks)) {
      task.remarks = [];
    }
    const line = formatSystemRemark(message, nowStr);
    const dup = task.remarks.some((r) => String(r?.content || "") === line);
    if (dup) {
      return false;
    }
    task.remarks.push({
      id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `rm-${Date.now()}`),
      content: line,
      remarkTime: nowStr || new Date().toLocaleString("zh-CN", { hour12: false }),
      system: true,
    });
    return true;
  }

  function recordChangeLog(task, entry) {
    if (!task) {
      return;
    }
    if (!Array.isArray(task.changeLog)) {
      task.changeLog = [];
    }
    task.changeLog.push({
      id: (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cl-${Date.now()}`),
      at: entry.at,
      operator: entry.operator || "用户",
      field: entry.field,
      oldValue: entry.oldValue ?? "",
      newValue: entry.newValue ?? "",
    });
    if (task.changeLog.length > 200) {
      task.changeLog = task.changeLog.slice(-200);
    }
  }

  function touchTaskUpdated(task, nowStr) {
    if (!task) {
      return;
    }
    task.updatedAt = nowStr || new Date().toLocaleString("zh-CN", { hour12: false });
  }

  function handlerLoadScore(handler, allTasks) {
    const name = String(handler || "").trim() || "未填";
    const open = (Array.isArray(allTasks) ? allTasks : []).filter(
      (t) => t.handler === name && TASK_ACTIVE_STATUSES.includes(t.status),
    ).length;
    if (open >= 8) {
      return 1;
    }
    if (open >= 5) {
      return 0.6;
    }
    if (open >= 3) {
      return 0.3;
    }
    return 0;
  }

  function calcTaskRiskV2(task, allTasks, opts, helpers) {
    const parseMs = helpers?.parseAnyTimeToMs || (() => 0);
    const latestMsFn = helpers?.getTaskLatestUpdateMs;
    const now = Date.now();
    const staleHours = Number(opts.staleHours || 48);
    const longDays = Number(opts.longProcessingDays || 7);
    const blockWords = ["阻塞", "卡住", "延期", "依赖", "等待", "无法推进"];
    const reasons = [];
    let score = 0;

    const latestMs = typeof latestMsFn === "function" ? latestMsFn(task) : 0;
    let staleHoursVal = 0;
    if (latestMs > 0 && TASK_TERMINAL_STATUSES.indexOf(task.status) === -1) {
      staleHoursVal = (now - latestMs) / 3600000;
      if (staleHoursVal >= staleHours) {
        reasons.push(`超时未更新 ${Math.floor(staleHoursVal)} 小时`);
      }
    }

    const createdMs = parseMs(task.createdAt);
    const ageDays = createdMs > 0 ? (now - createdMs) / 86400000 : 0;
    if (task.status === "处理中" && ageDays >= longDays) {
      reasons.push(`长期处理中 ${Math.floor(ageDays)} 天`);
    }

    const text = `${task.issueType || ""} ${task.content || ""} ${
      Array.isArray(task.remarks) ? task.remarks.map((r) => r?.content || "").join(" ") : ""
    }`;
    let blockHits = 0;
    blockWords.forEach((w) => {
      if (text.includes(w)) {
        blockHits += 1;
        reasons.push(`命中阻塞关键词「${w}」`);
      }
    });

    let tier = "none";
    if (staleHoursVal >= 30 * 24) {
      tier = "red";
    } else if (staleHoursVal >= 7 * 24) {
      tier = "orange";
    } else if (staleHoursVal >= staleHours) {
      tier = "yellow";
    }

    const staleScore = tier === "red" ? 1 : tier === "orange" ? 0.7 : tier === "yellow" ? 0.4 : 0;
    const loadScore = handlerLoadScore(task.handler, allTasks);
    const depScore = task.status === "已阻塞" ? 0.8 : 0;
    const bizScore = /线上|用户|财务|生产|故障|投诉|合规/.test(text) ? 0.8 : 0.2;
    const blockScore = Math.min(1, blockHits * 0.25);

    score =
      staleScore * 30 +
      loadScore * 20 +
      depScore * 20 +
      bizScore * 20 +
      blockScore * 10;

    const priorityBoost = task.priority === "高" ? 5 : task.priority === "低" ? -2 : 0;
    score = Math.round(Math.max(0, score + priorityBoost));

    const overdue =
      task.deadline && /^\d{4}-\d{2}-\d{2}$/.test(task.deadline) && task.status !== "已完结" && task.status !== "已取消"
        ? task.deadline < localDateKey()
        : false;
    if (overdue) {
      score += 8;
      reasons.push(`已过截止日期 ${task.deadline}`);
      if (tier === "none") {
        tier = "yellow";
      }
    }

    return {
      score,
      tier,
      tierLabel: tier === "red" ? "红色预警" : tier === "orange" ? "橙色预警" : tier === "yellow" ? "黄色预警" : "正常",
      reasons,
      staleHours: staleHoursVal,
      dimensions: {
        stale: staleScore,
        handlerLoad: loadScore,
        dependency: depScore,
        businessImpact: bizScore,
        blockKeywords: blockScore,
      },
      latestMs,
    };
  }

  function buildRiskReport(allTasks, opts, helpers) {
    const topN = Math.max(1, Math.min(50, Number(opts?.topN || 10)));
    const rows = (Array.isArray(allTasks) ? allTasks : [])
      .map((t) => ({ t, risk: calcTaskRiskV2(t, allTasks, opts, helpers) }))
      .filter((x) => x.risk.score > 0)
      .sort((a, b) => b.risk.score - a.risk.score);
    return {
      ok: true,
      total: rows.length,
      topN: rows.slice(0, topN).map((x) => ({
        id: x.t.id,
        taskId: x.t.taskId,
        status: x.t.status,
        priority: x.t.priority,
        deadline: x.t.deadline,
        score: x.risk.score,
        tier: x.risk.tier,
        tierLabel: x.risk.tierLabel,
        reasons: x.risk.reasons,
        handler: x.t.handler,
        reporter: x.t.reporter,
      })),
      risks: rows.map((x) => ({
        id: x.t.id,
        taskId: x.t.taskId,
        status: x.t.status,
        score: x.risk.score,
        tier: x.risk.tier,
        tierLabel: x.risk.tierLabel,
        reasons: x.risk.reasons,
      })),
      byTier: {
        red: rows.filter((x) => x.risk.tier === "red").length,
        orange: rows.filter((x) => x.risk.tier === "orange").length,
        yellow: rows.filter((x) => x.risk.tier === "yellow").length,
      },
    };
  }

  function runTaskMaintenance(allTasks, helpers) {
    const nowStr = helpers?.nowString?.() || new Date().toLocaleString("zh-CN", { hour12: false });
    const latestMsFn = helpers?.getTaskLatestUpdateMs;
    const parseMs = helpers?.parseAnyTimeToMs || (() => 0);
    let notes = 0;
    let suspended = 0;

    (Array.isArray(allTasks) ? allTasks : []).forEach((task) => {
      if (!TASK_ACTIVE_STATUSES.includes(task.status) && task.status !== "处理中") {
        return;
      }
      const latestMs = typeof latestMsFn === "function" ? latestMsFn(task) : parseMs(task.createdAt);
      if (!latestMs) {
        return;
      }
      const hours = (Date.now() - latestMs) / 3600000;
      const days = hours / 24;

      const hasNote = (needle) =>
        Array.isArray(task.remarks) && task.remarks.some((r) => String(r?.content || "").includes(needle));

      if (hours >= 72 && !hasNote("超时 72 小时")) {
        if (appendSystemRemark(task, "任务已超时 72 小时，请确认当前进度", nowStr)) {
          notes += 1;
          touchTaskUpdated(task, nowStr);
        }
      }
      if (days >= 30 && !hasNote("超过 30 天未更新")) {
        if (appendSystemRemark(task, "任务超过 30 天未更新，请处理人确认是否仍在推进", nowStr)) {
          notes += 1;
          touchTaskUpdated(task, nowStr);
        }
      }
      if (days >= 60 && task.status === "处理中") {
        const old = task.status;
        task.status = "已挂起";
        task.suspendedAt = nowStr;
        recordChangeLog(task, {
          at: nowStr,
          operator: "系统",
          field: "status",
          oldValue: old,
          newValue: "已挂起",
        });
        appendSystemRemark(task, "超过 60 天未更新，已自动流转为「已挂起」", nowStr);
        touchTaskUpdated(task, nowStr);
        suspended += 1;
      }
      if (task.status === "已挂起" && task.suspendedAt) {
        const suspendMs = parseMs(task.suspendedAt);
        if (suspendMs && (Date.now() - suspendMs) / 86400000 >= 30) {
          if (!hasNote("已挂起超过 30 天") && appendSystemRemark(task, "已挂起超过 30 天，请确认是否继续挂起或恢复处理", nowStr)) {
            notes += 1;
            touchTaskUpdated(task, nowStr);
          }
        }
      }
    });

    return { notes, suspended };
  }

  function extendNormalizedTask(raw, base) {
    const t = base || {};
    return {
      ...t,
      priority: normalizePriority(raw.priority ?? t.priority),
      deadline: normalizeDeadline(raw.deadline ?? t.deadline),
      updatedAt: String(raw.updatedAt ?? t.updatedAt ?? t.createdAt ?? ""),
      changeLog: Array.isArray(raw.changeLog) ? raw.changeLog : Array.isArray(t.changeLog) ? t.changeLog : [],
      blockReason: String(raw.blockReason ?? t.blockReason ?? ""),
      blockDependency: String(raw.blockDependency ?? t.blockDependency ?? ""),
      suspendedAt: String(raw.suspendedAt ?? t.suspendedAt ?? ""),
      cancelledAt: String(raw.cancelledAt ?? t.cancelledAt ?? ""),
    };
  }

  function nextStatusInCycle(status) {
    const order = ["待处理", "处理中", "已阻塞", "已挂起", "已完结"];
    const idx = order.indexOf(status);
    if (idx === -1 || status === "已完结" || status === "已取消") {
      return status;
    }
    return order[(idx + 1) % order.length];
  }

  function prioritySortKey(p) {
    if (p === "高") {
      return 0;
    }
    if (p === "中") {
      return 1;
    }
    return 2;
  }

  function sortTasksForList(list, sortBy) {
    const rows = (Array.isArray(list) ? list : []).slice();
    if (sortBy === "priority") {
      rows.sort((a, b) => prioritySortKey(a.priority) - prioritySortKey(b.priority));
    } else if (sortBy === "deadline") {
      rows.sort((a, b) => {
        const da = a.deadline || "9999-12-31";
        const db = b.deadline || "9999-12-31";
        return da.localeCompare(db);
      });
    }
    return rows;
  }

  function tasksToExcelRows(list) {
    return (Array.isArray(list) ? list : []).map((t, i) => ({
      序号: i + 1,
      登记事物ID: t.taskId,
      跟进问题类型: t.issueType,
      跟进事物内容: t.content,
      优先级: t.priority || "中",
      截止日期: t.deadline || "",
      问题反馈人: t.reporter,
      问题跟进处理人员: t.handler,
      登记时间: t.createdAt,
      当前状态: t.status,
      备注条数: Array.isArray(t.remarks) ? t.remarks.length : 0,
    }));
  }

  global.TaskEnhance = {
    TASK_STATUSES,
    TASK_ACTIVE_STATUSES,
    TASK_TERMINAL_STATUSES,
    TASK_PRIORITIES,
    TASK_ID_PATTERN,
    MAINTENANCE_KEY,
    normalizePriority,
    normalizeDeadline,
    contentSimilarity,
    findSimilarTasks,
    generateTaskId,
    migrateLegacyTaskIds,
    dedupeExactContentTasks,
    formatSystemRemark,
    appendSystemRemark,
    recordChangeLog,
    touchTaskUpdated,
    calcTaskRiskV2,
    buildRiskReport,
    runTaskMaintenance,
    extendNormalizedTask,
    nextStatusInCycle,
    sortTasksForList,
    tasksToExcelRows,
    localDateKey,
  };
})(typeof window !== "undefined" ? window : globalThis);
