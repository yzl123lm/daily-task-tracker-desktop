const { assertSafeId } = require("../../utils/ipcValidate.js");

const NAMESPACE_FORBIDDEN = "NAMESPACE_FORBIDDEN";

function buildProjectNamespace(projectId) {
  const id = assertSafeId(projectId, "projectId");
  return `project:${id}`;
}

function buildTaskNamespace(projectId, taskId) {
  const pid = assertSafeId(projectId, "projectId");
  const tid = assertSafeId(taskId, "taskId");
  return `task:${pid}:${tid}`;
}

function buildChatNamespace(chatId) {
  const id = assertSafeId(chatId, "chatId");
  return `chat:${id}`;
}

function parseNamespace(namespace) {
  const ns = String(namespace || "").trim();
  if (!ns) {
    throw new Error("缺少 namespace");
  }
  if (ns.startsWith("project:")) {
    const projectId = ns.slice("project:".length);
    assertSafeId(projectId, "projectId");
    return { type: "project", projectId, taskId: null, chatId: null, namespace: ns };
  }
  if (ns.startsWith("task:")) {
    const rest = ns.slice("task:".length);
    const sep = rest.indexOf(":");
    if (sep <= 0) {
      throw new Error("无效 task namespace");
    }
    const projectId = rest.slice(0, sep);
    const taskId = rest.slice(sep + 1);
    assertSafeId(projectId, "projectId");
    assertSafeId(taskId, "taskId");
    return { type: "task", projectId, taskId, chatId: null, namespace: ns };
  }
  if (ns.startsWith("chat:")) {
    const chatId = ns.slice("chat:".length);
    assertSafeId(chatId, "chatId");
    return { type: "chat", projectId: null, taskId: null, chatId, namespace: ns };
  }
  throw new Error(`无效 namespace: ${ns}`);
}

function namespacesForProjectScope(projectId, taskId) {
  const allowed = new Set([buildProjectNamespace(projectId)]);
  if (taskId) {
    allowed.add(buildTaskNamespace(projectId, taskId));
  }
  return allowed;
}

function assertNamespaceAllowed(requestedNamespace, allowedNamespaces) {
  const ns = String(requestedNamespace || "").trim();
  const allowed = allowedNamespaces instanceof Set ? allowedNamespaces : new Set(allowedNamespaces || []);
  if (!allowed.has(ns)) {
    const err = new Error(`跨 namespace 访问被拒绝: ${ns}`);
    err.code = NAMESPACE_FORBIDDEN;
    err.status = 403;
    throw err;
  }
  return ns;
}

function assertNoCrossScopeRead(sourceNamespace, targetNamespace) {
  const source = parseNamespace(sourceNamespace);
  const target = parseNamespace(targetNamespace);
  if (source.type === "chat" && (target.type === "project" || target.type === "task")) {
    const err = new Error("会话区禁止读取项目上下文");
    err.code = NAMESPACE_FORBIDDEN;
    err.status = 403;
    throw err;
  }
  if (source.type === "project" && target.type === "project" && source.projectId !== target.projectId) {
    const err = new Error("禁止跨项目读取上下文");
    err.code = NAMESPACE_FORBIDDEN;
    err.status = 403;
    throw err;
  }
  if (source.type === "task" && target.type === "task") {
    if (source.projectId !== target.projectId || source.taskId !== target.taskId) {
      const err = new Error("禁止跨任务读取上下文");
      err.code = NAMESPACE_FORBIDDEN;
      err.status = 403;
      throw err;
    }
  }
  if (source.type === "task" && target.type === "project" && source.projectId !== target.projectId) {
    const err = new Error("禁止跨项目读取上下文");
    err.code = NAMESPACE_FORBIDDEN;
    err.status = 403;
    throw err;
  }
  if (source.type === "chat" && target.type === "chat" && source.chatId !== target.chatId) {
    const err = new Error("禁止跨会话读取上下文");
    err.code = NAMESPACE_FORBIDDEN;
    err.status = 403;
    throw err;
  }
  return true;
}

function isDevToolName(toolName) {
  const name = String(toolName || "").trim();
  const blocked = [
    "read_project_file",
    "write_project_file",
    "run_shell_command",
    "git_commit",
    "git_push",
    "git_reset",
    "git_status",
  ];
  return blocked.includes(name) || name.startsWith("git_");
}

module.exports = {
  NAMESPACE_FORBIDDEN,
  buildProjectNamespace,
  buildTaskNamespace,
  buildChatNamespace,
  parseNamespace,
  namespacesForProjectScope,
  assertNamespaceAllowed,
  assertNoCrossScopeRead,
  isDevToolName,
};
