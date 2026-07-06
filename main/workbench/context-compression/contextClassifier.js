const { blockTypeFromRole, estimateTokens } = require("./types.js");

function scoreBlock(block) {
  let score = 0.5;
  const type = block.type;
  const text = String(block.content || "");

  if (type === "constraint") {
    score += 0.35;
  }
  if (type === "error") {
    score += 0.25;
  }
  if (type === "requirement") {
    score += 0.2;
  }
  if (type === "decision") {
    score += 0.15;
  }
  if (type === "code" || type === "diff") {
    score += 0.1;
  }
  if (type === "chat" && text.length < 40) {
    score -= 0.2;
  }
  if (/谢谢|好的|收到|明白/.test(text) && text.length < 20) {
    score -= 0.25;
  }
  if (block.recencyRank === 0) {
    score += 0.15;
  } else if (block.recencyRank <= 2) {
    score += 0.08;
  }
  return Math.min(1, Math.max(0, score));
}

function classifyBlocks(messages, { scopeType = "chat" } = {}) {
  const list = Array.isArray(messages) ? messages : [];
  const total = list.length;
  return list.map((msg, idx) => {
    const role = String(msg?.role || "user");
    const content = String(msg?.content || "");
    const type = blockTypeFromRole(role, content);
    const block = {
      id: msg?.id || `blk_${idx}`,
      role,
      content,
      type,
      tokenCount: estimateTokens(content),
      recencyRank: total - 1 - idx,
      scopeType,
      isPinned: type === "constraint" || type === "error",
    };
    block.priorityScore = scoreBlock(block);
    return block;
  });
}

module.exports = {
  classifyBlocks,
  scoreBlock,
};
