const crypto = require("crypto");
const { redactSecrets } = require("./redactSecrets.js");

const FINGERPRINT_VERSION = 1;

function normalizeMessage(message) {
  let text = redactSecrets(String(message || "")).toLowerCase();
  text = text
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[uuid]")
    .replace(/\b\d{4}-\d{2}-\d{2}[tT ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?\b/g, "[timestamp]")
    .replace(/\b0x[0-9a-f]+\b/gi, "[hex]")
    .replace(/\b\d{5,}\b/g, "[num]")
    .replace(/[A-Za-z]:\\Users\\[^\\]+/gi, "[user_home]")
    .replace(/\/Users\/[^/\s]+/g, "[user_home]")
    .replace(/\/home\/[^/\s]+/g, "[user_home]")
    .replace(/:\d+(?::\d+)?/g, ":L")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 400);
}

function normalizeFileKind(filePath) {
  const file = String(filePath || "").replace(/\\/g, "/");
  if (!file || file === "*") {
    return "*";
  }
  const base = file.split("/").pop() || file;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) {
    return "file";
  }
  return base.slice(dot + 1).toLowerCase();
}

function extractErrorType(message, category) {
  const text = String(message || "");
  const named = text.match(/\b([A-Z][a-zA-Z]*Error)\b/);
  if (named) {
    return named[1];
  }
  if (/assertion/i.test(text)) {
    return "AssertionError";
  }
  if (/patch|context mismatch|apply.*failed/i.test(text)) {
    return "PatchContextMismatch";
  }
  if (category === "shell_failure") {
    return "ShellError";
  }
  if (category === "test_failure" || category === "test") {
    return "TestFailure";
  }
  if (category === "build_error" || category === "build") {
    return "BuildError";
  }
  return "UnknownError";
}

function extractParserCode(message, parsed) {
  const text = String(message || "");
  const eslint = text.match(/\b([a-z@-]+\/[a-z-]+)\b/);
  if (eslint) {
    return eslint[1];
  }
  const tsCode = text.match(/\bTS\d{4,5}\b/);
  if (tsCode) {
    return tsCode[0];
  }
  const issue = parsed?.issues?.[0];
  if (issue?.ruleCode) {
    return String(issue.ruleCode);
  }
  return "";
}

function extractTopStackSymbol(message, parsed) {
  const text = String(message || "");
  const atFn = text.match(/at\s+([A-Za-z0-9_$.<]+)/);
  if (atFn) {
    return atFn[1].slice(0, 80);
  }
  const issue = parsed?.issues?.[0];
  if (issue?.file) {
    const base = issue.file.split("/").pop() || issue.file;
    return base.replace(/\.[a-z0-9]+$/i, "");
  }
  return "";
}

function buildFingerprint({
  source = "unknown",
  category = "unknown",
  message = "",
  file = "",
  parsed = null,
}) {
  const normalizedErrorType = extractErrorType(message, category);
  const parserCode = extractParserCode(message, parsed);
  const normalizedMessage = normalizeMessage(message);
  const fileKind = normalizeFileKind(file || parsed?.issues?.[0]?.file || "");
  const topStackSymbol = extractTopStackSymbol(message, parsed);
  const fingerprintInput = [
    String(source || "unknown"),
    String(category || "unknown"),
    normalizedErrorType,
    parserCode || "",
    normalizedMessage,
    fileKind,
    topStackSymbol || "",
  ].join("|");
  const fingerprint = crypto
    .createHash("sha256")
    .update(fingerprintInput, "utf8")
    .digest("hex")
    .slice(0, 16);
  return {
    fingerprint,
    fingerprintVersion: FINGERPRINT_VERSION,
    fingerprintInput,
    normalizedErrorType,
    parserCode,
    normalizedMessage,
    fileKind,
    topStackSymbol,
  };
}

module.exports = {
  FINGERPRINT_VERSION,
  buildFingerprint,
  normalizeMessage,
  normalizeFileKind,
  extractErrorType,
};
