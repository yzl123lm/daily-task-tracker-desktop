const fs = require("fs");
const path = require("path");
const { findInstalledRerankModel } = require("./requiredModels.js");

function getTransformersCacheDir(userDataPath) {
  return path.join(String(userDataPath || ""), "transformers-cache");
}

function probeOnnxRerankCache(userDataPath) {
  const cacheDir = getTransformersCacheDir(userDataPath);
  if (!fs.existsSync(cacheDir)) {
    return { ready: false, cacheDir, reason: "transformers-cache 目录不存在" };
  }
  try {
    const entries = fs.readdirSync(cacheDir, { withFileTypes: true });
    const hasOnnxRerank = entries.some(
      (e) =>
        e.isDirectory() &&
        /bge-reranker-v2-m3/i.test(e.name) &&
        /onnx/i.test(e.name)
    );
    if (hasOnnxRerank) {
      return { ready: true, cacheDir, reason: "" };
    }
    const modelsDir = path.join(cacheDir, "models--onnx-community--bge-reranker-v2-m3-ONNX");
    if (fs.existsSync(modelsDir)) {
      return { ready: true, cacheDir, reason: "" };
    }
    return { ready: false, cacheDir, reason: "未检测到 bge-reranker ONNX 缓存" };
  } catch (err) {
    return { ready: false, cacheDir, reason: String(err?.message || err) };
  }
}

/** @deprecated 使用 probeRerankReadiness */
function probeRerankCache(userDataPath) {
  return probeOnnxRerankCache(userDataPath);
}

/**
 * ONNX 缓存或 Ollama 已安装重排模型，均视为重排可用。
 * @param {string} userDataPath
 * @param {object|null} ollamaTags
 */
function probeRerankReadiness(userDataPath, ollamaTags) {
  const onnx = probeOnnxRerankCache(userDataPath);
  const ollamaModel = ollamaTags ? findInstalledRerankModel(ollamaTags) : "";
  if (onnx.ready) {
    return {
      ready: true,
      provider: "onnx",
      onnxReady: true,
      ollamaRerankModel: ollamaModel || "",
      cacheDir: onnx.cacheDir,
      reason: "",
    };
  }
  if (ollamaModel) {
    return {
      ready: true,
      provider: "ollama",
      onnxReady: false,
      ollamaRerankModel: ollamaModel,
      cacheDir: onnx.cacheDir,
      reason: "",
    };
  }
  return {
    ready: false,
    provider: "none",
    onnxReady: false,
    ollamaRerankModel: "",
    cacheDir: onnx.cacheDir,
    reason: onnx.reason || "未检测到 ONNX 缓存或 Ollama 重排模型",
  };
}

module.exports = {
  probeRerankCache,
  probeOnnxRerankCache,
  probeRerankReadiness,
  getTransformersCacheDir,
};
