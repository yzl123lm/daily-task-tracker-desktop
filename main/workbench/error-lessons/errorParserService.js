const { parseBuildError } = require("../parseBuildError.js");
const { redactSecrets } = require("./redactSecrets.js");

function classifySourceCategory(source, rawText) {
  const src = String(source || "").toLowerCase();
  const text = String(rawText || "").toLowerCase();
  if (src === "patch" || /patch|apply.*failed|context mismatch/i.test(text)) {
    return { category: "patch_failure", source: "patch" };
  }
  if (src === "shell" || src === "run_shell_command") {
    return { category: "shell_failure", source: "shell" };
  }
  if (src === "test" || src === "run_tests" || /npm test|jest|vitest|pytest/i.test(text)) {
    return { category: "test_failure", source: "test" };
  }
  if (src === "verify" || src === "build" || /build|compile|tsc|webpack/i.test(text)) {
    return { category: "build_error", source: src || "build" };
  }
  if (src === "agent" || src === "agent_error") {
    return { category: "agent_error", source: "agent" };
  }
  return { category: "unknown_error", source: src || "unknown" };
}

function parseErrorEvent(input) {
  const stdout = String(input?.stdout || "");
  const stderr = String(input?.stderr || "");
  const message = String(input?.message || input?.summary || "");
  const combined = [stderr, stdout, message].filter(Boolean).join("\n");
  const redacted = redactSecrets(combined);
  const parsed = input?.parsed || parseBuildError(redacted);
  const classified = classifySourceCategory(input?.source, redacted);
  const firstIssue = parsed?.issues?.[0];
  const primaryFile = input?.file || firstIssue?.file || "";
  const primaryMessage = parsed?.summary || message || redacted.split(/\r?\n/).find(Boolean) || "";
  const relatedFiles = [
    primaryFile,
    ...(parsed?.issues || []).map((i) => i.file).filter(Boolean),
  ].filter((v, idx, arr) => v && arr.indexOf(v) === idx);
  const tags = [classified.category];
  if (classified.source) {
    tags.push(classified.source);
  }
  if (/assert/i.test(primaryMessage)) {
    tags.push("assertion");
  }
  return {
    source: classified.source,
    category: classified.category,
    severity: input?.severity || "medium",
    errorSignature: String(primaryMessage).slice(0, 500),
    rawExcerpt: redacted.slice(0, 2000),
    parsed,
    primaryFile,
    primaryMessage,
    relatedFiles,
    tags,
    rootCause: String(input?.rootCause || parsed?.summary || primaryMessage).slice(0, 500),
    fixSummary: String(input?.fixSummary || input?.fixPlan || "").slice(0, 500),
    ruleText: String(
      input?.ruleText ||
        input?.rule ||
        (primaryFile ? `修复前先检查 ${primaryFile}:${firstIssue?.line || "?"}` : "修复前先阅读首个 error 行")
    ).slice(0, 500),
    preventionPrompt: String(input?.preventionPrompt || "").slice(0, 500),
    verifyCommand: String(input?.verifyCommand || "").slice(0, 200),
  };
}

module.exports = {
  parseErrorEvent,
  classifySourceCategory,
};
