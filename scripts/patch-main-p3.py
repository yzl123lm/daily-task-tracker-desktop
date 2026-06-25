"""Remove extracted blocks from main.js after P3 ipc/session split."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
path = ROOT / "main.js"
lines = path.read_text(encoding="utf-8").splitlines(keepends=True)

IMPORT_BLOCK = """const {
  DEFAULT_AI_BASE,
  DEFAULT_AI_MODEL,
  normalizeModelNameForMiniMax,
  normalizeOpenAiChatBaseUrl,
  normalizeApiKey,
  assertNotMiniMaxLoginJwtAsApiKey,
  allowsChatWithoutApiKey,
  isLocalChatInferenceBaseUrl,
} = require("./main/apiNormalize.js");
const {
  readAISession,
  getActiveProfileCredentials,
  decryptKeyB64,
  encryptKeyToB64,
} = require("./main/aiSessionStore.js");
const { appendMiniMaxErrorHints } = require("./main/miniMaxHints.js");
"""

# 1-based inclusive line ranges to delete (newest first)
RANGES = [
    (2757, 2880),  # embedding-openai handler
    (2464, 2492),  # appendMiniMaxErrorHints
    (433, 597),    # ai session ipc handlers
    (326, 430),    # ai session store functions
    (240, 243),    # settingsPath
    (148, 237),    # api normalize duplicates (keep image aliases 89-146)
    (79, 87),      # MINIMAX_MODEL_ALIASES
    (49, 50),      # DEFAULT_AI_BASE/MODEL const (re-imported)
]

for start, end in sorted(RANGES, reverse=True):
    del lines[start - 1 : end]

text = "".join(lines)
text = text.replace(
    'const { assertSafeId } = require("./utils/ipcValidate.js");\n\n',
    "",
)
text = text.replace(
    "  resolveLocalQwen3AsrModelId,\n  transcribeWithLocalQwen3Asr,\n  runVoiceStep,\n  parseLastJsonLine,\n} = require(\"./main/ollamaRuntime.js\");",
    "  resolveLocalQwen3AsrModelId,\n  transcribeWithLocalQwen3Asr,\n  runVoiceStep,\n  parseLastJsonLine,\n  stripOpenAiV1BaseSuffix,\n  isLikelyOllamaOpenAiBase,\n} = require(\"./main/ollamaRuntime.js\");",
)
marker = '} = require("./main/credentialSettings.js");\n'
if marker in text and IMPORT_BLOCK.strip() not in text:
    text = text.replace(marker, marker + "\n" + IMPORT_BLOCK)

path.write_text(text, encoding="utf-8")
print("main.js lines:", len(text.splitlines()))
