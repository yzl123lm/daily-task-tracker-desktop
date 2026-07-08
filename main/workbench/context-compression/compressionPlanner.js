const { estimateTokens } = require("./types.js");

function actionForScore(block, { keepLessonFingerprints = [] } = {}) {
  if (block.isPinned || block.type === "constraint" || block.type === "error") {
    return "keep_raw";
  }
  if (
    block.type === "error_lesson" ||
    block.type === "lesson" ||
    (block.lessonFingerprint && keepLessonFingerprints.includes(block.lessonFingerprint))
  ) {
    return "keep_raw";
  }
  const score = Number(block.priorityScore) || 0;
  if (score >= 0.8) {
    return "keep_raw";
  }
  if (score >= 0.55) {
    return "summarize";
  }
  if (score >= 0.3) {
    return "extract_facts";
  }
  if (block.recencyRank <= 3) {
    return "summarize";
  }
  return "drop";
}

function summarizeContent(content, maxLen = 160) {
  const text = String(content || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}…`;
}

function buildCompressionPlan(blocks, { minRecentTurnsKeep = 8, keepLessonFingerprints = [] } = {}) {
  const sorted = [...(blocks || [])];
  const recentIds = new Set(
    sorted.slice(-minRecentTurnsKeep).map((b) => b.id)
  );
  let kept = 0;
  let summarized = 0;
  let dropped = 0;
  const planned = sorted.map((block) => {
    let action = actionForScore(block, { keepLessonFingerprints });
    if (recentIds.has(block.id) && action === "drop") {
      action = "summarize";
    }
    if (action === "keep_raw") {
      kept += 1;
    } else if (action === "drop" || action === "externalize") {
      dropped += 1;
    } else {
      summarized += 1;
    }
    return {
      ...block,
      action,
      plannedContent:
        action === "keep_raw"
          ? block.content
          : action === "drop" || action === "externalize"
            ? ""
            : summarizeContent(block.content),
    };
  });
  return {
    blocks: planned,
    stats: { kept, summarized, dropped, externalized: 0 },
    estimatedTokensAfter: planned.reduce((sum, b) => {
      if (b.action === "drop" || b.action === "externalize") {
        return sum;
      }
      return sum + estimateTokens(b.plannedContent);
    }, 0),
  };
}

module.exports = {
  buildCompressionPlan,
  actionForScore,
  summarizeContent,
};
