const path = require("path");
const fs = require("fs");
const { app, BrowserWindow, shell } = require("electron");
const XLSX = require("xlsx");
const { Document, Packer } = require("docx");
const { buildFormalDocumentChildren, buildChatTurnsDocxChildren } = require("../../wordFormalExport.js");
const { writeFormalPdfToPath } = require("../../pdfFormalExport.js");
const { assertSafeExportBaseName } = require("../../utils/ipcValidate.js");

function normalizeChatTurnsForExport(turns) {
  if (!Array.isArray(turns)) {
    return [];
  }
  return turns
    .map((t, i) => ({
      index: i + 1,
      role: String(t?.role || "unknown"),
      content: String(t?.content || "").trim(),
    }))
    .filter((x) => x.content);
}

function registerExportHandlers(ipcMain) {
  ipcMain.handle("ai-export-document", async (event, payload) => {
    const format = String(payload?.format || "").toLowerCase();
    const directContent = String(payload?.content || "").trim();
    const turns = directContent
      ? [{ index: 1, role: "assistant", content: directContent }]
      : normalizeChatTurnsForExport(payload?.turns);
    if (!turns.length) {
      throw new Error("当前无可导出的 AI 对话内容。");
    }
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
    const userFileName = payload?.fileName ? assertSafeExportBaseName(payload.fileName) : "";
    const safeBaseName = userFileName || `AI对话导出-${ts}`;
    const ext = format === "word" ? "docx" : format === "excel" ? "xlsx" : format === "pdf" ? "pdf" : "";
    if (!ext) {
      throw new Error("不支持的导出格式");
    }
    let filePath = "";
    const target = String(payload?.target || "").toLowerCase();
    if (target === "desktop") {
      const desktop = app.getPath("desktop");
      filePath = path.join(desktop, `${safeBaseName}.${ext}`);
    } else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const save = await require("electron").dialog.showSaveDialog(win || undefined, {
        title: "导出 AI 对话",
        defaultPath: `${safeBaseName}.${ext}`,
        filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
      });
      if (save.canceled || !save.filePath) {
        return { ok: false, canceled: true };
      }
      filePath = save.filePath;
    }

    if (format === "excel") {
      const rows = turns.map((t) => ({ 序号: t.index, 角色: t.role, 内容: t.content }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "AI对话");
      XLSX.writeFile(wb, filePath);
    } else if (format === "word") {
      const role0 = String(turns[0]?.role || "").toLowerCase();
      const singleAssistantLetter =
        !directContent &&
        turns.length === 1 &&
        (role0 === "assistant" || role0 === "助手" || role0 === "ai");
      const children =
        directContent || singleAssistantLetter
          ? buildFormalDocumentChildren(directContent || turns[0].content, { fileTitle: userFileName })
          : buildChatTurnsDocxChildren(turns, { useFormalMarkdown: true });
      const doc = new Document({ sections: [{ children }] });
      const buf = await Packer.toBuffer(doc);
      fs.writeFileSync(filePath, buf);
    } else if (format === "pdf") {
      const role0 = String(turns[0]?.role || "").toLowerCase();
      const singleAssistantLetter =
        !directContent &&
        turns.length === 1 &&
        (role0 === "assistant" || role0 === "助手" || role0 === "ai");
      let md;
      let pdfTitle = userFileName;
      if (directContent) {
        md = directContent;
      } else if (singleAssistantLetter) {
        md = turns[0].content;
      } else {
        const parts = [];
        turns.forEach((t) => {
          parts.push(`## ${t.index}. ${t.role}`);
          parts.push("");
          parts.push(t.content);
          parts.push("");
        });
        md = parts.join("\n");
        pdfTitle = userFileName || "AI对话导出";
      }
      await writeFormalPdfToPath(filePath, md, { fileTitle: pdfTitle });
    }

    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`文件已尝试写入但未在磁盘上找到，请检查杀毒/磁盘权限。路径：${absPath}`);
    }
    const shouldReveal = target === "desktop" && payload?.revealInFolder !== false;
    if (shouldReveal) {
      try {
        shell.showItemInFolder(absPath);
      } catch {
        /* ignore */
      }
    }
    return { ok: true, filePath: absPath, revealedInFolder: shouldReveal };
  });

  ipcMain.handle("task-export-excel", async (event, payload) => {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) {
      throw new Error("当前无可导出的任务数据。");
    }
    const now = new Date();
    const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const userFileName = payload?.fileName ? assertSafeExportBaseName(payload.fileName) : "";
    const safeBaseName = userFileName || `任务列表导出-${ts}`;
    let filePath = "";
    const target = String(payload?.target || "").toLowerCase();
    if (target === "desktop") {
      filePath = path.join(app.getPath("desktop"), `${safeBaseName}.xlsx`);
    } else {
      const win = BrowserWindow.fromWebContents(event.sender);
      const save = await require("electron").dialog.showSaveDialog(win || undefined, {
        title: "导出任务列表",
        defaultPath: `${safeBaseName}.xlsx`,
        filters: [{ name: "Excel", extensions: ["xlsx"] }],
      });
      if (save.canceled || !save.filePath) {
        return { ok: false, canceled: true };
      }
      filePath = save.filePath;
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "任务列表");
    XLSX.writeFile(wb, filePath);
    const absPath = path.resolve(filePath);
    if (target === "desktop") {
      try {
        shell.showItemInFolder(absPath);
      } catch {
        /* ignore */
      }
    }
    return { ok: true, filePath: absPath };
  });
}

module.exports = { registerExportHandlers, normalizeChatTurnsForExport };
