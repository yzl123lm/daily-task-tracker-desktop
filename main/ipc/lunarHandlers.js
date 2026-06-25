const { runLunarCalendarQuery } = require("../../lunarCalendarMain.js");
const { runCnlunarQuery } = require("../../cnlunarMain.js");

function registerLunarHandlers(ipcMain, { app }) {
  ipcMain.handle("lunar-calendar-query", (_event, payload) => {
    try {
      return runLunarCalendarQuery(payload || {});
    } catch (e) {
      return { ok: false, error: e?.message || String(e) };
    }
  });

  ipcMain.handle("cnlunar-calendar-query", (_event, payload) => {
    return runCnlunarQuery(payload || {}, {
      getAppPath: () => app.getAppPath(),
      getUserDataPath: () => app.getPath("userData"),
    });
  });
}

module.exports = { registerLunarHandlers };
