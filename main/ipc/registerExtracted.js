const { registerExportHandlers } = require("./exportHandlers");
const { registerLunarHandlers } = require("./lunarHandlers");
const { registerEnvironmentHandlers } = require("./environmentHandlers");
const { registerAiSessionHandlers } = require("./aiSessionHandlers");
const { registerEmbeddingHandlers } = require("./embeddingHandlers");
const { registerModularSettingsHandlers } = require("../credentialSettings");
const { registerOllamaVoiceHandlers } = require("../ollamaRuntime");

function registerExtractedIpcHandlers(ipcMain, { app }) {
  registerExportHandlers(ipcMain);
  registerAiSessionHandlers(ipcMain);
  registerEmbeddingHandlers(ipcMain);
  registerModularSettingsHandlers(ipcMain);
  registerOllamaVoiceHandlers(ipcMain);
  registerLunarHandlers(ipcMain, { app });
  registerEnvironmentHandlers(ipcMain, { app });
}

module.exports = { registerExtractedIpcHandlers };
