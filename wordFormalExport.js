/**
 * 将常见 Markdown（标题、加粗、列表、表格、分隔线）转为 docx 公文/函件体例。
 * 宋体正文、黑体大标题、标题居中、正文首行缩进、表格框线。
 */

const {
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  LineRuleType,
} = require("docx");

const FONT_MAIN = "宋体";
const FONT_HEAD = "黑体";

const SZ_BODY = 32;
const SZ_H3 = 32;
const SZ_H2 = 36;
const SZ_H1 = 44;

const CELL_BORDER = {
  style: BorderStyle.SINGLE,
  size: 1,
  color: "000000",
};

function cellBorders() {
  return {
    top: CELL_BORDER,
    bottom: CELL_BORDER,
    left: CELL_BORDER,
    right: CELL_BORDER,
  };
}

/** 模型常把正文包在 ```markdown … ``` 内，不剥除则整段无法按标题/表格解析 */
function stripOuterCodeFence(text) {
  let s = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!s.startsWith("```")) return s;
  const lines = s.split(/\r?\n/);
  if (lines.length < 2) {
    return s.replace(/^```[a-zA-Z0-9_-]*\s*/, "").replace(/```\s*$/, "").trim();
  }
  let end = -1;
  for (let i = lines.length - 1; i >= 1; i -= 1) {
    if (/^```\s*$/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  const body = end > 0 ? lines.slice(1, end) : lines.slice(1);
  return body.join("\n").replace(/```\s*$/g, "").trim();
}

function normalizeMarkdownExportInput(text) {
  return stripOuterCodeFence(text).replace(/\uFF03/g, "#").replace(/\uFF5C/g, "|");
}

function isHeadingLine(trimmed) {
  return /^#{1,6}\s*\S/.test(trimmed);
}

function parseHeading(trimmed) {
  const m = trimmed.match(/^(#{1,6})\s*(.+)$/);
  if (!m) return null;
  return { level: m[1].length, text: m[2].trim() };
}

function runCjk(text, opts = {}) {
  const { bold = false, size = SZ_BODY, font = FONT_MAIN } = opts;
  return new TextRun({
    text: String(text ?? ""),
    bold,
    size,
    font: { ascii: "Times New Roman", eastAsia: font, hint: "eastAsia" },
  });
}

function runsFromInlineMarkdown(line, baseOpts) {
  const s = String(line ?? "");
  const runs = [];
  const re = /\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      runs.push(runCjk(s.slice(last, m.index), baseOpts));
    }
    runs.push(runCjk(m[1], { ...baseOpts, bold: true }));
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    runs.push(runCjk(s.slice(last), baseOpts));
  }
  if (!runs.length) {
    runs.push(runCjk("", baseOpts));
  }
  return runs;
}

function isTableLine(line) {
  const t = line.trim();
  return t.startsWith("|") && t.includes("|", 1);
}

function parseTableRow(line) {
  const raw = line.trim();
  const inner = raw.startsWith("|") ? raw.slice(1) : raw;
  const cells = inner.split("|").map((c) => c.trim());
  if (cells.length && cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isMdTableSeparatorRow(cells) {
  if (!cells.length) return false;
  return cells.every((c) => /^:?-+:?$/.test(c.replace(/\s/g, "")));
}

function buildTable(rows) {
  if (!rows.length) return null;
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const pct = Math.floor(10000 / colCount) / 100;
  const tableRows = rows.map((cells, ri) => {
    const padded = [...cells];
    while (padded.length < colCount) padded.push("");
    const headerRow = ri === 0;
    return new TableRow({
      children: padded.map(
        (text) =>
          new TableCell({
            borders: cellBorders(),
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            width: { size: pct, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 40, before: 40 },
                children: runsFromInlineMarkdown(text, {
                  size: SZ_BODY - 2,
                  font: FONT_MAIN,
                  bold: headerRow,
                }),
              }),
            ],
          })
      ),
    });
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: tableRows,
  });
}

const BODY_PARA = {
  spacing: { line: 360, lineRule: LineRuleType.AUTO, after: 120, before: 0 },
  indent: { firstLine: 480 },
  alignment: AlignmentType.JUSTIFIED,
};

/**
 * 与 Word/PDF 共用的结构化块（公文 Markdown）
 * @typedef {{ type: 'heading'; level: number; text: string }} FormalBlockHeading
 * @typedef {{ type: 'separator' }} FormalBlockSeparator
 * @typedef {{ type: 'paragraph'; text: string; variant?: 'body'|'bullet'|'ordered'; orderNum?: string }} FormalBlockParagraph
 * @typedef {{ type: 'table'; rows: string[][] }} FormalBlockTable
 * @typedef {FormalBlockHeading|FormalBlockSeparator|FormalBlockParagraph|FormalBlockTable} FormalBlock
 */

/**
 * @param {string} markdown
 * @returns {FormalBlock[]}
 */
