const { getDb, nowIso } = require("./db.js");
const { resolveUserId, getTask, getProject } = require("./projectService.js");
const { getTaskSpec } = require("./taskSpecService.js");
const { getPlanSteps } = require("./planStepsService.js");
const { listStagedPatches } = require("./patchStagingService.js");
const { getLatestRunForTask } = require("./agentRunStore.js");
const { evaluateCompletion } = require("./completionGuardService.js");
const fs = require("fs");
const path = require("path");

function hasPackageJson(localPath) {
  if (!localPath) return false;
  try {
    return fs.existsSync(path.join(localPath, "package.json"));
  } catch {
    return false;
  }
}

function isStaticWebProject(localPath) {
  if (!localPath || hasPackageJson(localPath)) return false;
  try {
    const candidates = ["index.html", "public/index.html", "src/index.html", "app.html"];
    return candidates.some((rel) => {
      try {
        const abs = path.join(localPath, rel);
        return fs.existsSync(abs) && fs.statSync(abs).isFile();
      } catch {
        return false;
      }
    });
  } catch {
    return !hasPackageJson(localPath);
  }
}

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

  let git = null;
  let pr = null;
  try {
    const { resolveProjectRoot } = require("./projectCodeService.js");
    const { getHeadMeta, buildPrDraftMeta } = require("./gitService.js");
    const root = resolveProjectRoot(project, getDefaultProjectRoot);
    if (root) {
      git = getHeadMeta(root);
      if (git?.isRepo && git.branch) {
        pr = buildPrDraftMeta({
          branch: git.branch,
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
          agentRunId: latestRun?.id,
        });
      }
    }
  } catch {
    git = null;
  }

  let checkpoint = null;
  try {
    const { getCheckpoint } = require("./checkpointService.js");
    checkpoint = getCheckpoint(getUserDataPath, uid, projectId, taskId);
  } catch {
    checkpoint = null;
  }

  const applied = patches.filter((p) => p.status === "APPLIED" || p.status === "ACCEPTED");
  const manifest = {
    version: 2,
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
      reviewVerdict: p.patchQuality?.review?.verdict || null,
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
      instructions: (() => {
        const localPath = project?.localPath || project?.local_path || "";
        if (!localPath) return "请配置项目本地路径后启动";
        if (!hasPackageJson(localPath) || isStaticWebProject(localPath)) {
          return `纯静态项目：用系统默认浏览器打开入口文件 index.html（位于 ${localPath}）`;
        }
        return `在项目目录打开并按 README/package.json 脚本启动：${localPath}`;
      })(),
      commands: buildStartCommands(project?.localPath || project?.local_path),
    },
    rollback: {
      instructions: "可通过工作台文件备份还原；或使用 Git 回退（若仓库已初始化）",
      commands: git?.isRepo
        ? [`git status`, `git checkout -- .`, `git reset --hard ${git.shortHash || "HEAD~1"}`]
        : ["在工作台「备份」面板还原文件"],
    },
    git,
    pr,
    checkpoint: checkpoint
      ? {
          phase: checkpoint.phase || null,
          lastGreen: Boolean(checkpoint.lastGreen?.isGreen),
          completedIds: checkpoint.completedIds || [],
        }
      : null,
    limitations: [
      ...(spec?.nonGoals || []),
      ...(guard.incompleteMarkers?.length
        ? [`仍检测到 ${guard.incompleteMarkers.length} 处 TODO/FIXME（若已 waiver 可忽略）`]
        : []),
    ],
    openItems: (spec?.openQuestions || []).map((q) => q.text),
    agentRunId: latestRun?.id || null,
    risks: (spec?.risks || []).map((r) => (typeof r === "string" ? r : r?.type || r?.level || JSON.stringify(r))),
  };

  const required = ["generatedAt", "project", "task", "changes", "acceptance", "start", "rollback"];
  const missing = required.filter((k) => manifest[k] == null);
  manifest.complete = missing.length === 0 && Boolean(manifest.spec);
  manifest.missingFields = missing;
  manifest.runbookMarkdown = formatDeliveryRunbook(manifest);

  return manifest;
}

