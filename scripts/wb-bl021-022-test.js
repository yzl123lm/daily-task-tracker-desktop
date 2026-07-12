/**
 * BL-021~022: MCP/Hooks / async sub-agents
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  registerHook,
  runHooks,
  listHooks,
  clearHooks,
  installBuiltinHooks,
  HOOK_PHASES,
} = require("../main/workbench/toolHookRegistry.js");
const {
  loadExtensionPacks,
  setPackEnabled,
  listMcpToolSchemas,
  wrapObservation,
  callMcpTool,
  mcpAgentEnabled,
} = require("../main/workbench/mcpGatewayService.js");
const { startAgentRun, getActiveRunForTask, listChildRuns } = require("../main/workbench/agentRunStore.js");
const { assertSubAgentTool, SUBAGENT_PURPOSES, READ_ONLY } = require("../main/workbench/subAgentRunner.js");
const { listToolSchemas, dispatchTool, assertToolAllowed } = require("../main/workbench/toolRegistry.js");
const { listAsyncJobs, asyncEnabled } = require("../main/workbench/asyncAgentQueue.js");

(async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl021-ud-"));
  const getUserDataPath = () => userData;
  getDb(getUserDataPath);

  // ——— Hooks (SEC-012) ———
  assert.ok(HOOK_PHASES.includes("preToolUse"));
  installBuiltinHooks();
  assert.ok(listHooks().preToolUse.length >= 1);

  registerHook(
    "preToolUse",
    ({ toolName }) => {
      if (toolName === "deny_me") return { allowed: false, reason: "test deny" };
      return { allowed: true };
    },
    { id: "test_deny", version: "1", source: "test" }
  );
  assert.strictEqual((await runHooks("preToolUse", { toolName: "read_file", ctx: {} })).allowed, true);
  assert.strictEqual((await runHooks("preToolUse", { toolName: "deny_me", ctx: {} })).allowed, false);

  clearHooks("preToolUse");
  registerHook(
    "preToolUse",
    async () => {
      throw new Error("boom");
    },
    { id: "boom", version: "1", source: "test" }
  );
  const preBoom = await runHooks("preToolUse", { toolName: "x" });
  assert.strictEqual(preBoom.allowed, false);
  assert.ok(preBoom.decisions[0].failClosed);
  installBuiltinHooks();

  // ——— Extension packs / MCP ———
  assert.ok(mcpAgentEnabled());
  const packs = loadExtensionPacks(getUserDataPath);
  assert.ok(packs.packs.some((p) => p.id === "graphify-mcp" && p.enabled));
  assert.ok(packs.packs.some((p) => p.thirdParty && !p.enabled));

  let adminBlocked = false;
  try {
    setPackEnabled(getUserDataPath, "sample-third-party-mcp", true, { adminApproved: false });
  } catch (e) {
    adminBlocked = e.code === "ADMIN_APPROVAL_REQUIRED";
  }
  assert.ok(adminBlocked);
  setPackEnabled(getUserDataPath, "sample-third-party-mcp", true, { adminApproved: true });
  assert.ok(loadExtensionPacks(getUserDataPath).packs.find((p) => p.id === "sample-third-party-mcp").enabled);
  setPackEnabled(getUserDataPath, "sample-third-party-mcp", false, { adminApproved: true });

  const schemas = listMcpToolSchemas(getUserDataPath);
  assert.ok(schemas.some((s) => s.function.name.startsWith("graphify_")));

  const obs = wrapObservation({
    ok: true,
    trust: "system",
    toolName: "graphify_god_nodes",
    data: { nodes: [] },
  });
  assert.strictEqual(obs.inheritsShellSandbox, false);
  assert.strictEqual(obs.permissionDomain, "MCP_READ");

  const mcpOut = await callMcpTool(
    getUserDataPath,
    "graphify_god_nodes",
    {},
    { appRoot: path.join(userData, "no-graph") }
  );
  assert.ok(mcpOut.trust);
  assert.strictEqual(typeof mcpOut.ok, "boolean");

  // ——— Sub-agent tool guard ———
  assert.ok(SUBAGENT_PURPOSES.explore);
  assert.ok(READ_ONLY.has("read_file"));
  assert.strictEqual(assertSubAgentTool("read_file"), "read_file");
  let forbidden = false;
  try {
    assertSubAgentTool("stage_patch");
  } catch (e) {
    forbidden = e.code === "SUBAGENT_TOOL_FORBIDDEN";
  }
  assert.ok(forbidden);

  // ——— Child runs vs mutex ———
  const project = createProject(getUserDataPath, "local-user", {
    name: "bl021",
    localPath: userData,
  });
  const task = createTask(getUserDataPath, "local-user", project.id, {
    title: "subagent mutex",
    description: "t",
  });
  const parent = startAgentRun(getUserDataPath, "local-user", {
    projectId: project.id,
    taskId: task.id,
    mode: "PLAN_ONLY",
    inputText: "parent",
  });
  const child = startAgentRun(getUserDataPath, "local-user", {
    projectId: project.id,
    taskId: task.id,
    mode: "PLAN_ONLY",
    inputText: "child",
    parentRunId: parent.runId,
    role: "subagent",
    purpose: "explore",
  });
  assert.strictEqual(child.role, "subagent");
  assert.strictEqual(
    getActiveRunForTask(getUserDataPath, "local-user", project.id, task.id).id,
    parent.runId
  );
  assert.ok(
    listChildRuns(getUserDataPath, "local-user", project.id, task.id, parent.runId).some(
      (k) => k.id === child.runId
    )
  );

  const toolSchemas = listToolSchemas("PLAN_ONLY", { getUserDataPath });
  assert.ok(toolSchemas.some((t) => t.function?.name === "spawn_sub_agent"));
  assert.ok(toolSchemas.some((t) => String(t.function?.name || "").startsWith("graphify_")));

  assert.ok(assertToolAllowed("graphify_god_nodes", "PLAN_ONLY", { getUserDataPath }).mcp);

  const hookDeny = await runHooks("preToolUse", {
    toolName: "stage_patch",
    ctx: { subAgent: true },
  });
  assert.strictEqual(hookDeny.allowed, false);

  const echo = await dispatchTool(
    {
      getUserDataPath,
      userId: "local-user",
      projectId: project.id,
      taskId: task.id,
      agentRunId: parent.runId,
      mode: "PLAN_ONLY",
      root: userData,
    },
    "mock_echo",
    { text: "hi" }
  );
  assert.strictEqual(echo.ok, true);
  assert.strictEqual(echo.echo, "hi");

  assert.ok(asyncEnabled());
  assert.ok(Array.isArray(listAsyncJobs({})));

  console.log("wb-bl021-022-test: OK");
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* sqlite lock */
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
