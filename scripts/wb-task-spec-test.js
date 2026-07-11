const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const { analyzeRequirement } = require("../main/workbench/clarificationPolicy.js");
const {
  createDraftSpec,
  saveTaskSpec,
  confirmTaskSpec,
  assertSpecAllowsPatch,
  getTaskSpec,
  SPEC_STATUS,
} = require("../main/workbench/taskSpecService.js");
const { savePlanSteps, getPlanSteps } = require("../main/workbench/planStepsService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-spec-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

const vague = "帮我开发一个团队任务管理系统，支持账号登录、项目管理、任务分配";
const analysis = analyzeRequirement(vague, { project: { techStack: [] } });
assert.ok(analysis.needsClarification, "vague requirement should need clarification");
assert.ok(analysis.questions.length >= 1 && analysis.questions.length <= 5);

const project = createProject(getUserDataPath, "local-user", {
  name: "spec-test",
  localPath: userData,
});
const task = createTask(getUserDataPath, "local-user", project.id, {
  title: "团队任务系统",
  description: vague,
});

const draft = createDraftSpec({
  message: vague,
  project,
  task,
  plan: ["设计数据模型", "实现登录"],
});
assert.strictEqual(draft.status, SPEC_STATUS.CLARIFYING);
assert.strictEqual(draft.executionReady, false);
saveTaskSpec(getUserDataPath, "local-user", project.id, task.id, draft);
savePlanSteps(getUserDataPath, "local-user", project.id, task.id, ["设计数据模型", "实现登录"], {
  criterionIds: (draft.acceptanceCriteria || []).map((c) => c.id),
});

const gateBlocked = assertSpecAllowsPatch(getTaskSpec(getUserDataPath, "local-user", project.id, task.id));
assert.strictEqual(gateBlocked.ok, false);
assert.strictEqual(gateBlocked.code, "SPEC_CLARIFYING");

// BL-002: PENDING_REVIEW must not allow patch
const pending = {
  ...draft,
  status: SPEC_STATUS.PENDING_REVIEW,
  openQuestions: [],
  executionReady: false,
};
assert.strictEqual(assertSpecAllowsPatch(pending).ok, false);
assert.strictEqual(assertSpecAllowsPatch(pending).code, "SPEC_PENDING_REVIEW");

const answers = {};
for (const q of draft.openQuestions) {
  answers[q.id] = "采用默认假设";
}
const confirmed = confirmTaskSpec(getUserDataPath, "local-user", project.id, task.id, { answers });
assert.strictEqual(confirmed.status, SPEC_STATUS.APPROVED);
assert.ok(confirmed.executionReady);

const gateOk = assertSpecAllowsPatch(confirmed);
assert.ok(gateOk.ok);

// re-approve bumps version and archives history
const again = confirmTaskSpec(getUserDataPath, "local-user", project.id, task.id, { answers: {} });
assert.ok(again.version >= 2);
assert.ok(Array.isArray(again.history) && again.history.length >= 1);

const steps = getPlanSteps(getUserDataPath, "local-user", project.id, task.id);
assert.ok(steps.length >= 1);
assert.ok(steps[0].id);

const clear = analyzeRequirement("帮我做一个贪吃蛇小游戏，纯 HTML/CSS/JS，本地打开即可", {});
assert.strictEqual(clear.needsClarification, false);

// clear req → PENDING_REVIEW still cannot patch until confirm
const snakeTask = createTask(getUserDataPath, "local-user", project.id, {
  title: "snake",
  description: "帮我做一个贪吃蛇小游戏，纯 HTML/CSS/JS，本地打开即可",
});
const snakeDraft = createDraftSpec({
  message: snakeTask.description,
  project,
  task: snakeTask,
  plan: ["index.html"],
});
assert.strictEqual(snakeDraft.status, SPEC_STATUS.PENDING_REVIEW);
assert.strictEqual(assertSpecAllowsPatch(snakeDraft).code, "SPEC_PENDING_REVIEW");
saveTaskSpec(getUserDataPath, "local-user", project.id, snakeTask.id, snakeDraft);
const snakeOk = confirmTaskSpec(getUserDataPath, "local-user", project.id, snakeTask.id, {});
assert.strictEqual(snakeOk.status, SPEC_STATUS.APPROVED);
assert.ok(assertSpecAllowsPatch(snakeOk).ok);

console.log("wb-task-spec-test: OK");
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock on windows */
}
