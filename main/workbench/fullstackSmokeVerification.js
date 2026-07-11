/**
 * BL-011 fullstack smoke: optional compose up + HTTP health + compose down.
 */
const fs = require("fs");
const { runWebHttpSmokeVerification, httpGet } = require("./webHttpSmokeVerification.js");
const { composeUp, composeDown, composeFileFor } = require("./composeRunnerService.js");
const { dockerAvailable } = require("./sandbox/index.js");

async function runFullstackSmokeVerification(root, { taskId, userApproved = false, healthUrl } = {}) {
  const hasCompose = Boolean(composeFileFor(root));
  const evidence = [];

  if (!hasCompose) {
    // Fall back to web-http-smoke for repos without compose
    const web = await runWebHttpSmokeVerification(root);
    return {
      ...web,
      profileId: "fullstack-smoke",
      scriptName: "fullstack-smoke",
      fallbackFrom: "web-http-smoke",
      message: web.ok
        ? `全栈冒烟（无 compose，降级 web-http）：${web.message}`
        : web.message,
    };
  }

  if (!dockerAvailable()) {
    const web = await runWebHttpSmokeVerification(root);
    return {
      ...web,
      profileId: "fullstack-smoke",
      scriptName: "fullstack-smoke",
      fallbackFrom: "web-http-smoke",
      dockerSkipped: true,
      message: web.ok
        ? `全栈冒烟（Docker 不可用，降级 web-http）：${web.message}`
        : `Docker 不可用且 web 冒烟失败：${web.message}`,
    };
  }

  if (!userApproved) {
    return {
      ok: false,
      skipped: false,
      profileId: "fullstack-smoke",
      scriptName: "fullstack-smoke",
      message: "fullstack-smoke 需要用户授权（compose + 网络）",
      code: "USER_APPROVAL_REQUIRED",
      evidence: [],
    };
  }

  const up = await composeUp(root, { taskId, userApproved: true });
  evidence.push(...(up.evidence || []));
  if (!up.ok) {
    return {
      ok: false,
      skipped: Boolean(up.skipped),
      profileId: "fullstack-smoke",
      scriptName: "fullstack-smoke",
      message: up.message,
      evidence,
      stdout: up.stdout,
      stderr: up.stderr,
    };
  }

  try {
    // Prefer explicit health URL; else try common localhost ports briefly
    const urls = healthUrl
      ? [healthUrl]
      : ["http://127.0.0.1:3000/", "http://127.0.0.1:8080/", "http://127.0.0.1:5173/"];
    let healthOk = false;
    let lastErr = null;
    for (const url of urls) {
      try {
        const resp = await httpGet(url, 4000);
        evidence.push({
          type: "health_http",
          url,
          statusCode: resp.statusCode,
          at: new Date().toISOString(),
        });
        if (resp.statusCode >= 200 && resp.statusCode < 500) {
          healthOk = true;
          break;
        }
      } catch (e) {
        lastErr = e;
      }
    }

    // Also accept static web evidence from repo itself
    if (!healthOk) {
      const web = await runWebHttpSmokeVerification(root, { captureConsole: false });
      evidence.push(...(web.evidence || []));
      healthOk = web.ok;
      if (!healthOk && lastErr) {
        evidence.push({ type: "health_error", message: String(lastErr.message || lastErr) });
      }
    }

    return {
      ok: healthOk,
      skipped: false,
      profileId: "fullstack-smoke",
      scriptName: "fullstack-smoke",
      message: healthOk ? "全栈冒烟通过（compose + health/web）" : "全栈冒烟失败：服务未就绪",
      evidence,
    };
  } finally {
    await composeDown(root, { taskId, userApproved: true });
  }
}

module.exports = {
  runFullstackSmokeVerification,
};
