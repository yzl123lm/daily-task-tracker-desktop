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

/**
 * LLM 偶发把 HTML/JSON 正文拆成 edits 数组（无 op，仅有 $text/strong 等键）。
 * 保留带合法 op 的条目；若仅剩 create_file/full_content 等可独立应用的编辑则继续。
 */
function normalizePatchEdits(edits) {
  const list = Array.isArray(edits) ? edits : [];
  const kept = [];
  let dropped = 0;
  for (const edit of list) {
    if (!edit || typeof edit !== "object") {
      dropped += 1;
      continue;
    }
    const op = String(edit.op || edit.operation || "").toLowerCase().trim();
    if (PATCH_OPS.has(op)) {
      kept.push(edit);
      continue;
    }
    // 无 op 的碎片（常见于把 HTML 当 edits 传）
    dropped += 1;
  }
  return { edits: kept, dropped, originalCount: list.length };
}

function applyPatchEdits(originalContent, edits) {
  let content = String(originalContent || "");
  const list = Array.isArray(edits) ? edits : [];
  for (const edit of list) {
    const op = String(edit.op || edit.operation || "").toLowerCase();
    if (!PATCH_OPS.has(op)) {
      const keys = edit && typeof edit === "object" ? Object.keys(edit).slice(0, 8).join(",") : "";
      throw new Error(
        op
          ? `不支持的 PatchEdit 操作: ${op}。可用：${[...PATCH_OPS].join("|")}`
          : `不支持的 PatchEdit 操作：缺少 op 字段${keys ? `（条目键: ${keys}）` : ""}。` +
            "请勿把 HTML/正文拆成 edits 数组；改用 proposedContent 或 edits:[{op:\"full_content\",content:\"...\"}]。"
      );
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
        const preview = content.slice(0, 200).replace(/\s+/g, " ");
        throw new Error(
          matches === 0
            ? `replace 锚点未找到："${find.slice(0, 80)}"。文件约 ${content.length} 字符。` +
              ` 片段：${preview}… 建议 read_file 后改用 proposedContent 或 op:full_content。`
            : `replace 需要唯一匹配，当前 ${matches} 处："${find.slice(0, 60)}"。建议 replace_range 或 full_content。`
        );
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
        throw new Error(
          `insert 锚点未找到："${anchor.slice(0, 80)}"。建议 read_file 确认内容，或改用 full_content/proposedContent。`
        );
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
  const changeType = String(args.changeType || args.change_type || "").toLowerCase();
  const isAddHint = ["add", "create", "new", "create_file"].includes(changeType);
  let edits = Array.isArray(args.edits) ? args.edits.slice() : null;

  // 清洗：丢弃无 op 的 HTML 碎片 edits，避免「不支持的 PatchEdit 操作:」空报错
  if (Array.isArray(edits) && edits.length) {
    const normalized = normalizePatchEdits(edits);
    if (normalized.dropped > 0 && normalized.edits.length) {
      edits = normalized.edits;
    } else if (normalized.dropped > 0 && !normalized.edits.length) {
      // 全部非法：若有 proposedContent 则回退；否则给出可操作错误
      if (args.proposedContent != null) {
        edits = null;
      } else {
        throw new Error(
          `stage_patch 的 edits 共 ${normalized.originalCount} 项均缺少合法 op（疑似把 HTML 正文拆进了 edits）。` +
            "请改用 proposedContent 提交完整文件内容，或 edits:[{op:\"full_content\"|\"create_file\",content:\"...\"}]。"
        );
      }
    }
  }

  // 兼容 LLM 常用 changeType=add：映射为 create_file / proposedContent
  if (isAddHint && (!edits || !edits.length) && args.proposedContent != null) {
    edits = [{ op: "create_file", content: String(args.proposedContent) }];
  } else if (isAddHint && Array.isArray(edits) && edits.length) {
    const hasCreate = edits.some((e) =>
      ["create_file", "full_content"].includes(String(e.op || e.operation || "").toLowerCase())
    );
    if (!hasCreate && args.proposedContent != null) {
      edits = [{ op: "create_file", content: String(args.proposedContent) }, ...edits];
    } else if (!hasCreate) {
      edits = edits.map((e, i) =>
        i === 0 && !e.op && !e.operation ? { ...e, op: "create_file" } : e
      );
    }
  }

  // 仅有 create_file/full_content 且含 content，但模型又塞了 proposedContent 时仍可用 edits
  if (
    Array.isArray(edits) &&
    edits.length === 0 &&
    args.proposedContent != null
  ) {
    edits = null;
  }
  let originalContent = "";
  const isCreate =
    isAddHint ||
    (Array.isArray(edits) &&
      edits.some((e) => String(e.op || e.operation).toLowerCase() === "create_file"));
  try {
    originalContent = projectCodeService.readProjectFile(root, filePath).content;
  } catch (err) {
    if (!isCreate && args.proposedContent == null) {
      throw err;
    }
  }
  let proposedContent;
  let patchEdits = [];
  if (Array.isArray(edits) && edits.length) {
    patchEdits = edits;
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
    isCreate: isCreate || (!originalContent && Boolean(String(proposedContent || "").trim())),
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
  normalizePatchEdits,
  scorePatchQuality,
  buildProposalFromArgs,
  buildProposalFromPatchEdits,
};
