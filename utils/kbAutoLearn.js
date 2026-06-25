const CREDIBILITY = {
  UNCONFIRMED: "unconfirmed",
  CONFIRMED: "confirmed",
  VERIFIED: "verified",
};

const SOURCE_TYPES = {
  CHAT: "chat",
  IMAGE_VISION: "image-vision",
  WEB_VERIFY: "web-verify",
  MANUAL: "manual",
};

const QUEUE_STATUS = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  INGESTED: "ingested",
};

function normalizeSourceType(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (Object.values(SOURCE_TYPES).includes(t)) {
    return t;
  }
  return SOURCE_TYPES.CHAT;
}

function normalizeCredibility(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (Object.values(CREDIBILITY).includes(t)) {
    return t;
  }
  return CREDIBILITY.UNCONFIRMED;
}

function credibilitySearchPenalty(credibility) {
  const c = normalizeCredibility(credibility);
  if (c === CREDIBILITY.VERIFIED) {
    return 0;
  }
  if (c === CREDIBILITY.CONFIRMED) {
    return -0.03;
  }
  return -0.12;
}

function shouldQueueAutoLearn(settings) {
  return settings?.autoLearnRequireConfirm === true;
}

function meetsAutoLearnThreshold(question, answer, settings = {}) {
  const minQ = Math.max(1, Number(settings.autoLearnMinQuestionChars) || 6);
  const minA = Math.max(20, Number(settings.autoLearnMinAnswerChars) || 80);
  const q = String(question || "").trim();
  const a = String(answer || "").trim();
  if (q.length < minQ) {
    return { ok: false, reason: "question-too-short", minQ, minA };
  }
  if (a.length < minA) {
    return { ok: false, reason: "answer-too-short", minQ, minA };
  }
  return { ok: true, minQ, minA };
}

function buildAutoLearnMeta(payload = {}) {
  const question = String(payload.question || payload.query || "").trim();
  const answer = String(payload.answer || payload.reply || "").trim();
  return {
    sourceType: normalizeSourceType(payload.sourceType),
    credibility: normalizeCredibility(payload.credibility || payload.credibilityDefault),
    sessionId: String(payload.sessionId || ""),
    modelName: String(payload.modelName || ""),
    questionPreview: question.slice(0, 200),
    answerPreview: answer.slice(0, 400),
    ingestedAt: payload.ingestedAt || new Date().toISOString(),
    recordId: String(payload.recordId || ""),
  };
}

function formatAutoLearnBadge(meta) {
  if (!meta) {
    return "";
  }
  const source = meta.sourceType || SOURCE_TYPES.CHAT;
  const cred = meta.credibility || CREDIBILITY.UNCONFIRMED;
  const sourceLabel =
    source === SOURCE_TYPES.WEB_VERIFY
      ? "联网核验"
      : source === SOURCE_TYPES.IMAGE_VISION
        ? "识图"
        : source === SOURCE_TYPES.MANUAL
          ? "手动"
          : "对话";
  const credLabel =
    cred === CREDIBILITY.VERIFIED ? "已核验" : cred === CREDIBILITY.CONFIRMED ? "已确认" : "未确认";
  return `${sourceLabel}·${credLabel}`;
}

module.exports = {
  CREDIBILITY,
  SOURCE_TYPES,
  QUEUE_STATUS,
  normalizeSourceType,
  normalizeCredibility,
  credibilitySearchPenalty,
  shouldQueueAutoLearn,
  meetsAutoLearnThreshold,
  buildAutoLearnMeta,
  formatAutoLearnBadge,
};
