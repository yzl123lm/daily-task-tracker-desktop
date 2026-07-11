/**
 * BL-001 Evidence Package + static-smoke (BL-003) smoke tests
 */
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
const { buildEvidencePackage, sha256Hex } = require("../main/workbench/agentTraceExport.js");
const { runStaticSmokeVerification } = require("../main/workbench/staticSmokeVerification.js");
const { runVerification, listAvailableVerifications } = require("../main/workbench/verificationService.js");
const { tryMarkTaskCompleted } = require("../main/workbench/taskCompletionService.js");
const { evaluateCompletion } = require("../main/workbench/completionGuardService.js");

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-evp-"));
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-evp-ud-"));
const getUserDataPath = () => userData;
getDb(getUserDataPath);

fs.writeFileSync(
  path.join(tmpRoot, "index.html"),
  "<!doctype html><html><body><h1>snake</h1></body></html>\n"
);

const project = createProject(getUserDataPath, "local-user", {
  name: "evp",
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
  plan: ["index.html"],
});
saveTaskSpec(getUserDataPath, "local-user", project.id, task.id, spec);
if (spec.status !== "APPROVED") {
  const answers = {};
  for (const q of spec.openQuestions || []) answers[q.id] = "默认";
  spec = confirmTaskSpec(getUserDataPath, "local-user", project.id, task.id, { answers });
}

const available = listAvailableVerifications(getUserDataPath, "local-user", project.id, {});
assert.ok(available.some((s) => String(s.scriptName || s.name).includes("static-smoke")));

(async () => {
  const verify = await runVerification(
    getUserDataPath,
    "local-user",
    {
      projectId: project.id,
      taskId: task.id,
      scriptName: "build",
      userApproved: true,
    },
    {}
  );
  assert.ok(verify.ok, verify.message);
  assert.strictEqual(verify.skipped, false);
  assert.ok(verify.profileId === "static-smoke" || verify.evidence?.length);

  const guard = evaluateCompletion(getUserDataPath, "local-user", {
    projectId: project.id,
    taskId: task.id,
    verifyResult: verify,
  });
  assert.ok(guard.ok, JSON.stringify(guard.blockers));
  assert.ok((guard.acceptanceEvidence || []).length >= 1);

  const marked = tryMarkTaskCompleted(getUserDataPath, "local-user", project.id, task.id, {
    verifyResult: verify,
    persistEvidence: true,
  });
  assert.ok(marked.completed);
  assert.ok(marked.evidencePackage?.integrity?.hash);
  assert.ok(marked.evidencePackage?.savedPath);
  assert.ok(fs.existsSync(marked.evidencePackage.savedPath));

  const pkg = buildEvidencePackage(getUserDataPath, "local-user", {
    projectId: project.id,
    taskId: task.id,
    verifyResult: verify,
    persist: false,
  });
  assert.strictEqual(pkg.version, 2);
  assert.strictEqual(pkg.kind, "evidence_package");
  assert.ok(pkg.integrity.hash.length === 64);
  assert.ok(sha256Hex("abc").length === 64);

  const empty = runStaticSmokeVerification(path.join(tmpRoot, "nope-missing"));
  assert.strictEqual(empty.ok, false);

  console.log("wb-evidence-package-test: OK");
})()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    try {
      fs.rmSync(userData, { recursive: true, force: true });
    } catch {
      /* sqlite */
    }
  });
