const fs = require("fs");
const path = require("path");
const projectCodeService = require("./projectCodeService.js");
const { buildPatchPreview } = require("./diffPreviewService.js");

const PATCH_OPS = new Set([
  "replace",
  "replace_range",
  "insert_before",
  "insert_after",
  "delete",
  "create_file",
  "append_file",
  "full_content",
]);

function readOriginal(root, relPath) {
  try {
    return projectCodeService.readProjectFile(root, relPath).content;
  } catch {
    if (String(relPath || "").trim()) {
      return "";
    }
    throw new Error("缺少文件路径");
  }
}

function applyPatchEdits(originalContent, edits) {
  let content = String(originalContent || "");
  const list = Array.isArray(edits) ? edits : [];
  for (const edit of list) {
    const op = String(edit.op || edit.operation || "").toLowerCase();
    if (!PATCH_OPS.has(op)) {
      throw new Error(`不支持的 PatchEdit 操作: ${op}`);
    }
    if (op === "full_content") {
      content = String(edit.content ?? edit.text ?? "");
      continue;
    }
    if (op === "append_file") {
      content += String(edit.content ?? edit.text ?? "");
      continue;
    }
    if (op === "create_file") {
      content = String(edit.content ?? edit.text ?? "");
      continue;
    }
    if (op === "replace") {
      const find = String(edit.find ?? edit.search ?? "");
      if (!find) {
        throw new Error("replace 需要 find");
      }
      const matches = content.split(find).length - 1;
      if (matches !== 1) {
        throw new Error(`replace 需要唯一匹配，当前 ${matches} 处`);
      }
      content = content.replace(find, String(edit.replace ?? edit.content ?? ""));
      continue;
    }
    if (op === "replace_range") {
      const start = Number(edit.startLine ?? edit.start);
      const end = Number(edit.endLine ?? edit.end);
      const lines = content.split(/\r?\n/);
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1 || end < start) {
        throw new Error("replace_range 行号无效");
      }
      const replacement = String(edit.content ?? edit.text ?? "").split(/\r?\n/);
      lines.splice(start - 1, end - start + 1, ...replacement);
      content = lines.join("\n");
      continue;
    }
    if (op === "insert_before" || op === "insert_after") {
      const anchor = String(edit.anchor ?? edit.find ?? "");
      const idx = content.indexOf(anchor);
      if (idx < 0) {
        throw new Error("insert 锚点未找到");
      }
      const insert = String(edit.content ?? edit.text ?? "");
      const pos = op === "insert_before" ? idx : idx + anchor.length;
      content = content.slice(0, pos) + insert + content.slice(pos);
      continue;
    }
    if (op === "delete") {
      const find = String(edit.find ?? edit.search ?? "");
      if (!find) {
        throw new Error("delete 需要 find");
      }
      const matches = content.split(find).length - 1;
      if (matches !== 1) {
        throw new Error(`delete 需要唯一匹配，当前 ${matches} 处`);
      }
      content = content.replace(find, "");
    }
  }
  return content;
}

function scorePatchQuality({ filePath, originalContent, proposedContent, patchEdits, isCreate }) {
  const issues = [];
  let score = 100;
  if (!String(filePath || "").trim()) {
    issues.push("missing_path");
    score -= 50;
  }
  if (proposedContent == null || String(proposedContent) === String(originalContent || "")) {
    issues.push("no_effective_change");
    score -= 40;
  }
  if (String(proposedContent || "").includes("// [PLAN_ONLY 建议]")) {
    issues.push("comment_placeholder_patch");
    score -= 60;
  }
  if (Array.isArray(patchEdits) && patchEdits.length === 0 && !isCreate) {
    issues.push("empty_edits");
    score -= 10;
  }
  if (isCreate && !String(proposedContent || "").trim()) {
    issues.push("empty_create_file");
    score -= 50;
  }
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    applicable: score >= 50 && !issues.includes("comment_placeholder_patch") && !issues.includes("no_effective_change"),
    issues,
  };
}

function buildProposalFromArgs(root, args) {
  const filePath = String(args.path || "").replace(/\\/g, "/");
  if (!filePath) {
    throw new Error("stage_patch 需要 path");
  }
  let originalContent = "";
  const isCreate =
    Array.isArray(args.edits) &&
    args.edits.some((e) => String(e.op || e.operation).toLowerCase() === "create_file");
  try {
    originalContent = projectCodeService.readProjectFile(root, filePath).content;
  } catch (err) {
    if (!isCreate && args.proposedContent == null) {
      throw err;
    }
  }
  let proposedContent;
  let patchEdits = [];
  if (Array.isArray(args.edits) && args.edits.length) {
    patchEdits = args.edits;
    proposedContent = applyPatchEdits(originalContent, patchEdits);
  } else if (args.proposedContent != null) {
    proposedContent = String(args.proposedContent);
  } else {
    throw new Error("stage_patch 需要 edits 或 proposedContent");
  }
  const patchQuality = scorePatchQuality({
    filePath,
    originalContent,
    proposedContent,
    patchEdits,
    isCreate,
  });
  if (!patchQuality.applicable) {
    const err = new Error(`低质量补丁被拒绝：${patchQuality.issues.join(", ") || "unknown"}`);
    err.code = "PATCH_QUALITY_REJECTED";
    err.patchQuality = patchQuality;
    throw err;
  }
  const preview = buildPatchPreview({
    filePath,
    originalContent,
    proposedContent,
    summary: args.summary || "Agent 补丁提议",
  });
  return {
    filePath,
    originalContent,
    proposedContent,
    unifiedDiff: preview.unifiedDiff,
    summary: preview.summary,
    patchEdits,
    patchQuality,
  };
}

function buildProposalFromPatchEdits(root, filePath, edits, summary) {
  return buildProposalFromArgs(root, { path: filePath, edits, summary });
}

module.exports = {
  PATCH_OPS,
  applyPatchEdits,
  scorePatchQuality,
  buildProposalFromArgs,
  buildProposalFromPatchEdits,
};
