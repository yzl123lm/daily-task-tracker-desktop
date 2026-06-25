/**
 * 公文体例 PDF（PDFKit + Windows 系统字体），与 wordFormalExport 共用 Markdown 块解析。
 */

const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const {
  normalizeMarkdownExportInput,
  isHeadingLine,
  parseFormalMarkdownToBlocks,
} = require("./wordFormalExport.js");

const MARGIN_PT = 54;
const LINE_GAP_BODY = 2;

function safeExists(p) {
  try {
    return p && fs.existsSync(p);
  } catch {
    return false;
  }
}

function findTtfByHint(dir, hintRe) {
  try {
    const names = fs.readdirSync(dir);
    for (const n of names) {
      if (!/\.ttf$/i.test(n)) continue;
      if (hintRe.test(n)) return path.join(dir, n);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function resolvePdfFonts() {
  const windir = process.env.WINDIR || process.env.SystemRoot || "C:\\Windows";
  const d = path.join(windir, "Fonts");
  const bundled = path.join(__dirname, "assets", "fonts", "NotoSansSC-Regular.ttf");
  const bundledBold = path.join(__dirname, "assets", "fonts", "NotoSansSC-Bold.ttf");
  /** PDFKit 对 .ttc 支持不完整，仅使用 .ttf */
  const normalCandidates = [
    bundled,
    path.join(d, "msyh.ttf"),
    path.join(d, "simhei.ttf"),
    path.join(d, "simsun.ttf"),
    path.join(d, "simsunb.ttf"),
    path.join(d, "Deng.ttf"),
    path.join(d, "STSONG.TTF"),
    path.join(d, "STXIHEI.TTF"),
  ];
  const boldCandidates = [
    bundledBold,
    path.join(d, "simhei.ttf"),
    path.join(d, "msyhbd.ttf"),
    path.join(d, "simkai.ttf"),
    path.join(d, "STHEITI.TTF"),
  ];
  let normal = normalCandidates.find(safeExists) || null;
  if (!normal) {
    normal = findTtfByHint(d, /yahei|msyh|microsoft|simhei|simsun|deng|noto|song|kai|fang/i);
  }
  let bold = boldCandidates.find(safeExists) || null;
  if (!bold) {
    bold = findTtfByHint(d, /simhei|msyhbd|bold|hei|noto.*bold/i) || normal;
  }
  if (!bold && normal) bold = normal;
  return { normal, bold };
}

function prepareBlocks(markdown, fileTitle) {
  const md = normalizeMarkdownExportInput(String(markdown || ""));
  const firstLine = md.split(/\r?\n/).find((l) => l.trim());
  const startsWithHeading = firstLine && isHeadingLine(firstLine.trim());
  let blocks = parseFormalMarkdownToBlocks(md);
  const ft = String(fileTitle || "").trim();
  if (ft && !startsWithHeading) {
    blocks = [{ type: "heading", level: 1, text: ft }, ...blocks];
  }
  return blocks;
}

/** @returns {{ bold: boolean, ch: string }[]} */
function charsWithBoldRegions(str) {
  const s = String(str ?? "");
  const out = [];
  let bold = false;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === "*" && s[i + 1] === "*") {
      bold = !bold;
      i += 1;
      continue;
    }
    out.push({ ch: s[i], bold });
  }
  return out;
}

function wrapCharLines(doc, fontNormal, fontBold, fontSize, chars, maxW) {
  /** @type {{ bold: boolean, ch: string }[][]} */
  const lines = [];
  let cur = [];
  let w = 0;
  doc.font(fontNormal).fontSize(fontSize);
  const wid = (bold, ch) => {
    doc.font(bold ? fontBold : fontNormal).fontSize(fontSize);
    return doc.widthOfString(ch);
  };
  for (const { ch, bold } of chars) {
    const dw = wid(bold, ch);
    if (w + dw > maxW && cur.length) {
      lines.push(cur);
      cur = [{ ch, bold }];
      w = dw;
    } else {
      cur.push({ ch, bold });
      w += dw;
    }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

function drawStyledLine(doc, lineChars, x, y, fontNormal, fontBold, fontSize) {
  let cx = x;
  let buf = "";
  let bufBold = lineChars.length ? lineChars[0].bold : false;
  const flush = () => {
    if (!buf) return;
    doc.font(bufBold ? fontBold : fontNormal).fontSize(fontSize);
    doc.text(buf, cx, y, { lineBreak: false });
    cx += doc.widthOfString(buf);
    buf = "";
  };
  for (const { ch, bold } of lineChars) {
    if (bold !== bufBold && buf) {
      flush();
      bufBold = bold;
    }
    buf += ch;
  }
  flush();
}

function paragraphLineHeight(doc, fontPath, fontSize) {
  doc.font(fontPath).fontSize(fontSize);
  return doc.currentLineHeight(true) + LINE_GAP_BODY;
}

function drawRichParagraph(doc, text, x, y, usableW, fontNormal, fontBold, fontSize) {
  const chars = charsWithBoldRegions(text);
  const lines = wrapCharLines(doc, fontNormal, fontBold, fontSize, chars, usableW);
  let yy = y;
  const lh = paragraphLineHeight(doc, fontNormal, fontSize);
  for (const line of lines) {
    drawStyledLine(doc, line, x, yy, fontNormal, fontBold, fontSize);
    yy += lh;
  }
  return yy;
}

function drawTable(doc, rows, x, y, width, fonts, fontSize) {
  if (!rows.length) return y;
  const colCount = Math.max(...rows.map((r) => r.length), 1);
  const colW = width / colCount;
  const pad = 5;
  const bodyPt = fontSize - 1;
  const heights = rows.map((row) => {
    let h = bodyPt + pad * 2;
    for (let c = 0; c < colCount; c += 1) {
      const cell = String(row[c] ?? "").replace(/\*\*/g, "");
      doc.font(fonts.normal).fontSize(bodyPt);
      const nh = doc.heightOfString(cell, { width: colW - pad * 2, align: "center" });
      h = Math.max(h, nh + pad * 2);
    }
    return h;
  });
  const totalH = heights.reduce((a, b) => a + b, 0);
  let y0 = y;
  doc.save();
  doc.lineWidth(0.35);
  for (let ri = 0; ri < rows.length; ri += 1) {
    const h = heights[ri];
    let xx = x;
    for (let ci = 0; ci < colCount; ci += 1) {
      const raw = String(rows[ri][ci] ?? "").replace(/\*\*/g, "");
      const isHeader = ri === 0;
      doc.font(isHeader ? fonts.bold : fonts.normal).fontSize(bodyPt);
      doc.text(raw, xx + pad, y0 + pad, { width: colW - pad * 2, align: "center" });
      xx += colW;
    }
    y0 += h;
  }
  const y1 = y + totalH;
  doc.rect(x, y, width, totalH).stroke();
  for (let ci = 1; ci < colCount; ci += 1) {
    const vx = x + ci * colW;
    doc.moveTo(vx, y).lineTo(vx, y1).stroke();
  }
  let hy = y;
  for (let ri = 0; ri < rows.length - 1; ri += 1) {
    hy += heights[ri];
    doc.moveTo(x, hy).lineTo(x + width, hy).stroke();
  }
  doc.restore();
  return y1 + 10;
}

function ensureSpace(doc, y, needH, fonts) {
  const bottom = doc.page.height - MARGIN_PT;
  if (y + needH > bottom) {
    doc.addPage();
    doc.font(fonts.normal);
    return MARGIN_PT;
  }
  return y;
}

/**
 * @param {string} filePath
 * @param {string} markdown
 * @param {{ fileTitle?: string }} [opts]
 */
function writeFormalPdfToPath(filePath, markdown, opts = {}) {
  const fonts = resolvePdfFonts();
  if (!fonts.normal) {
    throw new Error(
      "未找到可用的中文字体文件。请在 Windows 的 C:\\Windows\\Fonts 下安装「微软雅黑(msyh.ttc)」或「宋体/黑体」后再导出 PDF。"
    );
  }

  const blocks = prepareBlocks(markdown, opts.fileTitle);
  const doc = new PDFDocument({
    margin: MARGIN_PT,
    size: "A4",
    info: { Title: String(opts.fileTitle || "").trim() || "导出文档", Creator: "鲸落AI" },
  });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const pageW = doc.page.width - MARGIN_PT * 2;
  let y = MARGIN_PT;

  const sizes = { h1: 17, h2: 14.5, h3: 12.5, body: 11 };

  for (const b of blocks) {
    if (b.type === "separator") {
      y = ensureSpace(doc, y, 16, fonts);
      y += 14;
      continue;
    }

    if (b.type === "table") {
      const est = 24 + b.rows.length * 28;
      y = ensureSpace(doc, y, Math.min(est, 400), fonts);
      y = drawTable(doc, b.rows, MARGIN_PT, y, pageW, fonts, sizes.body);
      continue;
    }

    if (b.type === "heading") {
      const lv = b.level;
      const sz = lv <= 1 ? sizes.h1 : lv === 2 ? sizes.h2 : sizes.h3;
      const center = lv <= 2;
      const plain = String(b.text || "").replace(/\*\*/g, "");
      doc.font(fonts.bold).fontSize(sz);
      const lh = paragraphLineHeight(doc, fonts.bold, sz) + (lv <= 2 ? 6 : 4);
      y = ensureSpace(doc, y, lh + 8, fonts);
      const text = plain;
      if (center) {
        doc.font(fonts.bold).fontSize(sz).text(text, MARGIN_PT, y, {
          width: pageW,
          align: "center",
        });
        y = doc.y + (lv <= 2 ? 10 : 6);
      } else {
        doc.font(fonts.bold).fontSize(sz).text(text, MARGIN_PT, y, { width: pageW, align: "left" });
        y = doc.y + 6;
      }
      continue;
    }

    if (b.type === "paragraph") {
      const sz = sizes.body;
      const lh = paragraphLineHeight(doc, fonts.normal, sz);
      let indent = 0;
      let prefix = "";
      let bodyText = b.text;
      if (b.variant === "bullet") {
        indent = 18;
        prefix = "• ";
      } else if (b.variant === "ordered") {
        indent = 18;
        prefix = `${b.orderNum}. `;
      } else {
        indent = 22;
      }

      const chars = charsWithBoldRegions(prefix + bodyText);
      const lines = wrapCharLines(doc, fonts.normal, fonts.bold, sz, chars, pageW - indent);
      const blockH = lines.length * lh + 4;
      y = ensureSpace(doc, y, blockH, fonts);
      const x0 = MARGIN_PT + indent;
      let yy = y;
      for (const line of lines) {
        drawStyledLine(doc, line, x0, yy, fonts.normal, fonts.bold, sz);
        yy += lh;
      }
      y = yy + 4;
    }
  }

  doc.end();
  return new Promise((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

module.exports = {
  resolvePdfFonts,
  writeFormalPdfToPath,
  prepareBlocks,
};
