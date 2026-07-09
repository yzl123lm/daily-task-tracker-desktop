/** Strip model thinking / tool reasoning from user-visible text (shared main + renderer). */
function stripModelThinking(text) {
  if (!text) {
    return "";
  }
  let s = String(text);
  // Closed think / redacted blocks
  s = s.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "");
  s = s.replace(/<\/?redacted_thinking>/gi, "");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Unclosed <think> ... rest of string
  s = s.replace(/<think>[\s\S]*$/gi, "");
  s = s.replace(/<\/think>/gi, "");
  s = s.replace(/```(?:think|thinking)[\s\S]*?```/gi, "");
  s = s.replace(/^\s*思考[:：][\s\S]*?(?=需求理解[:：]|方案[:：]|实施步骤[:：]|$)/im, "");
  s = s.replace(/^\s*\[thinking\][\s\S]*?(?=\n\S|$)/gim, "");
  return s.replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeAgentOutputForUi(output) {
  if (!output || typeof output !== "object") {
    return output;
  }
  const next = { ...output };
  ["summary", "requirementUnderstanding", "answer", "note", "fallbackReason"].forEach((key) => {
    if (typeof next[key] === "string") {
      next[key] = stripModelThinking(next[key]);
    }
  });
  if (Array.isArray(next.plan)) {
    next.plan = next.plan.map((item) => stripModelThinking(item)).filter(Boolean);
  }
  if (Array.isArray(next.risks)) {
    next.risks = next.risks.map((item) => stripModelThinking(item)).filter(Boolean);
  }
  if (Array.isArray(next.testPlan)) {
    next.testPlan = next.testPlan.map((item) => stripModelThinking(item)).filter(Boolean);
  }
  return next;
}

module.exports = {
  stripModelThinking,
  sanitizeAgentOutputForUi,
};
