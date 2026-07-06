const { estimateTokens } = require("./types.js");

function formatSnapshotSection(snapshot) {
  if (!snapshot) {
    return "";
  }
  const parts = [];
  if (snapshot.currentObjective?.text) {
    parts.push(`【当前目标】${snapshot.currentObjective.text}`);
  }
  if (Array.isArray(snapshot.userConstraints) && snapshot.userConstraints.length) {
    parts.push(
      `【用户约束】${snapshot.userConstraints.map((c) => c.text).join("；")}`
    );
  }
  if (Array.isArray(snapshot.nextActions) && snapshot.nextActions.length) {
    parts.push(`【下一步】${snapshot.nextActions.map((a) => a.text).join("；")}`);
  }
  if (Array.isArray(snapshot.currentErrors) && snapshot.currentErrors.length) {
    parts.push(
      `【最新错误】${snapshot.currentErrors.map((e) => e.message).join("；")}`
    );
  }
  if (Array.isArray(snapshot.decisions) && snapshot.decisions.length) {
    parts.push(
      `【决策摘要】${snapshot.decisions.map((d) => d.summary).slice(-3).join("；")}`
    );
  }
  return parts.join("\n");
}

function buildPromptContext({
  snapshot,
  memories,
  recentMessages,
  minRecentTurnsKeep = 8,
}) {
  const snapshotBlock = formatSnapshotSection(snapshot);
  const memoryBlock = (memories || [])
    .slice(0, 12)
    .map((m) => `- [${m.memoryType}] ${m.content}`)
    .join("\n");
  const recent = (recentMessages || []).slice(-minRecentTurnsKeep);
  const recentBlock = recent
    .map((m) => `${m.role === "assistant" ? "助手" : "用户"}: ${m.content}`)
    .join("\n\n");
  const sections = [];
  if (snapshotBlock) {
    sections.push(`--- 压缩快照 ---\n${snapshotBlock}`);
  }
  if (memoryBlock) {
    sections.push(`--- 长期记忆 ---\n${memoryBlock}`);
  }
  if (recentBlock) {
    sections.push(`--- 最近对话 ---\n${recentBlock}`);
  }
  const text = sections.join("\n\n");
  return {
    text,
    tokenEstimate: estimateTokens(text),
    sections: {
      hasSnapshot: Boolean(snapshotBlock),
      memoryCount: (memories || []).length,
      recentTurns: recent.length,
    },
  };
}

module.exports = {
  buildPromptContext,
  formatSnapshotSection,
};
