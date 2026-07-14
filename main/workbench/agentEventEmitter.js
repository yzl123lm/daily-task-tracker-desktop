const { BrowserWindow } = require("electron");
const { newId, nowIso } = require("./db.js");
const { appendToolTrace, getAgentRun } = require("./agentRunStore.js");

const CHANNEL = "wb-project-agent-event";

const PHASE = {
  CHECKING_PATH: "CHECKING_PATH",
  ANALYZING: "ANALYZING",
  SCANNING: "SCANNING",
  SEARCHING: "SEARCHING",
  READING: "READING",
  PLANNING: "PLANNING",
  PATCHING: "PATCHING",
  WAITING_REVIEW: "WAITING_REVIEW",
  APPLYING: "APPLYING",
  VERIFYING: "VERIFYING",
  FIXING: "FIXING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELED: "CANCELED",
};

const STATUS = {
  queued: "queued",
  running: "running",
  success: "success",
  failed: "failed",
  waiting: "waiting",
  skipped: "skipped",
  canceled: "canceled",
};

const TOOL_PHASE_MAP = {
  list_files: PHASE.SCANNING,
  search_code: PHASE.SEARCHING,
  read_file: PHASE.READING,
  get_symbols: PHASE.READING,
  stage_patch: PHASE.PATCHING,
  write_memory: PHASE.PLANNING,
  mock_echo: PHASE.ANALYZING,
};

const TOOL_TITLE_MAP = {
  list_files: "扫描项目结构",
  search_code: "搜索相关文件",
  read_file: "读取关键代码",
  get_symbols: "读取符号索引",
  stage_patch: "生成代码变更",
  write_memory: "写入任务记忆",
};

function summarizeToolInput(toolName, args = {}) {
  const name = String(toolName || "");
  if (name === "read_file" && args.path) {
    return `读取 ${args.path}`;
  }
  if (name === "search_code" && args.query) {
    return `搜索「${String(args.query).slice(0, 48)}」`;
  }
  if (name === "list_files") {
    return args.prefix ? `列出 ${args.prefix}` : "列出项目文件";
  }
  if (name === "stage_patch" && args.path) {
    return `提议补丁 ${args.path}`;
  }
  try {
    return JSON.stringify(args).slice(0, 120);
  } catch {
    return "";
  }
}

function summarizeToolOutput(toolName, result) {
  if (!result) {
    return "";
  }
  if (result.ok === false) {
    if (result.code === "FILE_NOT_FOUND" || result.code === "PATH_NOT_USEFUL") {
      return result.nextTool === "stage_patch"
        ? `文件不存在，请 stage_patch 新建 ${result.path || ""}`.trim()
        : result.error || "文件不存在，请改用 stage_patch 新建";
    }
    if (toolName === "stage_patch" && result.hint === "use_full_content") {
      return "补丁失败：建议 read_file 后用 proposedContent 提交完整文件";
    }
    if (toolName === "stage_patch" && result.hint === "use_create_file") {
      return "文件不存在：请用 changeType:add 新建";
    }
    return `失败：${result.error || result.code || "unknown"}`;
  }
  if (toolName === "list_files" && Array.isArray(result.entries)) {
    return `列出 ${result.entries.length} 项`;
  }
  if (toolName === "search_code" && Array.isArray(result.hits)) {
    return `命中 ${result.hits.length} 处`;
  }
  if (toolName === "read_file") {
    const kb = result.content ? Math.round(String(result.content).length / 1024) : 0;
    return `读取成功${kb ? `，约 ${kb}KB` : ""}`;
  }
  if (toolName === "stage_patch") {
    return result.patchId ? `已暂存补丁 ${result.patchId}` : "补丁已暂存";
  }
  return result.ok ? "完成" : "";
}

function resolveSender(webContents) {
  if (webContents && !webContents.isDestroyed?.()) {
    return webContents;
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    return focused.webContents;
  }
  const all = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  return all[0]?.webContents || null;
}

