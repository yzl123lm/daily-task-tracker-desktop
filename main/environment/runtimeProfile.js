const fs = require("fs");
const path = require("path");

const PROFILE_VERSION = 1;
const PROFILE_FILENAME = "runtime-profile.json";

function getProfilePath(userDataPath) {
  return path.join(String(userDataPath || ""), PROFILE_FILENAME);
}

function readRuntimeProfile(userDataPath) {
  const p = getProfilePath(userDataPath);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return j && typeof j === "object" ? j : null;
  } catch {
    return null;
  }
}

function writeRuntimeProfile(userDataPath, profile) {
  const p = getProfilePath(userDataPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(profile, null, 2), "utf8");
  return profile;
}

/**
 * @param {object} evalReport evaluate() 输出
 */
function buildRuntimeProfile(evalReport) {
  const issues = Array.isArray(evalReport?.issues) ? evalReport.issues : [];
  const ollama = evalReport?.ollama || {};
  const models = evalReport?.models || {};
  const python = evalReport?.python || {};
  const rerank = evalReport?.rerank || {};

  const ollamaRunning = ollama.api?.reachable === true;
  const bgeM3InTags = models.bgeM3InTags === true || models.bgeM3Installed === true;
  const embedSmokeOk = models.embedSmokeOk;
  const embedReady =
    ollamaRunning && bgeM3InTags && embedSmokeOk !== false;
  const chatReady = Boolean(models.chatModelInstalled);
  const rerankReady = rerank.ready === true;
  const pythonReady = python.found === true && !(python.major === 3 && python.minor >= 13);
  const cloudReady = evalReport?.cloudApi?.configured === true;

  const profile = {
    version: PROFILE_VERSION,
    evaluatedAt: evalReport?.evaluatedAt || new Date().toISOString(),
    depth: evalReport?.depth || "lite",
    healthy: issues.filter((i) => i.severity === "error").length === 0,
    core: {
      ollamaInstalled: ollama.installed === true,
      ollamaRunning,
      localAiReady: ollamaRunning && chatReady,
      knowledgeBaseEmbedReady: ollamaRunning && embedReady,
      rerankReady,
      pythonReady,
      cloudConfigured: cloudReady,
    },
    features: {
      localChat: {
        enabled: ollamaRunning && chatReady,
        reason:
          !ollamaRunning
            ? "Ollama 未运行"
            : !chatReady
              ? "未安装本地对话模型"
              : "",
      },
      kbIngest: {
        enabled: embedReady,
        reason: !ollamaRunning
          ? "Ollama 未运行"
          : !bgeM3InTags
            ? "未安装 bge-m3"
            : embedSmokeOk === false
              ? "bge-m3 已安装但嵌入不可用，请检查 Ollama 路径或服务"
              : "",
      },
      kbSemanticSearch: {
        enabled: embedReady,
        reason: !ollamaRunning
          ? "Ollama 未运行"
          : !bgeM3InTags
            ? "未安装 bge-m3"
            : embedSmokeOk === false
              ? "bge-m3 已安装但嵌入不可用，请检查 Ollama 路径或服务"
              : "",
      },
      kbRerank: {
        enabled: rerankReady,
        reason: rerankReady
          ? ""
          : rerank.reason || "重排模型未就绪（可预下载 ONNX 或使用 Ollama 重排模型）",
      },
      localAsr: {
        enabled: pythonReady,
        reason: pythonReady ? "" : "需要 Python 3.11–3.12",
      },
      localTts: {
        enabled: pythonReady,
        reason: pythonReady ? "" : "需要 Python 3.11–3.12",
      },
      cloudChat: {
        enabled: cloudReady,
        reason: cloudReady ? "" : "未配置云端对话模型",
      },
    },
    models: {
      embedModel: models.embedModel || "bge-m3",
      chatModel: models.chatModelInstalled || "",
      recommendedChatModel: models.recommendedChatModel || "",
      rerankProvider: rerank.provider || "none",
      ollamaRerankModel: rerank.ollamaRerankModel || "",
    },
    issues,
  };
  return profile;
}

module.exports = {
  PROFILE_FILENAME,
  readRuntimeProfile,
  writeRuntimeProfile,
  buildRuntimeProfile,
  getProfilePath,
};
