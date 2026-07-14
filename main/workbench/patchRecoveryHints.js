/**
 * Actionable recovery hints when stage_patch / read_file fails (greenfield & replace loops).
 */

const fs = require("fs");
const path = require("path");

function isPatchEditFailureMessage(msg) {
  const s = String(msg || "");
  return /replace|锚点|PatchEdit|PATCH_|full_content|create_file|唯一匹配|insert|缺少 op|HTML/i.test(s);
}

function isMissingFileFailure(result) {
  if (!result) return false;
  if (result.code === "FILE_NOT_FOUND" || result.hint === "use_stage_patch") return true;
  return /文件不存在|FILE_NOT_FOUND|ENOENT/i.test(String(result.error || result.code || ""));
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

function collectMissingPathsFromTrace(toolTrace = []) {
  const paths = [];
  for (const t of toolTrace || []) {
    if (t.tool !== "read_file") continue;
    if (!isMissingFileFailure(t.result)) continue;
    const p = String(t.args?.path || t.result?.path || "").replace(/\\/g, "/").trim();
    if (p) paths.push(p);
  }
  return [...new Set(paths)];
}

function buildMissingFileCreateExample(relPath) {
  const name = String(relPath || "new-file.js").replace(/\\/g, "/");
  const isJs = /\.js$/i.test(name);
  const isCss = /\.css$/i.test(name);
  const isHtml = /\.html?$/i.test(name);
  let stub = `// ${name}\n`;
  if (isHtml) {
    stub = `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"/><title>App</title></head><body></body></html>\n`;
  } else if (isCss) {
    stub = `/* ${name} */\n`;
  } else if (isJs && /game\.js$/i.test(name)) {
    stub = `(() => {\n  const canvas = document.getElementById("game-canvas");\n  if (!canvas) return;\n  const ctx = canvas.getContext("2d");\n  // TODO: snake draw / loop\n})();\n`;
  }
  return {
    path: name,
    changeType: "add",
    summary: `新建 ${name}`,
    proposedContent: stub,
  };
}

function buildMissingFileRecoveryNudge(toolTrace = []) {
  const missing = collectMissingPathsFromTrace(toolTrace);
  if (!missing.length) return null;
  const recentMissingReads = (toolTrace || [])
    .slice(-6)
    .filter((t) => t.tool === "read_file" && isMissingFileFailure(t.result));
  if (recentMissingReads.length < 1) return null;

  const examples = missing.slice(0, 3).map((p) => {
    return `- ${p} → stage_patch({ path:"${p}", changeType:"add", proposedContent:"...(完整内容)" })`;
  });

  return [
    "【新建文件提示】检测到对不存在文件的 read_file。",
    "禁止再次 read_file 这些路径；下一步必须 stage_patch 新建：",
    ...examples,
    /game\.js/i.test(missing.join(" "))
      ? "若新建 game.js：同时用 stage_patch 修改 index.html，在 </body> 前加入 <script src=\"./game.js\"></script>。"
      : "",
    "不要调用 git_status / search_code 来绕过新建。",
  ]
    .filter(Boolean)
    .join("\n");
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
    "1) 先 list_files，再 read_file 读取【已存在】文件的真实内容；",
    "2) 新建文件：changeType:\"add\" + proposedContent，或 edits:[{op:\"create_file\",content:\"...\"}]；",
    "3) 修改现有文件：优先 proposedContent / op:full_content 提交完整内容；",
    paths.length ? `4) 本轮涉及路径：${paths.join(", ")}。` : "",
    "贪吃蛇类项目通常需要 index.html + style.css + game.js 三文件联动。",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractMentionedRelPaths(text = "") {
  const msg = String(text || "");
  const found = new Set();
  const re = /\b[\w./-]+\.(?:js|ts|tsx|jsx|css|html|json|md|py)\b/gi;
  let m;
  while ((m = re.exec(msg))) {
    found.add(m[0].replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  const targetLine = msg.match(/目标文件[：:]\s*(.+)/);
  if (targetLine) {
    for (const part of targetLine[1].split(/[,，\s]+/)) {
      const p = part.trim().replace(/\\/g, "/");
      if (/\.\w+$/.test(p)) found.add(p);
    }
  }
  if (/贪吃蛇|snake|canvas|小游戏/i.test(msg)) {
    found.add("index.html");
    found.add("style.css");
    found.add("game.js");
  }
  return [...found];
}

function listMissingProjectFiles(root, candidates = []) {
  const missing = [];
  const base = String(root || "");
  if (!base) return missing;
  for (const rel of candidates) {
    const clean = String(rel || "").replace(/\\/g, "/").replace(/^\.\//, "").trim();
    if (!clean || clean.includes("..")) continue;
    const abs = path.join(base, ...clean.split("/"));
    if (!fs.existsSync(abs)) missing.push(clean);
  }
  return [...new Set(missing)];
}

function buildPreemptiveMissingFilesNote(root, message = "") {
  const candidates = extractMentionedRelPaths(message);
  const missing = listMissingProjectFiles(root, candidates);
  if (!missing.length) return null;
  return [
    "【项目现状 · 缺失文件】以下路径当前不存在，禁止对其 read_file：",
    ...missing.map((p) => `- ${p}`),
    "请直接 stage_patch 新建（changeType:\"add\" + proposedContent）。",
    missing.includes("game.js")
      ? "game.js 为新建逻辑入口；创建后请在 index.html 引入 <script src=\"./game.js\"></script>。"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function messagesAlreadyHaveHint(messages = [], marker) {
  return (messages || []).some(
    (m) => m.role === "user" && String(m.content || "").includes(marker)
  );
}

function shouldDeferNoProgressBlock(toolTrace = [], messages = []) {
  const hasPatch = messagesAlreadyHaveHint(messages, "【补丁恢复提示】");
  const hasMissing = messagesAlreadyHaveHint(messages, "【新建文件提示】");
  if (hasPatch && hasMissing) return false;
  if (!hasMissing && buildMissingFileRecoveryNudge(toolTrace)) return true;
  if (!hasPatch && buildPatchRecoveryNudge(toolTrace)) return true;
  return false;
}

function pickRecoveryNudge(toolTrace = [], messages = []) {
  if (!messagesAlreadyHaveHint(messages, "【新建文件提示】")) {
    const missing = buildMissingFileRecoveryNudge(toolTrace);
    if (missing) return missing;
  }
  if (!messagesAlreadyHaveHint(messages, "【补丁恢复提示】")) {
    return buildPatchRecoveryNudge(toolTrace);
  }
  return null;
}

module.exports = {
  isPatchEditFailureMessage,
  isMissingFileFailure,
  buildPatchFailureRecovery,
  buildPatchRecoveryNudge,
  buildMissingFileRecoveryNudge,
  buildPreemptiveMissingFilesNote,
  extractMentionedRelPaths,
  listMissingProjectFiles,
  buildMissingFileCreateExample,
  shouldDeferNoProgressBlock,
  pickRecoveryNudge,
};
