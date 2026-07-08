/**
 * 知识库配置界面布局参数与检索默认值（桌面客户端合规排版方案）
 */
const KB_CONFIG_LAYOUT = {
  window: {
    defaultWidth: 1440,
    defaultHeight: 900,
    minWidth: 1280,
    minHeight: 760,
    backgroundColor: "#07111f",
  },
  chrome: {
    headerHeight: 64,
    footerHeight: 58,
    pagePaddingX: 14,
    pagePaddingY: 10,
    gap: 12,
    borderRadius: 12,
  },
  sidebar: {
    width: 246,
    collapsedWidth: 72,
    itemHeight: 72,
    statusCardHeight: 300,
    padding: 12,
    gap: 10,
  },
  main: {
    maxWidth: 1160,
    minCardHeight: 96,
    sectionGap: 10,
    cardPaddingX: 18,
    cardPaddingY: 14,
    fieldHeight: 38,
    labelHeight: 22,
  },
  grid: {
    basicColumns: 5,
    compactColumns: 4,
    tabletColumns: 3,
    minFieldWidth: 170,
    columnGap: 14,
    rowGap: 12,
  },
  control: {
    buttonHeight: 36,
    smallButtonHeight: 32,
    inputHeight: 38,
    switchWidth: 42,
    switchHeight: 22,
    iconButton: 36,
    chipHeight: 28,
  },
};

const DEFAULT_KB_RETRIEVAL_SETTINGS = {
  chunkSize: 800,
  chunkOverlap: 120,
  embedModel: "bge-m3",
  searchTopK: 5,
  searchMinScore: 0.7,
  searchCandidateK: 200,
  hybridVectorWeight: 0.7,
  keywordRecallLimit: 50,
  searchMode: "auto",
  chunkStrategy: "semantic",
  hybridSearch: true,
  useRrfRanking: true,
  rerankEnabled: true,
  rerankModel: "dengcao/bge-reranker-v2-m3",
  rerankProvider: "ollama",
  rerankTopN: 30,
  rerankWeight: 0.75,
  aiVerifyWriteback: false,
  autoLearnEnabled: false,
  autoLearnRequireConfirm: false,
  autoLearnMinQuestionChars: 6,
  autoLearnMinAnswerChars: 80,
  autoWebVerify: false,
  watchDirEnabled: false,
  watchDirPath: "",
  archivePolicy: "ask",
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n)));
}

function migrateLegacyRerankDefaults(input = {}) {
  const s = input && typeof input === "object" ? { ...input } : {};
  const modelBase = String(s.rerankModel || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  const provider = String(s.rerankProvider || "").trim().toLowerCase();
  const isLegacyOnnxDefault =
    (provider === "onnx" || provider === "") &&
    (!modelBase || modelBase === "bge-reranker-v2-m3");
  if (isLegacyOnnxDefault) {
    s.rerankProvider = "ollama";
    s.rerankModel = DEFAULT_KB_RETRIEVAL_SETTINGS.rerankModel;
  }
  return s;
}

function normalizeKbSettings(input = {}) {
  const s = migrateLegacyRerankDefaults(input);
  return {
    chunkSize: clamp(s.chunkSize ?? 800, 300, 2000),
    chunkOverlap: clamp(s.chunkOverlap ?? 120, 0, 500),
    searchTopK: clamp(s.searchTopK ?? 5, 1, 30),
    searchMinScore: clamp(s.searchMinScore ?? 0.55, 0.2, 0.95),
    searchCandidateK: clamp(s.searchCandidateK ?? 200, 20, 1000),
    keywordRecallLimit: clamp(s.keywordRecallLimit ?? 50, 10, 500),
    hybridVectorWeight: clamp(s.hybridVectorWeight ?? 0.7, 0.1, 0.95),
    autoLearnMinQuestionChars: clamp(s.autoLearnMinQuestionChars ?? 6, 1, 50),
    autoLearnMinAnswerChars: clamp(s.autoLearnMinAnswerChars ?? 80, 20, 1000),
    embedModel: String(s.embedModel || "bge-m3").trim() || "bge-m3",
    searchMode: ["auto", "semantic", "keyword", "hybrid"].includes(String(s.searchMode || ""))
      ? String(s.searchMode)
      : "auto",
    chunkStrategy: String(s.chunkStrategy || "") === "fixed" ? "fixed" : "semantic",
    hybridSearch: s.hybridSearch !== false,
    useRrfRanking: s.useRrfRanking !== false,
    rerankEnabled: s.rerankEnabled !== false,
    rerankModel:
      String(s.rerankModel || DEFAULT_KB_RETRIEVAL_SETTINGS.rerankModel).trim() ||
      DEFAULT_KB_RETRIEVAL_SETTINGS.rerankModel,
    rerankProvider: ["auto", "ollama", "onnx"].includes(String(s.rerankProvider || "").toLowerCase())
      ? String(s.rerankProvider).toLowerCase()
      : DEFAULT_KB_RETRIEVAL_SETTINGS.rerankProvider,
    rerankTopN: clamp(s.rerankTopN ?? 30, 5, 80),
    rerankWeight: clamp(s.rerankWeight ?? 0.75, 0.1, 0.95),
    aiVerifyWriteback: s.aiVerifyWriteback === true,
    autoLearnEnabled: s.autoLearnEnabled === true,
    autoLearnRequireConfirm: s.autoLearnRequireConfirm === true,
    autoWebVerify: s.autoWebVerify === true,
    watchDirEnabled: s.watchDirEnabled === true,
    watchDirPath: String(s.watchDirPath || "").trim(),
  };
}

function validateKbSettings(settings = {}) {
  const s = normalizeKbSettings(settings);
  const errors = [];
  const warnings = [];

  if (s.chunkOverlap >= s.chunkSize) {
    errors.push("分片重叠必须小于分片长度。");
  }
  if (s.useRrfRanking && !s.hybridSearch) {
    errors.push("RRF 排名融合需要开启混合检索。");
  }
  if (s.autoWebVerify) {
    warnings.push("入库时自动联网核验会显著增加耗时，建议仅在高级模式启用。");
  }

  return { settings: s, errors, warnings };
}

const api = {
  KB_CONFIG_LAYOUT,
  DEFAULT_KB_RETRIEVAL_SETTINGS,
  normalizeKbSettings,
  validateKbSettings,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
if (typeof window !== "undefined") {
  window.KbConfigLayout = api;
}
