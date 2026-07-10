const { getDb, nowIso, newId } = require("./db.js");
const {
  buildTaskNamespace,
  namespacesForProjectScope,
} = require("./namespace.js");
const { getProject, getTask, updateTask } = require("./projectService.js");
const { resolveUserId } = require("./projectService.js");
const compressionManager = require("./context-compression/contextCompressionManager.js");
const { buildPlanOnlyOutput } = require("./planOnlyOutput.js");
const { analyzeProjectCode, resolveProjectRoot } = require("./projectCodeService.js");
const {
  startAgentRun,
  cancelAgentRun,
  completeAgentRun,
  getAgentRun,
  failAgentRun,
  isRunCanceled,
  RUN_STATUS,
} = require("./agentRunStore.js");
const { runProjectAgentLLM, agentLlmEnabled } = require("./projectAgentLLM.js");
const { listStagedPatches, patchToDiffPreview, PATCH_STATUS } = require("./patchStagingService.js");
const { TASK_STATUS } = require("./taskStatus.js");
const { runFixLoop, resumeFixLoopAfterApply } = require("./fixLoopController.js");
const {
  getFixLoopState,
  fixLoopV2Enabled,
  grantAutoVerify,
} = require("./fixLoopStateService.js");
const { applyAcceptedPatches } = require("./controlledDevService.js");
const { listAvailableVerifications } = require("./verificationService.js");
const {
  emitAgentEvent,
  PHASE,
  STATUS,
} = require("./agentEventEmitter.js");

let getDefaultProjectRootFn = null;

function orchAutoVerifyEnabled() {
  return String(process.env.WB_ORCH_AUTO_VERIFY || "1") !== "0";
}

function configureAgentOrchestrator(options = {}) {
  if (typeof options.getDefaultProjectRoot === "function") {
    getDefaultProjectRootFn = options.getDefaultProjectRoot;
  }
}

function recordTaskMemories(getUserDataPath, userId, output) {
  const uid = resolveUserId(userId);
  const items = Array.isArray(output?.memoryToRecord) ? output.memoryToRecord : [];
  for (const item of items) {
    if (!item?.namespace || !item?.content) {
      continue;
    }
    const ns = String(item.namespace);
    const scopeType = ns.startsWith("task:")
      ? "task"
      : ns.startsWith("project:")
        ? "project"
        : "chat";
    const scopeId = ns.split(":").pop();
    const { writeMemory } = require("./contextMemoryService.js");
    writeMemory(getUserDataPath, uid, {
      namespace: ns,
      scopeType,
      scopeId,
      memoryType: String(item.type || "note"),
      content: String(item.content),
      source: "ProjectAgent",
      importance: item.type === "development_plan" ? 5 : 4,
    });
  }
}

function recordLegacyAgentRun(getUserDataPath, userId, fields) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const id = fields.agentRunId || newId("run");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO agent_runs (
      id, user_id, agent_type, scope_type, project_id, task_id, chat_id,
      input_text, output_text, status, error_message, created_at, completed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(
    id,
    uid,
    fields.agentType,
    fields.scopeType,
    fields.projectId || null,
    fields.taskId || null,
    fields.chatId || null,
    fields.inputText,
    JSON.stringify(fields.output || {}),
    fields.status || "COMPLETED",
    ts,
    ts
  );
  return id;
}

function taskStatusForMode(mode, phase) {
  const m = String(mode).toUpperCase();
  if (phase === "start") {
    if (m === "PLAN_ONLY") {
      return { status: TASK_STATUS.PLANNING, currentStep: "生成开发方案" };
    }
    if (m === "PATCH_PROPOSE") {
      return { status: TASK_STATUS.PLANNING, currentStep: "生成补丁提议" };
    }
    if (m === "VERIFY_FIX") {
      return { status: TASK_STATUS.FIXING, currentStep: "验证失败，生成修复补丁" };
    }
    if (m === "APPLY_APPROVED") {
      return { status: TASK_STATUS.APPLYING, currentStep: "用户已接受，准备写入" };
    }
  }
  if (phase === "done") {
    if (m === "PLAN_ONLY") {
      return { status: TASK_STATUS.PLANNING, currentStep: "方案待确认" };
    }
    if (m === "PATCH_PROPOSE") {
      return { status: TASK_STATUS.WAITING_APPROVAL, currentStep: "变更待审阅" };
    }
  }
  return null;
}

