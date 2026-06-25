const fs = require("fs");
const path = require("path");
const { evaluateRuntimePrerequisites } = require("../../runtimePrerequisites.js");
const { probeOllamaEnvironment } = require("./ollamaInstallProbe.js");
const { probeRerankReadiness } = require("./rerankCacheProbe.js");
const {
  REQUIRED_EMBED_MODEL,
  modelInstalled,
  findInstalledChatModel,
} = require("./requiredModels.js");
const { buildRuntimeProfile, writeRuntimeProfile } = require("./runtimeProfile.js");
const { getActiveProfileCredentials } = require("../aiSessionStore.js");
const { buildOllamaHardwareRecommendPayload } = require("../ollamaRuntime.js");

function loadEnvironmentManifest(appRoot) {
  const roots = [appRoot, process.cwd()].filter(Boolean);
  for (const root of roots) {
    const p = path.join(root, "environmentManifest.json");
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return { version: 1, plugins: [], installers: {} };
      }
    }
  }
  return { version: 1, plugins: [], installers: {} };
}

function findPluginForIssue(manifest, issueId) {
  const plugins = Array.isArray(manifest?.plugins) ? manifest.plugins : [];
  return plugins.find((p) => Array.isArray(p.issueIds) && p.issueIds.includes(issueId)) || null;
}

/** 一键修复执行顺序：基础运行时 → Ollama → 路径修复 → 模型 → 重排 */
const REMEDIATION_ORDER = [
  "python_missing",
  "python_high_version",
  "ollama_missing",
  "ollama_not_running",
  "ollama_models_path_unsafe",
  "bge_m3_missing",
  "bge_m3_embed_failed",
  "chat_model_missing",
  "rerank_cache_missing",
];

function sortRemediationIssues(issues) {
  return [...(issues || [])].sort((a, b) => {
    const ia = REMEDIATION_ORDER.indexOf(a.id);
    const ib = REMEDIATION_ORDER.indexOf(b.id);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
  });
}

function enrichIssuesWithRemediation(issues, manifest) {
  return issues.map((issue) => {
    const plugin = findPluginForIssue(manifest, issue.id);
    return {
      ...issue,
      autoAvailable: plugin?.auto === true,
      remediateAction: plugin?.remediate || issue.remediateType || "open_url",
      pluginId: plugin?.id || "",
      plugin,
    };
  });
}

function buildOllamaIssues(ollamaProbe, modelsInfo) {
  const issues = [];
  if (!ollamaProbe.installed) {
    issues.push({
      id: "ollama_missing",
      severity: "error",
      title: "未安装 Ollama",
      detail: "本地知识库嵌入与本地对话依赖 Ollama。可应用内下载官方安装包并静默安装。",
      remediateType: "download_installer",
      remediateUrl: "https://ollama.com/download",
    });
  } else if (!ollamaProbe.api.reachable) {
    issues.push({
      id: "ollama_not_running",
      severity: "error",
      title: "Ollama 未运行",
      detail: ollamaProbe.api.error || "无法连接 Ollama API，请启动 Ollama 后重试。",
      remediateType: "download_installer",
      remediateUrl: "https://ollama.com/download",
    });
  }
  if (ollamaProbe.pathUnsafe?.unsafe) {
    issues.push({
      id: "ollama_models_path_unsafe",
      severity: "warn",
      title: "Ollama 模型路径含非 ASCII 字符",
      detail: `当前路径可能导致嵌入失败：${ollamaProbe.pathUnsafe.path}。建议迁移到纯英文路径。`,
      remediateType: "powershell_fix",
    });
  }
  if (ollamaProbe.api.reachable && !modelsInfo.bgeM3InTags) {
    issues.push({
      id: "bge_m3_missing",
      severity: "warn",
      title: "未安装嵌入模型 bge-m3",
      detail: "知识库语义入库与检索需要 bge-m3，可应用内一键拉取。",
      remediateType: "ollama_pull",
    });
  }
  if (ollamaProbe.api.reachable && modelsInfo.bgeM3InTags && modelsInfo.embedSmokeOk === false) {
    issues.push({
      id: "bge_m3_embed_failed",
      severity: "warn",
      title: "bge-m3 嵌入实测失败",
      detail:
        modelsInfo.embedFailDetail ||
        "模型已在 Ollama 中安装，但嵌入请求未通过。常见原因：OLLAMA_MODELS 含中文路径、Ollama 未完全启动或内存不足。",
      remediateType: "powershell_fix",
    });
  }
  if (ollamaProbe.api.reachable && !modelsInfo.chatModelInstalled) {
    issues.push({
      id: "chat_model_missing",
      severity: "info",
      title: "未安装本地对话模型",
      detail: "AI 助手本地对话需要至少一个 chat 模型，可按硬件推荐自动拉取。",
      remediateType: "ollama_pull_recommended",
    });
  }
  return issues;
}

