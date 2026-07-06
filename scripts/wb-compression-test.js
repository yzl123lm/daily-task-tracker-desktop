const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wb-compress-"));
const getUserDataPath = () => tmpDir;

const { classifyBlocks } = require("../main/workbench/context-compression/contextClassifier.js");
const { buildCompressionPlan } = require("../main/workbench/context-compression/compressionPlanner.js");
const { buildSnapshot } = require("../main/workbench/context-compression/snapshotBuilder.js");
const { validateSnapshot } = require("../main/workbench/context-compression/snapshotValidator.js");
const { shouldCompress } = require("../main/workbench/context-compression/contextCompressionManager.js");
const { tokenBudgetForRuntime } = require("../main/workbench/context-compression/tokenBudget.js");
const compressionManager = require("../main/workbench/context-compression/contextCompressionManager.js");
const chatService = require("../main/workbench/chatService.js");

const messages = [
  { role: "user", content: "必须保留 JWT 登录方案，不要改数据库结构。" },
  { role: "assistant", content: "方案：新增 ProjectCard 组件并接入 API。" },
  { role: "user", content: "测试失败：npm test auth.service 报错 missing mock field" },
];

const blocks = classifyBlocks(messages, { scopeType: "task" });
assert(blocks.some((b) => b.type === "constraint"));
assert(blocks.some((b) => b.type === "error"));

const plan = buildCompressionPlan(blocks, { minRecentTurnsKeep: 4 });
const pinned = plan.blocks.filter((b) => b.type === "constraint" || b.type === "error");
pinned.forEach((b) => assert.notStrictEqual(b.action, "drop"));

const snapshot = buildSnapshot({
  namespace: "task:proj_1:task_1",
  plan,
  runtimeState: { mode: "normal", reason: "manual" },
});
const validation = validateSnapshot(snapshot, { scopeType: "task" });
assert.strictEqual(validation.valid, true);

const lowBudget = tokenBudgetForRuntime({ messageTokens: 1000, memoryTokens: 500, snapshotTokens: 0 });
assert.strictEqual(lowBudget.status, "normal");

const highBudget = shouldCompress(
  { messageTokens: 90000, memoryTokens: 10000, snapshotTokens: 5000 },
  { modelContextWindow: 128000 }
);
assert.strictEqual(highBudget.action, "compress");

const chat = chatService.createChat(getUserDataPath, null, { title: "压缩测试" });
chatService.appendMessage(getUserDataPath, null, chat.id, {
  role: "user",
  content: "解释一下向量数据库选型",
});
const result = compressionManager.applyCompression(getUserDataPath, null, {
  namespace: `chat:${chat.id}`,
  messages: [{ role: "user", content: "解释一下向量数据库选型" }],
  reason: "manual",
});
assert.strictEqual(result.applied, true);
assert(result.snapshot?.revision >= 1);

console.log("wb-compression-test: OK");
