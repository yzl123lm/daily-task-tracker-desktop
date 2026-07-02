const { registerExportHandlers } = require("./exportHandlers");
const { registerLunarHandlers } = require("./lunarHandlers");
const { registerEnvironmentHandlers } = require("./environmentHandlers");
const { registerTaskAttachmentHandlers } = require("./taskAttachmentHandlers");
const { registerTaskStoreHandlers } = require("./taskStoreHandlers");
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
  registerTaskAttachmentHandlers(ipcMain, { app });
  registerTaskStoreHandlers(ipcMain, { app });
}

module.exports = { registerExtractedIpcHandlers };
