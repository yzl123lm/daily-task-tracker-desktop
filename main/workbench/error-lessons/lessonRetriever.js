const { getDb } = require("../db.js");
const { resolveUserId } = require("../projectService.js");
const lessonStore = require("./lessonStore.js");
const { buildFingerprint, normalizeMessage } = require("./errorFingerprintService.js");

const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

function scoreLesson(lesson, { message = "", relatedFiles = [], fingerprintHint = "" } = {}) {
  let score = 0;
  const msgNorm = normalizeMessage(message);
  const sigNorm = normalizeMessage(lesson.errorSignature || lesson.ruleText || "");
  if (fingerprintHint && lesson.fingerprint === fingerprintHint) {
    score += 1.0;
  }
  if (lesson.category && msgNorm.includes(String(lesson.category).replace(/_/g, " "))) {
    score += 0.65;
  }
  const files = new Set((lesson.relatedFiles || []).map((f) => String(f).replace(/\\/g, "/")));
  const overlap = (relatedFiles || []).some((f) => files.has(String(f).replace(/\\/g, "/")));
  if (overlap) {
    score += 0.55;
  }
  if (sigNorm && msgNorm && (msgNorm.includes(sigNorm.slice(0, 40)) || sigNorm.includes(msgNorm.slice(0, 40)))) {
    score += 0.45;
  }
  if (lesson.status === "verified") {
    score += 0.3;
  }
  score += 0.2 * Math.log1p(Number(lesson.recurrenceCount) || 1);
  const ageMs = Date.now() - Date.parse(lesson.lastSeenAt || lesson.firstSeenAt || 0);
  if (Number.isFinite(ageMs) && ageMs < 7 * 24 * 3600 * 1000) {
    score += 0.1;
  }
  if (lesson.status === "deprecated") {
    score -= 0.5;
  }
  if (lesson.status === "rejected") {
    score -= 0.3;
  }
  return score;
}

function listScoredLessons(getUserDataPath, projectId, options = {}) {
  const lessons = lessonStore.listForProject(getUserDataPath, projectId, {
    limit: options.limit || 30,
  });
  return lessons
    .map((lesson) => ({
      lesson,
      score: scoreLesson(lesson, options),
    }))
    .sort((a, b) => b.score - a.score);
}

function toLessonRef(lesson) {
  return {
    lessonId: lesson.lessonId,
    fingerprint: lesson.fingerprint,
    status: lesson.status,
    ruleText: String(lesson.ruleText || "").slice(0, 300),
  };
}

function formatLessonSection(verified, candidate) {
  const lines = [];
  if (verified.length) {
    lines.push("# 历史错误经验（必须优先遵守）");
    for (const item of verified) {
      const l = item.lesson;
      lines.push(
        `- [verified][fingerprint: ${l.fingerprint}] 错误类型：${l.category}`,
        `  触发条件：${l.errorSignature || l.rootCause || "同类错误复发"}`,
        `  规避规则：${l.ruleText || "参照历史修复路径"}`,
        `  验证方式：${l.verifyCommand || "运行项目验证脚本"}`,
        ""
      );
    }
  }
  if (candidate.length) {
    lines.push("# 历史错误经验（参考）");
    for (const item of candidate) {
      const l = item.lesson;
      lines.push(
        `- [candidate][fingerprint: ${l.fingerprint}] ${l.category}: ${l.errorSignature || l.ruleText}`,
        ""
      );
    }
  }
  return lines.join("\n").trim();
}

function formatPreventionRules(verified, candidate) {
  const lines = ["# 已知错误规避规则", "生成方案与补丁前必须遵守以下规则："];
  let n = 0;
  for (const item of [...verified, ...candidate]) {
    const l = item.lesson || item;
    const rule = String(l.preventionPrompt || l.prevention_prompt || l.ruleText || "").trim();
    if (!rule) {
      continue;
    }
    n += 1;
    lines.push(`${n}. ${rule.slice(0, 400)}`);
    if (n >= 8) {
      break;
    }
  }
  if (n === 0) {
    return "";
  }
  return lines.join("\n");
}

function retrieveLessonsForContext(
  getUserDataPath,
  userId,
  { projectId, taskId, message = "", relatedFiles = [], tokenBudget = 2000 } = {}
) {
  resolveUserId(userId);
  if (!projectId) {
    return {
      verified: [],
      candidate: [],
      formattedText: "",
      lessonRefs: [],
      estimatedTokens: 0,
    };
  }
  const scored = listScoredLessons(getUserDataPath, projectId, {
    message,
    relatedFiles,
    limit: 40,
  });
  const verified = scored.filter((x) => x.lesson.status === "verified").slice(0, 8);
  const candidate = scored
    .filter((x) => x.lesson.status === "candidate")
    .slice(0, 6);
  let formattedText = formatLessonSection(verified, candidate);
  const minTokens = 1500;
  const maxTokens = 2500;
  let tokens = estimateTokens(formattedText);
  if (tokens > maxTokens) {
    while (tokens > maxTokens && candidate.length) {
      candidate.pop();
      formattedText = formatLessonSection(verified, candidate);
      tokens = estimateTokens(formattedText);
    }
    while (tokens > maxTokens && verified.length > 2) {
      verified.pop();
      formattedText = formatLessonSection(verified, candidate);
      tokens = estimateTokens(formattedText);
    }
    if (tokens > maxTokens) {
      const maxChars = maxTokens * CHARS_PER_TOKEN;
      formattedText = `${formattedText.slice(0, maxChars)}\n…[truncated]`;
      tokens = maxTokens;
    }
  }
  if (tokens < minTokens && scored.length) {
    const extra = scored
      .filter((x) => !verified.includes(x) && !candidate.includes(x))
      .slice(0, 4);
    for (const item of extra) {
      candidate.push(item);
      formattedText = formatLessonSection(verified, candidate);
      tokens = estimateTokens(formattedText);
      if (tokens >= minTokens) {
        break;
      }
    }
  }
  const lessonRefs = [...verified, ...candidate].map((x) => toLessonRef(x.lesson));
  const preventionText = formatPreventionRules(verified, candidate);
  return {
    verified: verified.map((x) => x.lesson),
    candidate: candidate.map((x) => x.lesson),
    formattedText,
    preventionText,
    lessonRefs,
    estimatedTokens: estimateTokens(formattedText) + estimateTokens(preventionText),
  };
}

function getLessonRefsForSnapshot(
  getUserDataPath,
  userId,
  { projectId, taskId, message = "", relatedFiles = [] } = {}
) {
  const result = retrieveLessonsForContext(getUserDataPath, userId, {
    projectId,
    taskId,
    message,
    relatedFiles,
    tokenBudget: 2000,
  });
  return result.lessonRefs.slice(0, 12);
}

function getHighRecurrenceVerifiedFingerprints(getUserDataPath, projectId, minRecurrence = 2) {
  const db = getDb(getUserDataPath);
  return db
    .prepare(
      `SELECT fingerprint FROM error_lessons
       WHERE project_id = ? AND status = 'verified' AND recurrence_count >= ?
       ORDER BY recurrence_count DESC, last_seen_at DESC
       LIMIT 20`
    )
    .all(String(projectId), Number(minRecurrence) || 2)
    .map((row) => row.fingerprint);
}

module.exports = {
  retrieveLessonsForContext,
  getLessonRefsForSnapshot,
  getHighRecurrenceVerifiedFingerprints,
  scoreLesson,
  formatLessonSection,
  formatPreventionRules,
  toLessonRef,
};
