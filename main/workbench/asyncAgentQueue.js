/**
 * BL-022 / UX-007: Async agent run queue — fire-and-forget + list/cancel.
 */
const { EventEmitter } = require("events");

const queueEvents = new EventEmitter();
/** @type {Map<string, object>} */
const asyncJobs = new Map();

function asyncEnabled() {
  return String(process.env.WB_AGENT_ASYNC || "1") !== "0";
}

function listAsyncJobs({ projectId, taskId } = {}) {
  let jobs = [...asyncJobs.values()];
  if (projectId) jobs = jobs.filter((j) => j.projectId === projectId);
  if (taskId) jobs = jobs.filter((j) => j.taskId === taskId);
  return jobs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function getAsyncJob(runId) {
  return asyncJobs.get(runId) || null;
}

/**
 * Start agent run without blocking IPC. Returns immediately with agentRunId.
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
  const job = {
    runId: started.runId,
    projectId: payload.projectId,
    taskId: payload.taskId,
    mode: payload.mode || "PLAN_ONLY",
    status: "RUNNING",
    startedAt: new Date().toISOString(),
    async: true,
  };
  asyncJobs.set(started.runId, job);
  queueEvents.emit("change", job);

  void (async () => {
    try {
      const result = await runProjectAgentFn(getUserDataPath, userId, {
        ...payload,
        existingRunId: started.runId,
      });
      job.status = "COMPLETED";
      job.finishedAt = new Date().toISOString();
      job.resultSummary = result?.output?.summary || result?.summary || null;
      queueEvents.emit("change", { ...job });
    } catch (err) {
      job.status = err?.code === "AGENT_CANCELED" ? "CANCELED" : "FAILED";
      job.finishedAt = new Date().toISOString();
      job.error = err?.message || "异步运行失败";
      queueEvents.emit("change", { ...job });
    }
  })();

  return { ok: true, async: true, agentRunId: started.runId, status: "RUNNING" };
}

function onAsyncQueueChange(listener) {
  queueEvents.on("change", listener);
  return () => queueEvents.off("change", listener);
}

module.exports = {
  asyncEnabled,
  listAsyncJobs,
  getAsyncJob,
  enqueueAgentRun,
  onAsyncQueueChange,
};