/**
 * Emit a user-visible Agent timeline event: persist + push to renderer.
 */
function emitAgentEvent(ctx = {}, fields = {}) {
  const eventId = fields.eventId || newId("evt");
  const startedAt = fields.startedAt || Date.now();
  const endedAt = fields.endedAt || (fields.status === STATUS.running ? 0 : Date.now());
  const durationMs =
    fields.durationMs != null
      ? fields.durationMs
      : endedAt && startedAt
        ? Math.max(0, endedAt - startedAt)
        : 0;

  const payload = {
    eventId,
    projectId: ctx.projectId || fields.projectId || null,
    taskId: ctx.taskId || fields.taskId || null,
    agentRunId: ctx.agentRunId || fields.agentRunId || null,
    phase: fields.phase || PHASE.ANALYZING,
    status: fields.status || STATUS.running,
    title: String(fields.title || "Agent 执行中"),
    summary: String(fields.summary || ""),
    detail: fields.detail != null ? String(fields.detail) : "",
    toolName: fields.toolName || null,
    toolInputSummary: fields.toolInputSummary || "",
    toolOutputSummary: fields.toolOutputSummary || "",
    startedAt,
    endedAt: endedAt || null,
    durationMs,
    progress: fields.progress != null ? fields.progress : 0,
    error: fields.error || null,
    visible: fields.visible !== false,
    debugOnly: Boolean(fields.debugOnly),
    stepKey: fields.stepKey || fields.phase || eventId,
    at: nowIso(),
  };

  if (
    ctx.getUserDataPath &&
    ctx.userId != null &&
    payload.projectId &&
    payload.taskId &&
    payload.agentRunId
  ) {
    try {
      appendToolTrace(
        ctx.getUserDataPath,
        ctx.userId,
        payload.projectId,
        payload.taskId,
        payload.agentRunId,
        {
          kind: "timeline",
          ...payload,
        }
      );
    } catch {
      /* run may be stale; still push UI */
    }
  }

  try {
    const sender = resolveSender(ctx.webContents || fields.webContents);
    if (sender && !sender.isDestroyed?.()) {
      sender.send(CHANNEL, payload);
    }
  } catch {
    /* ignore send errors */
  }

  return payload;
}

function listTimelineEventsFromRun(run) {
  if (!run?.toolTrace?.length) {
    return [];
  }
  return run.toolTrace
    .filter((e) => e && (e.kind === "timeline" || e.phase))
    .map((e) => ({
      eventId: e.eventId || e.at,
      projectId: e.projectId || run.projectId,
      taskId: e.taskId || run.taskId,
      agentRunId: e.agentRunId || run.id,
      phase: e.phase,
      status: e.status || (e.ok === false ? STATUS.failed : STATUS.success),
      title: e.title || e.tool || "步骤",
      summary: e.summary || e.toolInputSummary || "",
      detail: e.detail || "",
      toolName: e.toolName || e.tool || null,
      toolInputSummary: e.toolInputSummary || "",
      toolOutputSummary: e.toolOutputSummary || "",
      startedAt: e.startedAt || 0,
      endedAt: e.endedAt || 0,
      durationMs: e.durationMs || 0,
      error: e.error || null,
      visible: e.visible !== false,
      debugOnly: Boolean(e.debugOnly),
      stepKey: e.stepKey || e.phase || e.eventId,
      at: e.at,
    }));
}

function listAgentTimelineEvents(getUserDataPath, userId, projectId, taskId, agentRunId) {
  const run = getAgentRun(getUserDataPath, userId, projectId, taskId, agentRunId);
  return listTimelineEventsFromRun(run);
}

module.exports = {
  CHANNEL,
  PHASE,
  STATUS,
  TOOL_PHASE_MAP,
  TOOL_TITLE_MAP,
  emitAgentEvent,
  summarizeToolInput,
  summarizeToolOutput,
  listTimelineEventsFromRun,
  listAgentTimelineEvents,
};
