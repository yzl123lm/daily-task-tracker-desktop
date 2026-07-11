const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");
const {
  createDraftSpec,
  saveTaskSpec,
  confirmTaskSpec,
} = require("../main/workbench/taskSpecService.js");
const { savePlanSteps } = require("../main/workbench/planStepsService.js");
const {
  buildDeliveryManifest,
  saveDeliveryManifest,
  getDeliveryManifest,
} = require("../main/workbench/deliveryManifestService.js");
const {
  exportAgentTrace,
  buildEvidencePackage,
} = require("../main/workbench/agentTraceExport.js");
const { runStaticSmokeVerification } = require("../main/workbench/staticSmokeVerification.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-del-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-del-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html><title>s</title>");

const project = createProject(getUserDataPath, "local-user", {
  name: "delivery",
  localPath: tmpRoot,
});
const task = createTask(getUserDataPath, "local-user", project.id, {
  title: "snake",
  description: "做一个贪吃蛇小游戏，纯 HTML/CSS/JS，本地打开即可",
});
let spec = createDraftSpec({
  message: task.description,
  project,
  task,
  plan: ["创建 index.html"],
});
if (spec.openQuestions?.length) {
  const answers = {};
  for (const q of spec.openQuestions) answers[q.id] = "默认";
  saveTaskSpec(getUserDataPath, "local-user", project.id, task.id, spec);
  spec = confirmTaskSpec(getUserDataPath, "local-user", project.id, task.id, { answers });
} else {
  saveTaskSpec(getUserDataPath, "local-user", project.id, task.id, {
    ...spec,
    status: "APPROVED",
    executionReady: true,
  });
  confirmTaskSpec(getUserDataPath, "local-user", project.id, task.id, {});
}
savePlanSteps(getUserDataPath, "local-user", project.id, task.id, ["创建 index.html"], {
  criterionIds: ["ac_1"],
});

const smoke = runStaticSmokeVerification(tmpRoot);
assert.ok(smoke.ok && !smoke.skipped);

const manifest = buildDeliveryManifest(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task.id,
  verifyResult: smoke,
});
assert.ok(manifest.generatedAt);
assert.ok(manifest.spec);
assert.ok(manifest.start);
assert.ok(manifest.rollback);
saveDeliveryManifest(getUserDataPath, "local-user", project.id, task.id, manifest);
assert.ok(getDeliveryManifest(getUserDataPath, "local-user", project.id, task.id));

const trace = exportAgentTrace(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task.id,
  verifyResult: smoke,
});
assert.ok(trace.version >= 2);
assert.strictEqual(trace.kind, "evidence_package");
assert.ok(trace.taskSpec);
assert.ok(Array.isArray(trace.planSteps));
assert.ok(trace.integrity?.hash);
assert.ok(trace.completeness);

const persisted = buildEvidencePackage(getUserDataPath, "local-user", {
  projectId: project.id,
  taskId: task.id,
  verifyResult: smoke,
  persist: true,
});
assert.ok(persisted.savedPath);
assert.ok(fs.existsSync(persisted.savedPath));

const { deepRedact } = require("../main/workbench/agentTraceExport.js");
const redacted = deepRedact({
  token: "sk-abcdefghijklmnopqrstuvwxyz123456",
  nested: "password=supersecretvalue",
});
assert.ok(String(JSON.stringify(redacted)).includes("[REDACTED]"));

console.log("wb-delivery-manifest-test: OK");
try {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
} catch {
  /* ignore */
}
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}
