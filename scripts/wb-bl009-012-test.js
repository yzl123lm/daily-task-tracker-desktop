/**
 * BL-009~012: RepoProfile, DAG plan, web-http smoke, compose runner
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { detectRepoProfile, detectPackageManager } = require("../main/workbench/repoProfileService.js");
const { resolveInstallPlan } = require("../main/workbench/envBootstrapService.js");
const {
  validatePlanDag,
  getReadySteps,
  advancePlanStep,
  beginNextPlanStep,
  PLAN_STEP_STATUS,
} = require("../main/workbench/planExecutionService.js");
const { savePlanSteps, getPlanSteps } = require("../main/workbench/planStepsService.js");
const { runWebHttpSmokeVerification, assertDomBasics } = require("../main/workbench/webHttpSmokeVerification.js");
const { runStaticSmokeVerification } = require("../main/workbench/staticSmokeVerification.js");
const { getProfile, listProfiles } = require("../main/workbench/verificationProfileRegistry.js");
const {
  composeFileFor,
  sanitizeProjectName,
  _resetComposeSessionsForTests,
  probeDocker,
} = require("../main/workbench/composeRunnerService.js");
const { getDb } = require("../main/workbench/db.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");

async function run() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl009-"));
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bl009-ud-"));
  const getUserDataPath = () => userData;

  fs.writeFileSync(
    path.join(tmpRoot, "package.json"),
    JSON.stringify({
      name: "demo",
      scripts: { build: "echo build", test: "echo test" },
      dependencies: { express: "^4.0.0" },
    })
  );
  fs.writeFileSync(path.join(tmpRoot, "package-lock.json"), "{}");
  fs.writeFileSync(
    path.join(tmpRoot, "index.html"),
    "<!doctype html><html><head><title>Demo</title></head><body><h1>Hello</h1></body></html>"
  );
  fs.writeFileSync(
    path.join(tmpRoot, "docker-compose.yml"),
    "services:\n  web:\n    image: nginx:alpine\n    ports:\n      - '8080:80'\n"
  );

  // ——— BL-009 RepoProfile ———
  const profile = detectRepoProfile(tmpRoot);
  assert.strictEqual(profile.ok, true);
  assert.strictEqual(profile.packageManager.id, "npm");
  assert.ok(profile.languages.some((l) => l.id === "javascript"));
  assert.ok(["node", "node-web", "fullstack"].includes(profile.projectType));
  assert.ok(profile.containers.hasCompose);
  assert.ok(profile.entryPoints.includes("index.html"));
  assert.ok(profile.recommendedProfiles.includes("web-http-smoke"));
  assert.strictEqual(detectPackageManager(tmpRoot).id, "npm");

  const installPlan = resolveInstallPlan(profile);
  assert.strictEqual(installPlan.ok, true);
  assert.deepStrictEqual(installPlan.argv.slice(0, 2), ["npm", "ci"]);

  fs.writeFileSync(path.join(tmpRoot, "pnpm-lock.yaml"), "lockfileVersion: 9\n");
  const conflicted = detectRepoProfile(tmpRoot);
  assert.strictEqual(conflicted.packageManager.id, "pnpm");
  assert.ok(conflicted.conflicts.some((c) => c.type === "multiple_lockfiles"));
  fs.unlinkSync(path.join(tmpRoot, "pnpm-lock.yaml"));

  // ——— BL-010 DAG ———
  const good = validatePlanDag([
    { id: "a", text: "explore", dependencies: [] },
    { id: "b", text: "implement", dependencies: ["a"] },
    { id: "c", text: "verify", dependencies: ["b"] },
  ]);
  assert.strictEqual(good.ok, true);
  assert.ok(good.order.indexOf("a") < good.order.indexOf("b"));

  const cyclic = validatePlanDag([
    { id: "a", text: "a", dependencies: ["b"] },
    { id: "b", text: "b", dependencies: ["a"] },
  ]);
  assert.strictEqual(cyclic.ok, false);
  assert.strictEqual(cyclic.code, "PLAN_DAG_CYCLE");

  getDb(getUserDataPath);
  const project = createProject(getUserDataPath, "local-user", {
    name: "bl009",
    localPath: tmpRoot,
  });
  const task = createTask(getUserDataPath, "local-user", project.id, { title: "dag" });

  assert.throws(
    () =>
      savePlanSteps(getUserDataPath, "local-user", project.id, task.id, [
        { id: "a", text: "a", dependencies: ["b"] },
        { id: "b", text: "b", dependencies: ["a"] },
      ]),
    (err) => err.code === "PLAN_DAG_CYCLE"
  );

  const saved = savePlanSteps(getUserDataPath, "local-user", project.id, task.id, [
    { id: "s1", text: "one", dependencies: [] },
    { id: "s2", text: "two", dependencies: ["s1"] },
  ]);
  assert.ok(saved.planId);
  const ready0 = getReadySteps(saved.steps);
  assert.strictEqual(ready0.length, 1);
  assert.strictEqual(ready0[0].id, "s1");

  const started = beginNextPlanStep(getUserDataPath, "local-user", project.id, task.id);
  assert.strictEqual(started.ok, true);
  assert.strictEqual(started.step.id, "s1");
  assert.strictEqual(started.step.status, PLAN_STEP_STATUS.RUNNING);

  const adv = advancePlanStep(getUserDataPath, "local-user", project.id, task.id, {
    stepId: "s1",
    status: PLAN_STEP_STATUS.DONE,
  });
  assert.strictEqual(adv.ok, true);
  assert.ok(adv.ready.some((s) => s.id === "s2"));
  const stepsNow = getPlanSteps(getUserDataPath, "local-user", project.id, task.id);
  assert.strictEqual(stepsNow.find((s) => s.id === "s1").status, "done");

  // ——— BL-011 profiles + web smoke ———
  assert.strictEqual(getProfile("web-http-smoke").kind, "web_http_smoke");
  assert.strictEqual(getProfile("fullstack-smoke").kind, "fullstack_smoke");
  const listed = listProfiles(tmpRoot);
  assert.ok(listed.some((p) => p.id === "web-http-smoke" && p.available));

  const dom = assertDomBasics("<html><body><h1>x</h1></body></html>");
  assert.strictEqual(dom.ok, true);

  const staticSmoke = runStaticSmokeVerification(tmpRoot);
  assert.strictEqual(staticSmoke.ok, true);

  const webSmoke = await runWebHttpSmokeVerification(tmpRoot, { captureConsole: false });
  assert.strictEqual(webSmoke.ok, true, webSmoke.message);
  assert.ok((webSmoke.evidence || []).some((e) => e.type === "http_response"));
  assert.ok((webSmoke.evidence || []).some((e) => e.type === "dom_assert"));

  // ——— BL-012 compose helpers ———
  _resetComposeSessionsForTests();
  assert.strictEqual(composeFileFor(tmpRoot), "docker-compose.yml");
  assert.ok(sanitizeProjectName("Task ID 123!").startsWith("wb"));
  const docker = probeDocker();
  assert.ok(typeof docker.available === "boolean");
  console.log("docker probe:", docker);

  console.log("wb-bl009-012-test: OK");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
