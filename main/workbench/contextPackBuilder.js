const projectStructureService = require("./projectStructureService.js");
const symbolIndexService = require("./symbolIndexService.js");
const projectCodeService = require("./projectCodeService.js");

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

function buildContextPack({ root, message, tokenBudget = DEFAULT_TOKEN_BUDGET, promptContext }) {
  let remaining = tokenBudget;
  const sections = [];

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

  if (promptContext?.sections) {
    const ctxText = JSON.stringify(promptContext.sections, null, 2);
    sections.push({
      type: "memory",
      content: truncate(ctxText, Math.min(estimateTokens(ctxText), remaining)),
    });
  }

  return {
    sections,
    tokenBudget,
    estimatedTokens: sections.reduce((sum, s) => sum + estimateTokens(s.content), 0),
    searchHits,
    symbols,
    structure,
  };
}

module.exports = {
  DEFAULT_TOKEN_BUDGET,
  buildContextPack,
  estimateTokens,
};
