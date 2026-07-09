const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const lessonStore = require("../main/workbench/error-lessons/lessonStore.js");
const { retrieveLessonsForContext } = require("../main/workbench/error-lessons/lessonRetriever.js");
const { buildContextPack } = require("../main/workbench/contextPackBuilder.js");
const { buildSystemPrompt } = require("../main/workbench/projectAgentLLM.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cpl-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const uid = "local-user";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "wb-cpl-root-"));
fs.writeFileSync(path.join(root, "index.js"), "console.log(1);\n", "utf8");
const project = createProject(getUserDataPath, uid, { name: "lessons", localPath: root });
const task = createTask(getUserDataPath, uid, project.id, { title: "lesson task" });

lessonStore.createCandidate(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  fingerprint: "fp_flex_minwidth",
  category: "css_layout",
  source: "verify",
  errorSignature: "flex item overflow",
  ruleText: "标题区域必须设置 min-width:0",
  preventionPrompt: "修改 flex 布局时，标题区域必须设置 min-width:0，右侧 actions 使用 flex:0 0 auto。",
  status: "verified",
  verifyCommand: "build",
});

const packLessons = retrieveLessonsForContext(getUserDataPath, uid, {
  projectId: project.id,
  taskId: task.id,
  message: "修复 flex 布局挤压",
});
assert.ok(packLessons.preventionText.includes("min-width:0"));
assert.ok(packLessons.preventionText.includes("已知错误规避规则"));

const contextPack = buildContextPack({
  root,
  message: "修复 flex 布局挤压",
  getUserDataPath,
  userId: uid,
  projectId: project.id,
  taskId: task.id,
});
const prevention = contextPack.sections.find((s) => s.type === "prevention_rules");
assert.ok(prevention, "prevention_rules section missing");
assert.ok(prevention.content.includes("min-width:0"));

const systemPrompt = buildSystemPrompt("PLAN_ONLY", contextPack);
assert.ok(systemPrompt.includes("已知错误规避规则"));
assert.ok(systemPrompt.includes("min-width:0"));

console.log("wb-context-pack-lessons-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
  fs.rmSync(root, { recursive: true, force: true });
} catch {
  /* ignore */
}
