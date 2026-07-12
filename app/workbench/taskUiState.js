/**
 * BL-019 / STATE-005/007: Single UI state truth for Workbench task views.
 * Browser-side helper (no Node require).
 */
(function () {
  const PHASE_LABEL = {
    idle: "待命",
    running: "运行中",
    clarifying: "需求澄清中",
    plan_ready: "方案待确认",
    diff_ready: "变更待审阅",
    diff_accepted: "Diff 已接受",
    patch_empty: "未生成变更",
    written: "已写入 · 待验证",
    ready_confirm: "待确认完成",
    done: "已完成",
    failed: "失败",
  };

  const VIEW_HINT = {
    idle: { primaryView: "code", next: "输入需求并生成方案" },
    clarifying: { primaryView: "code", next: "回答澄清问题并确认规格" },
    plan_ready: { primaryView: "code", next: "确认方案后生成代码变更" },
    diff_ready: { primaryView: "diff", next: "在 Diff 审阅中接受或拒绝变更" },
    diff_accepted: { primaryView: "diff", next: "批准写入磁盘" },
    patch_empty: { primaryView: "code", next: "重新生成代码变更" },
    written: { primaryView: "test", next: "运行验证或确认完成" },
    ready_confirm: { primaryView: "test", next: "确认完成并查看交付 Runbook" },
    done: { primaryView: "git", next: "可新建任务或查看 Git/交付" },
    failed: { primaryView: "code", next: "查看错误后重试或重规划" },
    running: { primaryView: "code", next: "等待 Agent 完成当前步骤" },
  };

  function countDiffPending(projectId, taskId) {
    try {
      const st = window.__wbCodeReviewStore?.getState?.(projectId, taskId);
      if (!st?.changes?.length) return { pending: 0, accepted: 0, total: 0, riskCount: 0 };
      const pending = st.changes.filter((c) => c.reviewStatus === "pending" || c.reviewStatus === "revision").length;
      const accepted = st.changes.filter((c) => c.reviewStatus === "accepted").length;
      const riskCount = st.changes.filter((c) => (c.reviewFindings || []).length > 0).length;
      return { pending, accepted, total: st.changes.length, riskCount };
    } catch {
      return { pending: 0, accepted: 0, total: 0, riskCount: 0 };
    }
  }

  /**
   * @returns {{
   *   label: string,
   *   phase: string,
   *   dbStatus: string,
   *   primaryView: string,
   *   nextAction: string,
   *   goal: string,
   *   risks: string[],
   *   needsUserAction: boolean,
   *   isTerminal: boolean,
   *   isBlocked: boolean,
   *   diff: object,
   *   checkpointHint: string|null
   * }}
   */
  function getTaskUiState({
    task,
    composerPhase = "idle",
    agentRunStarting = false,
    checkpoint = null,
    planOutput = null,
  } = {}) {
    const ts = window.__wbTaskStatus || {};
    const dbStatus = String(ts.normalizeTaskStatus?.(task?.status) || task?.status || "").toUpperCase();
    const step = String(task?.currentStep || "");
    let phase = String(composerPhase || "idle");

    if (dbStatus === "COMPLETED" || dbStatus === "DONE" || dbStatus === "ARCHIVED") {
      phase = "done";
    } else if (dbStatus === "CANCELED") {
      phase = "failed";
    } else if (dbStatus === "BLOCKED" || dbStatus === "PARTIAL_FAILED") {
      phase = "failed";
    } else if (agentRunStarting || phase === "running") {
      phase = "running";
    } else if (phase === "idle") {
      if (dbStatus === "CLARIFYING") phase = "clarifying";
      else if (dbStatus === "SPEC_REVIEW" || step.includes("方案待确认")) phase = "plan_ready";
      else if (step.includes("变更待审阅") || dbStatus === "WAITING_APPROVAL") phase = "diff_ready";
      else if (step.includes("未生成变更")) phase = "patch_empty";
      else if (dbStatus === "TESTING" || dbStatus === "FIXING") phase = "written";
    }

    const projectId = task?.projectId || window.__wbStore?.getState?.().selectedProjectId;
    const taskId = task?.id;
    const diff = countDiffPending(projectId, taskId);

    let label = PHASE_LABEL[phase] || ts.labelForTaskStatus?.(dbStatus, step) || dbStatus || "未知";
    if (phase === "running" && step) {
      label = `运行中 · ${step.slice(0, 40)}`;
    }
    if (dbStatus === "BLOCKED") {
      label = "已阻塞";
    }

    const hint = VIEW_HINT[phase] || VIEW_HINT.idle;
    const risks = [];
    if (diff.riskCount > 0) risks.push(`${diff.riskCount} 个文件含审查风险提示`);
    if (Array.isArray(planOutput?.risks)) {
      for (const r of planOutput.risks.slice(0, 3)) risks.push(String(r));
    }
    if (dbStatus === "BLOCKED" && step) risks.push(step);

    let checkpointHint = null;
    if (checkpoint?.lastGreen?.isGreen) {
      checkpointHint = "已有绿色 Checkpoint，可恢复";
    } else if (checkpoint?.phase === "PLAN_RUNNING" || checkpoint?.phase === "WAITING_APPLY") {
      checkpointHint = `可恢复 · ${checkpoint.phase}`;
    } else if (checkpoint?.phase) {
      checkpointHint = `检查点 · ${checkpoint.phase}`;
    }

    const isTerminal = phase === "done" || dbStatus === "CANCELED" || dbStatus === "ARCHIVED";
    const isBlocked = dbStatus === "BLOCKED" || dbStatus === "PARTIAL_FAILED";
    const needsUserAction = [
      "clarifying",
      "plan_ready",
      "diff_ready",
      "diff_accepted",
      "ready_confirm",
      "written",
      "failed",
    ].includes(phase);

    return {
      label,
      phase,
      dbStatus,
      primaryView: hint.primaryView,
      nextAction: hint.next,
      goal: String(task?.title || planOutput?.summary || step || "当前任务").slice(0, 120),
      completedHint: phase === "done" ? "任务已完成" : step || "",
      doingHint: phase === "running" ? step || "Agent 执行中" : "",
      risks,
      needsUserAction,
      isTerminal,
      isBlocked,
      isSuccessVisual: phase === "done" && !isBlocked,
      diff,
      checkpointHint,
      currentStep: step,
    };
  }

  window.__wbTaskUiState = {
    getTaskUiState,
    PHASE_LABEL,
    VIEW_HINT,
  };
})();
