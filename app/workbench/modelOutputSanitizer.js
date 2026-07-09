/** Strip model thinking / tool reasoning from user-visible text. */
function stripModelThinking(text) {
  if (!text) {
    return "";
  }
  let s = String(text);
  s = s.replace(/<think>[\s\S]*?<\/redacted_thinking>/gi, "");
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  s = s.replace(/```think[\s\S]*?```/gi, "");
  s = s.replace(/^\s*思考[:：][\s\S]*?(?=需求理解[:：]|实施步骤[:：]|$)/im, "");
  return s.trim();
}

function sanitizeAgentOutputForUi(output) {
  if (!output || typeof output !== "object") {
    return output;
  }
  const next = { ...output };
  const fields = [
    "summary",
    "requirementUnderstanding",
    "answer",
    "note",
    "fallbackReason",
  ];
  fields.forEach((key) => {
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
  if (Array.isArray(next.affectedFiles)) {
    next.affectedFiles = next.affectedFiles.filter(Boolean);
  }
  return next;
}

function formatUserAgentLog(text) {
  const cleaned = stripModelThinking(text);
  if (!cleaned) {
    return "";
  }
  if (/^[\[{]/.test(cleaned) && cleaned.length > 400) {
    return "Agent 执行完成，详见方案卡片或 Timeline。";
  }
  return cleaned.slice(0, 2000);
}

window.__wbStripModelThinking = stripModelThinking;
window.__wbSanitizeAgentOutputForUi = sanitizeAgentOutputForUi;
window.__wbFormatUserAgentLog = formatUserAgentLog;
