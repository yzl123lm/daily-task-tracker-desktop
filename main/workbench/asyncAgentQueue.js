/**
 * UX-007: Async task center service — budget, pause/cancel, optional workspace isolation, notify.
 */
const { EventEmitter } = require("events");
const { cancelAgentRun, getAgentRun } = require("./agentRunStore.js");

const queueEvents = new EventEmitter();
/** @type {Map<string, object>} */
const asyncJobs = new Map();

function asyncEnabled() {
  return String(process.env.WB_AGENT_ASYNC || "1") !== "0";
}

function budgetTokenLimit() {
  const n = Number(process.env.WB_ASYNC_BUDGET_TOKENS || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isolateWorkspaceEnabled() {
  return String(process.env.WB_ASYNC_ISOLATE || "0") === "1";
}

function listAsyncJobs({ projectId, taskId, status } = {}) {
  let jobs = [...asyncJobs.values()];
  if (projectId) jobs = jobs.filter((j) => j.projectId === projectId);
  if (taskId) jobs = jobs.filter((j) => j.taskId === taskId);
  if (status) jobs = jobs.filter((j) => j.status === status);
  return jobs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function getAsyncJob(runId) {
  return asyncJobs.get(runId) || null;
}

function updateJob(runId, patch) {
  const job = asyncJobs.get(runId);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  asyncJobs.set(runId, job);
  queueEvents.emit("change", { ...job });
  return job;
}

function notifyJobTerminal(job) {
  try {
    const { Notification, BrowserWindow } = require("electron");
    if (Notification?.isSupported?.()) {
      const n = new Notification({
        title: "鲸落AI · 异步任务",
        body: `${job.status} · ${job.mode || "agent"} · ${(job.runId || "").slice(0, 12)}`,
      });
      n.show();
    }
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        win.flashFrame?.(true);
        win.webContents?.send?.("wb-async-job-change", { ...job });
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* non-electron / headless */
  }
}

/**
 * Start agent run without blocking IPC.
 */
async function enqueueAgentRun(runProjectAgentFn, getUserDataPath, userId, payload) {
  if (!asyncEnabled()) {
    const err = new Error("异步 Agent 队列已禁用");
    err.code = "ASYNC_DISABLED";
    throw err;
  }
  const { startAgentRun } = require("./agentRunStore.js");
  const started = startAgentRun(getUserDataPath, userId, {
    projectId: payload.projectId,
    taskId: payload.taskId,
    mode: payload.mode || "PLAN_ONLY",
    inputText: payload.message || "",
    role: "primary",
    purpose: payload.purpose || "async",
  });

  let workspaceSession = null;
  if (isolateWorkspaceEnabled() && payload.isolateWorkspace !== false) {
    try {
      const { getProject } = require("./projectService.js");
      const { resolveProjectRoot } = require("./projectCodeService.js");
      const { createWorkspaceSession } = require("./sandbox/workspaceSessionManager.js");
      const project = getProject(getUserDataPath, userId, payload.projectId);
      const sourceRoot = resolveProjectRoot(project, payload.getDefaultProjectRoot);
      workspaceSession = createWorkspaceSession({
        projectId: payload.projectId,
        taskId: payload.taskId,
        sourceRoot,
        getUserDataPath,
      });
    } catch {
      workspaceSession = null;
    }
  }

  const tokenLimit = budgetTokenLimit();
  const job = {
    runId: started.runId,
    projectId: payload.projectId,
    taskId: payload.taskId,
    mode: payload.mode || "PLAN_ONLY",
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    async: true,
    budget: {
      tokenLimit: tokenLimit || null,
      tokensUsed: 0,
      wallMs: 0,
    },
    workspaceSessionId: workspaceSession?.id || null,
    secretScope: workspaceSession ? `job:${started.runId}` : null,
    message: String(payload.message || "").slice(0, 200),
  };
  asyncJobs.set(started.runId, job);
  queueEvents.emit("change", { ...job });

  void (async () => {
    const wallStart = Date.now();
    try {
      const result = await runProjectAgentFn(getUserDataPath, userId, {
        ...payload,
        existingRunId: started.runId,
        workspaceRootOverride: workspaceSession?.root || payload.workspaceRootOverride,
        asyncJobId: started.runId,
      });
      const tokens =
        Number(result?.output?.replayTrace?.totals?.totalTokens) ||
        Number(result?.replayTrace?.totals?.totalTokens) ||
        0;
      const wallMs = Date.now() - wallStart;
      let status = "COMPLETED";
      let budgetExceeded = false;
      if (tokenLimit && tokens > tokenLimit) {
        budgetExceeded = true;
        status = "BUDGET_EXCEEDED";
      }
      updateJob(started.runId, {
        status,
        finishedAt: new Date().toISOString(),
        resultSummary: result?.output?.summary || result?.summary || null,
        budget: {
          tokenLimit: tokenLimit || null,
          tokensUsed: tokens,
          wallMs,
          exceeded: budgetExceeded,
        },
      });
      notifyJobTerminal(asyncJobs.get(started.runId));
    } catch (err) {
      const code = err?.code || "";
      const status =
        code === "AGENT_CANCELED"
          ? "CANCELED"
          : code === "AGENT_PAUSED"
            ? "PAUSED"
            : "FAILED";
      updateJob(started.runId, {
        status,
        finishedAt: new Date().toISOString(),
        error: err?.message || "异步运行失败",
        budget: {
          ...(asyncJobs.get(started.runId)?.budget || {}),
          wallMs: Date.now() - wallStart,
        },
      });
      notifyJobTerminal(asyncJobs.get(started.runId));
    } finally {
      if (workspaceSession?.id) {
        try {
          const { destroyWorkspaceSession } = require("./sandbox/workspaceSessionManager.js");
          destroyWorkspaceSession(workspaceSession.id);
        } catch {
          /* ignore */
        }
      }
    }
  })();

  return {
    ok: true,
    async: true,
    agentRunId: started.runId,
    status: "RUNNING",
    workspaceSessionId: workspaceSession?.id || null,
    budget: job.budget,
  };
}

function cancelAsyncJob(getUserDataPath, userId, { projectId, taskId, runId, reason } = {}) {
  const job = asyncJobs.get(runId);
  if (!job) {
    const err = new Error("异步任务不存在");
    err.code = "ASYNC_JOB_NOT_FOUND";
    throw err;
  }
  cancelAgentRun(getUserDataPath, userId, {
    projectId: projectId || job.projectId,
    taskId: taskId || job.taskId,
    agentRunId: runId,
    reason: reason || "用户取消异步任务",
  });
  return updateJob(runId, { status: "CANCELED", finishedAt: new Date().toISOString() });
}

function pauseAsyncJob(getUserDataPath, userId, { projectId, taskId, runId } = {}) {
  const job = asyncJobs.get(runId);
  if (!job) {
    const err = new Error("异步任务不存在");
    err.code = "ASYNC_JOB_NOT_FOUND";
    throw err;
  }
  if (!["RUNNING"].includes(job.status)) {
    return job;
  }
  // Soft-pause: abort run and mark PAUSED (resume = new enqueue from UI)
  cancelAgentRun(getUserDataPath, userId, {
    projectId: projectId || job.projectId,
    taskId: taskId || job.taskId,
    agentRunId: runId,
    reason: "用户暂停异步任务",
  });
  return updateJob(runId, {
    status: "PAUSED",
    pausedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  });
}

function onAsyncQueueChange(listener) {
  queueEvents.on("change", listener);
  return () => queueEvents.off("change", listener);
}

/** Test helper */
function _resetAsyncJobsForTests() {
  asyncJobs.clear();
}

module.exports = {
  asyncEnabled,
  listAsyncJobs,
  getAsyncJob,
  enqueueAgentRun,
  cancelAsyncJob,
  pauseAsyncJob,
  updateJob,
  onAsyncQueueChange,
  budgetTokenLimit,
  isolateWorkspaceEnabled,
  _resetAsyncJobsForTests,
};
