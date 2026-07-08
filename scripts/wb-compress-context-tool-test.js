const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { dispatchTool, listToolSchemas } = require("../main/workbench/toolRegistry.js");
const { buildContextPack } = require("../main/workbench/contextPackBuilder.js");
const { recordErrorLesson } = require("../main/workbench/errorLessonService.js");
const chatService = require("../main/workbench/chatService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cctx-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const project = createProject(getUserDataPath, uid, { name: "compress ctx", localPath: os.tmpdir() });
const task = createTask(getUserDataPath, uid, project.id, { title: "compress task" });

// T6: compress_context no longer TOOL_NOT_IMPLEMENTED
const schemas = listToolSchemas("PATCH_PROPOSE");
assert.ok(schemas.some((s) => s.function.name === "compress_context"));

const chat = chatService.createChat(getUserDataPath, uid, { title: "agent ctx" });
chatService.appendMessage(getUserDataPath, uid, chat.id, {
  role: "user",
  content: "必须保留 JWT 登录，不要改数据库结构。",
});

const ctx = {
  getUserDataPath,
  userId: uid,
  projectId: project.id,
  taskId: task.id,
  mode: "PATCH_PROPOSE",
  agentRunId: "run_compress_1",
};

(async () => {
  const result = await dispatchTool(ctx, "compress_context", { reason: "manual", mode: "normal" });
  assert.strictEqual(result.ok, true);
  assert.ok(result.applied);
  assert.ok(result.snapshotId || result.revision);

  const lesson = recordErrorLesson(getUserDataPath, uid, {
    projectId: project.id,
    taskId: task.id,
    category: "build_error",
    file: "src/demo.js",
    summary: "TypeError: cannot read property x",
    fixPlan: "add null check",
  });
  assert.ok(lesson.fingerprint);

  const pack = buildContextPack({
    root: process.cwd(),
    message: "demo jwt",
    promptContext: { text: "Compressed objective: fix JWT auth flow." },
    projectId: project.id,
    taskId: task.id,
    userId: uid,
    getUserDataPath,
  });
  assert.ok(pack.sections.some((s) => s.type === "compressed_context"));
  assert.ok(pack.sections.some((s) => s.type === "historicalErrorLessons"));

  console.log("wb-compress-context-tool-test: OK");
  try {
    fs.rmSync(userData, { recursive: true, force: true });
  } catch {
    /* sqlite lock */
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