class EnvironmentReadinessManager {
  /**
   * @param {{ appPath: string, userDataPath: string }} ctx
   */
  constructor(ctx) {
    this.ctx = ctx;
    this.manifest = loadEnvironmentManifest(ctx.appPath);
    this.lastReport = null;
    this.lastProfile = null;
  }

  getManifest() {
    return this.manifest;
  }

  getLastProfile() {
    return this.lastProfile;
  }

  getLastReport() {
    return this.lastReport;
  }

  /**
   * @param {{ depth?: 'lite'|'full' }} options
   */
  async evaluate(options = {}) {
    const depth = options.depth === "full" ? "full" : "lite";
    const prereq = await evaluateRuntimePrerequisites({ appPath: this.ctx.appPath });
    const ollamaProbe = await probeOllamaEnvironment({
      apiTimeoutMs: depth === "full" ? 4000 : 2500,
      tagsTimeoutMs: depth === "full" ? 4000 : 3000,
    });
    const tags = ollamaProbe.tags;
    const rerank = probeRerankReadiness(this.ctx.userDataPath, tags);

    const bgeM3InTags = tags ? modelInstalled(tags, REQUIRED_EMBED_MODEL) : false;
    const chatModelInstalled = tags ? findInstalledChatModel(tags) : "";
    let recommendedChatModel = "";
    try {
      const hw = await buildOllamaHardwareRecommendPayload();
      recommendedChatModel = hw?.items?.[0]?.model || "llama3.2";
    } catch {
      recommendedChatModel = "llama3.2";
    }

    let embedSmokeOk = null;
    let embedFailDetail = "";
    if (depth === "full" && ollamaProbe.api.reachable && bgeM3InTags) {
      try {
        const { runKbModelHealthCheck } = require("../../utils/kbModelHealth.js");
        const health = await runKbModelHealthCheck({ userDataPath: this.ctx.userDataPath });
        embedSmokeOk = health?.embedding?.embedTestPassed === true;
        if (!embedSmokeOk) {
          embedFailDetail = String(
            health?.embedding?.error ||
              health?.embedding?.detail?.message ||
              health?.embedding?.detail ||
              ""
          ).trim();
        }
      } catch (err) {
        embedSmokeOk = false;
        embedFailDetail = String(err?.message || err);
      }
    }

    const creds = getActiveProfileCredentials();
    const cloudApi = {
      configured: Boolean(creds?.baseUrl),
      hasKey: Boolean(creds?.apiKey),
    };

    const ollamaIssues = buildOllamaIssues(ollamaProbe, {
      bgeM3InTags,
      embedSmokeOk,
      embedFailDetail,
      chatModelInstalled,
    });

    if (!rerank.ready) {
      ollamaIssues.push({
        id: "rerank_cache_missing",
        severity: "info",
        title: "重排模型未就绪",
        detail:
          "默认使用 Ollama 重排 dengcao/bge-reranker-v2-m3，可应用内一键拉取。",
        remediateType: "ollama_pull",
      });
    }

    const allIssues = enrichIssuesWithRemediation(
      [...(prereq.issues || []), ...ollamaIssues],
      this.manifest
    );

    const report = {
      ok: true,
      depth,
      evaluatedAt: new Date().toISOString(),
      healthy: allIssues.filter((i) => i.severity === "error").length === 0,
      python: prereq.python,
      ollama: ollamaProbe,
      models: {
        embedModel: REQUIRED_EMBED_MODEL,
        bgeM3Installed: bgeM3InTags,
        bgeM3InTags,
        chatModelInstalled,
        recommendedChatModel,
        embedSmokeOk,
        embedFailDetail,
      },
      rerank,
      cloudApi,
      issues: allIssues,
      manifestVersion: this.manifest.version || 1,
    };

    const profile = buildRuntimeProfile(report);
    writeRuntimeProfile(this.ctx.userDataPath, profile);
    this.lastReport = report;
    this.lastProfile = profile;
    return { report, profile };
  }

  buildRemediationPlan(issueIds) {
    const ids = Array.isArray(issueIds) && issueIds.length ? issueIds : null;
    const pool = this.lastReport?.issues || [];
    const issues = ids ? pool.filter((i) => ids.includes(i.id)) : pool.slice();
    return sortRemediationIssues(issues);
  }
}

module.exports = {
  EnvironmentReadinessManager,
  loadEnvironmentManifest,
  enrichIssuesWithRemediation,
  REMEDIATION_ORDER,
  sortRemediationIssues,
};
