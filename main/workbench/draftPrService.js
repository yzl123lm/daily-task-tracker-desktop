/**
 * A3 Draft PR — metadata + optional local gh create (userApproved required for network).
 */
const { spawnSync } = require("child_process");
const { getProject, getTask, resolveUserId } = require("./projectService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getHeadMeta, buildPrDraftMeta, runGit } = require("./gitService.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { listStagedPatches } = require("./patchStagingService.js");
const { getLatestRunForTask } = require("./agentRunStore.js");
const { getDb, nowIso, newId } = require("./db.js");

function buildTaskPrBody(getUserDataPath, userId, { projectId, taskId, verifyResult } = {}) {
  const uid = resolveUserId(userId);
  const task = getTask(getUserDataPath, uid, projectId, taskId);
  const spec = getTaskSpec(getUserDataPath, uid, projectId, taskId);
  const patches = listStagedPatches(getUserDataPath, uid, projectId, taskId);
  const latestRun = getLatestRunForTask(getUserDataPath, uid, projectId, taskId);
  return {
    title: task?.title || "Workbench delivery",
    body: [
      `## Summary`,
      spec?.goal || task?.title || "",
      ``,
      `## Verification`,
      verifyResult?.ok
        ? `PASS · ${verifyResult.scriptName || verifyResult.profileId || "verify"}`
        : `See Workbench verification panel`,
      ``,
      `## Changes`,
      ...patches
        .filter((p) => p.status === "APPLIED" || p.status === "ACCEPTED")
        .slice(0, 20)
        .map((p) => `- \`${p.filePath}\`: ${p.summary || p.status}`),
    ].join("\n"),
    agentRunId: latestRun?.id || null,
  };
}

function getDraftPrForTask(getUserDataPath, userId, { projectId, taskId, getDefaultProjectRoot, verifyResult } = {}) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    return { ok: false, reason: "no_project_root", draft: null };
  }
  const head = getHeadMeta(root);
  if (!head?.isRepo || !head.branch) {
    return { ok: false, reason: "not_a_git_repo", head, draft: null };
  }
  const meta = buildTaskPrBody(getUserDataPath, uid, { projectId, taskId, verifyResult });
  const draft = buildPrDraftMeta({
    branch: head.branch,
    title: meta.title,
    body: meta.body,
    agentRunId: meta.agentRunId,
  });
  return { ok: true, head, draft, projectId, taskId };
}

function runGh(cwd, args, { timeoutMs = 60000 } = {}) {
  const result = spawnSync("gh", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
    shell: false,
  });
  return {
    exitCode: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    success: result.status === 0,
    error: result.error ? String(result.error.message || result.error) : null,
  };
}

/**
 * Push + create draft PR via local gh. Requires userApproved.
 * Does not run automatically for ASSISTED_DEV; caller enforces.
 */
function createDraftPr(
  getUserDataPath,
  userId,
  {
    projectId,
    taskId,
    userApproved,
    approvalId,
    requestId,
    push = true,
    getDefaultProjectRoot,
    verifyResult,
  } = {}
) {
  if (!userApproved) {
    const err = new Error("创建 Draft PR 需要用户确认");
    err.code = "USER_APPROVAL_REQUIRED";
    err.status = 403;
    throw err;
  }
  if (!approvalId && !requestId) {
    const err = new Error("创建 Draft PR 需要 approvalId 或 requestId");
    err.code = "APPROVAL_ID_REQUIRED";
    err.status = 403;
    throw err;
  }

  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, projectId);
  if (!project) {
    throw new Error("项目不存在");
  }
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }

  const prepared = getDraftPrForTask(getUserDataPath, uid, {
    projectId,
    taskId,
    getDefaultProjectRoot,
    verifyResult,
  });
  if (!prepared.ok || !prepared.draft) {
    return { ok: false, reason: prepared.reason || "draft_unavailable", draft: prepared.draft };
  }

  const draft = prepared.draft;
  let pushResult = null;
  if (push) {
    pushResult = runGit(root, ["push", "-u", "origin", draft.branch], { timeoutMs: 120000 });
    if (!pushResult.success) {
      return {
        ok: false,
        reason: "git_push_failed",
        draft,
        push: pushResult,
        message: pushResult.stderr || pushResult.stdout || "git push 失败",
      };
    }
  }

  const gh = runGh(root, [
    "pr",
    "create",
    "--draft",
    "--title",
    draft.title,
    "--body",
    draft.body,
  ]);
  if (!gh.success) {
    return {
      ok: false,
      reason: gh.error && /ENOENT|not found/i.test(gh.error) ? "gh_not_found" : "gh_pr_failed",
      draft,
      push: pushResult,
      gh,
      message: gh.stderr || gh.stdout || gh.error || "gh pr create 失败",
    };
  }

  const prUrl = (gh.stdout.match(/https?:\/\/\S+/) || [])[0] || gh.stdout || null;
  const result = {
    ok: true,
    draft,
    push: pushResult,
    gh,
    prUrl,
    createdAt: nowIso(),
  };

  try {
    const db = getDb(getUserDataPath);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
       VALUES (?, ?, 'task', ?, 'draft_pr.create', ?, ?)`
    ).run(
      newId("audit"),
      uid,
      taskId,
      JSON.stringify({
        projectId,
        branch: draft.branch,
        prUrl,
        approvalId: approvalId || requestId,
        pushed: Boolean(push),
      }),
      nowIso()
    );
  } catch {
    /* audit best-effort */
  }

  return result;
}

module.exports = {
  getDraftPrForTask,
  createDraftPr,
  buildTaskPrBody,
};
