function buildUnifiedDiff(filePath, oldText, newText) {
  const oldLines = String(oldText || "").split(/\r?\n/);
  const newLines = String(newText || "").split(/\r?\n/);
  const header = [`--- a/${filePath}`, `+++ b/${filePath}`, "@@ -1 +" + newLines.length + " @@"];
  const body = [];
  const max = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < max; i += 1) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n) {
      if (o !== undefined) {
        body.push(` ${o}`);
      }
      continue;
    }
    if (o !== undefined) {
      body.push(`-${o}`);
    }
    if (n !== undefined) {
      body.push(`+${n}`);
    }
  }
  return [...header, ...body].join("\n");
}

function buildPatchPreview({ filePath, originalContent, proposedContent, summary }) {
  const diff = buildUnifiedDiff(filePath, originalContent, proposedContent);
  return {
    filePath,
    summary: summary || "补丁预览（未写入磁盘）",
    unifiedDiff: diff,
    linesAdded: (diff.match(/^\+/gm) || []).length,
    linesRemoved: (diff.match(/^-/gm) || []).length,
    writeApplied: false,
    originalContent: String(originalContent || ""),
    proposedContent: String(proposedContent || ""),
  };
}

function buildFromPatchEdits(root, filePath, edits, summary) {
  const patchProposalService = require("./patchProposalService.js");
  const proposal = patchProposalService.buildProposalFromPatchEdits(root, filePath, edits, summary);
  return buildPatchPreview(proposal);
}

function suggestPatchFromDescription(filePath, originalContent, description) {
  const desc = String(description || "").trim();
  const marker = `// [PLAN_ONLY 建议] ${desc.slice(0, 120)}`;
  const lines = String(originalContent || "").split(/\r?\n/);
  const proposed = [marker, ...lines].join("\n");
  return buildPatchPreview({
    filePath,
    originalContent,
    proposedContent: proposed,
    summary: `在文件顶部插入规划注释：${desc.slice(0, 80)}`,
  });
}

module.exports = {
  buildUnifiedDiff,
  buildPatchPreview,
  buildFromPatchEdits,
  suggestPatchFromDescription,
};
