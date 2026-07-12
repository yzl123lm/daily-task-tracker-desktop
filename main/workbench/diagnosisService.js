/**
 * BL-013 / VER-006~007: Failure classification + Diagnosis schema.
 */
const { parseErrorEvent, classifySourceCategory } = require("./error-lessons/errorParserService.js");
const { buildFingerprint } = require("./error-lessons/errorFingerprintService.js");
const { newId } = require("./db.js");

const DIAGNOSIS_VERSION = 1;

/** VER-006 canonical failure categories */
const FAILURE_CATEGORY = {
  COMPILE: "compile",
  TEST: "test",
  TYPE: "type",
  LINT: "lint",
  DEPENDENCY: "dependency",
  ENVIRONMENT: "environment",
  PERMISSION: "permission",
  NETWORK: "network",
  DATA: "data",
  RUNTIME: "runtime",
  FLAKY_TEST: "flaky_test",
  PATCH: "patch",
  UNKNOWN: "unknown",
};

const STRATEGY_BY_CATEGORY = {
  [FAILURE_CATEGORY.COMPILE]: {
    tools: ["read_file", "stage_patch", "run_verification"],
    strategy: "定位编译错误文件与行号，最小补丁修复后重跑 build",
  },
  [FAILURE_CATEGORY.TEST]: {
    tools: ["read_file", "search_code", "stage_patch", "run_verification"],
    strategy: "对照失败断言与被测实现，修复逻辑后重跑相关测试",
  },
  [FAILURE_CATEGORY.TYPE]: {
    tools: ["read_file", "stage_patch", "run_verification"],
    strategy: "修正类型声明/返回值，优先跑 typecheck",
  },
  [FAILURE_CATEGORY.LINT]: {
    tools: ["read_file", "stage_patch", "run_verification"],
    strategy: "按 lint 规则做最小风格/安全修复",
  },
  [FAILURE_CATEGORY.DEPENDENCY]: {
    tools: ["get_repo_profile", "analyze_package"],
    strategy: "检查锁文件与依赖声明，经审批后 bootstrap，禁止静默升级",
  },
  [FAILURE_CATEGORY.ENVIRONMENT]: {
    tools: ["get_repo_profile", "list_verification_profiles"],
    strategy: "核对 Node/工具链与 RepoProfile，先环境引导再改代码",
  },
  [FAILURE_CATEGORY.PERMISSION]: {
    tools: [],
    strategy: "停止自动修复，向用户申请权限或降级操作",
  },
  [FAILURE_CATEGORY.NETWORK]: {
    tools: [],
    strategy: "确认网络策略/allowlist；默认 deny 下不得外联",
  },
  [FAILURE_CATEGORY.DATA]: {
    tools: ["read_file", "stage_patch"],
    strategy: "检查 fixture/seed/迁移；危险写库需审批",
  },
  [FAILURE_CATEGORY.RUNTIME]: {
    tools: ["read_file", "search_code", "stage_patch", "run_verification"],
    strategy: "根据堆栈定位运行时异常，补丁后重跑冒烟",
  },
  [FAILURE_CATEGORY.FLAKY_TEST]: {
    tools: ["run_verification"],
    strategy: "先原样重跑确认不稳定；避免无证据改业务逻辑",
  },
  [FAILURE_CATEGORY.PATCH]: {
    tools: ["read_file", "stage_patch"],
    strategy: "重新读取当前文件内容，避免基于过期上下文打补丁",
  },
  [FAILURE_CATEGORY.UNKNOWN]: {
    tools: ["read_file", "run_verification"],
    strategy: "先收集完整日志与可证伪检查，再提出假设",
  },
};

function mapToFailureCategory(parsedEvent, rawText) {
  const text = String(rawText || parsedEvent?.rawExcerpt || "").toLowerCase();
  const legacy = String(parsedEvent?.category || "").toLowerCase();

  if (/eacces|eperm|permission denied|access is denied/.test(text)) {
    return FAILURE_CATEGORY.PERMISSION;
  }
  if (/enotfound|econnrefused|etimedout|network|dns|fetch failed|socket/.test(text)) {
    return FAILURE_CATEGORY.NETWORK;
  }
  if (/cannot find module|err_module_not_found|enoent.*node_modules|peer dep|npm err! code e404/.test(text)) {
    return FAILURE_CATEGORY.DEPENDENCY;
  }
  if (/eslint|prettier|lint error|stylelint/.test(text) || /lint/.test(legacy)) {
    return FAILURE_CATEGORY.LINT;
  }
  if (/tsc|ts\d{4}|type error|is not assignable|cannot find name/.test(text)) {
    return FAILURE_CATEGORY.TYPE;
  }
  if (/flaky|intermittent|timeout.*retry|order.?dependent/.test(text)) {
    return FAILURE_CATEGORY.FLAKY_TEST;
  }
  if (legacy === "test_failure" || /failing|assertionerror|expected .* received|pytest|jest/.test(text)) {
    return FAILURE_CATEGORY.TEST;
  }
  if (legacy === "patch_failure" || /patch|context mismatch|hunk/.test(text)) {
    return FAILURE_CATEGORY.PATCH;
  }
  if (/syntaxerror|parse error|unexpected token|compilation|webpack|vite build/.test(text) || legacy === "build_error") {
    return FAILURE_CATEGORY.COMPILE;
  }
  if (/migration|sqlite|postgres|constraint|foreign key|seed/.test(text)) {
    return FAILURE_CATEGORY.DATA;
  }
  if (/referenceerror|typeerror|rangeerror|uncaught|stack:/.test(text)) {
    return FAILURE_CATEGORY.RUNTIME;
  }
  if (/python not found|node: command not found|enoent.*spawn|no such file/.test(text)) {
    return FAILURE_CATEGORY.ENVIRONMENT;
  }
  return FAILURE_CATEGORY.UNKNOWN;
}

