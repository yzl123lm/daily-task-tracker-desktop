const TOKEN_PATTERNS = [
  /\b(sk-[a-zA-Z0-9]{20,})\b/g,
  /\b(ghp_[a-zA-Z0-9]{20,})\b/g,
  /\b(gho_[a-zA-Z0-9]{20,})\b/g,
  /\b(xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
  /\b(api[_-]?key\s*[:=]\s*["']?)[a-zA-Z0-9._-]{8,}/gi,
  /\b(bearer\s+)[a-zA-Z0-9._-]{12,}/gi,
  /\b(password\s*[:=]\s*["']?)[^\s"']{4,}/gi,
  /\b(secret\s*[:=]\s*["']?)[^\s"']{4,}/gi,
];

const PATH_PATTERNS = [
  /[A-Za-z]:\\Users\\[^\\]+/g,
  /\/Users\/[^/\s]+/g,
  /\/home\/[^/\s]+/g,
  /C:\\Users\\[^\\]+/gi,
];

function redactSecrets(text) {
  let out = String(text || "");
  for (const re of TOKEN_PATTERNS) {
    out = out.replace(re, (match, prefix) => {
      if (prefix && typeof prefix === "string" && /[:=]/.test(prefix)) {
        return `${prefix}[REDACTED]`;
      }
      return "[REDACTED]";
    });
  }
  for (const re of PATH_PATTERNS) {
    out = out.replace(re, "[USER_HOME]");
  }
  return out;
}

module.exports = {
  redactSecrets,
};
