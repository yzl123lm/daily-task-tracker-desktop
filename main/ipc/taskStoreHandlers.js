const { readTasksFromFile, writeTasksToFile } = require("../taskStore");

function registerTaskStoreHandlers(ipcMain, { app }) {
  ipcMain.handle("tasks-load", () => {
    const tasks = readTasksFromFile(app.getPath("userData"));
    return { ok: true, tasks };
  });

  ipcMain.handle("tasks-save", (_event, payload) => {
    const tasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    const saved = writeTasksToFile(app.getPath("userData"), tasks);
    return { ok: true, count: saved.tasks.length, updatedAt: saved.updatedAt };
  });
}

module.exports = { registerTaskStoreHandlers };
