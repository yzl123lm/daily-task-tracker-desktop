function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function estimateMessagesTokens(messages) {
  if (!Array.isArray(messages)) {
    return 0;
  }
  return messages.reduce((sum, m) => sum + estimateTokens(m?.content), 0);
}

function blockTypeFromRole(role, content) {
  const text = String(content || "");
  const lower = text.toLowerCase();
  if (/\b(error|exception|failed)\b/i.test(text) || /失败|报错|异常/.test(text)) {
    return "error";
  }
  if (/\b(test|npm test|pytest|jest)\b/i.test(lower)) {
    return "test_result";
  }
  if (/\b(diff|patch|\.ts|\.js|\.py|function |class )\b/i.test(text)) {
    return "code";
  }
  if (role === "user" && /必须|不要|禁止|务必|一定要/.test(text)) {
    return "constraint";
  }
  if (role === "assistant" && /方案|计划|步骤|建议/.test(text)) {
    return "decision";
  }
  if (role === "user") {
    return "requirement";
  }
  return "chat";
}

module.exports = {
  estimateTokens,
  estimateMessagesTokens,
  blockTypeFromRole,
};