async function runProjectAgent(getUserDataPath, userId, payload) {
  const uid = resolveUserId(userId);
  const projectId = payload.projectId;
  const taskId = payload.taskId;
  const message = String(payload.message || "");
  const mode = String(payload.mode || "PLAN_ONLY").toUpperCase();
  const webContents = payload.webContents || null;

  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  if (!task) {
    throw new Error("任务不存在");
  }

  if (mode === "APPLY_APPROVED") {
    if (!payload.userApproved) {
      const err = new Error("APPLY_APPROVED 需要 userApproved: true");
      err.code = "USER_APPROVAL_REQUIRED";
      err.status = 403;
      throw err;
    }
    if (!payload.approvalId && !payload.requestId) {
      const err = new Error("APPLY_APPROVED 需要 approvalId 或 requestId");
      err.code = "APPROVAL_ID_REQUIRED";
      err.status = 403;
      throw err;
    }
    updateTask(getUserDataPath, uid, projectId, taskId, {
      status: TASK_STATUS.APPLYING,
      currentStep: "用户已接受，批量写入中",
    });
    emitAgentEvent(
      { getUserDataPath, userId: uid, projectId, taskId, webContents },
      {
        phase: PHASE.APPLYING,
        status: STATUS.running,
        title: "写入代码",
        summary: "正在应用已接受的 Diff",
        stepKey: "write_code",
      }
    );
    const applyRunId = newId("apply");
    const applyResult = applyAcceptedPatches(
      getUserDataPath,
      uid,
      {
        projectId,
        taskId,
        patchIds: payload.patchIds,
        userApproved: true,
        approvalId: payload.approvalId,
        requestId: payload.requestId,
        createGitBranch: Boolean(payload.createGitBranch),
      },
      { getDefaultProjectRoot: getDefaultProjectRootFn }
    );
    let fixResult = null;
    let verifyResult = null;
    let verifySkipped = null;
    const fixState = getFixLoopState(getUserDataPath, uid, projectId, taskId);
    const wantAutoVerify =
      orchAutoVerifyEnabled() &&
      (Boolean(payload.autoVerify) || Boolean(fixState?.autoVerifyGranted));
    const verifyScripts = Array.isArray(payload.verifyScripts) && payload.verifyScripts.length
      ? payload.verifyScripts.map(String)
      : [String(payload.fixContext?.scriptName || fixState?.scriptName || "build")];
    const scriptName = verifyScripts[0] || "build";

    if (applyResult.ok && wantAutoVerify) {
      grantAutoVerify(getUserDataPath, uid, projectId, taskId, { scriptName });
    }

    if (applyResult.ok && fixState?.active) {
      const taskNs = buildTaskNamespace(projectId, taskId);
      const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
        namespace: taskNs,
        messages: [],
      });
      emitAgentEvent(
        { getUserDataPath, userId: uid, projectId, taskId, agentRunId: applyRunId, webContents },
        {
          phase: PHASE.VERIFYING,
          status: STATUS.running,
          title: "继续验证",
          summary: "修复补丁已写入，自动继续验证",
          stepKey: "run_verify",
        }
      );
      fixResult = await resumeFixLoopAfterApply(
        getUserDataPath,
        uid,
        {
          getUserDataPath,
          userId: uid,
          projectId,
          taskId,
          agentRunId: payload.agentRunId || fixState.agentRunId || applyRunId,
          promptContext: prepared.promptContext,
          webContents,
        },
        {
          patchIds: payload.patchIds,
          appliedPatchIds: applyResult.appliedIds,
          getDefaultProjectRoot: getDefaultProjectRootFn,
        }
      );
    } else if (applyResult.ok && wantAutoVerify) {
      const available = listAvailableVerifications(getUserDataPath, uid, projectId, {
        getDefaultProjectRoot: getDefaultProjectRootFn,
      });
      if (!available || !available.length) {
        verifySkipped = {
          skipped: true,
          message: "未配置验证脚本，已跳过自动验证",
          scriptName,
        };
        emitAgentEvent(
          { getUserDataPath, userId: uid, projectId, taskId, agentRunId: applyRunId, webContents },
          {
            phase: PHASE.COMPLETED,
            status: STATUS.skipped,
            title: "自动验证",
            summary: verifySkipped.message,
            stepKey: "run_verify",
          }
        );
      } else {
        const taskNs = buildTaskNamespace(projectId, taskId);
        const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
          namespace: taskNs,
          messages: [],
        });
        emitAgentEvent(
          { getUserDataPath, userId: uid, projectId, taskId, agentRunId: applyRunId, webContents },
          {
            phase: PHASE.VERIFYING,
            status: STATUS.running,
            title: "自动验证",
            summary: `运行 npm run ${scriptName}`,
            stepKey: "run_verify",
          }
        );
        fixResult = await runFixLoop(
          getUserDataPath,
          uid,
          {
            getUserDataPath,
            userId: uid,
            projectId,
            taskId,
            agentRunId: applyRunId,
            promptContext: prepared.promptContext,
            webContents,
            root: resolveProjectRoot(project, getDefaultProjectRootFn),
          },
          { scriptName, getDefaultProjectRoot: getDefaultProjectRootFn }
        );
        verifyResult = fixResult?.verify || null;
        if (fixResult?.skipped) {
          verifySkipped = {
            skipped: true,
            message: fixResult.message || "未配置验证脚本，已跳过自动验证",
            scriptName,
          };
        }
      }
    }

    const writeOk = Boolean(applyResult.ok);
    const verifyOk = Boolean(fixResult?.ok);
    const waiting = Boolean(fixResult?.waitingApproval);
    emitAgentEvent(
      { getUserDataPath, userId: uid, projectId, taskId, agentRunId: applyRunId, webContents },
      {
        phase: !writeOk ? PHASE.FAILED : waiting ? PHASE.WAITING_REVIEW : verifyOk || verifySkipped ? PHASE.COMPLETED : PHASE.COMPLETED,
        status: !writeOk ? STATUS.failed : waiting ? STATUS.waiting : STATUS.success,
        title: "写入代码",
        summary: !writeOk
          ? applyResult.error || "批量写入失败"
          : verifyOk
            ? `已写入 ${applyResult.count || 0} 个文件，验证通过`
            : waiting
              ? `已写入 ${applyResult.count || 0} 个文件，等待修复 Diff 审阅`
              : verifySkipped
                ? `已写入 ${applyResult.count || 0} 个文件（${verifySkipped.message}）`
                : `已写入 ${applyResult.count || 0} 个文件`,
        stepKey: "write_code",
        error: writeOk ? null : applyResult.error || "批量写入失败",
      }
    );
    return {
      agentRunId: applyRunId,
      applyRunId,
      status: writeOk ? RUN_STATUS.COMPLETED : RUN_STATUS.FAILED,
      mode,
      output: {
        summary: !writeOk
          ? applyResult.error || "批量写入失败"
          : verifyOk
            ? "补丁已写入且验证通过"
            : waiting
              ? "补丁已写入，等待下一轮 Diff 审阅"
              : verifySkipped
                ? `已写入 ${applyResult.count} 个文件；${verifySkipped.message}`
                : `已写入 ${applyResult.count} 个文件`,
        applyResult,
        fixResult,
        verifyResult,
        verifySkipped,
        needUserConfirm: waiting,
        remainingReport: fixResult?.remainingReport || null,
      },
    };
  }

  const startStatus = taskStatusForMode(mode, "start");
  if (startStatus) {
    updateTask(getUserDataPath, uid, projectId, taskId, startStatus);
  }

  const taskNs = buildTaskNamespace(projectId, taskId);
  const messages = [{ role: "user", content: message }];
  const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
    namespace: taskNs,
    messages,
  });
  if (prepared?.compressionResult?.applied) {
    const before = prepared.compressionResult.tokensBefore;
    const after = prepared.compressionResult.tokensAfter;
    emitAgentEvent(
      { getUserDataPath, userId: uid, projectId, taskId, webContents },
      {
        phase: PHASE.ANALYZING,
        status: STATUS.success,
        title: "上下文压缩",
        summary: `已压缩上下文，token ${before ?? "?"} → ${after ?? "?"}`,
        stepKey: "compress_context",
      }
    );
  }
  const root = resolveProjectRoot(project, getDefaultProjectRootFn);

  emitAgentEvent(
    { getUserDataPath, userId: uid, projectId, taskId, webContents },
    {
      phase: PHASE.CHECKING_PATH,
      status: STATUS.running,
      title: "检查项目路径",
      summary: root ? `使用 ${root}` : "未解析到项目路径",
      stepKey: "check_source",
    }
  );

  const codeAnalysis = analyzeProjectCode(project, message, getDefaultProjectRootFn);

  emitAgentEvent(
    { getUserDataPath, userId: uid, projectId, taskId, webContents },
    {
      phase: PHASE.CHECKING_PATH,
      status: root ? STATUS.success : STATUS.failed,
      title: "检查项目路径",
      summary: root ? `使用 ${root}` : "项目路径不可用",
      stepKey: "check_source",
      error: root ? null : "项目路径不可用",
    }
  );

  let agentRunId = null;
  let output;
  let runStatus = RUN_STATUS.COMPLETED;
  try {
    const started = startAgentRun(getUserDataPath, uid, {
      projectId,
      taskId,
      mode,
      inputText: message,
    });
    agentRunId = started.runId;
    const ctx = {
      getUserDataPath,
      userId: uid,
      projectId,
      taskId,
      agentRunId,
      mode,
      root,
      appRoot: typeof getDefaultProjectRootFn === "function" ? getDefaultProjectRootFn() : null,
      project,
      task,
      promptContext: prepared.promptContext,
      webContents,
    };

    emitAgentEvent(ctx, {
      phase: PHASE.ANALYZING,
      status: STATUS.running,
      title: "分析需求",
      summary: "AI 正在理解你的开发目标",
      stepKey: "analyze_req",
    });

    if (mode === "VERIFY_FIX" && payload.fixContext?.scriptName) {
      emitAgentEvent(ctx, {
        phase: PHASE.VERIFYING,
        status: STATUS.running,
        title: "运行验证",
        summary: `执行 ${payload.fixContext.scriptName}`,
        stepKey: "run_verify",
      });
      if (payload.fixContext?.resume && fixLoopV2Enabled()) {
        const fixState = getFixLoopState(getUserDataPath, uid, projectId, taskId);
        if (fixState?.active) {
          const fixResult = await resumeFixLoopAfterApply(getUserDataPath, uid, ctx, {
            patchIds: payload.fixContext.patchIds,
            getDefaultProjectRoot: getDefaultProjectRootFn,
          });
          output = {
            summary: fixResult.ok ? "验证通过" : fixResult.message || "修复流程继续",
            fixResult,
            toolTrace: [],
            mode,
          };
          runStatus = fixResult.ok ? RUN_STATUS.COMPLETED : RUN_STATUS.WAITING_APPROVAL;
        }
      }
      if (!output) {
        const fixResult = await runFixLoop(getUserDataPath, uid, ctx, {
          scriptName: payload.fixContext.scriptName,
          getDefaultProjectRoot: getDefaultProjectRootFn,
        });
        output = {
          summary: fixResult.ok ? "验证通过" : fixResult.message || "修复流程结束",
          fixResult,
          toolTrace: [],
          mode,
        };
        runStatus = fixResult.ok ? RUN_STATUS.COMPLETED : RUN_STATUS.WAITING_APPROVAL;
      }
      emitAgentEvent(ctx, {
        phase: runStatus === RUN_STATUS.COMPLETED ? PHASE.COMPLETED : PHASE.WAITING_REVIEW,
        status: runStatus === RUN_STATUS.COMPLETED ? STATUS.success : STATUS.waiting,
        title: runStatus === RUN_STATUS.COMPLETED ? "任务完成" : "等待用户审阅",
        summary: output?.summary || "",
        stepKey: runStatus === RUN_STATUS.COMPLETED ? "complete" : "await_diff",
      });
    } else if (agentLlmEnabled() && root) {
      if (mode === "PLAN_ONLY") {
        emitAgentEvent(ctx, {
          phase: PHASE.PLANNING,
          status: STATUS.running,
          title: "生成开发方案",
          summary: "正在生成可确认的实施方案",
          stepKey: "generate_plan",
        });
      } else if (mode === "PATCH_PROPOSE") {
        emitAgentEvent(ctx, {
          phase: PHASE.PATCHING,
          status: STATUS.running,
          title: "生成代码变更",
          summary: "正在根据方案生成可审阅 Diff",
          stepKey: "generate_patch",
        });
      }
      output = await runProjectAgentLLM(ctx, { message, mode });
      runStatus =
        mode === "PATCH_PROPOSE" ? RUN_STATUS.WAITING_APPROVAL : RUN_STATUS.COMPLETED;

      emitAgentEvent(ctx, {
        phase: PHASE.ANALYZING,
        status: STATUS.success,
        title: "分析需求",
        summary: "需求理解完成",
        stepKey: "analyze_req",
      });

      if (mode === "PLAN_ONLY") {
        const planCount = output?.plan?.length || 0;
        emitAgentEvent(ctx, {
          phase: PHASE.PLANNING,
          status: planCount ? STATUS.success : STATUS.failed,
          title: "生成开发方案",
          summary: planCount ? `共 ${planCount} 步，方案待确认` : "未生成任何计划",
          stepKey: "generate_plan",
          error: planCount ? null : "未生成任何计划",
        });
        emitAgentEvent(ctx, {
          phase: PHASE.WAITING_REVIEW,
          status: STATUS.waiting,
          title: "方案待确认",
          summary: "请确认方案后生成代码变更",
          stepKey: "plan_ready",
        });
      } else if (mode === "PATCH_PROPOSE") {
        const stagedNow = listStagedPatches(getUserDataPath, uid, projectId, taskId, {
          status: PATCH_STATUS.STAGED,
        });
        const diffCount = Math.max(output?.diffPreviews?.length || 0, stagedNow.length);
        if (output) {
          output.diffPreviews = stagedNow.map(patchToDiffPreview).filter(Boolean);
        }
        emitAgentEvent(ctx, {
          phase: PHASE.PATCHING,
          status: diffCount ? STATUS.success : STATUS.failed,
          title: "生成代码变更",
          summary: diffCount
            ? `生成 ${diffCount} 个文件 Diff`
            : output?.note || "Agent 未返回 staged patch",
          stepKey: "generate_patch",
          error: diffCount ? null : output?.note || "未生成代码变更：当前 Agent 未返回 staged patch",
        });
        if (diffCount) {
          emitAgentEvent(ctx, {
            phase: PHASE.WAITING_REVIEW,
            status: STATUS.waiting,
            title: "等待用户审阅 Diff",
            summary: `已生成 ${diffCount} 个代码变更`,
            stepKey: "await_diff",
          });
        } else {
          emitAgentEvent(ctx, {
            phase: PHASE.PATCHING,
            status: STATUS.failed,
            title: "未生成代码变更",
            summary: "Agent 未返回 staged patch，请重新生成代码变更",
            stepKey: "generate_patch",
            error: "staged_patches count = 0",
          });
        }
      }
    } else {
      emitAgentEvent(ctx, {
        phase: PHASE.PLANNING,
        status: STATUS.running,
        title: "生成开发方案",
        summary: agentLlmEnabled() ? "LLM 不可用，使用规则方案" : "LLM 已禁用，使用规则方案",
        stepKey: "generate_plan",
      });
      output = buildPlanOnlyOutput({
        message,
        project,
        task,
        projectId,
        taskId,
        promptContext: prepared.promptContext,
        codeAnalysis,
      });
      if (mode === "PATCH_PROPOSE") {
        output.diffPreviews = [];
        output.note = "LLM 不可用，PATCH_PROPOSE 需要配置模型";
        emitAgentEvent(ctx, {
          phase: PHASE.PATCHING,
          status: STATUS.failed,
          title: "生成代码变更",
          summary: output.note,
          stepKey: "generate_patch",
          error: output.note,
        });
      } else {
        emitAgentEvent(ctx, {
          phase: PHASE.PLANNING,
          status: STATUS.success,
          title: "生成开发方案",
          summary: `规则方案共 ${(output.plan || []).length} 步`,
          stepKey: "generate_plan",
        });
        emitAgentEvent(ctx, {
          phase: PHASE.WAITING_REVIEW,
          status: STATUS.waiting,
          title: "方案待确认",
          summary: "请确认方案后生成代码变更",
          stepKey: "plan_ready",
        });
      }
    }

    // Always finalize the run session. PATCH_PROPOSE/VERIFY_FIX may already be
    // WAITING_APPROVAL from projectAgentLLM; treat that as a completed hand-off
    // so the mutex does not block「重新生成」.
    if (agentRunId) {
      const current = getAgentRun(getUserDataPath, uid, projectId, taskId, agentRunId);
      if (current && [RUN_STATUS.PENDING, RUN_STATUS.RUNNING, RUN_STATUS.WAITING_APPROVAL].includes(current.status)) {
        const finalizeStatus =
          runStatus === RUN_STATUS.WAITING_APPROVAL || mode === "PATCH_PROPOSE" || mode === "VERIFY_FIX"
            ? RUN_STATUS.COMPLETED
            : runStatus || RUN_STATUS.COMPLETED;
        completeAgentRun(getUserDataPath, uid, {
          projectId,
          taskId,
          agentRunId,
          output,
          status: finalizeStatus,
        });
        if (finalizeStatus === RUN_STATUS.COMPLETED && runStatus === RUN_STATUS.WAITING_APPROVAL) {
          runStatus = RUN_STATUS.COMPLETED;
        }
      }
    }

    recordTaskMemories(getUserDataPath, uid, output);
    if (mode === "PATCH_PROPOSE") {
      const staged = listStagedPatches(getUserDataPath, uid, projectId, taskId, {
        status: PATCH_STATUS.STAGED,
      });
      const reviewable = listStagedPatches(getUserDataPath, uid, projectId, taskId).filter((p) =>
        [PATCH_STATUS.STAGED, PATCH_STATUS.ACCEPTED, PATCH_STATUS.REVISION_REQUESTED].includes(
          p.status
        )
      );
      const count = Math.max(staged.length, reviewable.length, output?.diffPreviews?.length || 0);
      output = output || {};
      output.diffPreviews = reviewable.length
        ? reviewable.map(patchToDiffPreview).filter(Boolean)
        : staged.map(patchToDiffPreview).filter(Boolean);
      if (count > 0) {
        updateTask(getUserDataPath, uid, projectId, taskId, {
          status: TASK_STATUS.WAITING_APPROVAL,
          currentStep: "变更待审阅",
        });
      } else {
        updateTask(getUserDataPath, uid, projectId, taskId, {
          status: TASK_STATUS.PLANNING,
          currentStep: "未生成变更",
        });
        output.note = output.note || "AI 未生成代码变更，请重新生成";
      }
    } else {
      const doneStatus = taskStatusForMode(mode, "done");
      if (doneStatus) {
        updateTask(getUserDataPath, uid, projectId, taskId, doneStatus);
      }
    }
  } catch (err) {
    if (projectId && taskId) {
      try {
        const { recordErrorEvent } = require("./error-lessons/errorEventCollector.js");
        recordErrorEvent(getUserDataPath, uid, {
          projectId,
          taskId,
          source: "agent",
          message: err.message,
          summary: err.message,
          category: err.code || "agent_error",
        });
      } catch {
        /* optional */
      }
    }
    emitAgentEvent(
      {
        getUserDataPath,
        userId: uid,
        projectId,
        taskId,
        agentRunId,
        webContents,
      },
      {
        phase: PHASE.FAILED,
        status: STATUS.failed,
        title: "执行失败",
        summary: err.message || "Agent 执行失败",
        stepKey: "failed",
        error: err.message,
      }
    );
    if (agentRunId) {
      failAgentRun(getUserDataPath, uid, {
        projectId,
        taskId,
        agentRunId,
        errorMessage: err.message,
      });
    }
    if (agentLlmEnabled() && err.code !== "AGENT_RUN_MUTEX") {
      output = buildPlanOnlyOutput({
        message,
        project,
        task,
        projectId,
        taskId,
        promptContext: prepared.promptContext,
        codeAnalysis,
      });
      output.fallbackReason = err.message;
      recordTaskMemories(getUserDataPath, uid, output);
      updateTask(getUserDataPath, uid, projectId, taskId, {
        status: TASK_STATUS.WAITING_APPROVAL,
        currentStep: "规则 Agent 方案（LLM 失败回退）",
      });
      runStatus = RUN_STATUS.COMPLETED;
      emitAgentEvent(
        {
          getUserDataPath,
          userId: uid,
          projectId,
          taskId,
          agentRunId,
          webContents,
        },
        {
          phase: PHASE.PLANNING,
          status: STATUS.success,
          title: "生成开发方案",
          summary: "LLM 失败，已回退规则方案",
          stepKey: "generate_plan",
        }
      );
    } else {
      throw err;
    }
  }

  if (mode === "PATCH_PROPOSE" || mode === "VERIFY_FIX") {
    const patches = listStagedPatches(getUserDataPath, uid, projectId, taskId).filter((p) =>
      [
        PATCH_STATUS.STAGED,
        PATCH_STATUS.ACCEPTED,
        PATCH_STATUS.REVISION_REQUESTED,
      ].includes(p.status)
    );
    output = output || {};
    output.diffPreviews = patches.map(patchToDiffPreview).filter(Boolean);
    output.stagedPatchIds = patches.map((p) => p.id);
  }

  recordLegacyAgentRun(getUserDataPath, uid, {
    agentRunId,
    agentType: "ProjectAgent",
    scopeType: "task",
    projectId,
    taskId,
    inputText: message,
    output,
    status: runStatus,
  });

  return {
    agentRunId,
    status: runStatus,
    mode,
    contextHealth: prepared.contextHealth,
    compressionResult: prepared.compressionResult,
    output,
    namespace: taskNs,
    allowedNamespaces: [...namespacesForProjectScope(projectId, taskId)],
  };
}

