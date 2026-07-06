const DEFAULT_COMPRESSION_CONFIG = {
  modelContextWindow: 128000,
  systemPromptTokens: 2000,
  toolSchemaTokens: 1500,
  reservedOutputTokens: 4096,
  safetyMarginTokens: 1024,
  softLimitRatio: 0.72,
  hardLimitRatio: 0.85,
  targetRatioAfterCompression: 0.45,
  minRecentTurnsKeep: 8,
  maxRawLogKeepTokens: 1200,
  maxRawCodeSnippetTokens: 6000,
  enableValidation: true,
  enableSnapshotVersioning: true,
};

function mergeCompressionConfig(overrides) {
  return { ...DEFAULT_COMPRESSION_CONFIG, ...(overrides || {}) };
}

module.exports = {
  DEFAULT_COMPRESSION_CONFIG,
  mergeCompressionConfig,
};
