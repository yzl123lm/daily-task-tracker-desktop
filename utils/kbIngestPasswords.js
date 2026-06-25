const fs = require("fs");
const path = require("path");
const { decodeTextBuffer } = require("./kbRetrieval.js");

function extractPasswordFromHintFileName(fileName) {
  const base = String(fileName || "").trim();
  const patterns = [
    /^密码[:：]?(.+?)\.txt$/i,
    /^password[:：]?(.+?)\.txt$/i,
    /^pwd[:：]?(.+?)\.txt$/i,
  ];
  for (const re of patterns) {
    const m = base.match(re);
    if (m && String(m[1] || "").trim()) {
      return String(m[1]).trim();
    }
  }
  return "";
}

function isPasswordHintTextFile(filePath) {
  const base = path.basename(String(filePath || ""));
  return /\.txt$/i.test(base) && /^(密码|password|pwd)/i.test(base);
}

function readPasswordHintsFromFile(filePath) {
  const hints = [];
  const fromName = extractPasswordFromHintFileName(path.basename(filePath));
  if (fromName) {
    hints.push(fromName);
  }
  try {
    if (!filePath || !fs.existsSync(filePath)) {
      return [...new Set(hints)];
    }
    const buf = fs.readFileSync(filePath);
    if (!buf.length) {
      return [...new Set(hints)];
    }
    const text = decodeTextBuffer(buf).trim();
    if (!text) {
      return [...new Set(hints)];
    }
    text.split(/\r?\n/).forEach((line) => {
      const cleaned = String(line || "")
        .trim()
        .replace(/^密码[:：]\s*/i, "")
        .replace(/^password[:：]\s*/i, "");
      if (cleaned) {
        hints.push(cleaned);
      }
    });
  } catch {
    /* ignore read errors */
  }
  return [...new Set(hints.filter(Boolean))];
}

function collectIngestPasswordHints(filePaths, targetFilePath) {
  const hints = new Set();
  const list = Array.isArray(filePaths) ? filePaths : [];
  list.forEach((fp) => {
    if (!isPasswordHintTextFile(fp)) {
      return;
    }
    readPasswordHintsFromFile(fp).forEach((h) => hints.add(h));
  });
  const targetDir = path.dirname(String(targetFilePath || ""));
  if (targetDir && fs.existsSync(targetDir)) {
    try {
      fs.readdirSync(targetDir).forEach((name) => {
        const full = path.join(targetDir, name);
        if (!isPasswordHintTextFile(full)) {
          return;
        }
        readPasswordHintsFromFile(full).forEach((h) => hints.add(h));
      });
    } catch {
      /* ignore */
    }
  }
  return [...hints];
}

function isEmptyPasswordHintFile(filePath) {
  if (!isPasswordHintTextFile(filePath)) {
    return false;
  }
  try {
    if (!fs.existsSync(filePath)) {
      return false;
    }
    return fs.statSync(filePath).size === 0 && Boolean(extractPasswordFromHintFileName(path.basename(filePath)));
  } catch {
    return false;
  }
}

function isEncryptedDocumentError(err) {
  const msg = String(err?.message || err || "");
  return /password-protected|encryption scheme unsupported|file is password-protected|password required/i.test(msg);
}

function formatIngestParseError(err, ext, filePath) {
  const msg = String(err?.message || err || "未知错误");
  const lower = msg.toLowerCase();
  if (isEncryptedDocumentError(err)) {
    const hints = collectIngestPasswordHints([], filePath);
    const hintText = hints.length ? `已检测到可能的密码：${hints.join(" / ")}` : "未找到同目录密码提示文件（如 密码12345678.txt）";
    return `Excel 已加密。上传时将弹出密码窗口；也可在同目录放置密码提示文件（如 密码12345678.txt）。密码会安全保存，后续检索自动解密。请确认本机已安装 Microsoft Excel 以支持旧版 .xls。`;
  }
  if ((ext === ".txt" || ext === ".md") && /empty|空/.test(lower)) {
    return "文本文件为空，无可入库内容";
  }
  if (isEmptyPasswordHintFile(filePath)) {
    const pwd = extractPasswordFromHintFileName(path.basename(filePath));
    return `密码提示文件为空（密码见文件名：${pwd}），无需单独入库；同目录加密 Excel 将自动尝试该密码`;
  }
  return msg;
}

module.exports = {
  extractPasswordFromHintFileName,
  isPasswordHintTextFile,
  readPasswordHintsFromFile,
  collectIngestPasswordHints,
  isEmptyPasswordHintFile,
  isEncryptedDocumentError,
  formatIngestParseError,
};