function cancelProjectAgent(getUserDataPath, userId, { projectId, taskId, agentRunId }) {
  const { cancelFixLoop } = require("./fixLoopController.js");
  const {
    getActiveRunForTask,
    getOpenRunForTask,
    releaseStaleRunsForTask,
  } = require("./agentRunStore.js");
  cancelFixLoop(getUserDataPath, userId, projectId, taskId, "用户取消 Agent");
  let runId = agentRunId ? String(agentRunId).trim() : "";
  if (!runId) {
    const active =
      getActiveRunForTask(getUserDataPath, userId, projectId, taskId) ||
      getOpenRunForTask(getUserDataPath, userId, projectId, taskId);
    runId = active?.id || "";
  }
  if (!runId) {
    releaseStaleRunsForTask(getUserDataPath, userId, projectId, taskId, {
      reason: "用户取消 Agent",
    });
    return { ok: true, note: "no-active-run" };
  }
  return cancelAgentRun(getUserDataPath, userId, { projectId, taskId, agentRunId: runId });
}

function buildChatAgentOutput(message, promptContext) {
  const text = String(message || "").trim();
  const ctxHint = promptContext?.sections?.hasSnapshot
    ? "已加载会话压缩快照与记忆。"
    : "当前会话上下文充足。";
  return {
    summary: "会话区问答回复（ChatAgent，无开发工具权限）。",
    answer: `收到您的问题：「${text.slice(0, 200)}」。\n\n${ctxHint}\n\n这是会话区的普通问答通道，我不会读取项目文件或执行开发操作。如需完整 AI 能力，请继续使用下方 AI 对话区；如需项目开发，请在左侧选择项目并创建任务。`,
    mode: "QA_ONLY",
  };
}

