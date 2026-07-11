const { getDb, nowIso } = require("./db.js");
const { resolveUserId, getTask, getProject } = require("./projectService.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { listStagedPatches } = require("./patchStagingService.js");
const { getLatestRunForTask } = require("./agentRunStore.js");
const { evaluateCompletion } = require("./completionGuardService.js");

function buildDeliveryManifest(getUserDataPath, userId, { projectId, taskId, verifyResult, getDefaultProjectRoot } = {}) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  const spec = getTaskSpec(getUserDataPath, uid, projectId, taskId);
  const plan = getPlanSteps(getUserDataPath, uid, projectId, taskId);
  const patches = listStagedPatches(getUserDataPath, uid, projectId, taskId);
  const latestRun = getLatestRunForTask(getUserDataPath, uid, projectId, taskId);
  const guard = evaluateCompletion(getUserDataPath, uid, {
    projectId,
    taskId,
    verifyResult,
    getDefaultProjectRoot,
  });

  const applied = patches.filter((p) => p.status === "APPLIED" || p.status === "ACCEPTED");
  const manifest = {
    version: 1,
    generatedAt: nowIso(),
    project: {
      id: projectId,
      name: project?.name || "",
      localPath: project?.localPath || null,
    },
    task: {
      id: taskId,
      title: task?.title || "",
      status: task?.status || "",
    },
    spec: spec
      ? {
          specId: spec.specId,
          version: spec.version,
          status: spec.status,
          goal: spec.goal,
          assumptions: spec.assumptions || [],
          openQuestions: spec.openQuestions || [],
        }
      : null,
    planSteps: plan,
    changes: applied.map((p) => ({
      patchId: p.id,
      path: p.filePath,
      summary: p.summary,
      status: p.status,
    })),
    verification: verifyResult
      ? {
          ok: verifyResult.ok,
          skipped: Boolean(verifyResult.skipped),
          scriptName: verifyResult.scriptName || verifyResult.profileId,
          exitCode: verifyResult.exitCode,
          summary: verifyResult.parsed?.summary || verifyResult.message || null,
        }
      : null,
    acceptance: {
      guardOk: guard.ok,
      blockers: guard.blockers,
      criteria: spec?.acceptanceCriteria || [],
    },
    start: {
      instructions: project?.localPath
        ? `在项目目录打开并按 README/package.json 脚本启动：${project.localPath}`
        : "请配置项目本地路径后启动",
    },
    rollback: {
      instructions: "可通过工作台文件备份还原；或使用 Git 回退（若仓库已初始化）",
    },
    limitations: [
      ...(spec?.nonGoals || []),
      ...(guard.incompleteMarkers?.length
        ? [`仍检测到 ${guard.incompleteMarkers.length} 处 TODO/FIXME（若已 waiver 可忽略）`]
        : []),
    ],
    openItems: (spec?.openQuestions || []).map((q) => q.text),
    agentRunId: latestRun?.id || null,
  };

  const required = ["generatedAt", "project", "task", "changes", "acceptance", "start", "rollback"];
  const missing = required.filter((k) => manifest[k] == null);
  manifest.complete = missing.length === 0 && Boolean(manifest.spec);
  manifest.missingFields = missing;

  return manifest;
}

function saveDeliveryManifest(getUserDataPath, userId, projectId, taskId, manifest) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const ts = nowIso();
  db.prepare(
    `UPDATE project_tasks SET delivery_manifest_json = ?, updated_at = ?
     WHERE id = ? AND project_id = ? AND user_id = ?`
  ).run(JSON.stringify(manifest), ts, taskId, projectId, uid);
  return manifest;
}

function getDeliveryManifest(getUserDataPath, userId, projectId, taskId) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const row = db
    .prepare(
      `SELECT delivery_manifest_json FROM project_tasks
       WHERE id = ? AND project_id = ? AND user_id = ?`
    )
    .get(taskId, projectId, uid);
  if (!row?.delivery_manifest_json) return null;
  try {
    return JSON.parse(row.delivery_manifest_json);
  } catch {
    return null;
  }
}

module.exports = {
  buildDeliveryManifest,
  saveDeliveryManifest,
  getDeliveryManifest,
};
