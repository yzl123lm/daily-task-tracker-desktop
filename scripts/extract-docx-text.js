const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const docxPath = process.argv[2];
if (!docxPath || !fs.existsSync(docxPath)) {
  console.error("Usage: node extract-docx-text.js <path-to-docx>");
  process.exit(1);
}

const tmpDir = path.join(__dirname, "_docx_tmp");
fs.mkdirSync(tmpDir, { recursive: true });
const xmlPath = path.join(tmpDir, "document.xml");
try {
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${docxPath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "pipe" }
  );
} catch {
  // docx is zip; Expand-Archive may need .zip extension — copy and rename
  const zipPath = path.join(tmpDir, "doc.zip");
  fs.copyFileSync(docxPath, zipPath);
  execSync(
    `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${tmpDir.replace(/'/g, "''")}' -Force"`,
    { stdio: "pipe" }
  );
}

const xmlFile = path.join(tmpDir, "word", "document.xml");
if (!fs.existsSync(xmlFile)) {
  console.error("document.xml not found");
  process.exit(1);
}
const xml = fs.readFileSync(xmlFile, "utf8");
const text = xml
  .replace(/<w:tab[^/]*\/>/g, "\t")
  .replace(/<\/w:p>/g, "\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&amp;/g, "&");
console.log(text);
