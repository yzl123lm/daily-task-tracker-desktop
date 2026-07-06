const { mergeCompressionConfig } = require("./config.js");
const { estimateTokens } = require("./types.js");

function computeEffectiveContextTokens(configInput) {
  const config = mergeCompressionConfig(configInput);
  const effectiveContextTokens =
    config.modelContextWindow -
    config.systemPromptTokens -
    config.toolSchemaTokens -
    config.reservedOutputTokens -
    config.safetyMarginTokens;
  return {
    ...config,
    effectiveContextTokens: Math.max(effectiveContextTokens, 4096),
  };
}

function computeUsedRatio(usedTokens, configInput) {
  const config = computeEffectiveContextTokens(configInput);
  const used = Math.max(0, Number(usedTokens) || 0);
  const ratio = used / config.effectiveContextTokens;
  return {
    usedTokens: used,
    effectiveContextTokens: config.effectiveContextTokens,
    usedRatio: Math.min(1, Math.max(0, ratio)),
    config,
  };
}

function healthStatusFromRatio(usedRatio) {
  if (usedRatio < 0.6) {
    return "normal";
  }
  if (usedRatio < 0.72) {
    return "warning";
  }
  if (usedRatio < 0.85) {
    return "compress_recommended";
  }
  return "forced";
}

function tokenBudgetForRuntime(runtimeState, configInput) {
  const config = computeEffectiveContextTokens(configInput);
  const messageTokens = Number(runtimeState?.messageTokens) || 0;
  const memoryTokens = Number(runtimeState?.memoryTokens) || 0;
  const snapshotTokens = Number(runtimeState?.snapshotTokens) || 0;
  const usedTokens = messageTokens + memoryTokens + snapshotTokens;
  const budget = computeUsedRatio(usedTokens, config);
  return {
    ...budget,
    breakdown: { messageTokens, memoryTokens, snapshotTokens },
    status: healthStatusFromRatio(budget.usedRatio),
  };
}

module.exports = {
  computeEffectiveContextTokens,
  computeUsedRatio,
  healthStatusFromRatio,
  tokenBudgetForRuntime,
};
