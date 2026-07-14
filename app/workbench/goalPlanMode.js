/**
 * Agent 模式模块：Agent（含场景模板）| 计划 | 项目推进
 * - agent / agent:<sceneId>: 通用开发与场景模板，方案→补丁快路径
 * - plan: 仅产出/确认完整计划
 * - project: 依托已确认计划逐步推进；也可上传外部需求文档
 */
(function () {
  const WS_KEY = "wb_composer_workstream_v1";

  function getModeSelectEl() {
    return (
      document.getElementById("wbComposerAgentMode") ||
      document.getElementById("wbComposerWorkstream")
    );
  }

  function parseAgentModeValue(raw) {
    const v = String(raw || "").trim();
    if (v === "plan" || v === "goal_plan") return { ws: "plan", templateId: "" };
    if (v === "project") return { ws: "project", templateId: "" };
    if (v === "general") return { ws: "general", templateId: "" };
    if (v === "agent" || v === "") return { ws: "general", templateId: "" };
    if (v.startsWith("agent:")) {
      return { ws: "general", templateId: v.slice("agent:".length) };
    }
    return { ws: "general", templateId: "" };
  }

  function formatAgentModeValue(ws, templateId) {
    if (ws === "plan") return "plan";
    if (ws === "project") return "project";
    if (templateId) return `agent:${templateId}`;
    return "agent";
  }

  function getWorkstream() {
    const el = getModeSelectEl();
    const v = el?.value || localStorage.getItem(WS_KEY) || "agent";
    const parsed = parseAgentModeValue(v);
    if (parsed.ws === "plan" || parsed.ws === "project") {
      return parsed.ws;
    }
    return "general";
  }

  function syncAgentModeSelectValue(ws, templateId) {
    const el = getModeSelectEl();
    if (!el) return;
    const next = formatAgentModeValue(ws, templateId);
    if (el.value !== next) {
      el.value = next;
    }
  }

  function setWorkstream(mode, { templateId } = {}) {
    let nextWs = "general";
    if (mode === "plan" || mode === "goal_plan") nextWs = "plan";
    else if (mode === "project") nextWs = "project";
    const tplId =
      templateId !== undefined
        ? templateId
        : nextWs === "general"
          ? window.__wbSceneTemplates?.getActiveTemplate?.()?.id || ""
          : "";
    if (nextWs === "general" && tplId) {
      window.__wbSceneTemplates?.applyTemplate?.(tplId, { fillComposer: false });
    }
    syncAgentModeSelectValue(nextWs, tplId);
    try {
      localStorage.setItem(WS_KEY, nextWs);
    } catch {
      /* ignore */
    }
    syncWorkstreamUi();
  }

  function onAgentModeChange(value) {
    const parsed = parseAgentModeValue(value);
    try {
      localStorage.setItem(WS_KEY, parsed.ws);
    } catch {
      /* ignore */
    }
    if (parsed.ws === "general") {
      window.__wbSceneTemplates?.applyTemplate?.(parsed.templateId, { fillComposer: false });
    }
    syncWorkstreamUi();
    const msg =
      parsed.ws === "plan"
        ? "已切换：计划（先产出完整计划，确认后再项目推进）"
        : parsed.ws === "project"
          ? "已切换：项目推进（需完整计划，或上传需求文档）"
          : parsed.templateId
            ? `已切换：Agent · ${window.__wbSceneTemplates?.getTemplate?.(parsed.templateId)?.name || "场景"}`
            : "已切换：Agent";
    window.__wbShowComposerToast?.(msg, { type: "info" });
  }

  /** @deprecated use getWorkstream / isPlanWorkstream */
  function getExecMode() {
    const ws = getWorkstream();
    return ws === "plan" ? "goal_plan" : ws === "project" ? "goal_plan" : "general";
  }

  function isPlanWorkstream() {
    return getWorkstream() === "plan";
  }

  function isProjectWorkstream() {
    return getWorkstream() === "project";
  }

  /** 计划或项目推进均走分步计划能力 */
  function isGoalPlanMode() {
    const ws = getWorkstream();
    return ws === "plan" || ws === "project";
  }

  function syncWorkstreamUi() {
    const ws = getWorkstream();
    const module = document.getElementById("wbAgentModeModule");
    const uploadBtn = document.getElementById("wbImportRequirementBtn");
    const input = document.getElementById("wbAgentInput");
    if (module) {
      module.classList.toggle("wb-agent-mode-module--plan", ws === "plan");
      module.classList.toggle("wb-agent-mode-module--project", ws === "project");
    }
    if (uploadBtn) {
      uploadBtn.hidden = ws !== "project";
      uploadBtn.setAttribute("aria-hidden", ws === "project" ? "false" : "true");
    }
    if (input) {
      if (ws === "plan") {
        input.placeholder =
          "描述要规划的目标（仅生成完整开发计划，确认后可再到「项目推进」执行）…";
      } else if (ws === "project") {
        input.placeholder =
          "基于已确认计划推进；或先「上传需求文档」，再描述本轮要做的内容…";
      } else if (!window.__wbSceneTemplates?.getActiveTemplate?.()) {
        input.placeholder =
          "描述你希望 AI 完成的开发任务，例如：开发一个贪吃蛇小游戏";
      }
    }
  }

  function api() {
    return window.desktopAPI || window.electronAPI || {};
  }

  async function fetchPlanDag(projectId, taskId) {
    if (!api().wbProjectPlanDag) return { ok: false, steps: [], ready: [] };
    return api().wbProjectPlanDag({ projectId, taskId });
  }

  async function hasCompletePlan(projectId, taskId) {
    if (!projectId || !taskId) return { ok: false, reason: "missing_ids" };
    try {
      const spec = await api().wbProjectTaskSpecGet?.({ projectId, taskId });
      const dag = await fetchPlanDag(projectId, taskId);
      const steps = dag.steps || [];
      const approved =
        spec?.status === "APPROVED" || spec?.executionReady === true;
      const hasSteps = steps.length > 0;
      const checkpoint = await api().wbProjectCheckpointGet?.({ projectId, taskId });
      const planDone =
        checkpoint?.phase === "PLAN_DONE" ||
        checkpoint?.phase === "PLAN_CONFIRMED" ||
        Boolean(checkpoint?.planConfirmed);
      const imported = Boolean(checkpoint?.requirementDocPath);
      if (imported && (hasSteps || String(checkpoint?.requirementDocPath || ""))) {
        return { ok: true, via: "imported_doc", steps, spec, checkpoint };
      }
      if (approved && hasSteps && (checkpoint?.planConfirmed || planDone)) {
        return { ok: true, via: "confirmed_plan", steps, spec, checkpoint };
      }
      return {
        ok: false,
        reason: !hasSteps
          ? "no_steps"
          : !approved
            ? "spec_not_approved"
            : "not_confirmed",
        steps,
        spec,
        checkpoint,
      };
    } catch (err) {
      return { ok: false, reason: err?.message || "check_failed" };
    }
  }

  async function beginNextStep(projectId, taskId) {
    if (typeof api().wbProjectPlanStepBegin === "function") {
      return api().wbProjectPlanStepBegin({ projectId, taskId });
    }
    return api().wbProjectPlanDag?.({ projectId, taskId, action: "begin" });
  }

  async function advanceStep(projectId, taskId, { stepId, status = "done", result } = {}) {
    if (typeof api().wbProjectPlanStepAdvance === "function") {
      return api().wbProjectPlanStepAdvance({ projectId, taskId, stepId, status, result });
    }
    return api().wbProjectPlanDag?.({
      projectId,
      taskId,
      action: "advance",
      stepId,
      status,
      result,
    });
  }

  function stepLabel(step, indexHint) {
    if (!step) return `步骤 ${indexHint || "?"}`;
    const text = step.text || step.title || step.id || "";
    return text.slice(0, 120);
  }

  async function markPlanConfirmed(projectId, taskId) {
    if (typeof api().wbProjectCheckpointSave === "function") {
      await api().wbProjectCheckpointSave({
        projectId,
        taskId,
        patch: {
          phase: "PLAN_CONFIRMED",
          planConfirmed: true,
          nextAction: "execute_plan_steps",
        },
      });
      return;
    }
    await api().wbProjectTaskUpdate?.({
      projectId,
      taskId,
      currentStep: "计划已确认，可进入项目推进",
    });
  }

  async function confirmGoalPlan() {
    if (typeof window.__wbConfirmTaskSpecFromUi === "function") {
      await window.__wbConfirmTaskSpecFromUi();
    }
    const store = window.__wbStore?.getState?.() || {};
    const projectId = store.selectedProjectId;
    const taskId = store.selectedTaskId;
    if (!projectId || !taskId) return;
    await markPlanConfirmed(projectId, taskId);
    const dag = await fetchPlanDag(projectId, taskId);
    const steps = dag.steps || [];
    window.__wbActivityFeed?.pushPlanInline?.({
      title: "完整开发计划",
      summary: "计划已确认。请切换到「项目推进」按步骤执行；或继续完善计划。",
      plan: steps.map((s) => s.text || s.title || s.id),
      confirmed: true,
      nextStepIndex: 1,
    });
    if (isPlanWorkstream()) {
      window.__wbSetComposerPhase?.("goal_plan_ready");
      window.__wbShowComposerToast?.(
        "计划已完整确认。请将模式切换为「项目推进」后再执行步骤。",
        { type: "success" }
      );
      return;
    }
    window.__wbSetComposerPhase?.("goal_plan_ready");
    window.__wbShowComposerToast?.("计划已确认。点击「执行第 1 步」开始项目推进。", {
      type: "success",
    });
  }

  async function runNextGoalStep() {
    const store = window.__wbStore?.getState?.() || {};
    const projectId = store.selectedProjectId;
    const taskId = store.selectedTaskId;
    if (!projectId || !taskId) {
      window.__wbShowComposerToast?.("请先选择项目与任务", { type: "warn" });
      return;
    }
    if (isPlanWorkstream()) {
      window.__wbShowComposerToast?.(
        "当前为「计划」模式，仅生成/确认计划。请切换到「项目推进」再执行步骤。",
        { type: "info" }
      );
      return;
    }
    const gate = await hasCompletePlan(projectId, taskId);
    if (!gate.ok) {
      const hint =
        gate.reason === "no_steps"
          ? "尚无计划步骤。请先在「计划」模式生成并确认计划，或上传需求文档。"
          : gate.reason === "spec_not_approved"
            ? "计划规格未确认。请先在「计划」模式确认完整计划。"
            : "需要先有完整计划才能项目推进。请切换到「计划」或上传需求文档。";
      window.__wbShowComposerToast?.(hint, { type: "warn" });
      window.__wbActivityFeed?.pushGoalStepCard?.({
        id: "goal_gate_block",
        title: "无法进入项目推进",
        summary: hint,
        status: "ready",
      });
      return;
    }
    window.__wbSetComposerPhase?.("goal_step_running");
    const begun = await beginNextStep(projectId, taskId);
    if (!begun?.ok && begun?.blocked) {
      window.__wbShowComposerToast?.(begun.message || "计划步骤不可用", { type: "error" });
      window.__wbSetComposerPhase?.("goal_plan_ready");
      return;
    }
    if (begun?.done || (!begun?.step && begun?.ok)) {
      window.__wbActivityFeed?.pushGoalStepCard?.({
        id: "goal_all_done",
        title: "全部目标步骤已完成",
        summary: begun.message || "计划内步骤均已完成，可确认任务完成。",
        status: "done",
        allDone: true,
      });
      window.__wbSetComposerPhase?.("ready_confirm");
      return;
    }
    const step = begun.step;
    if (!step) {
      window.__wbShowComposerToast?.("没有可执行的下一步", { type: "warn" });
      window.__wbSetComposerPhase?.("goal_step_done");
      return;
    }
    window.__wbGoalPlanActiveStepId = step.id;
    window.__wbActivityFeed?.pushGoalStepCard?.({
      id: `goal_running_${step.id}`,
      stepId: step.id,
      title: `正在执行：${stepLabel(step)}`,
      summary: "将为本步生成可审阅 Diff，请在右侧抽屉中确认后写入。",
      status: "running",
    });
    const expected = Array.isArray(step.expectedFiles) ? step.expectedFiles.filter(Boolean) : [];
    const message = [
      "【项目推进 · 单步实施】",
      "仅实施以下步骤，不要越界完成后续步骤：",
      stepLabel(step),
      expected.length ? `目标文件：${expected.join(", ")}` : "",
      expected.length
        ? `若目标文件尚不存在（尤其 ${expected.join(" / ")}）：禁止 read_file，直接 stage_patch changeType:add + proposedContent 新建。`
        : "补丁指引：先 list_files 确认现状；不存在的文件禁止 read_file，直接 changeType:add 新建。",
      "修改已存在文件失败时改用 full_content，勿重复无效 replace。",
      "Canvas/游戏逻辑写入 game.js，并在 index.html 引入 <script src=\"./game.js\"></script>。",
      "请用 stage_patch 产出本步所需变更。",
    ]
      .filter(Boolean)
      .join("\n");
    await window.__wbProposeCodePatches?.({
      resumeMessage: message,
      goalStepId: step.id,
      basedOnLastPlan: true,
    });
  }

  async function onGoalStepWritten({ summary } = {}) {
    if (!isGoalPlanMode() || isPlanWorkstream()) return false;
    const store = window.__wbStore?.getState?.() || {};
    const projectId = store.selectedProjectId;
    const taskId = store.selectedTaskId;
    const stepId = window.__wbGoalPlanActiveStepId;
    if (!projectId || !taskId || !stepId) return false;
    const advanced = await advanceStep(projectId, taskId, {
      stepId,
      status: "done",
      result: { summary: summary || "本步已写入" },
    });
    const ready = advanced?.ready || [];
    const allDone =
      !ready.length &&
      (advanced?.plan?.steps || []).every(
        (s) => s.status === "done" || s.status === "skipped"
      );
    window.__wbActivityFeed?.pushGoalStepCard?.({
      id: `goal_done_${stepId}`,
      stepId,
      title: "本步处理结果",
      summary: summary || "代码已写入。是否执行下一个目标任务步骤？",
      status: "done",
      allDone,
    });
    window.__wbCloseCodeDrawer?.();
    if (allDone) {
      window.__wbSetComposerPhase?.("ready_confirm");
      window.__wbShowComposerToast?.("全部步骤已完成，请确认完成任务。", { type: "success" });
    } else {
      window.__wbSetComposerPhase?.("goal_step_done");
      window.__wbShowComposerToast?.("本步完成。是否执行下一步？", { type: "success" });
    }
    window.__wbGoalPlanActiveStepId = null;
    return true;
  }

  async function importRequirementDoc() {
    const store = window.__wbStore?.getState?.() || {};
    const projectId = store.selectedProjectId;
    let taskId = store.selectedTaskId;
    if (!projectId) {
      window.__wbShowComposerToast?.("请先选择项目", { type: "warn" });
      return;
    }
    if (!taskId && typeof window.__wbEnsureComposerTask === "function") {
      try {
        taskId = await window.__wbEnsureComposerTask(projectId, "外部需求文档导入");
      } catch {
        /* optional */
      }
    }
    if (!taskId) {
      window.__wbShowComposerToast?.("请先选择或新建一个任务，再上传需求文档", {
        type: "warn",
      });
      return;
    }
    const fn = api().wbProjectImportRequirement;
    if (typeof fn !== "function") {
      window.__wbShowComposerToast?.("当前版本不支持导入需求文档", { type: "error" });
      return;
    }
    try {
      const result = await fn({ projectId, taskId });
      if (result?.canceled) return;
      if (!result?.ok) {
        window.__wbShowComposerToast?.(result?.error || "导入失败", { type: "error" });
        return;
      }
      window.__wbActivityFeed?.pushUserMessage?.(
        `已上传需求文档：${result.relPath || result.path || "requirements"}`
      );
      window.__wbActivityFeed?.pushPlanInline?.({
        title: "外部需求文档",
        summary: result.preview || "已导入项目，可作为项目推进依据。",
        plan: result.inferredSteps || [],
        confirmed: true,
        nextStepIndex: 1,
      });
      if (result.inferredSteps?.length) {
        window.__wbSetComposerPhase?.("goal_plan_ready");
      }
      window.__wbShowComposerToast?.(
        `需求文档已导入${result.relPath ? `（${result.relPath}）` : ""}，可开始项目推进`,
        { type: "success" }
      );
    } catch (err) {
      window.__wbShowComposerToast?.(err?.message || "导入失败", { type: "error" });
    }
  }

  function migrateLegacyModeSelect() {
    const legacyExec = localStorage.getItem("wb_composer_exec_mode_v1");
    const storedWs = localStorage.getItem(WS_KEY);
    if (legacyExec === "goal_plan" && !storedWs) {
      try {
        localStorage.setItem(WS_KEY, "plan");
      } catch {
        /* ignore */
      }
    }
    if (storedWs === "general") {
      try {
        localStorage.setItem(WS_KEY, "general");
      } catch {
        /* ignore */
      }
    }
  }

  function bindExecModeSelect() {
    migrateLegacyModeSelect();
    const el = getModeSelectEl();
    if (el && el.dataset.bound !== "1") {
      el.dataset.bound = "1";
      window.__wbSceneTemplates?.populateAgentModeSelect?.();
      const ws = localStorage.getItem(WS_KEY) || "general";
      const tplId = window.__wbSceneTemplates?.getActiveTemplate?.()?.id || "";
      syncAgentModeSelectValue(
        ws === "plan" || ws === "project" ? ws : "general",
        tplId
      );
      el.addEventListener("change", () => {
        onAgentModeChange(el.value);
      });
    }
    const uploadBtn = document.getElementById("wbImportRequirementBtn");
    if (uploadBtn && uploadBtn.dataset.bound !== "1") {
      uploadBtn.dataset.bound = "1";
      uploadBtn.addEventListener("click", () => {
        void importRequirementDoc();
      });
    }
    syncWorkstreamUi();
  }

  window.__wbGoalPlanMode = {
    getExecMode,
    setExecMode: setWorkstream,
    getWorkstream,
    setWorkstream,
    isGoalPlanMode,
    isPlanWorkstream,
    isProjectWorkstream,
    hasCompletePlan,
    confirmGoalPlan,
    runNextGoalStep,
    onGoalStepWritten,
    fetchPlanDag,
    bindExecModeSelect,
    syncWorkstreamUi,
    importRequirementDoc,
    stepLabel,
    parseAgentModeValue,
    formatAgentModeValue,
    syncAgentModeSelectValue,
    onAgentModeChange,
  };
  window.__wbConfirmGoalPlan = confirmGoalPlan;
  window.__wbRunNextGoalStep = runNextGoalStep;
})();
