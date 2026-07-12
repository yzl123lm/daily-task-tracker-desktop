const fs = require("fs");
const path = require("path");
const { dialog, BrowserWindow, shell } = require("electron");
const { assertSafeId, assertAbsolutePath } = require("../../utils/ipcValidate.js");
const projectService = require("./projectService.js");
const chatService = require("./chatService.js");
const contextMemoryService = require("./contextMemoryService.js");
const agentOrchestrator = require("./agentOrchestrator.js");
const agentRunService = require("./agentRunService.js");
const agentRunStore = require("./agentRunStore.js");
const {
  listAgentTimelineEvents,
  listTimelineEventsFromRun,
} = require("./agentEventEmitter.js");
const chatSummaryService = require("./chatSummaryService.js");
const compressionManager = require("./context-compression/contextCompressionManager.js");
const contextStore = require("./context-compression/contextStore.js");
const { parseNamespace, assertNoCrossScopeRead, NAMESPACE_FORBIDDEN } = require("./namespace.js");
const projectCodeService = require("./projectCodeService.js");
const diffPreviewService = require("./diffPreviewService.js");
const testRunnerService = require("./testRunnerService.js");
const {
  assertProjectAgentTool,
  recordToolOperation,
  listToolOperations,
} = require("./toolPermissionService.js");
const controlledDevService = require("./controlledDevService.js");
const backupRestoreService = require("./backupRestoreService.js");
const patchStagingService = require("./patchStagingService.js");
const verificationService = require("./verificationService.js");

