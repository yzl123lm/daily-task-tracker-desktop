/** @deprecated 请使用 environmentHandlers.js；保留空导出以免旧引用报错 */
const { registerEnvironmentHandlers } = require("./environmentHandlers.js");

function registerRuntimeHandlers(ipcMain, ctx) {
  registerEnvironmentHandlers(ipcMain, ctx);
}

module.exports = { registerRuntimeHandlers };
