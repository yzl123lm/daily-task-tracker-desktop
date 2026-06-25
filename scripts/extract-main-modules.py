"""Extract ollama/voice runtime from main.js into main/ollamaRuntime.js"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
lines = (ROOT / "main.js").read_text(encoding="utf-8").splitlines()

def grab(start, end):
    return lines[start - 1 : end]

body = []
body += grab(227, 302)
body += grab(304, 476)
body += grab(478, 607)
body += grab(609, 803)
body += grab(4001, 4423)

ipc_block = ["function registerOllamaVoiceHandlers(ipcMain) {", *grab(4425, 4677), "}"]

header = """const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { app } = require("electron");

"""

footer = """
module.exports = {
  readOllamaSettings,
  writeOllamaSettings,
  normalizeOllamaHost,
  buildOllamaNativeOptions,
  extractOllamaNativeChatUsage,
  ollamaFetchJson,
  runVoiceStep,
  buildOllamaHardwareRecommendPayload,
  buildCpuLocalLlmHintPayload,
  registerOllamaVoiceHandlers,
};
"""

out = header + "\n".join(body) + "\n\n" + "\n".join(ipc_block) + footer
(ROOT / "main" / "ollamaRuntime.js").write_text(out + "\n", encoding="utf-8")
print("ollamaRuntime.js lines:", len(out.splitlines()))
