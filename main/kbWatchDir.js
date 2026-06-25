const path = require("path");
const fs = require("fs");
const { BrowserWindow } = require("electron");
const { assertAbsolutePath } = require("../utils/ipcValidate.js");

const WATCH_DEBOUNCE_MS = 1800;
const SUPPORTED_WATCH_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".doc",
  ".docx",
  ".pdf",
  ".xlsx",
  ".xls",
  ".png",
  ".jpg",
  ".jpeg",
  ".bmp",
  ".webp",
  ".tif",
  ".tiff",
  ".csv",
  ".json",
  ".log",
  ".rtf",
  ".html",
  ".htm",
  ".xml",
  ".yml",
  ".yaml",
]);

function isWatchableFile(filePath) {
  const ext = path.extname(String(filePath || "")).toLowerCase();
  return SUPPORTED_WATCH_EXTS.has(ext);
}

function notifyRenderer(payload) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send("kb-watch-event", payload);
    }
  });
}

function createKbWatchService({ ingestFile, loadLibrarySettings, listLibraryIds }) {
  /** @type {Map<string, { watcher: fs.FSWatcher|null, dir: string, enabled: boolean, pending: Map<string, NodeJS.Timeout>, queue: string[], processing: boolean, lastEvent: object|null }>} */
  const states = new Map();

  function getState(libraryId) {
    const id = String(libraryId || "").trim();
    if (!states.has(id)) {
      states.set(id, {
        watcher: null,
        dir: "",
        enabled: false,
        pending: new Map(),
        queue: [],
        processing: false,
        lastEvent: null,
      });
    }
    return states.get(id);
  }

  function stopWatch(libraryId) {
    const st = getState(libraryId);
    if (st.watcher) {
      try {
        st.watcher.close();
      } catch {
        /* ignore */
      }
      st.watcher = null;
    }
    st.pending.forEach((timer) => clearTimeout(timer));
    st.pending.clear();
    st.enabled = false;
  }

  function stopAll() {
    Array.from(states.keys()).forEach((id) => stopWatch(id));
  }

  async function enqueueIngest(libraryId, filePath, reason = "watch") {
    const st = getState(libraryId);
    const fp = path.normalize(String(filePath || ""));
    if (!fp || !isWatchableFile(fp)) {
      return;
    }
    try {
      if (!fs.existsSync(fp) || !fs.statSync(fp).isFile()) {
        return;
      }
    } catch {
      return;
    }
    if (!st.queue.includes(fp)) {
      st.queue.push(fp);
    }
    if (!st.processing) {
      void drainQueue(libraryId);
    }
    st.lastEvent = { at: new Date().toISOString(), filePath: fp, reason, phase: "queued" };
    notifyRenderer({ libraryId, ...st.lastEvent });
  }

  async function drainQueue(libraryId) {
    const st = getState(libraryId);
    if (st.processing) {
      return;
    }
    st.processing = true;
    while (st.queue.length) {
      const fp = st.queue.shift();
      st.lastEvent = { at: new Date().toISOString(), filePath: fp, reason: "ingest", phase: "running" };
      notifyRenderer({ libraryId, ...st.lastEvent });
      try {
        const result = await ingestFile(fp, libraryId);
        st.lastEvent = {
          at: new Date().toISOString(),
          filePath: fp,
          phase: "done",
          ok: result?.ok === true,
          skipped: result?.skipped === true,
          locked: result?.locked === true,
          reason: result?.reason || "",
          name: result?.name || path.basename(fp),
          error: result?.error || "",
        };
      } catch (err) {
        st.lastEvent = {
          at: new Date().toISOString(),
          filePath: fp,
          phase: "error",
          ok: false,
          error: err?.message || String(err),
        };
      }
      notifyRenderer({ libraryId, ...st.lastEvent });
    }
    st.processing = false;
  }

  function scheduleIngest(libraryId, filePath, reason) {
    const st = getState(libraryId);
    const fp = path.normalize(String(filePath || ""));
    if (!fp) {
      return;
    }
    const prev = st.pending.get(fp);
    if (prev) {
      clearTimeout(prev);
    }
    const timer = setTimeout(() => {
      st.pending.delete(fp);
      void enqueueIngest(libraryId, fp, reason);
    }, WATCH_DEBOUNCE_MS);
    st.pending.set(fp, timer);
  }

  function walkFiles(dirPath, recursive, onFile) {
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dirPath, ent.name);
      if (ent.isDirectory()) {
        if (recursive) {
          walkFiles(full, true, onFile);
        }
        continue;
      }
      if (ent.isFile()) {
        onFile(full);
      }
    }
  }

  async function scanDirectory(libraryId, reason = "scan") {
    const settings = loadLibrarySettings(libraryId);
    const dir = String(settings?.watchDirPath || "").trim();
    if (!dir || !fs.existsSync(dir)) {
      return { ok: false, error: "监控目录无效或不存在" };
    }
    const files = [];
    walkFiles(dir, settings?.watchDirRecursive !== false, (fp) => {
      if (isWatchableFile(fp)) {
        files.push(fp);
      }
    });
    for (const fp of files) {
      await enqueueIngest(libraryId, fp, reason);
    }
    return { ok: true, scanned: files.length, libraryId };
  }

  function startWatch(libraryId, dirPath) {
    const id = String(libraryId || "").trim();
    const dir = path.normalize(String(dirPath || ""));
    stopWatch(id);
    if (!dir || !fs.existsSync(dir)) {
      return { ok: false, error: "监控目录不存在" };
    }
    const st = getState(id);
    st.dir = dir;
    st.enabled = true;
    try {
      st.watcher = fs.watch(dir, { recursive: true }, (_eventType, filename) => {
        if (!filename) {
          return;
        }
        const base = String(filename).replace(/\//g, path.sep);
        const full = path.join(dir, base);
        scheduleIngest(id, full, "watch");
      });
    } catch (err) {
      st.enabled = false;
      return { ok: false, error: err?.message || String(err) };
    }
    notifyRenderer({ libraryId: id, phase: "watching", dir, at: new Date().toISOString() });
    return { ok: true, dir };
  }

  async function syncLibrary(libraryId) {
    const id = String(libraryId || "").trim();
    const settings = loadLibrarySettings(id);
    stopWatch(id);
    if (settings?.watchDirEnabled !== true) {
      return { ok: true, watching: false };
    }
    let dir = "";
    try {
      dir = settings?.watchDirPath ? assertAbsolutePath(settings.watchDirPath, { label: "监控目录" }) : "";
    } catch (err) {
      return { ok: false, error: err?.message || "无效监控目录" };
    }
    const started = startWatch(id, dir);
    if (!started.ok) {
      return started;
    }
    await scanDirectory(id, "initial-scan");
    return { ok: true, watching: true, dir };
  }

  async function syncAll() {
    const ids = listLibraryIds();
    const results = [];
    for (const id of ids) {
      results.push({ libraryId: id, ...(await syncLibrary(id)) });
    }
    return results;
  }

  function getLibraryStatus(libraryId) {
    const st = getState(libraryId);
    const settings = loadLibrarySettings(libraryId);
    return {
      libraryId,
      enabled: settings?.watchDirEnabled === true,
      dir: settings?.watchDirPath || st.dir || "",
      watching: Boolean(st.watcher && st.enabled),
      queueLength: st.queue.length,
      processing: st.processing,
      lastEvent: st.lastEvent,
    };
  }

  function getAllStatus() {
    return listLibraryIds().map((id) => getLibraryStatus(id));
  }

  return {
    stopAll,
    stopWatch,
    syncLibrary,
    syncAll,
    scanDirectory,
    getLibraryStatus,
    getAllStatus,
  };
}

module.exports = { createKbWatchService, isWatchableFile };