function buildStartCommands(localPath) {
  const cd = localPath ? `cd ${JSON.stringify(localPath)}` : "# cd <project-root>";
  if (!hasPackageJson(localPath)) {
    const openCmd =
      process.platform === "win32"
        ? "start \"\" index.html"
        : process.platform === "darwin"
          ? "open index.html"
          : "xdg-open index.html";
    return [
      cd,
      "# 无 package.json：请用浏览器打开 HTML 入口，勿默认执行 npm",
      openCmd,
    ];
  }
  return [cd, "npm install  # 如需要", "npm test     # 或项目约定的验证脚本", "npm start    # 如适用"];
}

/**
 * BL-020 / STATE-008 / UX-005: Human-readable Runbook markdown.
 */
function formatDeliveryRunbook(manifest) {
  const m = manifest || {};
  const lines = [];
  lines.push(`# 交付 Runbook · ${m.task?.title || m.task?.id || "任务"}`);
  lines.push("");
  lines.push(`生成时间：${m.generatedAt || ""}`);
  if (m.agentRunId) lines.push(`Agent Run：\`${m.agentRunId}\``);
  lines.push("");

  lines.push("## 做了什么");
  if (m.spec?.goal) lines.push(m.spec.goal);
  else lines.push(m.task?.title || "（无目标摘要）");
  lines.push("");
  if ((m.changes || []).length) {
    lines.push("### 变更文件");
    for (const c of m.changes) {
      lines.push(`- \`${c.path}\` — ${c.summary || c.status}${c.reviewVerdict ? ` 〔review:${c.reviewVerdict}〕` : ""}`);
    }
    lines.push("");
  }

  lines.push("## 怎么启动");
  lines.push(m.start?.instructions || "");
  for (const cmd of m.start?.commands || []) {
    lines.push("```bash");
    lines.push(cmd);
    lines.push("```");
  }
  lines.push("");

  lines.push("## 怎么验证");
  if (m.verification) {
    const v = m.verification;
    lines.push(
      `- 结果：${v.ok ? "**PASS**" : v.skipped ? "SKIPPED" : "**FAIL**"} · ${v.scriptName || ""} · exit=${v.exitCode ?? "?"}`
    );
    if (v.summary) lines.push(`- 摘要：${v.summary}`);
  } else {
    lines.push("- （尚无验证结果，请在工作台「测试」视图运行验证）");
  }
  if ((m.acceptance?.criteria || []).length) {
    lines.push("### 验收标准");
    for (const c of m.acceptance.criteria.slice(0, 12)) {
      const mark = c.satisfied ? "x" : " ";
      lines.push(`- [${mark}] ${c.id || ""} ${c.text || c.title || ""}`);
    }
  }
  lines.push("");

  lines.push("## Git / PR");
  if (m.git?.isRepo) {
    lines.push(`- 分支：\`${m.git.branch || "?"}\``);
    lines.push(`- Commit：\`${m.git.shortHash || "?"}\` ${m.git.subject || ""}`);
  } else {
    lines.push("- 当前项目不是 Git 仓库（写入时使用文件备份保护）");
  }
  if (m.pr?.commands) {
    lines.push("");
    lines.push("### Draft PR 命令（需本机已登录 gh）");
    lines.push("```bash");
    lines.push(m.pr.commands.push);
    lines.push(m.pr.commands.createDraftPr);
    lines.push("```");
  }
  lines.push("");

  lines.push("## 怎么回滚");
  lines.push(m.rollback?.instructions || "");
  for (const cmd of m.rollback?.commands || []) {
    lines.push(`- \`${cmd}\``);
  }
  lines.push("");

  if ((m.risks || []).length || (m.limitations || []).length || (m.openItems || []).length) {
    lines.push("## 风险 / 限制 / 未完成");
    for (const r of m.risks || []) lines.push(`- 风险：${r}`);
    for (const l of m.limitations || []) lines.push(`- 限制：${l}`);
    for (const o of m.openItems || []) lines.push(`- 未完成：${o}`);
    lines.push("");
  }

  if (m.acceptance && !m.acceptance.guardOk) {
    lines.push("## 阻塞说明");
    lines.push("> 完成守卫未通过，**不要**视为成功交付。");
    for (const b of m.acceptance.blockers || []) {
      lines.push(`- ${b.message || b.code || JSON.stringify(b)}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("_由鲸落AI Workbench 自动生成 · Delivery Manifest v2_");
  return lines.join("\n");
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
  formatDeliveryRunbook,
  buildStartCommands,
};