function parseFormalMarkdownToBlocks(markdown) {
  const normalized = normalizeMarkdownExportInput(markdown);
  const lines = normalized.split(/\r?\n/);
  /** @type {FormalBlock[]} */
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (isTableLine(trimmed)) {
      const tableRows = [];
      while (i < lines.length && isTableLine(lines[i].trim())) {
        const cells = parseTableRow(lines[i]);
        if (!isMdTableSeparatorRow(cells)) {
          tableRows.push(cells);
        }
        i += 1;
      }
      if (tableRows.length) {
        blocks.push({ type: "table", rows: tableRows });
      }
      continue;
    }

    const hd = parseHeading(trimmed);
    if (hd && hd.text) {
      blocks.push({ type: "heading", level: hd.level, text: hd.text });
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: "separator" });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*]\s+/, "");
      blocks.push({ type: "paragraph", text, variant: "bullet" });
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, "");
      const num = /^\d+/.exec(trimmed)[0];
      blocks.push({ type: "paragraph", text, variant: "ordered", orderNum: num });
      i += 1;
      continue;
    }

    const paraLines = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (isTableLine(t) || isHeadingLine(t) || /^---+$/.test(t) || /^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
        break;
      }
      paraLines.push(lines[i].trim());
      i += 1;
    }
    const merged = paraLines.join(" ").replace(/\s+/g, " ").trim();
    if (merged) {
      blocks.push({ type: "paragraph", text: merged, variant: "body" });
    }
  }

  return blocks;
}

/**
 * @param {FormalBlock[]} blocks
 * @returns {Array<import('docx').Paragraph|import('docx').Table>}
 */
function formalBlocksToDocxChildren(blocks) {
  /** @type {Array<import('docx').Paragraph|import('docx').Table>} */
  const out = [];
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const b = blocks[bi];
    if (b.type === "table") {
      const tbl = buildTable(b.rows);
      if (tbl) out.push(tbl);
      continue;
    }
    if (b.type === "separator") {
      out.push(
        new Paragraph({
          spacing: { before: 160, after: 160 },
          children: [runCjk("")],
        })
      );
      continue;
    }
    if (b.type === "heading") {
      const { level } = b;
      const runs = runsFromInlineMarkdown(b.text, {
        size: level <= 1 ? SZ_H1 : level === 2 ? SZ_H2 : SZ_H3,
        font: level <= 2 ? FONT_HEAD : FONT_MAIN,
        bold: true,
      });
      const center = level <= 2;
      out.push(
        new Paragraph({
          alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: {
            line: 360,
            lineRule: LineRuleType.AUTO,
            before: level <= 2 ? (out.length ? 240 : 0) : 200,
            after: level <= 2 ? 200 : 120,
          },
          indent: center ? {} : { firstLine: 0 },
          children: runs,
        })
      );
      continue;
    }
    if (b.type === "paragraph") {
      if (b.variant === "bullet") {
        out.push(
          new Paragraph({
            ...BODY_PARA,
            indent: { left: 420, hanging: 280, firstLine: 0 },
            children: [runCjk("• ", { size: SZ_BODY }), ...runsFromInlineMarkdown(b.text, { size: SZ_BODY })],
          })
        );
      } else if (b.variant === "ordered") {
        out.push(
          new Paragraph({
            ...BODY_PARA,
            indent: { left: 420, hanging: 280, firstLine: 0 },
            children: [
              runCjk(`${b.orderNum}. `, { size: SZ_BODY }),
              ...runsFromInlineMarkdown(b.text, { size: SZ_BODY }),
            ],
          })
        );
      } else {
        out.push(
          new Paragraph({
            ...BODY_PARA,
            children: runsFromInlineMarkdown(b.text, { size: SZ_BODY }),
          })
        );
      }
    }
  }
  return out;
}

/**
 * @param {string} markdown
 * @param {{ fileTitle?: string }} _opts
 * @returns {Array<import('docx').Paragraph|import('docx').Table>}
 */
function contentMarkdownToFormalDocxChildren(markdown, _opts = {}) {
  return formalBlocksToDocxChildren(parseFormalMarkdownToBlocks(markdown));
}

/**
 * @param {string} markdown
 * @param {{ fileTitle?: string }} opts
 */
function buildFormalDocumentChildren(markdown, opts = {}) {
  const fileTitle = String(opts.fileTitle || "").trim();
  const md = normalizeMarkdownExportInput(markdown);
  const firstNonEmpty = md.split(/\r?\n/).find((l) => l.trim());
  const startsWithHeading = firstNonEmpty && isHeadingLine(firstNonEmpty.trim());

  let children = contentMarkdownToFormalDocxChildren(md, opts);

  if (fileTitle && !startsWithHeading) {
    const titlePara = new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280, before: 0, line: 400, lineRule: LineRuleType.AUTO },
      children: [runCjk(fileTitle, { size: SZ_H1 + 2, font: FONT_HEAD, bold: true })],
    });
    children = [titlePara, ...children];
  }

  return children;
}

/**
 * 对话导出：每条角色一行 + Markdown 正文
 */
function buildChatTurnsDocxChildren(turns, { useFormalMarkdown = true } = {}) {
  const children = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [runCjk("AI 对话导出", { size: SZ_H2, font: FONT_HEAD, bold: true })],
    })
  );
  turns.forEach((t) => {
    children.push(
      new Paragraph({
        spacing: { before: 160, after: 80 },
        children: [runCjk(`${t.index}. ${t.role}`, { size: SZ_BODY, font: FONT_HEAD, bold: true })],
      })
    );
    if (useFormalMarkdown) {
      contentMarkdownToFormalDocxChildren(t.content, {}).forEach((p) => children.push(p));
    } else {
      children.push(
        new Paragraph({
          ...BODY_PARA,
          children: runsFromInlineMarkdown(t.content, { size: SZ_BODY }),
        })
      );
    }
  });
  return children;
}

module.exports = {
  normalizeMarkdownExportInput,
  isHeadingLine,
  parseFormalMarkdownToBlocks,
  formalBlocksToDocxChildren,
  contentMarkdownToFormalDocxChildren,
  buildFormalDocumentChildren,
  buildChatTurnsDocxChildren,
};
