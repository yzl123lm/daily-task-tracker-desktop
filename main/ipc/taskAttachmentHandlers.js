const { BrowserWindow, dialog, shell } = require("electron");
const { assertAbsolutePath } = require("../../utils/ipcValidate.js");
const {
  DEFAULT_ROOT_DIR,
  readSettings,
  writeSettings,
  prepareTaskAttachmentDir,
  resolveTaskAttachmentDir,
  saveBufferFiles,
  copySourceFiles,
  listAttachmentFiles,
  fileToDataUrl,
} = require("../taskAttachments.js");

function registerTaskAttachmentHandlers(ipcMain, { app }) {
  const userDataPath = () => app.getPath("userData");

  ipcMain.handle("task-attachment-get-settings", () => {
    const settings = readSettings(userDataPath());
    return {
      ok: true,
      rootDir: settings.rootDir,
      configuredAt: settings.configuredAt,
      needConfigure: !settings.configuredAt,
      defaultRootDir: DEFAULT_ROOT_DIR,
    };
  });

  ipcMain.handle("task-attachment-set-root", (_event, payload) => {
    try {
      const rootDir = assertAbsolutePath(payload?.rootDir, { label: "任务附件存储目录" });
      const saved = writeSettings(userDataPath(), rootDir);
      return { ok: true, rootDir: saved.rootDir, configuredAt: saved.configuredAt };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-choose-root", async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const current = String(payload?.currentPath || readSettings(userDataPath()).rootDir || DEFAULT_ROOT_DIR).trim();
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "选择任务附件存储根目录",
      defaultPath: current || undefined,
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: res.filePaths[0] };
  });

  ipcMain.handle("task-attachment-pick-files", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "选择附件或图片",
      properties: ["openFile", "multiSelections"],
      filters: [
        { name: "文档与图片", extensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md", "png", "jpg", "jpeg", "gif", "webp", "bmp"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    return { ok: true, paths: res.filePaths };
  });

  ipcMain.handle("task-attachment-prepare-dir", (_event, payload) => {
    try {
      const issueType = String(payload?.issueType || "").trim();
      const taskId = String(payload?.taskId || "").trim();
      const createdAtIsoDate = String(payload?.createdAtIsoDate || "").trim();
      if (!issueType || !taskId) {
        return { ok: false, error: "缺少 issueType 或 taskId" };
      }
      const out = prepareTaskAttachmentDir(userDataPath(), { issueType, createdAtIsoDate, taskId });
      return out;
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-save-buffers", (_event, payload) => {
    try {
      const dir = assertAbsolutePath(payload?.dir, { label: "任务附件目录" });
      const files = Array.isArray(payload?.files) ? payload.files : [];
      const normalized = files
        .map((f) => {
          const name = String(f?.name || "").trim();
          const base64 = String(f?.base64 || "").trim();
          if (!name || !base64) {
            return null;
          }
          return { name, data: Buffer.from(base64, "base64") };
        })
        .filter(Boolean);
      const saved = saveBufferFiles(dir, normalized);
      return { ok: true, saved, dir };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-copy-files", (_event, payload) => {
    try {
      const dir = assertAbsolutePath(payload?.dir, { label: "任务附件目录" });
      const paths = Array.isArray(payload?.paths) ? payload.paths : [];
      const saved = copySourceFiles(dir, paths);
      return { ok: true, saved, dir };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-list", (_event, payload) => {
    try {
      const task = payload?.task && typeof payload.task === "object" ? payload.task : {};
      const dir =
        String(payload?.dir || "").trim() ||
        resolveTaskAttachmentDir(userDataPath(), {
          issueType: task.issueType,
          createdAtIsoDate: task.createdAtIsoDate,
          taskId: task.taskId,
          attachmentDir: task.attachmentDir,
        });
      if (!dir) {
        return { ok: true, dir: "", files: [] };
      }
      const files = listAttachmentFiles(dir).map((f) => ({
        ...f,
        dataUrl: f.isImage ? fileToDataUrl(f.path) : "",
      }));
      return { ok: true, dir, files };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-open-file", async (_event, payload) => {
    try {
      const filePath = assertAbsolutePath(payload?.path, { mustExist: true, label: "附件" });
      const err = await shell.openPath(filePath);
      if (err) {
        return { ok: false, error: err };
      }
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle("task-attachment-show-in-folder", async (_event, payload) => {
    try {
      const filePath = assertAbsolutePath(payload?.path, { mustExist: true, label: "附件" });
      shell.showItemInFolder(filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
}

module.exports = { registerTaskAttachmentHandlers };
