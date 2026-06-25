"""Remove extracted blocks from main.js and wire modular imports."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "main.js"
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

# 1-based inclusive ranges to delete (bottom-first)
DELETE_RANGES = [
    (4679, 4706),
    (4425, 4677),
    (4001, 4423),
    (3986, 3999),
    (1726, 1843),
    (1620, 1663),
    (1472, 1618),
    (1117, 1148),
    (809, 928),
    (226, 803),
]

def delete_range(start, end):
    del lines[start - 1 : end]

for start, end in DELETE_RANGES:
    delete_range(start, end)

text = "".join(lines)

IMPORT_BLOCK = """
const { createWindow } = require("./main/window.js");
const { registerExtractedIpcHandlers } = require("./main/ipc/registerExtracted.js");
const {
  readOllamaSettings,
  normalizeOllamaHost,
  buildOllamaNativeOptions,
  extractOllamaNativeChatUsage,
  resolveLocalQwen3AsrModelId,
  transcribeWithLocalQwen3Asr,
  runVoiceStep,
  parseLastJsonLine,
} = require("./main/ollamaRuntime.js");
const {
  readASRSettings,
  readTTSSettings,
  readImageSettings,
  readCapabilitySettings,
} = require("./main/credentialSettings.js");
"""

needle = '} = require("./searchPipeline.js");\n'
if needle not in text:
    raise SystemExit("searchPipeline import anchor not found")
text = text.replace(needle, needle + IMPORT_BLOCK, 1)

# Drop requires only used by extracted handlers
for old in [
    'const XLSX = require("xlsx");\n',
    'const { Document, Packer } = require("docx");\n',
    'const { buildFormalDocumentChildren, buildChatTurnsDocxChildren } = require("./wordFormalExport.js");\n',
    'const { writeFormalPdfToPath } = require("./pdfFormalExport.js");\n',
    'const { evaluateRuntimePrerequisites } = require("./runtimePrerequisites.js");\n',
    'const { runLunarCalendarQuery } = require("./lunarCalendarMain.js");\n',
    'const { runCnlunarQuery } = require("./cnlunarMain.js");\n',
]:
    text = text.replace(old, "")

REGISTER = "\nregisterExtractedIpcHandlers(ipcMain, { app });\n\n"
anchor = "registerKnowledgeBaseHandlers(ipcMain, {"
if anchor not in text:
    raise SystemExit("registerKnowledgeBaseHandlers anchor not found")
text = text.replace(anchor, REGISTER + anchor, 1)

path.write_text(text, encoding="utf-8")
print("main.js lines:", len(text.splitlines()))
