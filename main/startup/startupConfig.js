/** @typedef {"pending"|"running"|"success"|"failed"|"timeout"|"skipped"} WarmupTaskStatus */

/**
 * 启动画面与预热配置（可通过环境变量 JINGLUO_SKIP_STARTUP=1 跳过整页）
 */
module.exports = {
  startup: {
    enabled: true,
    minDisplayTime: 1800,
    maxWaitTime: 8000,
    allowSkip: false,
    showProgress: true,
    showTaskName: true,
    showVersion: true,
    width: 520,
    height: 400,
    productName: "鲸落AI",
    tagline: "智能工作助手",
  },
  warmup: {
    enabled: true,
    parallel: false,
    failFast: false,
    continueOnError: true,
    /** 启动完成后后台延迟执行的轻量预热（不阻塞主界面） */
    deferredEmbedWarmMs: 3500,
    /** 启动完成后后台预热 Ollama 重排模型 dengcao/bge-reranker-v2-m3 */
    deferredRerankWarmMs: 6000,
    tasks: {
      config: true,
      directories: true,
      environment: true,
      ollama: false,
      embeddingModel: false,
      reranker: false,
      knowledgeBase: true,
      cloudApi: true,
      mainUi: true,
    },
  },
};
