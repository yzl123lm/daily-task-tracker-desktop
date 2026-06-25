/**
 * Quick probe: parse scanned PDF via knowledgeBaseMain parse path.
 * Usage: node scripts/test-pdf-ocr-ingest.js [pdfPath]
 */
const path = require("path");
const fs = require("fs");

const pdfPath =
  process.argv[2] ||
  "E:\\工作文件\\协议汇总\\物流协议\\顺丰\\下订单接口20191261532.pdf";

async function main() {
  if (!fs.existsSync(pdfPath)) {
    console.error("File not found:", pdfPath);
    process.exit(1);
  }
  const buf = fs.readFileSync(pdfPath);
  const { pdfToPng } = require("pdf-to-png-converter");
  const { recognize } = require("tesseract.js");

  const data = await require("pdf-parse")(buf);
  const direct = String(data.text || "").trim();
  console.log("pdf-parse chars:", direct.length, "pages:", data.numpages);

  if (direct) {
    console.log("Has text layer, sample:", direct.slice(0, 120));
    return;
  }

  console.log("No text layer — running OCR pipeline...");
  const pages = await pdfToPng(pdfPath, { viewportScale: 2, verbosityLevel: 0 });
  console.log("Rendered pages:", pages.length);

  const tmpDir = path.join(require("os").tmpdir(), `kb-test-ocr-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const parts = [];
  for (const page of pages) {
    const pngPath = path.join(tmpDir, `p${page.pageNumber}.png`);
    fs.writeFileSync(pngPath, page.content);
    let text = "";
    try {
      text = String((await recognize(pngPath, "chi_sim+eng"))?.data?.text || "");
    } catch {
      text = String((await recognize(pngPath, "eng"))?.data?.text || "");
    }
    parts.push(text.trim());
    console.log(`Page ${page.pageNumber}: ${text.trim().length} chars`);
  }
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const joined = parts.filter(Boolean).join("\n\n");
  console.log("Total OCR chars:", joined.length);
  console.log("Sample:", joined.slice(0, 300));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
