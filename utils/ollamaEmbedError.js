const fs = require("fs");
const path = require("path");

/**
 * 将 Ollama / llama-server 嵌入相关原始错误转为可操作的中文说明。
 * @param {unknown} raw
 * @param {{ model?: string, host?: string, modelsPath?: string }} [ctx]
 */
function formatOllamaEmbedError(raw, ctx = {}) {
  const msg = String(raw || "").trim();
  if (!msg) {
    return "Ollama 嵌入请求失败（无详细错误信息）。";
  }

  if (/^Ollama 嵌入模型「/.test(msg) && msg.includes("原始错误：")) {
    return msg;
  }

  const model = String(ctx.model || "bge-m3").trim() || "bge-m3";
  const rawErr = extractRawOllamaError(msg);
  const isLoadFail =
    /failed to load model|llama-server process has terminated|error loading model|exit status 1/i.test(rawErr);
  const hasPathIssue =
    /blobs[\\/]sha256-/i.test(rawErr) &&
    (/ģ||ʹ|洢||[\u0080-\u00ff]{3,}/.test(rawErr) || /OLLAMA_MODELS/i.test(rawErr));

  if (!isLoadFail && !hasPathIssue) {
    return msg;
  }

  const lines = [`Ollama 嵌入模型「${model}」加载失败，无法生成向量。`];

  if (ctx.modelsPath) {
    lines.push(`当前 Ollama 模型目录：${ctx.modelsPath}`);
  }

  if (hasPathIssue) {
    lines.push(
      "检测到模型文件路径含非英文字符或出现乱码，常见于将 OLLAMA_MODELS 设为中文路径（例如「模型存储」）。Windows 下 llama-server 可能因此无法读取 blobs 文件。"
    );
    lines.push("建议按以下步骤处理：");
    lines.push("1. 将模型目录改为纯英文路径，例如 D:\\OllamaModels 或 %USERPROFILE%\\.ollama\\models");
    lines.push("2. 在系统/用户环境变量中设置 OLLAMA_MODELS 为上述英文路径");
    lines.push("3. 在 Ollama 客户端设置中同步修改模型存储位置（若有该项）");
    lines.push("4. 迁移 blobs、manifests 目录到新路径，或在新路径重新执行：ollama pull " + model);
    lines.push("5. 完全退出 Ollama 托盘/服务后重新启动");
    lines.push("（项目根执行：npm run fix:ollama-models-path 或 npm run restart:ollama-english-models）");
  } else {
    lines.push("建议：");
    lines.push(`1. 在「AI能力 → 本地模型部署」确认已拉取嵌入模型（ollama pull ${model}）`);
    lines.push("2. 确认 Ollama 服务正常运行后重试");
    lines.push("3. 若仍失败，重启 Ollama 并检查磁盘空间与模型文件是否完整");
  }

  lines.push("");
  lines.push("原始错误：" + rawErr);
  return lines.join("\n");
}

function extractRawOllamaError(msg) {
  const text = String(msg || "").trim();
  const marker = "原始错误：";
  const idx = text.lastIndexOf(marker);
  if (idx >= 0) {
    return text.slice(idx + marker.length).trim() || text;
  }
  return text;
}

/** @param {string} installed @param {string} requested */
function ollamaModelNameMatches(installed, requested) {
  const ins = String(installed || "").trim().toLowerCase();
  const req = String(requested || "").trim().toLowerCase();
  if (!ins || !req) {
    return false;
  }
  if (ins === req) {
    return true;
  }
  const insBase = ins.split(":")[0];
  const reqBase = req.split(":")[0];
  return ins.startsWith(`${req}:`) || req.startsWith(`${ins}:`) || insBase === reqBase;
}

function readOllamaModelsPathFromLog() {
  try {
    const localAppData = process.env.LOCALAPPDATA || "";
    if (!localAppData) {
      return "";
    }
    const logPath = path.join(localAppData, "Ollama", "server.log");
    if (!fs.existsSync(logPath)) {
      return "";
    }
    const stat = fs.statSync(logPath);
    const readLen = Math.min(stat.size, 16000);
    const buf = Buffer.alloc(readLen);
    const fd = fs.openSync(logPath, "r");
    fs.readSync(fd, buf, 0, readLen, Math.max(0, stat.size - readLen));
    fs.closeSync(fd);
    const tail = buf.toString("utf8");
    const matches = [...tail.matchAll(/OLLAMA_MODELS:([^\s\]]+)/g)];
    if (!matches.length) {
      return "";
    }
    return matches[matches.length - 1][1].replace(/\\\\/g, "\\").trim();
  } catch {
    return "";
  }
}

function buildOllamaEmbedErrorCtx(model, host) {
  return {
    model,
    host,
    modelsPath: readOllamaModelsPathFromLog(),
  };
}

module.exports = {
  formatOllamaEmbedError,
  ollamaModelNameMatches,
  readOllamaModelsPathFromLog,
  buildOllamaEmbedErrorCtx,
};