/**
 * Build a versioned Diagnosis object (VER-007).
 * Must cite logs/files and include rootCauseHypothesis + falsifiableCheck.
 */
function buildDiagnosis(input = {}) {
  const parsedEvent = parseErrorEvent(input);
  const failureCategory = mapToFailureCategory(parsedEvent, parsedEvent.rawExcerpt);
  const strategy = STRATEGY_BY_CATEGORY[failureCategory] || STRATEGY_BY_CATEGORY[FAILURE_CATEGORY.UNKNOWN];
  const fingerprint = buildFingerprint({
    source: parsedEvent.source,
    category: failureCategory,
    message: parsedEvent.primaryMessage,
    file: parsedEvent.primaryFile,
    parsed: parsedEvent.parsed,
  });

  const issues = (parsedEvent.parsed?.issues || []).slice(0, 8).map((i) => ({
    file: i.file || null,
    line: i.line || null,
    message: String(i.message || "").slice(0, 300),
  }));

  const confidence = (() => {
    if (issues.length && parsedEvent.primaryFile) return 0.85;
    if (failureCategory !== FAILURE_CATEGORY.UNKNOWN) return 0.65;
    return 0.4;
  })();

  const falsifiableCheck = parsedEvent.primaryFile
    ? {
        type: "read_and_repro",
        description: `先阅读 ${parsedEvent.primaryFile}${issues[0]?.line ? `:${issues[0].line}` : ""}，确认错误仍可由当前代码复现，再打补丁`,
        command: input.verifyCommand || null,
      }
    : {
        type: "re_verify",
        description: "先原样重跑同一验证命令，确认错误可复现，禁止仅根据错误最后一行改代码",
        command: input.verifyCommand || null,
      };

  return {
    diagnosisVersion: DIAGNOSIS_VERSION,
    diagnosisId: newId("diag"),
    at: new Date().toISOString(),
    failureCategory,
    legacyCategory: parsedEvent.category,
    source: parsedEvent.source,
    fingerprint: fingerprint.fingerprint,
    confidence,
    rootCauseHypothesis: String(parsedEvent.rootCause || parsedEvent.primaryMessage).slice(0, 500),
    evidence: {
      logExcerpt: parsedEvent.rawExcerpt,
      relatedFiles: parsedEvent.relatedFiles || [],
      issues,
      recentChanges: Array.isArray(input.recentChanges) ? input.recentChanges.slice(0, 10) : [],
      verifyCommand: input.verifyCommand || parsedEvent.verifyCommand || null,
    },
    falsifiableCheck,
    suggestedTools: strategy.tools,
    suggestedStrategy: strategy.strategy,
    verifySteps: [
      falsifiableCheck.description,
      strategy.strategy,
      "应用补丁后重跑相关验证与最小回归",
    ],
    tags: [...new Set([...(parsedEvent.tags || []), failureCategory])],
  };
}

function buildDiagnosisFromVerify(verify, extras = {}) {
  return buildDiagnosis({
    source: "verify",
    stdout: verify?.stdout,
    stderr: verify?.stderr,
    message: verify?.message || verify?.parsed?.summary,
    parsed: verify?.parsed,
    verifyCommand: verify?.command || extras.scriptName || null,
    recentChanges: extras.recentChanges,
  });
}

function formatDiagnosisForPrompt(diagnosis) {
  if (!diagnosis) return "";
  const lines = [
    `[Diagnosis v${diagnosis.diagnosisVersion}] category=${diagnosis.failureCategory} confidence=${diagnosis.confidence}`,
    `根因假设: ${diagnosis.rootCauseHypothesis}`,
    `可证伪检查: ${diagnosis.falsifiableCheck?.description || ""}`,
    `策略: ${diagnosis.suggestedStrategy}`,
    `相关文件: ${(diagnosis.evidence?.relatedFiles || []).slice(0, 5).join(", ") || "(无)"}`,
  ];
  for (const issue of (diagnosis.evidence?.issues || []).slice(0, 5)) {
    lines.push(`- ${issue.file || "?"}:${issue.line || "?"} ${issue.message || ""}`);
  }
  lines.push("禁止仅根据错误最后一行盲目改代码；先完成可证伪检查。");
  return lines.join("\n");
}

function classifyFailure(input) {
  const diagnosis = buildDiagnosis(input);
  return {
    failureCategory: diagnosis.failureCategory,
    legacy: classifySourceCategory(input?.source, input?.stderr || input?.message),
    suggestedTools: diagnosis.suggestedTools,
    suggestedStrategy: diagnosis.suggestedStrategy,
  };
}

module.exports = {
  DIAGNOSIS_VERSION,
  FAILURE_CATEGORY,
  STRATEGY_BY_CATEGORY,
  buildDiagnosis,
  buildDiagnosisFromVerify,
  formatDiagnosisForPrompt,
  classifyFailure,
  mapToFailureCategory,
};
