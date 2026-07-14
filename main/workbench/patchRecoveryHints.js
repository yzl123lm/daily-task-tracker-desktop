/**
 * Actionable recovery hints when stage_patch / PatchEdit fails (greenfield & replace loops).
 */

function isPatchEditFailureMessage(msg) {
  const s = String(msg || "");
  return /replace|锚点|PatchEdit|PATCH_|full_content|create_file|唯一匹配|insert/i.test(s);
}

function buildPatchFailureRecovery({
  error,
  filePath,
  originalContent = "",
  args = {},
} = {}) {
  const msg = String(error?.message || error || "");
  const rel = String(filePath || args.path || "").replace(/\\/g, "/");
  const isEmpty = !String(originalContent || "").trim();
  const hints = [];

  if (/唯一匹配，当前 0 处|锚点未找到|insert 锚点未找到/i.test(msg)) {
    hints.push(
      `replace/insert 锚点在 ${rel || "目标文件"} 中未找到。请先 read_file 查看真实内容，不要猜测 DOM/类名。`
    );
    hints.push(
      "推荐改用 proposedContent 提交完整文件，或 edits:[{op:\"full_content\",content:\"...\"}]。"
    );
  }
  if (/不支持的 PatchEdit|缺少 op|疑似把 HTML/i.test(msg)) {
    hints.push(
      "edits 必须是带 op 的补丁操作，不要把 HTML 标签拆成 edits 数组项。请改用 proposedContent 或单一 create_file/full_content。"
    );
  }
  if (/唯一匹配，当前 [2-9]|唯一匹配，当前 \d{2,}/.test(msg)) {
    hints.push("replace 匹配到多处，请改用 replace_range（行号）或 full_content。");
  }
  if (isEmpty || /ENOENT|不是文件|文件不存在/i.test(msg)) {
    hints.push(
      `文件 ${rel || "(未指定)"} 尚不存在。请用 changeType:\"add\" + proposedContent，或 edits:[{op:\"create_file\",content:\"...\"}]。`
    );
  }
  if (/game\.js|canvas|绘制|蛇|贪吃蛇/i.test(String(args.summary || "")) && !/game\.js/i.test(rel)) {
    hints.push("Canvas/游戏逻辑通常写入 game.js，并在 index.html 末尾添加 <script src=\"./game.js\"></script>。");
  }
  if (!hints.length) {
    hints.push("请 read_file 确认现状后，用 proposedContent 或 full_content 重试，避免重复相同 edits。");
  }

  const preview = String(originalContent || "").slice(0, 480);
  return {
    recoveryHint: hints.join(" "),
    filePreview: preview ? `${rel} 前 ${preview.length} 字符预览：\n${preview}` : null,
    suggestFullContent: /唯一匹配|锚点|0 处/.test(msg) || isEmpty,
    suggestCreateFile: isEmpty,
  };
}

function buildPatchRecoveryNudge(toolTrace = []) {
  const recentFails = (toolTrace || [])
    .slice(-8)
    .filter((t) => t.tool === "stage_patch" && t.result?.ok === false);
  if (recentFails.length < 3) {
    return null;
  }
  if (!recentFails.every((t) => isPatchEditFailureMessage(t.result?.error || t.result?.code))) {
    return null;
  }
  const paths = [...new Set(recentFails.map((t) => t.args?.path).filter(Boolean))];
  return [
    "【补丁恢复提示】stage_patch 已连续失败，请勿重复相同 replace 锚点。",
    "1) 先 list_files，再 read_file 读取目标文件真实内容；",
    "2) 新建文件：changeType:\"add\" + proposedContent，或 edits:[{op:\"create_file\",content:\"...\"}]；",
    "3) 修改现有文件：优先 proposedContent / op:full_content 提交完整内容；",
    paths.length ? `4) 本轮涉及路径：${paths.join(", ")}。` : "",
    "贪吃蛇类项目通常需要 index.html + style.css + game.js 三文件联动。",
  ]
    .filter(Boolean)
    .join("\n");
}

function shouldDeferNoProgressBlock(toolTrace = [], messages = []) {
  const nudged = (messages || []).some(
    (m) => m.role === "user" && String(m.content || "").includes("【补丁恢复提示】")
  );
  if (nudged) {
    return false;
  }
  return Boolean(buildPatchRecoveryNudge(toolTrace));
}

module.exports = {
  isPatchEditFailureMessage,
  buildPatchFailureRecovery,
  buildPatchRecoveryNudge,
  shouldDeferNoProgressBlock,
};
