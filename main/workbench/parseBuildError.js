const LINE_COL_RE =
  /(?:^|\s)(?:at\s+)?(?:.*?\()?([A-Za-z]:[\\/][^\s:()]+|[^\s:()]+\.[a-zA-Z]+):(\d+)(?::(\d+))?/g;
const SIMPLE_FILE_LINE = /([^\s:]+\.[a-zA-Z0-9]+):(\d+)(?::(\d+))?/g;

function parseBuildError(stderrOrStdout) {
  const text = String(stderrOrStdout || "");
  const issues = [];
  const seen = new Set();
  let m;
  LINE_COL_RE.lastIndex = 0;
  while ((m = LINE_COL_RE.exec(text)) !== null) {
    const file = m[1].replace(/\\/g, "/");
    const line = Number(m[2]);
    const col = m[3] ? Number(m[3]) : null;
    const key = `${file}:${line}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    issues.push({ file, line, column: col, raw: m[0].trim() });
    if (issues.length >= 20) {
      break;
    }
  }
  if (!issues.length) {
    SIMPLE_FILE_LINE.lastIndex = 0;
    while ((m = SIMPLE_FILE_LINE.exec(text)) !== null) {
      const file = m[1].replace(/\\/g, "/");
      const line = Number(m[2]);
      const key = `${file}:${line}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      issues.push({ file, line, column: m[3] ? Number(m[3]) : null, raw: m[0] });
      if (issues.length >= 20) {
        break;
      }
    }
  }
  const summaryLine =
    text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /error|failed|ERR!/i.test(l)) || text.split(/\r?\n/)[0] || "";
  return { summary: summaryLine.slice(0, 300), issues, raw: text.slice(0, 8000) };
}

module.exports = {
  parseBuildError,
};