function runChatAgent(getUserDataPath, userId, { chatId, message, toolName }) {
  if (toolName) {
    assertChatAgentTool(toolName);
  }
  const uid = resolveUserId(userId);
  const chatNs = `chat:${chatId}`;
  const { collectChatMessages } = require("./context-compression/contextMonitor.js");
  const { appendMessage } = require("./chatService.js");
  const { maybeUpdateChatSummary } = require("./chatSummaryService.js");
  const history = collectChatMessages(getUserDataPath, uid, chatId);
  const userMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "user",
    content: String(message || ""),
  });
  const messages = [...history, { role: "user", content: String(message || "") }];
  const prepared = compressionManager.prepareContextForAgent(getUserDataPath, uid, {
    namespace: chatNs,
    messages,
  });
  const output = buildChatAgentOutput(message, prepared.promptContext);
  const assistantMsg = appendMessage(getUserDataPath, uid, chatId, {
    role: "assistant",
    content: output.answer,
  });
  const summaryResult = maybeUpdateChatSummary(getUserDataPath, uid, chatId);
  const agentRunId = recordLegacyAgentRun(getUserDataPath, uid, {
    agentType: "ChatAgent",
    scopeType: "chat",
    chatId,
    inputText: String(message || ""),
    output: { ...output, summaryUpdate: summaryResult },
    status: "COMPLETED",
  });
  return {
    agentRunId,
    status: "COMPLETED",
    contextHealth: prepared.contextHealth,
    compressionResult: prepared.compressionResult,
    output,
    userMessage: userMsg,
    assistantMessage: assistantMsg,
    namespace: chatNs,
    memoryUpdated: Boolean(summaryResult?.updated),
    summaryUpdate: summaryResult,
  };
}

function assertChatAgentTool(toolName) {
  const { isDevToolName } = require("./namespace.js");
  if (isDevToolName(toolName)) {
    const err = new Error(`ChatAgent 禁止调用开发工具: ${toolName}`);
    err.code = "TOOL_FORBIDDEN";
    err.status = 403;
    throw err;
  }
}

module.exports = {
  assertChatAgentTool,
  configureAgentOrchestrator,
  runProjectAgent,
  cancelProjectAgent,
  runChatAgent,
};
