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
      trust: "memory",
      content: truncate(promptContext.text, Math.min(ctxTokens, remaining)),
    });
    remaining -= Math.min(ctxTokens, remaining);
  }

  const structure = projectStructureService.analyzeProjectStructure(root);
  const structureText = JSON.stringify(structure, null, 2);
  const structureTokens = estimateTokens(structureText);
  sections.push({
    type: "structure",
    trust: "untrusted_code",
    content: truncate(structureText, Math.min(structureTokens, 800)),
  });
  remaining -= Math.min(structureTokens, 800);

  try {
    const { detectRepoProfile, formatRepoProfileForContext } = require("./repoProfileService.js");
    const repoProfile = detectRepoProfile(root);
    const repoText = formatRepoProfileForContext(repoProfile);
    const repoTokens = estimateTokens(repoText);
    const repoBudget = Math.min(700, remaining);
    if (repoBudget > 40) {
      sections.push({
        type: "repoProfile",
        trust: "system",
        content: truncate(repoText, repoBudget),
      });
      remaining -= Math.min(repoTokens, repoBudget);
    }
  } catch {
    /* optional */
  }

  try {
    const {
      buildRepoMap,
      retrieveRepoContext,
      formatRepoMapForContext,
    } = require("./repoMapRetriever.js");
    const repoMap = buildRepoMap(root);
    const mapText = formatRepoMapForContext(repoMap);
    const mapBudget = Math.min(700, remaining);
    if (mapText && mapBudget > 40) {
      sections.push({
        type: "repoMap",
        trust: "untrusted_code",
        content: truncate(mapText, mapBudget),
      });
      remaining -= Math.min(estimateTokens(mapText), mapBudget);
    }
    const hybrid = retrieveRepoContext({ root, message, limit: 8 });
    if (hybrid.hits?.length && remaining > 100) {
      const hybridText = JSON.stringify(
        hybrid.hits.map((h) => ({
          path: h.path,
          score: h.score,
          reasons: h.reasons,
          lines: h.lines,
        })),
        null,
        2
      );
      const hb = Math.min(500, remaining);
      sections.push({
        type: "hybridRetrieval",
        trust: "untrusted_code",
        content: truncate(hybridText, hb),
      });
      remaining -= Math.min(estimateTokens(hybridText), hb);
    }
  } catch {
    /* optional */
  }

  try {
    const {
      loadProjectInstructions,
      formatInstructionsForContext,
    } = require("./instructionContextService.js");
    const instr = loadProjectInstructions(root);
    try {
      const { filterInstructionsByPrefs } = require("./instructionCatalogService.js");
      instr.files = filterInstructionsByPrefs(getUserDataPath, instr.files || []);
      instr.order = (instr.files || []).map((f) => f.path);
    } catch {
      /* optional */
    }
    const instrText = formatInstructionsForContext(instr);
    const ib = Math.min(900, remaining);
    if (instrText && ib > 40) {
      sections.push({
        type: "project_instructions",
        trust: "system",
        content: truncate(instrText, ib),
      });
      remaining -= Math.min(estimateTokens(instrText), ib);
    }
  } catch {
    /* optional */
  }

  const symbols = symbolIndexService.findSymbols(root, message, { limit: 20 });
  const symText = JSON.stringify(symbols.slice(0, 15), null, 2);
  const symTokens = estimateTokens(symText);
  sections.push({
    type: "symbols",
    trust: "untrusted_code",
    content: truncate(symText, Math.min(symTokens, 600)),
  });
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
          trust: "lesson",
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
            trust: "system",
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
          trust: "lesson",
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
  sections.push({
    type: "snippets",
    trust: "untrusted_code",
    content: JSON.stringify(snippets, null, 2),
  });

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
          trust: "untrusted_code",
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
