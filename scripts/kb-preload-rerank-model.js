#!/usr/bin/env node
/**
 * 预下载 bge-reranker-v2-m3 ONNX（q8，约 570MB）到应用 userData/transformers-cache。
 * 用法：node scripts/kb-preload-rerank-model.js [userDataPath]
 */
const os = require("os");
const path = require("path");
const { rerankDocuments, ONNX_MODEL_ID } = require("../utils/kbRerank.js");

async function main() {
  const userDataPath =
    process.argv[2] ||
    process.env.KB_USER_DATA ||
    path.join(os.homedir(), "AppData", "Roaming", "daily-task-tracker-desktop");
  console.log(`预加载重排模型 ${ONNX_MODEL_ID}（q8）…`);
  console.log(`缓存目录：${path.join(userDataPath, "transformers-cache")}`);
  const t0 = Date.now();
  const out = await rerankDocuments({
    provider: "onnx",
    query: "warmup",
    documents: ["warmup passage for model download"],
    userDataPath,
    model: "bge-reranker-v2-m3",
  });
  console.log(`完成（${out.provider} · ${Date.now() - t0}ms）`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
