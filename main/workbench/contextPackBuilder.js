const projectStructureService = require("./projectStructureService.js");
const symbolIndexService = require("./symbolIndexService.js");
const projectCodeService = require("./projectCodeService.js");
const graphifyContextService = require("./graphifyContextService.js");
const { searchMemories } = require("./contextMemoryService.js");
const { buildTaskNamespace } = require("./namespace.js");

const DEFAULT_TOKEN_BUDGET = 12000;
const CHARS_PER_TOKEN = 4;

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / CHARS_PER_TOKEN);
}

function truncate(text, maxTokens) {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  const s = String(text || "");
  if (s.length <= maxChars) {
    return s;
  }
  return `${s.slice(0, maxChars)}\n…[truncated]`;
}

function buildContextPack({
  root,
  message,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
  promptContext,
  projectId,
  taskId,
  userId,
  getUserDataPath,
}) {
  let remaining = tokenBudget;
  const sections = [];

  if (promptContext?.text) {
    const ctxTokens = estimateTokens(promptContext.text);
    sections.push({
      type: "compressed_context",
      content: truncate(promptContext.text, Math.min(ctxTokens, remaining)),
    });
    remaining -= Math.min(ctxTokens, remaining);
  }

  const structure = projectStructureService.analyzeProjectStructure(root);
  const structureText = JSON.stringify(structure, null, 2);
  const structureTokens = estimateTokens(structureText);
  sections.push({ type: "structure", content: truncate(structureText, Math.min(structureTokens, 800)) });
  remaining -= Math.min(structureTokens, 800);

  const symbols = symbolIndexService.findSymbols(root, message, { limit: 20 });
  const symText = JSON.stringify(symbols.slice(0, 15), null, 2);
  const symTokens = estimateTokens(symText);
  sections.push({ type: "symbols", content: truncate(symText, Math.min(symTokens, 600)) });
  remaining -= Math.min(symTokens, 600);

  if (getUserDataPath && userId && projectId && taskId) {
    try {
      const { retrieveLessonsForContext } = require("./error-lessons/lessonRetriever.js");
      const lessonPack = retrieveLessonsForContext(getUserDataPath, userId, {
        projectId,
        taskId,
        message,
        tokenBudget: 2000,
      });
      if (lessonPack.formattedText) {
        const lessonTokens = estimateTokens(lessonPack.formattedText);
        const targetBudget = Math.min(2500, Math.max(1500, lessonTokens));
        const budget = Math.min(targetBudget, remaining);
        sections.push({
          type: "historicalErrorLessons",
          content: truncate(lessonPack.formattedText, budget),
        });
        remaining -= Math.min(lessonTokens, budget);
      }
      if (lessonPack.preventionText) {
        const prevTokens = estimateTokens(lessonPack.preventionText);
        const prevBudget = Math.min(800, remaining);
        if (prevBudget > 40) {
          sections.push({
            type: "prevention_rules",
            content: truncate(lessonPack.preventionText, prevBudget),
          });
          remaining -= Math.min(prevTokens, prevBudget);
        }
      }
    } catch {
      const ns = buildTaskNamespace(projectId, taskId);
      const lessons = searchMemories(getUserDataPath, userId, {
        namespace: ns,
        query: "error_lesson",
        limit: 5,
      }).filter((m) => m.memoryType === "error_lesson");
      if (lessons.length) {
        const lessonText = lessons.map((m) => `- ${m.content}`).join("\n");
        sections.push({
          type: "historicalErrorLessons",
          content: truncate(lessonText, Math.min(estimateTokens(lessonText), 400)),
        });
        remaining -= Math.min(estimateTokens(lessonText), 400);
      }
    }
  }

  const searchHits = projectCodeService.searchProjectCode(root, message).slice(0, 8);
  const snippets = [];
  for (const hit of searchHits) {
    if (remaining <= 200) {
      break;
    }
    try {
      const file = projectCodeService.readProjectFile(root, hit.path);
      const chunk = truncate(file.content, Math.min(400, remaining));
      const tokens = estimateTokens(chunk);
      snippets.push({ path: hit.path, line: hit.line, content: chunk });
      remaining -= tokens;
    } catch {
      /* skip */
    }
  }
  sections.push({ type: "snippets", content: JSON.stringify(snippets, null, 2) });

  return {
    sections,
    tokenBudget,
    estimatedTokens: sections.reduce((sum, s) => sum + estimateTokens(s.content), 0),
    searchHits,
    symbols,
    structure,
  };
}

async function buildContextPackAsync(options) {
  const pack = buildContextPack(options);
  if (options.appRoot && graphifyContextService.graphifyEnabled()) {
    try {
      const graphify = await graphifyContextService.buildGraphifySummary({
        appRoot: options.appRoot,
        message: options.message,
        tokenBudget: 2000,
      });
      const graphText = graphifyContextService.formatGraphifySection(graphify);
      if (graphText) {
        pack.sections.unshift({
          type: "graphify",
          content: truncate(graphText, 500),
        });
        pack.graphify = graphify;
      }
    } catch {
      pack.graphify = { available: false };
    }
  }
  pack.estimatedTokens = pack.sections.reduce((sum, s) => sum + estimateTokens(s.content), 0);
  return pack;
}

module.exports = {
  DEFAULT_TOKEN_BUDGET,
  buildContextPack,
  buildContextPackAsync,
  estimateTokens,
};
