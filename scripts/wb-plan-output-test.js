const assert = require("assert");
const { buildPlanOnlyOutput } = require("../main/workbench/planOnlyOutput.js");
const { summarizeMessages, SUMMARY_EVERY_N_MESSAGES } = require("../main/workbench/chatSummaryService.js");

const output = buildPlanOnlyOutput({
  message: "为项目区域增加新增项目弹窗和项目卡片列表",
  project: { name: "测试项目", techStack: ["Electron"] },
  task: { title: "UI 任务", description: "左侧项目列表" },
  projectId: "proj_1",
  taskId: "task_1",
  promptContext: { text: "snapshot context" },
});

assert.strictEqual(output.summary, "已生成开发方案，尚未修改文件。");
assert.ok(Array.isArray(output.plan) && output.plan.length >= 3);
assert.ok(Array.isArray(output.affectedFiles) && output.affectedFiles.length >= 2);
assert.ok(Array.isArray(output.memoryToRecord) && output.memoryToRecord.length >= 2);
assert.strictEqual(output.needUserConfirm, true);
assert.strictEqual(output.mode, "PLAN_ONLY");
assert.ok(output.memoryToRecord.some((m) => m.type === "development_plan"));
assert.ok(output.affectedFiles.some((f) => f.includes("projectArea")));

const messages = [];
for (let i = 0; i < SUMMARY_EVERY_N_MESSAGES; i += 1) {
  messages.push({ role: i % 2 === 0 ? "user" : "assistant", content: `msg ${i}` });
}
const summary = summarizeMessages(messages);
assert.ok(summary.includes("本会话近期主题"));

console.log("wb-plan-output-test: OK");