function registerWorkbenchHandlers(ipcMain, { getUserDataPath, getDefaultProjectRoot, getAppRoot }) {
  if (!ipcMain || typeof getUserDataPath !== "function") {
    throw new Error("registerWorkbenchHandlers 缺少参数");
  }

  agentOrchestrator.configureAgentOrchestrator({
    getDefaultProjectRoot:
      typeof getDefaultProjectRoot === "function" ? getDefaultProjectRoot : null,
  });
  try {
    const { configureMcpGateway } = require("./mcpGatewayService.js");
    if (typeof getAppRoot === "function") {
      configureMcpGateway({ getAppRoot });
    } else if (typeof getDefaultProjectRoot === "function") {
      configureMcpGateway({ getAppRoot: getDefaultProjectRoot });
    }
  } catch {
    /* optional */
  }

  function resolveRootForProject(project) {
    return projectCodeService.resolveProjectRoot(project, getDefaultProjectRoot);
  }

  ipcMain.handle("wb-projects-list", (_event, payload) => {
    return projectService.listProjects(getUserDataPath, payload?.userId);
  });

  ipcMain.handle("wb-project-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    return project;
  });

  ipcMain.handle("wb-project-create", (_event, payload) => {
    const project = projectService.createProject(getUserDataPath, payload?.userId, payload || {});
    contextMemoryService.initProjectMemory(getUserDataPath, payload?.userId, project);
    return project;
  });

  ipcMain.handle("wb-project-update", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.updateProject(getUserDataPath, payload?.userId, projectId, payload || {});
  });

  ipcMain.handle("wb-project-archive", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.archiveProject(getUserDataPath, payload?.userId, projectId);
  });

  ipcMain.handle("wb-project-delete", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.deleteProject(getUserDataPath, payload?.userId, projectId);
  });

  ipcMain.handle("wb-project-tasks-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.listTasks(getUserDataPath, payload?.userId, projectId);
  });

  ipcMain.handle("wb-project-task-create", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return projectService.createTask(getUserDataPath, payload?.userId, projectId, payload || {});
  });

  ipcMain.handle("wb-project-task-update", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return projectService.updateTask(getUserDataPath, payload?.userId, projectId, taskId, payload || {});
  });

  ipcMain.handle("wb-project-agent-runs-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return agentRunService.listAgentRunsForTask(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-agent-events-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const agentRunId = payload?.agentRunId
      ? assertSafeId(payload.agentRunId, "agentRunId")
      : null;
    if (agentRunId) {
      return listAgentTimelineEvents(
        getUserDataPath,
        payload?.userId,
        projectId,
        taskId,
        agentRunId
      );
    }
    const open =
      typeof agentRunStore.getOpenRunForTask === "function"
        ? agentRunStore.getOpenRunForTask(getUserDataPath, payload?.userId, projectId, taskId)
        : agentRunStore.getActiveRunForTask(getUserDataPath, payload?.userId, projectId, taskId);
    if (open) {
      return listTimelineEventsFromRun(open);
    }
    const latest = agentRunStore.getLatestRunForTask(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId
    );
    return listTimelineEventsFromRun(latest);
  });

  ipcMain.handle("wb-project-agent-run", (event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return agentOrchestrator.runProjectAgent(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      message: payload?.message,
      mode: payload?.mode || "PLAN_ONLY",
      fixContext: payload?.fixContext,
      userApproved: payload?.userApproved,
      approvalId: payload?.approvalId,
      requestId: payload?.requestId,
      patchIds: payload?.patchIds,
      createGitBranch: payload?.createGitBranch,
      agentRunId: payload?.agentRunId,
      existingRunId: payload?.existingRunId,
      scene: payload?.scene,
      autoVerify: payload?.autoVerify,
      verifyScripts: payload?.verifyScripts,
      verifyApprovalPolicy: payload?.verifyApprovalPolicy,
      source: payload?.source,
      basedOnLastPlan: payload?.basedOnLastPlan,
      webContents: event?.sender || null,
    });
  });

  ipcMain.handle("wb-project-agent-run-async", (event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { enqueueAgentRun } = require("./asyncAgentQueue.js");
    return enqueueAgentRun(agentOrchestrator.runProjectAgent, getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      message: payload?.message,
      mode: payload?.mode || "PLAN_ONLY",
      fixContext: payload?.fixContext,
      scene: payload?.scene,
      autoVerify: payload?.autoVerify,
      source: payload?.source || "async_queue",
      purpose: payload?.purpose || "async",
      webContents: event?.sender || null,
    });
  });

  ipcMain.handle("wb-async-runs-list", (_event, payload) => {
    const { listAsyncJobs } = require("./asyncAgentQueue.js");
    return listAsyncJobs({
      projectId: payload?.projectId || null,
      taskId: payload?.taskId || null,
      status: payload?.status || null,
    });
  });

  ipcMain.handle("wb-async-job-cancel", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const runId = assertSafeId(payload?.runId || payload?.agentRunId, "runId");
    const { cancelAsyncJob } = require("./asyncAgentQueue.js");
    return cancelAsyncJob(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      runId,
      reason: payload?.reason || "用户取消",
    });
  });

  ipcMain.handle("wb-async-job-pause", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const runId = assertSafeId(payload?.runId || payload?.agentRunId, "runId");
    const { pauseAsyncJob } = require("./asyncAgentQueue.js");
    return pauseAsyncJob(getUserDataPath, payload?.userId, { projectId, taskId, runId });
  });

  ipcMain.handle("wb-parallel-group-create", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { createParallelGroup, allocateBranchWorkspaces } = require("./parallelBranchService.js");
    const group = createParallelGroup({
      projectId,
      taskId,
      branches: Array.isArray(payload?.branches) ? payload.branches : [{ branchId: "a" }, { branchId: "b" }],
    });
    if (payload?.allocateWorkspaces !== false) {
      allocateBranchWorkspaces(getUserDataPath, payload?.userId, group.id, { getDefaultProjectRoot });
    }
    return group;
  });

  ipcMain.handle("wb-parallel-merge-preview", (_event, payload) => {
    const groupId = String(payload?.groupId || "").trim();
    if (!groupId) throw new Error("缺少 groupId");
    const { previewParallelMerge } = require("./parallelBranchService.js");
    return previewParallelMerge(getUserDataPath, payload?.userId, groupId);
  });

  ipcMain.handle("wb-parallel-merge-apply", (_event, payload) => {
    const groupId = String(payload?.groupId || "").trim();
    if (!groupId) throw new Error("缺少 groupId");
    const { applyParallelMerge } = require("./parallelBranchService.js");
    return applyParallelMerge(getUserDataPath, payload?.userId, {
      groupId,
      userApproved: Boolean(payload?.userApproved),
      approvalId: payload?.approvalId || null,
      requestId: payload?.requestId || null,
      forcePreferBranchId: payload?.forcePreferBranchId || null,
      getDefaultProjectRoot,
    });
  });

  ipcMain.handle("wb-instruction-catalog-list", (_event, payload) => {
    const { listInstructionCatalog } = require("./instructionCatalogService.js");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    let projectRoot = payload?.projectRoot || null;
    if (!projectRoot && payload?.projectId) {
      const uid = resolveUserId(payload?.userId);
      const project = getProject(getUserDataPath, uid, assertSafeId(payload.projectId, "projectId"));
      projectRoot = resolveProjectRoot(project, getDefaultProjectRoot);
    }
    let appRoot = process.cwd();
    try {
      appRoot = require("electron").app.getAppPath();
    } catch {
      /* cli */
    }
    return listInstructionCatalog(getUserDataPath, { projectRoot, appRoot });
  });

  ipcMain.handle("wb-instruction-catalog-set-enabled", (_event, payload) => {
    const { setCatalogItemEnabled } = require("./instructionCatalogService.js");
    return setCatalogItemEnabled(getUserDataPath, {
      id: payload?.id,
      path: payload?.path,
      enabled: Boolean(payload?.enabled),
      kind: payload?.kind,
    });
  });

  ipcMain.handle("wb-instruction-catalog-preview", (_event, payload) => {
    const { previewCatalogInjection } = require("./instructionCatalogService.js");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    let projectRoot = payload?.projectRoot || null;
    if (!projectRoot && payload?.projectId) {
      const uid = resolveUserId(payload?.userId);
      const project = getProject(getUserDataPath, uid, assertSafeId(payload.projectId, "projectId"));
      projectRoot = resolveProjectRoot(project, getDefaultProjectRoot);
    }
    return previewCatalogInjection(getUserDataPath, { projectRoot });
  });

  ipcMain.handle("wb-mcp-gateway-status", async () => {
    const { getMcpGatewayStatus } = require("./mcpGatewayService.js");
    return getMcpGatewayStatus(getUserDataPath);
  });

  ipcMain.handle("wb-extension-packs-list", () => {
    const { loadExtensionPacks } = require("./mcpGatewayService.js");
    return loadExtensionPacks(getUserDataPath);
  });

  ipcMain.handle("wb-extension-pack-set-enabled", (_event, payload) => {
    const packId = String(payload?.packId || "").trim();
    if (!packId) throw new Error("缺少 packId");
    const { setPackEnabled } = require("./mcpGatewayService.js");
    return setPackEnabled(getUserDataPath, packId, Boolean(payload?.enabled), {
      adminApproved: Boolean(payload?.adminApproved),
    });
  });

  ipcMain.handle("wb-tool-hooks-list", () => {
    const { listHooks } = require("./toolHookRegistry.js");
    return listHooks();
  });

  ipcMain.handle("wb-subagent-run", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { runSubAgent } = require("./subAgentRunner.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    return runSubAgent(
      {
        getUserDataPath,
        userId: payload?.userId,
        projectId,
        taskId,
        agentRunId: payload?.parentRunId || `manual_${Date.now()}`,
        mode: "PLAN_ONLY",
        root,
        getDefaultProjectRoot,
      },
      {
        purpose: payload?.purpose || "explore",
        message: payload?.message,
        maxRounds: payload?.maxRounds,
      }
    );
  });

  ipcMain.handle("wb-project-agent-cancel", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const agentRunId = payload?.agentRunId
      ? assertSafeId(payload.agentRunId, "agentRunId")
      : null;
    return agentOrchestrator.cancelProjectAgent(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      agentRunId,
    });
  });

  ipcMain.handle("wb-project-task-spec-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getTaskSpec } = require("./taskSpecService.js");
    return getTaskSpec(getUserDataPath, payload?.userId, projectId, taskId);
  });

  ipcMain.handle("wb-project-task-spec-confirm", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { confirmTaskSpec } = require("./taskSpecService.js");
    const { TASK_STATUS } = require("./taskStatus.js");
    const spec = confirmTaskSpec(getUserDataPath, payload?.userId, projectId, taskId, {
      answers: payload?.answers || {},
      approver: payload?.approver || "user",
    });
    if (spec.status === "APPROVED") {
      projectService.updateTask(getUserDataPath, payload?.userId, projectId, taskId, {
        status: TASK_STATUS.PLANNING,
        currentStep: "方案待确认",
      });
    } else if (spec.status === "CLARIFYING") {
      projectService.updateTask(getUserDataPath, payload?.userId, projectId, taskId, {
        status: TASK_STATUS.CLARIFYING,
        currentStep: "需求澄清中",
      });
    }
    return spec;
  });

  ipcMain.handle("wb-project-agent-trace-export", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const agentRunId = payload?.agentRunId
      ? assertSafeId(payload.agentRunId, "agentRunId")
      : null;
    const { buildEvidencePackage } = require("./agentTraceExport.js");
    return buildEvidencePackage(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      agentRunId,
      persist: payload?.persist !== false,
    });
  });

  ipcMain.handle("wb-project-agent-replay-compare", async (_event, payload) => {
    const { runOfflineReplay, extractReplayTraceFromInput, loadPricing } = require("./agentOfflineReplay.js");
    const pathMod = require("path");
    let trace = payload?.trace || null;
    if (!trace && payload?.evidencePath) {
      const fsMod = require("fs");
      const raw = JSON.parse(fsMod.readFileSync(String(payload.evidencePath), "utf8"));
      trace = extractReplayTraceFromInput(raw);
    }
    if (!trace && payload?.projectId && payload?.taskId) {
      const projectId = assertSafeId(payload.projectId, "projectId");
      const taskId = assertSafeId(payload.taskId, "taskId");
      const agentRunId = payload?.agentRunId
        ? assertSafeId(payload.agentRunId, "agentRunId")
        : null;
      const { buildEvidencePackage } = require("./agentTraceExport.js");
      const pkg = buildEvidencePackage(getUserDataPath, payload?.userId, {
        projectId,
        taskId,
        agentRunId,
        persist: false,
      });
      trace = extractReplayTraceFromInput(pkg);
    }
    if (!trace) {
      throw new Error("未找到可回放轨迹（replayTrace）");
    }
    const pricing = loadPricing(pathMod.join(__dirname, "../../config/wb-replay"));
    return runOfflineReplay({
      trace,
      candidateTrace: payload?.candidateTrace || null,
      models: Array.isArray(payload?.models) ? payload.models : [],
      dryRun: payload?.dryRun !== false && !payload?.live,
      live: Boolean(payload?.live),
      pricing: pricing?.default || pricing,
    });
  });

  ipcMain.handle("wb-project-delivery-manifest-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const {
      getDeliveryManifest,
      buildDeliveryManifest,
      formatDeliveryRunbook,
    } = require("./deliveryManifestService.js");
    const manifest =
      getDeliveryManifest(getUserDataPath, payload?.userId, projectId, taskId) ||
      buildDeliveryManifest(getUserDataPath, payload?.userId, {
        projectId,
        taskId,
        getDefaultProjectRoot,
      });
    if (payload?.format === "markdown" || payload?.format === "runbook") {
      return {
        markdown: manifest.runbookMarkdown || formatDeliveryRunbook(manifest),
        manifest,
      };
    }
    return manifest;
  });

  ipcMain.handle("wb-project-runbook-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const {
      getDeliveryManifest,
      buildDeliveryManifest,
      formatDeliveryRunbook,
    } = require("./deliveryManifestService.js");
    const manifest =
      getDeliveryManifest(getUserDataPath, payload?.userId, projectId, taskId) ||
      buildDeliveryManifest(getUserDataPath, payload?.userId, {
        projectId,
        taskId,
        getDefaultProjectRoot,
      });
    return {
      markdown: manifest.runbookMarkdown || formatDeliveryRunbook(manifest),
      manifest,
    };
  });

  ipcMain.handle("wb-project-task-complete", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { tryMarkTaskCompleted } = require("./taskCompletionService.js");
    const { resolveUserId } = require("./projectService.js");
    const uid = resolveUserId(payload?.userId);
    return tryMarkTaskCompleted(getUserDataPath, uid, projectId, taskId, {
      verifyResult: payload?.verifyResult || null,
      currentStep: payload?.currentStep || "用户确认完成",
      getDefaultProjectRoot,
      persistEvidence: payload?.persistEvidence !== false,
    });
  });

  ipcMain.handle("wb-project-git-head", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { getHeadMeta, listBranches } = require("./gitService.js");
    const uid = resolveUserId(payload?.userId);
    const project = getProject(getUserDataPath, uid, projectId);
    if (!project) throw new Error("项目不存在");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (!root) throw new Error("未配置项目代码目录");
    return {
      head: getHeadMeta(root),
      branches: listBranches(root),
    };
  });

  ipcMain.handle("wb-project-patches-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const statuses = Array.isArray(payload?.statuses) ? payload.statuses : undefined;
    const patches = patchStagingService.listStagedPatches(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { status: payload?.status, statuses }
    );
    return patches.map(patchStagingService.patchToDiffPreview);
  });

  ipcMain.handle("wb-project-patch-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const patchId = assertSafeId(payload?.patchId, "patchId");
    const patch = patchStagingService.getStagedPatch(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      patchId
    );
    if (!patch) {
      throw new Error("补丁不存在");
    }
    return patchStagingService.patchToDiffPreview(patch);
  });

  ipcMain.handle("wb-project-patch-status", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const patchId = assertSafeId(payload?.patchId, "patchId");
    const status = String(payload?.status || "").toUpperCase();
    return patchStagingService.updatePatchStatus(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      patchId,
      status
    );
  });

  ipcMain.handle("wb-project-verify-start", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return verificationService.runVerification(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        scriptName: payload?.scriptName || payload?.profileId || "build",
        profileId: payload?.profileId || null,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-repo-profile", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { detectRepoProfile } = require("./repoProfileService.js");
    const uid = resolveUserId(payload?.userId);
    const project = getProject(getUserDataPath, uid, projectId);
    if (!project) throw new Error("项目不存在");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (!root) throw new Error("未配置项目代码目录");
    return detectRepoProfile(root);
  });

  ipcMain.handle("wb-project-bootstrap-env", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { bootstrapEnvironment } = require("./envBootstrapService.js");
    const uid = resolveUserId(payload?.userId);
    const project = getProject(getUserDataPath, uid, projectId);
    if (!project) throw new Error("项目不存在");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (!root) throw new Error("未配置项目代码目录");
    return bootstrapEnvironment(root, {
      userApproved: Boolean(payload?.userApproved),
      timeoutMs: Number(payload?.timeoutMs) || 600000,
    });
  });

  ipcMain.handle("wb-project-compose-up", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { composeUp } = require("./composeRunnerService.js");
    const uid = resolveUserId(payload?.userId);
    const project = getProject(getUserDataPath, uid, projectId);
    if (!project) throw new Error("项目不存在");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (!root) throw new Error("未配置项目代码目录");
    return composeUp(root, {
      taskId,
      userApproved: Boolean(payload?.userApproved),
      file: payload?.file || null,
    });
  });

  ipcMain.handle("wb-project-compose-down", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getProject, resolveUserId } = require("./projectService.js");
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { composeDown } = require("./composeRunnerService.js");
    const uid = resolveUserId(payload?.userId);
    const project = getProject(getUserDataPath, uid, projectId);
    if (!project) throw new Error("项目不存在");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (!root) throw new Error("未配置项目代码目录");
    return composeDown(root, {
      taskId,
      userApproved: true,
      volumes: Boolean(payload?.volumes),
      file: payload?.file || null,
    });
  });

  ipcMain.handle("wb-project-plan-dag", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getPlanSteps } = require("./planStepsService.js");
    const { validatePlanDag, getReadySteps } = require("./planExecutionService.js");
    const steps = getPlanSteps(getUserDataPath, payload?.userId, projectId, taskId);
    const dag = validatePlanDag(steps);
    return {
      ...dag,
      ready: getReadySteps(steps),
    };
  });

  ipcMain.handle("wb-project-checkpoint-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getCheckpoint } = require("./checkpointService.js");
    return getCheckpoint(getUserDataPath, payload?.userId, projectId, taskId);
  });

  ipcMain.handle("wb-project-task-recover", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { recoverTaskState, executeRecoveryAction } = require("./taskRecoveryService.js");
    if (payload?.execute) {
      return executeRecoveryAction(getUserDataPath, payload?.userId, {
        projectId,
        taskId,
        action: payload?.action || null,
        getDefaultProjectRoot,
      });
    }
    return recoverTaskState(getUserDataPath, payload?.userId, { projectId, taskId });
  });

  ipcMain.handle("wb-project-fixloop-rollback", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { rollbackFixLoopRound } = require("./fixLoopRollbackService.js");
    return rollbackFixLoopRound(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      round: payload?.round,
      userApproved: Boolean(payload?.userApproved),
      getDefaultProjectRoot,
    });
  });

  ipcMain.handle("wb-project-diagnosis-build", (_event, payload) => {
    const { buildDiagnosis } = require("./diagnosisService.js");
    return buildDiagnosis({
      source: payload?.source || "verify",
      stdout: payload?.stdout,
      stderr: payload?.stderr,
      message: payload?.message,
      verifyCommand: payload?.verifyCommand,
    });
  });

  ipcMain.handle("wb-project-verify-scripts", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return verificationService.listAvailableVerifications(
      getUserDataPath,
      payload?.userId,
      projectId,
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-choose-root", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      properties: ["openDirectory"],
      title: "选择项目路径",
    });
    if (res.canceled || !res.filePaths?.length) {
      return null;
    }
    return res.filePaths[0];
  });

  ipcMain.handle("wb-project-open-path", async (_event, payload) => {
    try {
      let target = String(payload?.path || "").trim();
      if (!target && payload?.projectId) {
        const projectId = assertSafeId(payload.projectId, "projectId");
        const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
        if (!project) {
          return { ok: false, error: "项目不存在" };
        }
        target = String(project.localPath || project.local_path || "").trim();
      }
      const resolved = assertAbsolutePath(target, { mustExist: true, label: "项目路径" });
      let openTarget = resolved;
      try {
        if (!fs.statSync(resolved).isDirectory()) {
          openTarget = path.dirname(resolved);
        }
      } catch {
        /* keep resolved */
      }
      const err = await shell.openPath(openTarget);
      if (err) {
        return { ok: false, error: `打开失败：${err}` };
      }
      return { ok: true, path: openTarget };
    } catch (error) {
      return { ok: false, error: error?.message || String(error) };
    }
  });

  ipcMain.handle("wb-project-code-root", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const state = projectCodeService.getProjectCodeRoot(project, getDefaultProjectRoot);
    return {
      projectId,
      localPath: state.localPath || project.localPath || null,
      codeRoot: state.root,
      source: state.source,
      valid: state.valid,
      isFallback: state.isFallback,
      isAsar: state.isAsar,
      reason: state.reason || null,
    };
  });

  ipcMain.handle("wb-project-files-tree", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      return { entries: [], codeRoot: null };
    }
    assertProjectAgentTool("list_project_files");
    const entries = projectCodeService.listTreeEntries(root);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "list_project_files",
      args: { root },
      resultText: `列出 ${entries.length} 项`,
      riskLevel: "LOW",
    });
    return { entries, codeRoot: root };
  });

  ipcMain.handle("wb-project-file-read", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const relPath = String(payload?.path || "").trim();
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("read_project_file");
    const file = projectCodeService.readProjectFile(root, relPath);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "read_project_file",
      args: { path: relPath },
      resultText: `读取 ${relPath} (${file.lines} 行)`,
      riskLevel: "LOW",
    });
    return { ...file, codeRoot: root };
  });

  ipcMain.handle("wb-project-code-search", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      return { hits: [], codeRoot: null };
    }
    assertProjectAgentTool("search_project_code");
    const hits = projectCodeService.searchProjectCode(root, payload?.query);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "search_project_code",
      args: { query: payload?.query },
      resultText: `搜索命中 ${hits.length} 处`,
      riskLevel: "LOW",
    });
    return { hits, codeRoot: root };
  });

  ipcMain.handle("wb-project-diff-preview", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const relPath = String(payload?.path || "").trim();
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("preview_diff");
    const file = projectCodeService.readProjectFile(root, relPath);
    if (payload?.proposedContent == null && !Array.isArray(payload?.edits)) {
      const err = new Error(
        "preview_diff 需要 proposedContent 或 edits；注释式假补丁已禁用（调试可设 WB_ALLOW_COMMENT_PATCH_FALLBACK=1）"
      );
      err.code = "DIFF_PREVIEW_REQUIRES_CONTENT";
      if (diffPreviewService.commentPatchFallbackEnabled?.()) {
        const preview = diffPreviewService.suggestPatchFromDescription(
          relPath,
          file.content,
          payload?.description || payload?.message || "规划建议"
        );
        recordToolOperation(getUserDataPath, payload?.userId, {
          projectId,
          taskId: payload?.taskId || null,
          toolName: "preview_diff",
          args: { filePath: relPath, fallback: "comment" },
          resultText: preview.summary,
          riskLevel: "LOW",
        });
        return preview;
      }
      throw err;
    }
    const preview = Array.isArray(payload?.edits)
      ? diffPreviewService.buildFromPatchEdits(root, relPath, payload.edits, payload?.summary)
      : diffPreviewService.buildPatchPreview({
          filePath: relPath,
          originalContent: file.content,
          proposedContent: payload.proposedContent,
          summary: payload?.summary,
        });
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "preview_diff",
      args: { filePath: relPath },
      resultText: preview.summary,
      riskLevel: "LOW",
    });
    return preview;
  });

  ipcMain.handle("wb-project-run-test", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const project = projectService.getProject(getUserDataPath, payload?.userId, projectId);
    if (!project) {
      throw new Error("项目不存在");
    }
    const root = resolveRootForProject(project);
    if (!root) {
      throw new Error("未配置项目代码目录");
    }
    assertProjectAgentTool("run_tests");
    const result = await testRunnerService.runWhitelistedCommand(root, payload?.command);
    recordToolOperation(getUserDataPath, payload?.userId, {
      projectId,
      taskId: payload?.taskId || null,
      toolName: "run_tests",
      args: { command: payload?.command },
      resultText: `exit=${result.exitCode} success=${result.success}\n${result.stdout}\n${result.stderr}`,
      riskLevel: result.success ? "LOW" : "MEDIUM",
    });
    return { ...result, codeRoot: root };
  });

  ipcMain.handle("wb-project-tool-ops-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return listToolOperations(
      getUserDataPath,
      payload?.userId,
      projectId,
      payload?.taskId || null,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-test-commands", () => {
    return testRunnerService.WHITELIST_PATTERNS.map((re) => String(re.source));
  });

  ipcMain.handle("wb-project-apply-patch", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    return controlledDevService.applyControlledPatch(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        path: payload?.path,
        content: payload?.content,
        userApproved: Boolean(payload?.userApproved),
        createGitBranch: Boolean(payload?.createGitBranch),
        stagedPatchId: payload?.stagedPatchId || null,
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-run-test-fix", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.runTestWithFixSuggestions(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        command: payload?.command,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-git-status", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    return controlledDevService.getGitStatusForProject(
      getUserDataPath,
      payload?.userId,
      projectId,
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-git-commit", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.commitWithApproval(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        message: payload?.message,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-pr-draft-get", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { getDraftPrForTask } = require("./draftPrService.js");
    return getDraftPrForTask(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      getDefaultProjectRoot,
      verifyResult: payload?.verifyResult || null,
    });
  });

  ipcMain.handle("wb-project-pr-draft-create", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = assertSafeId(payload?.taskId, "taskId");
    const { createDraftPr } = require("./draftPrService.js");
    return createDraftPr(getUserDataPath, payload?.userId, {
      projectId,
      taskId,
      userApproved: Boolean(payload?.userApproved),
      approvalId: payload?.approvalId || null,
      requestId: payload?.requestId || null,
      push: payload?.push !== false,
      getDefaultProjectRoot,
      verifyResult: payload?.verifyResult || null,
    });
  });

  ipcMain.handle("wb-project-backups-list", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return backupRestoreService.listFileBackups(
      getUserDataPath,
      payload?.userId,
      projectId,
      taskId,
      { limit: payload?.limit }
    );
  });

  ipcMain.handle("wb-project-backup-restore", (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const backupId = assertSafeId(payload?.backupId, "backupId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    assertProjectAgentTool("restore_file_backup", { userApproved: Boolean(payload?.userApproved) });
    return backupRestoreService.restoreFileFromBackup(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        backupId,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-project-shell-presets", () => {
    const shellRunnerService = require("./shellRunnerService.js");
    return {
      presets: shellRunnerService.SHELL_PRESETS,
      patterns: [
        ...shellRunnerService.TEST_WHITELIST_PATTERNS.map((re) => String(re.source)),
        ...shellRunnerService.CONTROLLED_SHELL_PATTERNS.map((re) => String(re.source)),
      ],
    };
  });

  ipcMain.handle("wb-project-run-shell", async (_event, payload) => {
    const projectId = assertSafeId(payload?.projectId, "projectId");
    const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
    return controlledDevService.runControlledShell(
      getUserDataPath,
      payload?.userId,
      {
        projectId,
        taskId,
        command: payload?.command,
        userApproved: Boolean(payload?.userApproved),
      },
      { getDefaultProjectRoot }
    );
  });

  ipcMain.handle("wb-chats-list", (_event, payload) => {
    if (payload?.withSummary) {
      return chatSummaryService.listChatsEnriched(getUserDataPath, payload?.userId);
    }
    return chatService.listChats(getUserDataPath, payload?.userId);
  });

  ipcMain.handle("wb-chat-get", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const chat = chatService.getChat(getUserDataPath, payload?.userId, chatId, {
      includeMessages: Boolean(payload?.includeMessages),
    });
    if (!chat) {
      throw new Error("会话不存在");
    }
    return chat;
  });

  ipcMain.handle("wb-chat-create", (_event, payload) => {
    return chatService.createChat(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-chat-update", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.updateChat(getUserDataPath, payload?.userId, chatId, payload || {});
  });

  ipcMain.handle("wb-chat-archive", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.archiveChat(getUserDataPath, payload?.userId, chatId);
  });

  ipcMain.handle("wb-chat-delete", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatService.deleteChat(getUserDataPath, payload?.userId, chatId);
  });

  ipcMain.handle("wb-chat-send-message", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    if (payload?.toolName) {
      agentOrchestrator.assertChatAgentTool(payload.toolName);
    }
    return agentOrchestrator.runChatAgent(getUserDataPath, payload?.userId, {
      chatId,
      message: payload?.message,
      toolName: payload?.toolName,
    });
  });

  ipcMain.handle("wb-chat-append-message", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const msg = chatService.appendMessage(getUserDataPath, payload?.userId, chatId, {
      role: payload?.role,
      content: payload?.content,
    });
    const summaryResult = chatSummaryService.maybeUpdateChatSummary(
      getUserDataPath,
      payload?.userId,
      chatId
    );
    return { message: msg, summaryUpdate: summaryResult };
  });

  ipcMain.handle("wb-chat-maybe-summarize", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    return chatSummaryService.maybeUpdateChatSummary(getUserDataPath, payload?.userId, chatId);
  });

  ipcMain.handle("wb-chat-agent-context", (_event, payload) => {
    const chatId = assertSafeId(payload?.chatId, "chatId");
    const chat = chatService.getChat(getUserDataPath, payload?.userId, chatId, {
      includeMessages: true,
    });
    if (!chat) {
      throw new Error("会话不存在");
    }
    const messages = (chat.messages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return compressionManager.prepareContextForAgent(getUserDataPath, payload?.userId, {
      namespace: `chat:${chatId}`,
      messages,
    });
  });

  ipcMain.handle("wb-memory-search", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    const callerNamespace = String(payload?.callerNamespace || namespace).trim();
    assertNoCrossScopeRead(callerNamespace, namespace);
    if (payload?.projectId) {
      const projectId = assertSafeId(payload.projectId, "projectId");
      const taskId = payload?.taskId ? assertSafeId(payload.taskId, "taskId") : null;
      return contextMemoryService.searchWithProjectGuard(
        getUserDataPath,
        payload?.userId,
        projectId,
        taskId,
        payload
      );
    }
    return contextMemoryService.searchMemories(getUserDataPath, payload?.userId, payload);
  });

  ipcMain.handle("wb-memory-write", (_event, payload) => {
    return contextMemoryService.writeMemory(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-namespace-probe", (_event, payload) => {
    try {
      assertNoCrossScopeRead(payload?.fromNamespace, payload?.toNamespace);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        code: err.code || NAMESPACE_FORBIDDEN,
        message: err.message,
      };
    }
  });

  ipcMain.handle("wb-context-health", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return compressionManager.getContextHealth(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-context-compress", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return compressionManager.applyCompression(getUserDataPath, payload?.userId, payload || {});
  });

  ipcMain.handle("wb-context-snapshots-list", (_event, payload) => {
    const namespace = String(payload?.namespace || "").trim();
    parseNamespace(namespace);
    return contextStore.listSnapshots(getUserDataPath, payload?.userId, namespace, {
      limit: payload?.limit,
    });
  });

  ipcMain.handle("wb-context-snapshot-get", (_event, payload) => {
    const snapshotId = assertSafeId(payload?.snapshotId, "snapshotId");
    const snap = contextStore.getSnapshotById(getUserDataPath, payload?.userId, snapshotId);
    if (!snap) {
      throw new Error("快照不存在");
    }
    return snap;
  });

  ipcMain.handle("wb-context-snapshot-restore", (_event, payload) => {
    const snapshotId = assertSafeId(payload?.snapshotId, "snapshotId");
    return contextStore.restoreSnapshot(getUserDataPath, payload?.userId, snapshotId);
  });
}

module.exports = { registerWorkbenchHandlers };
