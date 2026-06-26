const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
const { TextDecoder } = require("util");
const { dialog, BrowserWindow, shell, app } = require("electron");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const XLSX = require("xlsx");
const WordExtractor = require("word-extractor");
const { recognize } = require("tesseract.js");
const {
  formatOllamaEmbedError,
  ollamaModelNameMatches,
  buildOllamaEmbedErrorCtx,
} = require("./utils/ollamaEmbedError.js");
const { buildOllamaEmbedPayload, readOllamaSettings: readOllamaSettingsFromRuntime, inspectOllamaEmbedDevice, warmOllamaEmbedModel, fetchOllamaEmbedJson } = require("./main/ollamaRuntime.js");
const { assertAbsolutePath, assertUuid, assertKbLibraryId, assertAccessibleFilePath, assertMaxBase64Size } = require("./utils/ipcValidate.js");
const { sanitizePreviewHtml } = require("./utils/sanitizeHtml.js");
const {
  collectIngestPasswordHints,
  isEmptyPasswordHintFile,
  extractPasswordFromHintFileName,
  isPasswordHintTextFile,
  formatIngestParseError,
  isEncryptedDocumentError,
} = require("./utils/kbIngestPasswords.js");
const { saveDocumentPassword, getPasswordsForFile } = require("./utils/kbDocPasswordVault.js");
const { DEFAULT_KB_RETRIEVAL_SETTINGS, normalizeKbSettings, validateKbSettings } = require("./utils/kbConfigLayout.js");
const { runKbModelHealthCheck, buildKbModelHealthDiagnostics } = require("./utils/kbModelHealth.js");
const {
  computeFileMd5,
  decodeTextBuffer,
  chunkText,
  cosineSimilarity,
  vectorScoreFromDistance,
  classifyQuery,
  inferQueryProfile,
  buildChunkIndexText,
  formatEmbeddingInput,
  scanChunksByKeyword,
  scanMetadataHits,
  mergeAndFuseHits,
  hitMeetsMinScore,
  resolveCandidateK,
  computeChunkHash,
  detectDocKind,
  buildChunkSpecs,
  planChunkIncrementalUpdate,
  shouldExpandAdjacentChunks,
  expandAdjacentChunkHits,
  expandSectionRangeChunkHits,
  finalizeAgentSearchHits,
  isTocLikeChunk,
  isRevisionHistoryLikeChunk,
  isApiSpecQuery,
  KEYWORD_RECALL_LIMIT,
  extractDocumentReferenceCodes,
} = require("./utils/kbRetrieval.js");
const {
  loadStoreFromSqlite,
  loadStoreForSearch: loadStoreForSearchFromSqlite,
  countLibraryChunks,
  sampleEmbeddingDim,
  hydrateChunkEmbeddings,
  closeLibraryDb,
  closeAllLibraryDbs,
  saveStoreToSqlite,
  migrateJsonStoreIfNeeded,
  checkIndexHealth,
  appendSearchLog,
  upsertIngestJob,
  enqueueAutoLearn,
  getAutoLearnQueueItem,
  listAutoLearnQueue,
  updateAutoLearnQueueItem,
  appendAutoLearnAudit,
  listAutoLearnAudit,
  listSearchLogs,
  listIngestJobs,
  countAutoLearnQueue,
  sqliteDbPath,
} = require("./utils/kbSqliteStore.js");
const {
  CREDIBILITY,
  SOURCE_TYPES,
  QUEUE_STATUS,
  shouldQueueAutoLearn,
  meetsAutoLearnThreshold,
  buildAutoLearnMeta,
  normalizeCredibility,
} = require("./utils/kbAutoLearn.js");
const {
  loadFtsIndex,
  saveFtsIndex,
  rebuildFtsIndex,
  upsertChunkInIndex,
  removeDocFromFtsIndex,
  searchFtsIndex,
} = require("./utils/kbFtsIndex.js");
const { createKbWatchService } = require("./main/kbWatchDir.js");
const { rerankSearchHits } = require("./utils/kbRerank.js");

const KB_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

function kbAllowedReadRoots() {
  return [
    app.getPath("home"),
    app.getPath("documents"),
    app.getPath("desktop"),
    app.getPath("downloads"),
    app.getPath("userData"),
    os.tmpdir(),
  ].filter(Boolean);
}

let _lancedb = null;

const LANCE_CONNECT_TIMEOUT_MS = 30000;
const LANCE_MIGRATE_TIMEOUT_MS = 120000;
const LANCE_SEARCH_TIMEOUT_MS = 60000;
const KB_SEARCH_HANDLER_TIMEOUT_MS = 360000;

let kbSearchInFlight = 0;
let kbEmbedWarmAbort = null;

function isEmbedTimeoutError(err) {
  const name = String(err?.name || "");
  const msg = String(err?.message || err || "");
  return name === "TimeoutError" || name === "AbortError" || /超时|timeout/i.test(msg);
}

function withKbOpTimeout(promise, ms, label) {
  const budget = Math.max(1000, Number(ms) || 60000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`${label}超时（>${Math.round(budget / 1000)}s）`)),
        budget
      );
    }),
  ]);
}

function abortPendingEmbedWarm() {
  if (kbEmbedWarmAbort) {
    try {
      kbEmbedWarmAbort.abort();
    } catch {
      /* ignore */
    }
    kbEmbedWarmAbort = null;
  }
}

function getLanceDb() {
  if (_lancedb) {
    return _lancedb;
  }
  try {
    _lancedb = require("@lancedb/lancedb");
    return _lancedb;
  } catch (err) {
    const reason = err?.message || String(err);
    throw new Error(`LanceDB 运行时未就绪：${reason}`);
  }
}

const KB_SUBFOLDER_NAMES = ["鲸落AI-知识库", "每日工作任务记录工具-知识库"];

function kbMetaExists(dir) {
  return (
    fs.existsSync(path.join(dir, "kb-meta.json")) || fs.existsSync(path.join(dir, "libraries"))
  );
}

function countKbRootChunks(root) {
  try {
    if (!fs.existsSync(path.join(root, "kb-meta.json"))) {
      return 0;
    }
    const meta = JSON.parse(fs.readFileSync(path.join(root, "kb-meta.json"), "utf8"));
    const libs = Array.isArray(meta.libraries) ? meta.libraries : [];
    let total = 0;
    for (const lib of libs) {
      total += countLibraryChunks(path.join(root, "libraries", String(lib.id || "")));
    }
    return total;
  } catch {
    return 0;
  }
}

function collectKbRootCandidates(raw) {
  const base = String(raw || "").trim();
  const out = new Set();
  if (!base) {
    return [];
  }
  if (kbMetaExists(base)) {
    out.add(path.resolve(base));
  }
  for (const name of KB_SUBFOLDER_NAMES) {
    const direct = path.join(base, name);
    if (kbMetaExists(direct)) {
      out.add(path.resolve(direct));
    }
  }
  try {
    const entries = fs.readdirSync(base, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) {
        continue;
      }
      const sub = path.join(base, ent.name);
      if (kbMetaExists(sub)) {
        out.add(path.resolve(sub));
      }
      for (const name of KB_SUBFOLDER_NAMES) {
        const nested = path.join(sub, name);
        if (kbMetaExists(nested)) {
          out.add(path.resolve(nested));
        }
      }
    }
  } catch {
    /* ignore unreadable custom root */
  }
  return Array.from(out);
}

function kbCustomSubfolderPath(raw) {
  const base = String(raw || "").trim();
  if (!base) {
    return "";
  }
  const candidates = collectKbRootCandidates(base);
  if (!candidates.length) {
    return path.join(base, KB_SUBFOLDER_NAMES[0]);
  }
  candidates.sort((a, b) => countKbRootChunks(b) - countKbRootChunks(a));
  return candidates[0];
}

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"]);
const CANONICAL_KB_EXTS = new Set([
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
]);
const AUTO_TEXT_EXTS = new Set([".csv", ".json", ".log", ".rtf", ".html", ".htm", ".xml", ".yml", ".yaml"]);

function lanceRoot(userDataPath) {
  return path.join(kbRoot(userDataPath), "lancedb");
}

function tableNameForLibrary(libraryId) {
  const raw = String(libraryId || "default").trim().toLowerCase();
  const normalized = raw.replace(/[^a-z0-9_.-]+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (normalized) {
    return `kb_chunks_${normalized}`;
  }
  const fallbackHash = crypto.createHash("sha1").update(raw || "default").digest("hex").slice(0, 24);
  return `kb_chunks_lib_${fallbackHash}`;
}

function sqlQuote(str) {
  return `'${String(str || "").replace(/'/g, "''")}'`;
}

function normalizeEmbedding(emb, model) {
  if (!Array.isArray(emb) || !emb.length) {
    throw new Error(`嵌入模型「${model || "未知"}」返回了空向量，请确认该模型支持 embeddings（例如 bge-m3）`);
  }
  const vector = emb.map((v) => Number(v));
  if (!vector.every((n) => Number.isFinite(n))) {
    throw new Error(`嵌入模型「${model || "未知"}」返回了非数值向量，无法入库`);
  }
  return vector;
}

function decodeHtmlEntities(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlLikeToText(text) {
  return decodeHtmlEntities(
    String(text || "")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function rtfToText(text) {
  return String(text || "")
    .replace(/\\par[d]?/gi, "\n")
    .replace(/\\tab/gi, "  ")
    .replace(/\\'[0-9a-fA-F]{2}/g, " ")
    .replace(/\\[a-z]+-?\d* ?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function looksLikeReadableText(text) {
  const s = String(text || "").trim();
  if (!s) {
    return false;
  }
  const controlCount = (s.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return controlCount / Math.max(1, s.length) < 0.01;
}

function sanitizeFilenameBase(input) {
  return String(input || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 96);
}

function saveNormalizedTextArtifact(userDataPath, libraryId, sourcePath, text) {
  const root = path.join(kbRoot(userDataPath), "normalized", String(libraryId || "default"));
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const base = sanitizeFilenameBase(path.basename(sourcePath, path.extname(sourcePath))) || `doc_${Date.now()}`;
  const out = path.join(root, `${base}.normalized.txt`);
  fs.writeFileSync(out, String(text || ""), "utf8");
  return out;
}

async function openLibraryLanceTable(userDataPath, libraryId) {
  const root = lanceRoot(userDataPath);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const db = await getLanceDb().connect(root);
  const tableName = tableNameForLibrary(libraryId);
  const names = await db.tableNames();
  if (!names.includes(tableName)) {
    return null;
  }
  return db.openTable(tableName);
}

async function migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId, store) {
  const st = store || loadStore(userDataPath, libraryId);
  const root = lanceRoot(userDataPath);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  const db = await withKbOpTimeout(getLanceDb().connect(root), LANCE_CONNECT_TIMEOUT_MS, "LanceDB 连接");
  const tableName = tableNameForLibrary(libraryId);
  const names = await withKbOpTimeout(db.tableNames(), LANCE_CONNECT_TIMEOUT_MS, "LanceDB 列表");
  let table = names.includes(tableName) ? await withKbOpTimeout(db.openTable(tableName), LANCE_CONNECT_TIMEOUT_MS, "LanceDB 打开表") : null;
  if (table) {
    return table;
  }
  const rows = (st.chunks || [])
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      id: c.id,
      libraryId: String(libraryId),
      docId: c.docId,
      docName: c.docName,
      text: c.text,
      embedding: c.embedding,
    }));
  if (!rows.length) {
    return null;
  }
  table = await withKbOpTimeout(
    db.createTable(tableName, rows, { mode: "create", existOk: true }),
    LANCE_MIGRATE_TIMEOUT_MS,
    "LanceDB 建索引"
  );
  return table;
}

async function lanceCountChunks(userDataPath, libraryId, fallbackStore) {
  try {
    const table = await migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId, fallbackStore);
    return await table.countRows();
  } catch {
    return Array.isArray(fallbackStore?.chunks) ? fallbackStore.chunks.length : 0;
  }
}

async function lanceDeleteByDocId(userDataPath, libraryId, docId) {
  const table = await migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId);
  if (!table) {
    return;
  }
  await table.delete(`docId = ${sqlQuote(docId)}`);
}

async function lanceDeleteByChunkId(userDataPath, libraryId, chunkId) {
  const table = await migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId);
  if (!table) {
    return;
  }
  await table.delete(`id = ${sqlQuote(chunkId)}`);
}

async function lanceAppendChunks(userDataPath, libraryId, chunks) {
  const rows = (chunks || [])
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((c) => ({
      id: c.id,
      libraryId: String(libraryId),
      docId: c.docId,
      docName: c.docName,
      text: c.text,
      embedding: c.embedding,
    }));
  if (!rows.length) {
    throw new Error("入库失败：未生成可用向量（embedding 为空）");
  }
  let table = await migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId);
  if (!table) {
    const root = lanceRoot(userDataPath);
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
    const db = await getLanceDb().connect(root);
    table = await db.createTable(tableNameForLibrary(libraryId), rows, { mode: "create", existOk: true });
    return;
  }
  await table.add(rows, { mode: "append" });
}

async function dropLanceTable(userDataPath, libraryId) {
  const root = lanceRoot(userDataPath);
  if (!fs.existsSync(root)) {
    return;
  }
  const db = await getLanceDb().connect(root);
  const tableName = tableNameForLibrary(libraryId);
  const names = await db.tableNames();
  if (names.includes(tableName)) {
    await db.dropTable(tableName);
  }
}

async function lanceSearchByEmbedding(userDataPath, libraryId, queryVec, topK) {
  const table = await migrateLibraryChunksToLanceIfNeeded(userDataPath, libraryId);
  if (!table) {
    return [];
  }
  const rows = await withKbOpTimeout(
    table.vectorSearch(queryVec).limit(topK).toArray(),
    LANCE_SEARCH_TIMEOUT_MS,
    "向量检索"
  );
  return (rows || []).map((r) => ({
    score: vectorScoreFromDistance(r._distance, queryVec, r.embedding),
    docName: r.docName,
    docId: r.docId,
    chunkId: r.id,
    text: r.text,
  }));
}

function kbStorageSettingsPath(userDataPath) {
  return path.join(userDataPath, "kb-storage-settings.json");
}

function readKbStorageSettings(userDataPath) {
  const defaults = { customRoot: "", resolvedKbRoot: "" };
  const p = kbStorageSettingsPath(userDataPath);
  if (!fs.existsSync(p)) {
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      customRoot: String(raw?.customRoot || "").trim(),
      resolvedKbRoot: String(raw?.resolvedKbRoot || "").trim(),
    };
  } catch {
    return defaults;
  }
}

function writeKbStorageSettings(userDataPath, next) {
  const p = kbStorageSettingsPath(userDataPath);
  const prev = readKbStorageSettings(userDataPath);
  const obj = {
    customRoot: next?.customRoot != null ? String(next.customRoot || "").trim() : prev.customRoot,
    resolvedKbRoot:
      next?.resolvedKbRoot != null ? String(next.resolvedKbRoot || "").trim() : prev.resolvedKbRoot,
  };
  fs.writeFileSync(p, JSON.stringify(obj), "utf8");
}

function resolvePinnedKbRoot(userDataPath) {
  const st = readKbStorageSettings(userDataPath);
  const raw = String(st.customRoot || "").trim();
  if (!raw) {
    return "";
  }
  const pinned = String(st.resolvedKbRoot || "").trim();
  if (pinned && kbMetaExists(pinned)) {
    return pinned;
  }
  const resolved = kbCustomSubfolderPath(raw);
  if (resolved) {
    writeKbStorageSettings(userDataPath, { resolvedKbRoot: resolved });
  }
  return resolved;
}

function kbRootDetails(userDataPath) {
  const st = readKbStorageSettings(userDataPath);
  const raw = String(st.customRoot || "").trim();
  if (!raw) {
    return { root: path.join(userDataPath, "knowledge-base"), customRoot: "", mode: "default" };
  }
  const modern = resolvePinnedKbRoot(userDataPath) || kbCustomSubfolderPath(raw);
  const modernHasData = fs.existsSync(path.join(modern, "kb-meta.json")) || fs.existsSync(path.join(modern, "libraries"));
  const directHasData = fs.existsSync(path.join(raw, "kb-meta.json")) || fs.existsSync(path.join(raw, "libraries"));
  if (modernHasData || !directHasData) {
    return { root: modern, customRoot: raw, mode: modernHasData ? "custom-modern" : "custom-modern-new" };
  }
  return { root: raw, customRoot: raw, mode: "custom-legacy-direct" };
}

function kbRoot(userDataPath) {
  return kbRootDetails(userDataPath).root;
}

function copyIfAbsent(src, dst) {
  if (!fs.existsSync(src) || fs.existsSync(dst)) {
    return;
  }
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.cpSync(src, dst, { recursive: true });
    return;
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function migrateLegacyKbDataIfNeeded(userDataPath, targetRoot) {
  if (fs.existsSync(path.join(targetRoot, "kb-meta.json"))) {
    return "";
  }
  const st = readKbStorageSettings(userDataPath);
  const rawCustom = String(st.customRoot || "").trim();
  const candidates = [
    path.join(userDataPath, "knowledge-base"),
    rawCustom,
    rawCustom ? kbCustomSubfolderPath(rawCustom) : "",
    ...(rawCustom ? KB_SUBFOLDER_NAMES.map((name) => path.join(rawCustom, name)) : []),
  ]
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .filter((x, i, arr) => arr.indexOf(x) === i)
    .filter((x) => path.resolve(x) !== path.resolve(targetRoot));
  for (const c of candidates) {
    if (!fs.existsSync(path.join(c, "kb-meta.json"))) {
      continue;
    }
    copyIfAbsent(path.join(c, "kb-meta.json"), path.join(targetRoot, "kb-meta.json"));
    copyIfAbsent(path.join(c, "libraries"), path.join(targetRoot, "libraries"));
    copyIfAbsent(path.join(c, "store.json"), path.join(targetRoot, "store.json"));
    copyIfAbsent(path.join(c, "lancedb"), path.join(targetRoot, "lancedb"));
    return c;
  }
  return "";
}

function normalizeOllamaHost(raw) {
  let h = typeof raw === "string" ? raw.trim() : "";
  if (!h) {
    return "http://127.0.0.1:11434";
  }
  h = h.replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(h)) {
    h = `http://${h}`;
  }
  return h;
}

function libsRoot(userDataPath) {
  return path.join(kbRoot(userDataPath), "libraries");
}

function kbMetaPath(userDataPath) {
  return path.join(kbRoot(userDataPath), "kb-meta.json");
}

function legacyStorePath(userDataPath) {
  return path.join(kbRoot(userDataPath), "store.json");
}

function libraryDir(userDataPath, libraryId) {
  return path.join(libsRoot(userDataPath), libraryId);
}

function storePath(userDataPath, libraryId) {
  return path.join(libraryDir(userDataPath, libraryId), "store.json");
}

function toWindowsLongPath(rawPath) {
  if (process.platform !== "win32") {
    return String(rawPath || "");
  }
  const normalized = path.resolve(String(rawPath || ""));
  if (normalized.startsWith("\\\\?\\")) {
    return normalized;
  }
  if (normalized.startsWith("\\\\")) {
    return `\\\\?\\UNC\\${normalized.slice(2)}`;
  }
  return `\\\\?\\${normalized}`;
}

function pathExistsOnDisk(rawPath) {
  const p = String(rawPath || "").trim();
  if (!p || p.startsWith("ai://")) {
    return false;
  }
  const variants = new Set([p, path.normalize(p)]);
  if (process.platform === "win32") {
    variants.add(toWindowsLongPath(p));
    const slashAlt = p.replace(/\//g, "\\");
    if (slashAlt !== p) {
      variants.add(slashAlt);
      variants.add(toWindowsLongPath(slashAlt));
    }
  }
  for (const candidate of variants) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

function resolveFirstExistingPath(candidates) {
  const seen = new Set();
  for (const raw of candidates || []) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    const resolved = pathExistsOnDisk(value);
    if (resolved) {
      return resolved;
    }
  }
  return "";
}

function findDocumentInLibraries(userDataPath, docId, preferredLibraryId = "") {
  const targetId = String(docId || "").trim();
  if (!targetId) {
    return null;
  }
  const meta = readKbMeta(userDataPath);
  const libs = Array.isArray(meta.libraries) ? [...meta.libraries] : [];
  const preferred = String(preferredLibraryId || "").trim();
  if (preferred) {
    libs.sort((a, b) => {
      const aHit = String(a?.id || "") === preferred ? -1 : 0;
      const bHit = String(b?.id || "") === preferred ? -1 : 0;
      return bHit - aHit;
    });
  }
  for (const lib of libs) {
    const libId = String(lib?.id || "").trim();
    if (!libId) {
      continue;
    }
    const st = loadStore(userDataPath, libId);
    const doc = (st.documents || []).find((d) => String(d?.id || "") === targetId);
    if (doc) {
      return { libId, doc, st };
    }
  }
  return null;
}

async function openPathInSystemShell(targetPath) {
  const resolved = pathExistsOnDisk(targetPath) || String(targetPath || "").trim();
  if (!resolved) {
    return { ok: false, error: "文件路径无效" };
  }
  const shellError = await shell.openPath(resolved);
  if (!shellError) {
    return { ok: true, path: resolved };
  }
  if (process.platform === "win32") {
    try {
      const { spawn } = require("child_process");
      spawn("cmd.exe", ["/d", "/s", "/c", "start", '""', resolved], {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }).unref();
      return { ok: true, path: resolved, via: "cmd-start" };
    } catch (err) {
      return { ok: false, error: `${shellError}（备用打开方式失败：${err?.message || err}）`, path: resolved };
    }
  }
  return { ok: false, error: shellError, path: resolved };
}

function defaultStore() {
  const base = { ...DEFAULT_KB_RETRIEVAL_SETTINGS };
  return {
    version: 2,
    settings: {
      ...base,
      autoLearnCredibilityDefault: "unconfirmed",
      watchDirRecursive: true,
    },
    documents: [],
    chunks: [],
    graph: {
      version: 1,
      updatedAt: "",
      signature: "0:0",
      nodes: [],
      edges: [],
      summary: { nodeCount: 0, edgeCount: 0, docNodeCount: 0, sectionNodeCount: 0, topNodes: [] },
    },
  };
}

function normalizeAutoLearnText(raw, maxLen = 8000) {
  const text = String(raw || "")
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) {
    return "";
  }
  if (!Number.isFinite(maxLen) || maxLen <= 0 || text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, Math.max(1200, maxLen - 20)).trim()}\n…（已截断）`;
}

function extractAutoLearnKeyPoints(answer, maxPoints = 6) {
  const text = normalizeAutoLearnText(answer, 5000);
  if (!text) {
    return [];
  }
  const lines = text
    .split("\n")
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .map((x) => x.replace(/^[-*•●]\s*/, "").trim())
    .filter(Boolean);
  const picked = [];
  const seen = new Set();
  for (const line of lines) {
    const short = line.replace(/\s+/g, " ").trim();
    if (!short || short.length < 8) {
      continue;
    }
    if (/^(结论|依据|建议|步骤|说明|备注|注意)/.test(short)) {
      continue;
    }
    const k = short.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    picked.push(short.length > 160 ? `${short.slice(0, 160)}…` : short);
    if (picked.length >= maxPoints) {
      break;
    }
  }
  return picked;
}

function buildAutoLearnDocText(question, answer, sourceType) {
  const q = normalizeAutoLearnText(question, 1200);
  const a = normalizeAutoLearnText(answer, 6500);
  const points = extractAutoLearnKeyPoints(a, 6);
  const pointLines = points.length ? points.map((p, i) => `${i + 1}. ${p}`).join("\n") : "1. 暂无可提炼关键点（回答内容较短）。";
  return [
    "# 自动学习记录",
    `## 来源\n- 类型：${String(sourceType || "chat")}`,
    `- 时间：${new Date().toISOString()}`,
    "## 问题",
    q || "（空）",
    "## 回答摘要",
    a || "（空）",
    "## 关键知识点",
    pointLines,
  ]
    .join("\n\n")
    .trim();
}

function normalizeLibraryId(raw) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fa5-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || `kb-${Date.now()}`;
}

function readKbMeta(userDataPath) {
  const defaults = {
    version: 1,
    activeLibraryId: "default",
    libraries: [{ id: "default", name: "默认知识库", createdAt: new Date().toISOString() }],
  };
  const p = kbMetaPath(userDataPath);
  if (!fs.existsSync(p)) {
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!raw || typeof raw !== "object") {
      return defaults;
    }
    const libs = Array.isArray(raw.libraries) ? raw.libraries.filter((x) => x && x.id) : [];
    if (!libs.length) {
      return defaults;
    }
    return {
      version: 1,
      activeLibraryId: libs.some((x) => x.id === raw.activeLibraryId) ? raw.activeLibraryId : libs[0].id,
      libraries: libs.map((x) => ({
        id: String(x.id),
        name: String(x.name || x.id),
        createdAt: String(x.createdAt || new Date().toISOString()),
      })),
    };
  } catch {
    return defaults;
  }
}

function saveKbMeta(userDataPath, meta) {
  const dir = kbRoot(userDataPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(kbMetaPath(userDataPath), JSON.stringify(meta), "utf8");
}

function ensureKbInitialized(userDataPath) {
  const root = kbRoot(userDataPath);
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  migrateLegacyKbDataIfNeeded(userDataPath, root);
  const libs = libsRoot(userDataPath);
  if (!fs.existsSync(libs)) {
    fs.mkdirSync(libs, { recursive: true });
  }
  let meta = readKbMeta(userDataPath);
  saveKbMeta(userDataPath, meta);
  const legacy = legacyStorePath(userDataPath);
  const defaultStoreFile = storePath(userDataPath, "default");
  if (!fs.existsSync(defaultStoreFile) && fs.existsSync(legacy)) {
    fs.mkdirSync(path.dirname(defaultStoreFile), { recursive: true });
    fs.copyFileSync(legacy, defaultStoreFile);
  }
  for (const lib of meta.libraries) {
    const libDir = libraryDir(userDataPath, lib.id);
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }
    const hasSqlite = fs.existsSync(sqliteDbPath(libDir));
    const hasJson = fs.existsSync(storePath(userDataPath, lib.id));
    if (!hasSqlite && !hasJson) {
      saveStoreToSqlite(libDir, defaultStore());
    }
  }
}

function loadStore(userDataPath, libraryId) {
  ensureKbInitialized(userDataPath);
  const libDir = libraryDir(userDataPath, libraryId);
  migrateJsonStoreIfNeeded(libDir, defaultStore);
  const st = loadStoreFromSqlite(libDir, defaultStore);
  st.settings = normalizeKbSettings(st.settings);
  return st;
}

function loadStoreForSearch(userDataPath, libraryId) {
  ensureKbInitialized(userDataPath);
  const libDir = libraryDir(userDataPath, libraryId);
  migrateJsonStoreIfNeeded(libDir, defaultStore);
  const st = loadStoreForSearchFromSqlite(libDir, defaultStore);
  st.settings = normalizeKbSettings(st.settings);
  return st;
}

function saveStore(userDataPath, libraryId, store) {
  const libDir = libraryDir(userDataPath, libraryId);
  if (!fs.existsSync(libDir)) {
    fs.mkdirSync(libDir, { recursive: true });
  }
  saveStoreToSqlite(libDir, store);
}

function ollamaEmbedRequestBody(model, input) {
  return buildOllamaEmbedPayload(model, input, readOllamaSettingsFromRuntime());
}

async function ollamaEmbed(host, model, input, options = {}) {
  const role = options.role === "query" ? "query" : "passage";
  const payloadInput = Array.isArray(input)
    ? input.map((x) => formatEmbeddingInput(x, model, role))
    : formatEmbeddingInput(input, model, role);
  const base = normalizeOllamaHost(host);
  async function callOne(url) {
    try {
      return await fetchOllamaEmbedJson(url, ollamaEmbedRequestBody(model, payloadInput));
    } catch (err) {
      throw new Error(formatOllamaEmbedError(err.message || String(err), buildOllamaEmbedErrorCtx(model)));
    }
  }

  // 新版 Ollama 推荐 /api/embed；旧版可回退 /api/embeddings（超时错误不再二次请求，避免 >130s 挂起）。
  try {
    const data = await callOne(`${base}/api/embed`);
    if (Array.isArray(data?.embeddings) && Array.isArray(data.embeddings[0])) {
      return data.embeddings[0];
    }
    if (Array.isArray(data?.embedding)) {
      return data.embedding;
    }
  } catch (err) {
    if (isEmbedTimeoutError(err)) {
      throw err;
    }
    // fallthrough to legacy endpoint
  }

  const data = await callOne(`${base}/api/embeddings`);
  const emb = data?.embedding;
  if (Array.isArray(emb)) {
    return emb;
  }
  if (Array.isArray(data?.embeddings) && Array.isArray(data.embeddings[0])) {
    return data.embeddings[0];
  }
  throw new Error(formatOllamaEmbedError("Ollama 返回中缺少 embedding/embeddings", buildOllamaEmbedErrorCtx(model)));
}

async function listOllamaInstalledModels(host) {
  const base = normalizeOllamaHost(host);
  const res = await fetch(`${base}/api/tags`);
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
    throw new Error(`无法连接 Ollama（${base}）：${msg}`);
  }
  const list = Array.isArray(data?.models) ? data.models : [];
  return list.map((m) => String(m?.name || m?.model || "").trim()).filter(Boolean);
}

async function assertOllamaEmbedReady(host, model) {
  const modelName = String(model || "bge-m3").trim() || "bge-m3";
  const installed = await listOllamaInstalledModels(host);
  const found = installed.some((name) => ollamaModelNameMatches(name, modelName));
  if (!found) {
    throw new Error(
      `嵌入模型「${modelName}」未在本机 Ollama 中找到。请打开「AI能力 → 本地模型部署」拉取该模型（例如 ollama pull ${modelName}）后重试。`
    );
  }
  await ollamaEmbed(host, modelName, "知识库嵌入连通性检测", { role: "passage" });
}

async function ollamaEmbedBatch(host, model, texts, batchSize = 8, options = {}) {
  const role = options.role === "query" ? "query" : "passage";
  const rawInputs = (texts || []).map((t) => String(t || "").trim()).filter(Boolean);
  if (!rawInputs.length) {
    return [];
  }
  const base = normalizeOllamaHost(host);
  const out = [];
  for (let i = 0; i < rawInputs.length; i += batchSize) {
    const rawBatch = rawInputs.slice(i, i + batchSize);
    const batch = rawBatch.map((t) => formatEmbeddingInput(t, model, role));
    let batchEmb = null;
    try {
      const data = await fetchOllamaEmbedJson(`${base}/api/embed`, ollamaEmbedRequestBody(model, batch));
      if (Array.isArray(data?.embeddings) && data.embeddings.length === batch.length) {
        batchEmb = data.embeddings;
      }
    } catch {
      batchEmb = null;
    }
    if (batchEmb) {
      out.push(...batchEmb);
      continue;
    }
    for (const raw of rawBatch) {
      out.push(await ollamaEmbed(host, model, raw, options));
    }
  }
  return out;
}

function existingEmbeddingDim(store) {
  const c = store.chunks.find((x) => Array.isArray(x.embedding) && x.embedding.length > 0);
  return c ? c.embedding.length : 0;
}

function normalizeDocAlias(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[“”"'`]/g, "")
    .replace(/[()[\]{}]/g, "")
    .replace(/\s+/g, "");
}

function collectDocTextById(store) {
  const map = new Map();
  (store.chunks || []).forEach((c) => {
    const id = String(c?.docId || "").trim();
    if (!id) return;
    const prev = map.get(id) || "";
    map.set(id, `${prev}\n${String(c?.text || "")}`.trim());
  });
  return map;
}

function extractStructuredHeadings(text) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const out = [];
  for (const line of lines) {
    const t = String(line || "").trim();
    if (!t) continue;
    const md = t.match(/^(#{1,6})\s+(.+)$/);
    if (md) {
      out.push({ level: Math.min(6, md[1].length), title: md[2].trim() });
      continue;
    }
    const numbered = t.match(/^(\d+(?:\.\d+){0,4})[、.)\s]+(.+)$/);
    if (numbered) {
      const level = Math.max(1, Math.min(6, numbered[1].split(".").length));
      out.push({ level, title: `${numbered[1]} ${numbered[2].trim()}`.trim() });
    }
  }
  return out.slice(0, 48);
}

const GRAPH_PROTOCOL_STOPWORDS = new Set([
  "文档",
  "协议",
  "规范",
  "说明",
  "版本",
  "公司",
  "分公司",
  "中国电信",
  "中国",
  "分册",
  "外部",
  "平台",
  "能力",
  "开放",
  "接口",
  "技术",
  "标准",
]);

function extractDocKeywordTokens(name, docText = "") {
  const tokens = new Set();
  const combined = `${String(name || "")}\n${String(docText || "").slice(0, 4000)}`;
  extractDocumentReferenceCodes(combined).forEach((code) => tokens.add(String(code).toLowerCase()));
  (combined.match(/[\u4e00-\u9fff]{2,8}/g) || []).forEach((word) => {
    if (!GRAPH_PROTOCOL_STOPWORDS.has(word)) {
      tokens.add(word);
    }
  });
  (combined.match(/[a-zA-Z]{3,}/g) || []).forEach((word) => {
    tokens.add(String(word).toLowerCase());
  });
  return tokens;
}

function countSharedTokens(a, b) {
  let n = 0;
  a.forEach((token) => {
    if (b.has(token)) {
      n += 1;
    }
  });
  return n;
}

function buildKnowledgeGraphSnapshot(store) {
  const st = store && typeof store === "object" ? store : defaultStore();
  const docs = Array.isArray(st.documents) ? st.documents : [];
  const textByDoc = collectDocTextById(st);
  const nodes = [];
  const edges = [];
  const nodeMap = new Map();
  const edgeMap = new Map();
  const aliasToDocId = new Map();

  const addNode = (node) => {
    const id = String(node?.id || "").trim();
    if (!id) return;
    if (nodeMap.has(id)) return;
    const next = {
      id,
      label: String(node?.label || id),
      type: String(node?.type || "concept"),
      docId: node?.docId ? String(node.docId) : "",
      level: Number(node?.level) || 0,
      weight: 1,
    };
    nodeMap.set(id, next);
    nodes.push(next);
  };

  const addEdge = (source, target, type, weight = 1) => {
    const s = String(source || "").trim();
    const t = String(target || "").trim();
    if (!s || !t || s === t) return;
    const a = s < t ? s : t;
    const b = s < t ? t : s;
    const kind = String(type || "link");
    const key = `${a}__${b}__${kind}`;
    if (edgeMap.has(key)) {
      edgeMap.get(key).weight += Number(weight) || 1;
      return;
    }
    const edge = {
      id: key,
      source: a,
      target: b,
      type: kind,
      weight: Number(weight) || 1,
    };
    edgeMap.set(key, edge);
    edges.push(edge);
  };

  docs.forEach((doc) => {
    const docId = String(doc?.id || "").trim();
    if (!docId) return;
    const name = String(doc?.name || "未命名文档");
    addNode({ id: `doc:${docId}`, label: name, type: "doc", docId });
    const baseAlias = normalizeDocAlias(name);
    if (baseAlias) aliasToDocId.set(baseAlias, docId);
  });

  docs.forEach((doc) => {
    const docId = String(doc?.id || "").trim();
    if (!docId) return;
    const sourceNodeId = `doc:${docId}`;
    const docText = String(textByDoc.get(docId) || "");

    const headings = extractStructuredHeadings(docText);
    let lastSectionNodeId = "";
    headings.forEach((h, idx) => {
      const secId = `sec:${docId}:${idx + 1}`;
      addNode({
        id: secId,
        label: h.title,
        type: "section",
        docId,
        level: h.level,
      });
      addEdge(sourceNodeId, secId, "contains", 1);
      if (lastSectionNodeId) {
        addEdge(lastSectionNodeId, secId, "flow", 1);
      }
      lastSectionNodeId = secId;
    });

    let m;
    const wikiRe = /\[\[([^[\]\n]+)\]\]/g;
    while ((m = wikiRe.exec(docText)) !== null) {
      const inner = String(m[1] || "");
      const targetRaw = inner.split("|")[0].split("#")[0].trim();
      const alias = normalizeDocAlias(targetRaw);
      const targetDocId = aliasToDocId.get(alias);
      if (targetDocId && targetDocId !== docId) {
        addEdge(sourceNodeId, `doc:${targetDocId}`, "wiki-link", 2);
      }
    }

    const mdLinkRe = /\[[^\]]+]\(([^)\s]+)\)/g;
    while ((m = mdLinkRe.exec(docText)) !== null) {
      const rawTarget = String(m[1] || "").trim();
      if (!rawTarget || /^(https?:|mailto:)/i.test(rawTarget)) continue;
      const base = path.basename(rawTarget).split("#")[0];
      const alias = normalizeDocAlias(base);
      const targetDocId = aliasToDocId.get(alias);
      if (targetDocId && targetDocId !== docId) {
        addEdge(sourceNodeId, `doc:${targetDocId}`, "md-link", 1);
      }
    }

    if (docs.length <= 80) {
      const normalizedText = normalizeDocAlias(docText);
      docs.forEach((other) => {
        const otherId = String(other?.id || "").trim();
        if (!otherId || otherId === docId) return;
        const alias = normalizeDocAlias(other?.name || "");
        if (!alias || alias.length < 2) return;
        if (normalizedText.includes(alias)) {
          addEdge(sourceNodeId, `doc:${otherId}`, "mention", 1);
        }
      });
    }
  });

  const docPrimaryCodes = new Map();
  const docKeywordTokens = new Map();
  docs.forEach((doc) => {
    const docId = String(doc?.id || "").trim();
    if (!docId) return;
    const name = String(doc?.name || "");
    const sourcePath = String(doc?.sourcePath || "");
    const docText = String(textByDoc.get(docId) || "");
    const codes = extractDocumentReferenceCodes(`${name}\n${sourcePath}`);
    if (codes[0]) {
      docPrimaryCodes.set(docId, codes[0]);
    }
    docKeywordTokens.set(docId, extractDocKeywordTokens(name, docText));
  });

  docPrimaryCodes.forEach((code, targetDocId) => {
    if (!code) return;
    docs.forEach((doc) => {
      const docId = String(doc?.id || "").trim();
      if (!docId || docId === targetDocId) return;
      const docText = String(textByDoc.get(docId) || "");
      if (docText.includes(code)) {
        addEdge(`doc:${docId}`, `doc:${targetDocId}`, "code-ref", 2);
      }
    });
  });

  const codeToDocIds = new Map();
  docPrimaryCodes.forEach((code, docId) => {
    if (!code) return;
    const key = String(code).toLowerCase();
    if (!codeToDocIds.has(key)) {
      codeToDocIds.set(key, []);
    }
    codeToDocIds.get(key).push(docId);
  });
  codeToDocIds.forEach((docIds, code) => {
    if (docIds.length < 2) return;
    for (let i = 0; i < docIds.length; i += 1) {
      for (let j = i + 1; j < docIds.length; j += 1) {
        addEdge(`doc:${docIds[i]}`, `doc:${docIds[j]}`, "same-protocol", 2);
      }
    }
    if (docIds.length >= 2 && docIds.length <= 12) {
      addNode({ id: `code:${code}`, label: code, type: "concept" });
      docIds.forEach((docId) => addEdge(`doc:${docId}`, `code:${code}`, "has-code", 1));
    }
  });

  const folderGroups = new Map();
  docs.forEach((doc) => {
    const docId = String(doc?.id || "").trim();
    const sourcePath = String(doc?.sourcePath || "").trim();
    if (!docId || !sourcePath) return;
    const dir = path.dirname(sourcePath);
    if (!dir || dir === "." || dir === path.parse(sourcePath).root) return;
    const folderLabel = path.basename(dir) || dir;
    const folderKey = normalizeDocAlias(folderLabel) || normalizeDocAlias(dir);
    if (!folderKey) return;
    if (!folderGroups.has(folderKey)) {
      folderGroups.set(folderKey, { label: folderLabel, docIds: [] });
    }
    const group = folderGroups.get(folderKey);
    if (!group.docIds.includes(docId)) {
      group.docIds.push(docId);
    }
  });
  folderGroups.forEach((group, folderKey) => {
    if (group.docIds.length < 2) return;
    const folderNodeId = `folder:${folderKey.slice(0, 48)}`;
    addNode({ id: folderNodeId, label: group.label, type: "folder" });
    group.docIds.forEach((docId) => addEdge(`doc:${docId}`, folderNodeId, "same-folder", 1));
    if (group.docIds.length <= 24) {
      for (let i = 0; i < group.docIds.length; i += 1) {
        const next = group.docIds[i + 1];
        if (next) {
          addEdge(`doc:${group.docIds[i]}`, `doc:${next}`, "folder-seq", 1);
        }
      }
    }
  });

  if (docs.length <= 120) {
    const docIds = docs.map((d) => String(d?.id || "").trim()).filter(Boolean);
    for (let i = 0; i < docIds.length; i += 1) {
      for (let j = i + 1; j < docIds.length; j += 1) {
        const a = docIds[i];
        const b = docIds[j];
        const shared = countSharedTokens(docKeywordTokens.get(a) || new Set(), docKeywordTokens.get(b) || new Set());
        if (shared >= 2) {
          addEdge(`doc:${a}`, `doc:${b}`, "shared-keyword", Math.min(3, shared));
        }
      }
    }
  }

  const degree = new Map();
  edges.forEach((e) => {
    degree.set(e.source, (degree.get(e.source) || 0) + e.weight);
    degree.set(e.target, (degree.get(e.target) || 0) + e.weight);
  });
  nodes.forEach((n) => {
    n.weight = Number(degree.get(n.id) || 1);
  });

  const topNodes = [...nodes]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12)
    .map((n) => ({ id: n.id, label: n.label, type: n.type, weight: n.weight }));
  const docNodes = nodes.filter((n) => n.type === "doc");
  const sectionNodes = nodes.filter((n) => n.type === "section");
  const folderNodes = nodes.filter((n) => n.type === "folder");
  const conceptNodes = nodes.filter((n) => n.type === "concept");
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    signature: `${docs.length}:${(st.chunks || []).length}:g2`,
    nodes,
    edges,
    summary: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      docNodeCount: docNodes.length,
      sectionNodeCount: sectionNodes.length,
      folderNodeCount: folderNodes.length,
      conceptNodeCount: conceptNodes.length,
      topNodes,
    },
  };
}

function ensureGraphSnapshot(store, forceRebuild = false) {
  const docsLen = Array.isArray(store?.documents) ? store.documents.length : 0;
  const chunksLen = Array.isArray(store?.chunks) ? store.chunks.length : 0;
  const expectedSignature = `${docsLen}:${chunksLen}:g2`;
  if (!forceRebuild && store?.graph && store.graph.signature === expectedSignature) {
    return store.graph;
  }
  const snapshot = buildKnowledgeGraphSnapshot(store);
  if (store && typeof store === "object") {
    store.graph = snapshot;
  }
  return snapshot;
}

function globalGraphSnapshotPath(userDataPath) {
  return path.join(kbRoot(userDataPath), "global-graph.json");
}

function readGlobalGraphSnapshot(userDataPath) {
  const p = globalGraphSnapshotPath(userDataPath);
  if (!fs.existsSync(p)) {
    return null;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function saveGlobalGraphSnapshot(userDataPath, graph) {
  const p = globalGraphSnapshotPath(userDataPath);
  fs.writeFileSync(p, JSON.stringify(graph), "utf8");
}

function resolveRequestedLibraryIds(meta, payload) {
  const p = payload && typeof payload === "object" ? payload : {};
  const allIds = (meta?.libraries || []).map((x) => String(x.id || "").trim()).filter(Boolean);
  const allSet = new Set(allIds);
  const reqArray = Array.isArray(p.libraryIds) ? p.libraryIds : [];
  const reqSingle = String(p.libraryId || "").trim();
  if (reqSingle === "__all__" || reqArray.some((x) => String(x || "").trim() === "__all__")) {
    return allIds;
  }
  const out = [];
  reqArray.forEach((x) => {
    const id = String(x || "").trim();
    if (id && allSet.has(id) && !out.includes(id)) out.push(id);
  });
  if (!out.length && reqSingle && allSet.has(reqSingle)) {
    out.push(reqSingle);
  }
  if (!out.length) {
    const fallback = String(meta?.activeLibraryId || "").trim();
    if (fallback && allSet.has(fallback)) {
      out.push(fallback);
    } else if (allIds[0]) {
      out.push(allIds[0]);
    }
  }
  return out;
}

function buildCombinedStoreForLibraries(userDataPath, libraryIds) {
  const combined = defaultStore();
  combined.documents = [];
  combined.chunks = [];
  combined.graph = defaultStore().graph;
  const docSeen = new Set();
  const chunkSeen = new Set();
  const docLibraryById = new Map();
  const signatures = [];
  libraryIds.forEach((libId) => {
    const st = loadStore(userDataPath, libId);
    const docs = Array.isArray(st.documents) ? st.documents : [];
    const chunks = Array.isArray(st.chunks) ? st.chunks : [];
    const docIdList = [];
    const chunkIdList = [];
    docs.forEach((d) => {
      const id = String(d?.id || "").trim();
      if (!id) return;
      docIdList.push(id);
      if (!docSeen.has(id)) {
        docSeen.add(id);
        docLibraryById.set(id, libId);
        combined.documents.push(d);
      }
    });
    chunks.forEach((c) => {
      const id = String(c?.id || "").trim();
      if (!id) return;
      chunkIdList.push(id);
      if (!chunkSeen.has(id)) {
        chunkSeen.add(id);
        combined.chunks.push(c);
      }
    });
    const fp = `${libId}|d:${docs.length}|c:${chunks.length}|${docIdList.join(",")}|${chunkIdList.join(",")}`;
    signatures.push(crypto.createHash("sha1").update(fp).digest("hex").slice(0, 16));
  });
  const signature = signatures.join("|");
  return { store: combined, docLibraryById, signature };
}

function attachLibraryInfoToGraph(graph, docLibraryById, libraries) {
  if (!graph || !Array.isArray(graph.nodes)) {
    return graph;
  }
  const libNameById = new Map((libraries || []).map((x) => [String(x.id || ""), String(x.name || x.id || "")]));
  graph.nodes.forEach((n) => {
    const docId = String(n?.docId || "").trim();
    if (!docId) return;
    const libId = String(docLibraryById.get(docId) || "").trim();
    if (!libId) return;
    n.libraryId = libId;
    n.libraryName = libNameById.get(libId) || libId;
  });
  return graph;
}

function ensureGlobalGraphSnapshot(userDataPath, meta, libraryIds, forceRebuild = false) {
  const targetIds = Array.isArray(libraryIds) ? libraryIds.filter(Boolean) : [];
  const { store, docLibraryById, signature } = buildCombinedStoreForLibraries(userDataPath, targetIds);
  const expectedSignature = `global:${signature}:g2`;
  if (!forceRebuild) {
    const cached = readGlobalGraphSnapshot(userDataPath);
    if (cached && cached.signature === expectedSignature) {
      return attachLibraryInfoToGraph(cached, docLibraryById, meta?.libraries || []);
    }
  }
  const graph = buildKnowledgeGraphSnapshot(store);
  graph.signature = expectedSignature;
  const next = attachLibraryInfoToGraph(graph, docLibraryById, meta?.libraries || []);
  saveGlobalGraphSnapshot(userDataPath, next);
  return next;
}

const PDF_OCR_MAX_PAGES = 50;
const PDF_OCR_VIEWPORT_SCALE = 2.0;

function getPdfToPngFn() {
  return require("pdf-to-png-converter").pdfToPng;
}

async function ocrImagePathWithTesseract(imagePath) {
  try {
    const out = await recognize(imagePath, "chi_sim+eng");
    return String(out?.data?.text || "");
  } catch {
    const out = await recognize(imagePath, "eng");
    return String(out?.data?.text || "");
  }
}

async function ocrScannedPdfBuffer(buf, sourcePath = "") {
  let tempPdf = "";
  let workDir = "";
  try {
    const pdfToPng = getPdfToPngFn();
    const input =
      sourcePath && fs.existsSync(sourcePath)
        ? sourcePath
        : (() => {
            tempPdf = path.join(
              os.tmpdir(),
              `kb-pdf-ocr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.pdf`
            );
            fs.writeFileSync(tempPdf, buf);
            return tempPdf;
          })();
    workDir = path.join(
      os.tmpdir(),
      `kb-pdf-ocr-pages-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    fs.mkdirSync(workDir, { recursive: true });
    const pngPages = await pdfToPng(input, {
      viewportScale: PDF_OCR_VIEWPORT_SCALE,
      verbosityLevel: 0,
    });
    const limited = pngPages.slice(0, PDF_OCR_MAX_PAGES);
    const parts = [];
    for (const page of limited) {
      const pngBuf = page.content;
      if (!pngBuf || !pngBuf.length) {
        continue;
      }
      const pngPath = path.join(workDir, page.name || `page-${page.pageNumber}.png`);
      fs.writeFileSync(pngPath, pngBuf);
      const pageText = (await ocrImagePathWithTesseract(pngPath)).trim();
      if (pageText) {
        parts.push(pageText);
      }
      try {
        fs.unlinkSync(pngPath);
      } catch {
        /* ignore */
      }
    }
    if (pngPages.length > PDF_OCR_MAX_PAGES) {
      parts.push(
        `（扫描版 OCR 仅处理前 ${PDF_OCR_MAX_PAGES} 页，原文档共 ${pngPages.length} 页）`
      );
    }
    return parts.join("\n\n");
  } finally {
    if (tempPdf && fs.existsSync(tempPdf)) {
      try {
        fs.unlinkSync(tempPdf);
      } catch {
        /* ignore */
      }
    }
    if (workDir && fs.existsSync(workDir)) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

function spreadsheetWorkbookToText(wb) {
  const lines = [];
  (wb.SheetNames || []).forEach((name) => {
    const sheet = wb.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    if (csv.trim()) {
      lines.push(`## ${name}\n${csv}`);
    }
  });
  return lines.join("\n\n");
}

function ensureExcelExtractRuntimeScript() {
  const unpacked = process.resourcesPath
    ? path.join(process.resourcesPath, "app.asar.unpacked", "scripts", "kb-excel-to-text.ps1")
    : "";
  if (unpacked && fs.existsSync(unpacked)) {
    return unpacked;
  }
  const bundled = path.join(__dirname, "scripts", "kb-excel-to-text.ps1");
  if (!fs.existsSync(bundled)) {
    return null;
  }
  if (!/app\.asar[\\/]/i.test(path.normalize(bundled))) {
    return bundled;
  }
  const destDir = path.join(app.getPath("userData"), "kb-runtime");
  const dest = path.join(destDir, "kb-excel-to-text.ps1");
  try {
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(bundled, dest);
    return dest;
  } catch {
    return null;
  }
}

function runExcelComExtract(srcPath, password) {
  if (process.platform !== "win32") {
    return { ok: false, error: "加密 Excel 需 Windows 环境且安装 Microsoft Excel" };
  }
  const scriptPath = ensureExcelExtractRuntimeScript();
  if (!scriptPath) {
    return { ok: false, error: "缺少 Excel 解密脚本 kb-excel-to-text.ps1" };
  }
  const outFile = path.join(
    os.tmpdir(),
    `kb-xls-text-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`
  );
  const args = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-Path",
    srcPath,
    "-OutFile",
    outFile,
  ];
  if (password) {
    args.push("-Password", password);
  }
  const out = spawnSync("powershell", args, { encoding: "utf8", windowsHide: true, timeout: 120000 });
  try {
    if (out.status !== 0 || !fs.existsSync(outFile)) {
      return {
        ok: false,
        error: String(out.stderr || out.stdout || "Excel COM 提取失败").trim(),
      };
    }
    const text = decodeTextBuffer(fs.readFileSync(outFile)).trim();
    if (!text) {
      return { ok: false, error: "Excel 解密后无有效内容" };
    }
    return { ok: true, text, via: "excel-com" };
  } finally {
    try {
      fs.unlinkSync(outFile);
    } catch {
      /* ignore */
    }
  }
}

function parseSpreadsheetBuffer(buf, sourcePath, passwords = []) {
  const attempts = [...new Set([""].concat(passwords || []).map((x) => String(x || "").trim()))];
  let lastErr = null;
  for (const password of attempts) {
    try {
      const opts = { type: "buffer" };
      if (password) {
        opts.password = password;
      }
      const wb = XLSX.read(buf, opts);
      const text = spreadsheetWorkbookToText(wb).trim();
      if (text) {
        return { ok: true, text, via: password ? "xlsx-password" : "xlsx" };
      }
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message || err);
      if (!/password-protected|encryption scheme unsupported|password/i.test(msg)) {
        throw err;
      }
    }
  }
  if (sourcePath && fs.existsSync(sourcePath)) {
    for (const password of attempts.filter(Boolean)) {
      const viaCom = runExcelComExtract(sourcePath, password);
      if (viaCom.ok) {
        return viaCom;
      }
      lastErr = new Error(viaCom.error || "Excel COM 解密失败");
    }
    const viaCom = runExcelComExtract(sourcePath, "");
    if (viaCom.ok) {
      return viaCom;
    }
  }
  throw lastErr || new Error("File is password-protected");
}

async function parseBufferToText(extRaw, buf, sourcePath = "", options = {}) {
  const ext = String(extRaw || "").toLowerCase();
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") {
    return decodeTextBuffer(buf);
  }
  if (ext === ".docx") {
    const r = await mammoth.extractRawText({ buffer: buf });
    return r.value || "";
  }
  if (ext === ".doc") {
    const head = buf.slice(0, Math.min(buf.length, 64)).toString("latin1").trimStart();
    if (/^\{\\rtf/i.test(head)) {
      return rtfToText(decodeTextBuffer(buf));
    }
    const extractor = new WordExtractor();
    let tempPath = "";
    try {
      const targetPath = sourcePath && fs.existsSync(sourcePath)
        ? sourcePath
        : (() => {
            const p = path.join(
              process.env.TEMP || process.cwd(),
              `kb-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.doc`
            );
            fs.writeFileSync(p, buf);
            tempPath = p;
            return p;
          })();
      const doc = await extractor.extract(targetPath);
      const body = String(doc?.getBody?.() || "").trim();
      const footnotes = String(doc?.getFootnotes?.() || "").trim();
      const headers = String(doc?.getHeaders?.() || "").trim();
      const all = [headers, body, footnotes].filter(Boolean).join("\n\n");
      return all;
    } catch (err) {
      if (sourcePath && fs.existsSync(sourcePath) && process.platform === "win32") {
        const rich = await tryConvertDocToRichPreview(sourcePath);
        const converted = String(rich?.rawText || "").trim();
        if (converted) {
          return converted;
        }
      }
      throw err;
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (ext === ".pdf") {
    const data = await pdfParse(buf);
    const direct = String(data.text || "")
      .replace(/\u0000/g, "")
      .trim();
    if (direct) {
      return data.text || "";
    }
    return ocrScannedPdfBuffer(buf, sourcePath);
  }
  if (ext === ".xlsx" || ext === ".xls") {
    const parsed = parseSpreadsheetBuffer(buf, sourcePath, options.passwords || []);
    return parsed.text || "";
  }
  if (IMAGE_EXTS.has(ext)) {
    let tempPath = "";
    const targetPath = sourcePath && fs.existsSync(sourcePath)
      ? sourcePath
      : (() => {
          const p = path.join(
            process.env.TEMP || process.cwd(),
            `kb-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext || ".png"}`
          );
          fs.writeFileSync(p, buf);
          tempPath = p;
          return p;
        })();
    try {
      return await ocrImagePathWithTesseract(targetPath);
    } finally {
      if (tempPath && fs.existsSync(tempPath)) {
        try {
          fs.unlinkSync(tempPath);
        } catch {
          /* ignore */
        }
      }
    }
  }
  if (AUTO_TEXT_EXTS.has(ext)) {
    const raw = buf.toString("utf8");
    if (ext === ".json") {
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    }
    if (ext === ".html" || ext === ".htm" || ext === ".xml") {
      return htmlLikeToText(raw);
    }
    if (ext === ".rtf") {
      return rtfToText(raw);
    }
    return raw;
  }
  const maybeText = buf.toString("utf8");
  if (looksLikeReadableText(maybeText)) {
    return maybeText;
  }
  throw new Error(
    `不支持的文件类型：${ext || "（无扩展名）"}。当前支持 .txt .md .markdown .doc .docx .pdf .xlsx .xls .png .jpg .jpeg .bmp .webp .tif .tiff，并可自动适配 .csv .json .log .rtf .html .htm .xml .yml .yaml`
  );
}

async function parseDocxPreviewHtml(buf) {
  try {
    const res = await mammoth.convertToHtml(
      { buffer: buf },
      {
        convertImage: mammoth.images.inline(async (element) => {
          const base64 = await element.read("base64");
          const mime = String(element.contentType || "image/png");
          return { src: `data:${mime};base64,${base64}` };
        }),
      }
    );
    const html = String(res?.value || "").trim();
    if (!html) {
      return "";
    }
    return `<article class="docx-preview">${sanitizePreviewHtml(html)}</article>`;
  } catch {
    return "";
  }
}

function cleanDocPreviewNoise(rawText) {
  const lines = String(rawText || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
  const freq = new Map();
  lines.forEach((line) => {
    const t = String(line || "").trim();
    if (!t) return;
    if (t.length > 40) return;
    const k = t.replace(/\s+/g, " ");
    freq.set(k, (freq.get(k) || 0) + 1);
  });
  const out = [];
  for (const line of lines) {
    const t = String(line || "").trim();
    const k = t.replace(/\s+/g, " ");
    if (/^第\s*\d+\s*页$/.test(k)) {
      continue;
    }
    if (k && (freq.get(k) || 0) >= 4) {
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function mimeByExt(extRaw) {
  const ext = String(extRaw || "").toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".bmp") return "image/bmp";
  if (ext === ".svg") return "image/svg+xml";
  return "application/octet-stream";
}

function inlineLocalImagesInHtml(rawHtml, htmlBaseDir) {
  const text = String(rawHtml || "");
  if (!text) {
    return "";
  }
  return text.replace(/(<img[^>]*\ssrc=["'])([^"']+)(["'][^>]*>)/gi, (m, p1, src, p3) => {
    const s = String(src || "").trim();
    if (!s || /^data:|^https?:|^file:/i.test(s)) {
      return m;
    }
    const localPath = path.resolve(htmlBaseDir, decodeURIComponent(s.replace(/\//g, path.sep)));
    if (!fs.existsSync(localPath)) {
      return m;
    }
    try {
      const buf = fs.readFileSync(localPath);
      const mime = mimeByExt(path.extname(localPath));
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      return `${p1}${dataUrl}${p3}`;
    } catch {
      return m;
    }
  });
}

function extractBodyHtml(rawHtml) {
  const html = String(rawHtml || "");
  if (!html) {
    return "";
  }
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(['"]).*?\1/gi, "");
}

function decodeBufferWithFallback(buf) {
  const bytes = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  const tryDecode = (enc) => {
    try {
      const dec = new TextDecoder(enc, { fatal: false });
      return dec.decode(bytes);
    } catch {
      return "";
    }
  };
  const candidates = [
    { enc: "utf-8", text: tryDecode("utf-8") },
    { enc: "utf-16le", text: tryDecode("utf-16le") },
    { enc: "gb18030", text: tryDecode("gb18030") },
  ].filter((x) => x.text);
  const score = (s) => {
    const text = String(s || "");
    const len = Math.max(1, text.length);
    const bad = (text.match(/�|\u0000/g) || []).length;
    const zh = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    return zh * 3 - bad * 10 - Math.max(0, len - text.replace(/\s+/g, "").length) * 0.02;
  };
  if (!candidates.length) {
    return bytes.toString("utf8");
  }
  candidates.sort((a, b) => score(b.text) - score(a.text));
  return candidates[0].text;
}

function normalizeWordHtmlForPreview(bodyHtml) {
  let html = String(bodyHtml || "");
  if (!html) {
    return "";
  }
  html = html
    .replace(/<!--\[if[\s\S]*?<!\[endif]-->/gi, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<\/?o:p[^>]*>/gi, "")
    .replace(/<\/?w:[^>]*>/gi, "")
    .replace(/<\/?v:[^>]*>/gi, "")
    .replace(/<\/?st1:[^>]*>/gi, "")
    .replace(/\sclass=(["'])Mso[^"']*\1/gi, "")
    .replace(/\s(?:width|height)=["'][^"']*["']/gi, "");
  html = html.replace(/\sstyle=(["'])([\s\S]*?)\1/gi, (_m, q, styleText) => {
    const style = String(styleText || "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean)
      .filter((x) => !/^mso-/i.test(x))
      .filter((x) => !/^(tab-stops|layout-grid|line-height-rule|text-autospace)\s*:/i.test(x))
      .filter((x) => !/^(width|height|min-width|max-width|min-height|max-height)\s*:/i.test(x))
      .filter((x) => !/^(left|right|top|bottom)\s*:/i.test(x))
      .join("; ");
    return style ? ` style=${q}${style}${q}` : "";
  });
  return html.replace(/\n{3,}/g, "\n\n").trim();
}

function runWordConvertScript(srcDocPath, outDocxPath, outHtmlPath) {
  const psScript = [
    "$ErrorActionPreference = 'Stop'",
    "$src = $args[0]",
    "$docx = $args[1]",
    "$html = $args[2]",
    "$apps = @('Word.Application','KWPS.Application','WPS.Application')",
    "$ok = $false",
    "$errs = @()",
    "foreach ($prog in $apps) {",
    "  $app = $null",
    "  $doc = $null",
    "  try {",
    "    $app = New-Object -ComObject $prog",
    "    try { $app.Visible = $false } catch {}",
    "    try { $app.DisplayAlerts = 0 } catch {}",
    "    $doc = $app.Documents.Open($src, $false, $true)",
    "    $savedDocx = $false",
    "    foreach ($fmt in @(16, 12)) {",
    "      try {",
    "        $doc.SaveAs([ref]$docx, [ref]$fmt)",
    "        if (Test-Path $docx) { $savedDocx = $true; break }",
    "      } catch {}",
    "    }",
    "    if (-not $savedDocx) { throw 'SaveAs DOCX failed' }",
    "    $savedHtml = $false",
    "    foreach ($fmt in @(10, 8)) {",
    "      try {",
    "        $doc.SaveAs([ref]$html, [ref]$fmt)",
    "        if (Test-Path $html) { $savedHtml = $true; break }",
    "      } catch {}",
    "    }",
    "    if (-not $savedHtml) { throw 'SaveAs HTML failed' }",
    "    $ok = $true",
    "    Write-Output ('OK:' + $prog)",
    "    break",
    "  } catch {",
    "    $errs += ($prog + ': ' + $_.Exception.Message)",
    "  } finally {",
    "    if ($doc) { try { $doc.Close() } catch {} }",
    "    if ($app) { try { $app.Quit() } catch {} }",
    "  }",
    "}",
    "if (-not $ok) { throw ($errs -join ' | ') }",
  ].join("\n");
  const psFile = path.join(os.tmpdir(), `kb-word-convert-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.ps1`);
  fs.writeFileSync(psFile, psScript, "utf8");
  try {
    const out = spawnSync(
      "powershell",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile, srcDocPath, outDocxPath, outHtmlPath],
      { encoding: "utf8", windowsHide: true, timeout: 45000 }
    );
    const ok = out.status === 0 && fs.existsSync(outDocxPath) && fs.existsSync(outHtmlPath);
    return {
      ok,
      error: ok ? "" : String(out.stderr || out.stdout || "Word 转换失败"),
    };
  } finally {
    try {
      fs.unlinkSync(psFile);
    } catch {
      /* ignore */
    }
  }
}

function findSofficeBinary() {
  const candidates = [];
  try {
    const out = spawnSync("where", ["soffice"], { encoding: "utf8", windowsHide: true, shell: true });
    if (out.status === 0) {
      String(out.stdout || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((p) => candidates.push(p));
    }
  } catch {
    /* ignore */
  }
  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pfx86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  candidates.push(
    path.join(pf, "LibreOffice", "program", "soffice.exe"),
    path.join(pfx86, "LibreOffice", "program", "soffice.exe")
  );
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  return "";
}

function runSofficeConvert(srcDocPath, outDocxPath, outHtmlPath, workDir) {
  const soffice = findSofficeBinary();
  if (!soffice) {
    return { ok: false, error: "未检测到 soffice（LibreOffice）" };
  }
  const base = path.basename(srcDocPath, path.extname(srcDocPath));
  const docxName = `${base}.docx`;
  const htmlName = `${base}.html`;
  const runOne = (fmt) =>
    spawnSync(
      soffice,
      ["--headless", "--convert-to", fmt, "--outdir", workDir, srcDocPath],
      { encoding: "utf8", windowsHide: true, timeout: 60000 }
    );
  const a = runOne("docx");
  const b = runOne("html");
  const fromDocx = path.join(workDir, docxName);
  const fromHtml = path.join(workDir, htmlName);
  if (fs.existsSync(fromDocx) && fs.existsSync(fromHtml)) {
    try {
      fs.copyFileSync(fromDocx, outDocxPath);
      fs.copyFileSync(fromHtml, outHtmlPath);
      return { ok: true, error: "" };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }
  return {
    ok: false,
    error: `soffice 转换失败：${String(a.stderr || a.stdout || "")} ${String(b.stderr || b.stdout || "")}`.trim(),
  };
}

async function tryConvertDocToRichPreview(docPath) {
  if (process.platform !== "win32" || !docPath || !fs.existsSync(docPath)) {
    return { ok: false, error: "当前环境不支持 DOC 富预览转换" };
  }
  const workDir = path.join(os.tmpdir(), `kb-doc-preview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(workDir, { recursive: true });
  const outDocx = path.join(workDir, "converted.docx");
  const outHtml = path.join(workDir, "converted.html");
  const comConverted = runWordConvertScript(docPath, outDocx, outHtml);
  let converted = comConverted;
  if (!converted.ok) {
    const sofficeConverted = runSofficeConvert(docPath, outDocx, outHtml, workDir);
    if (sofficeConverted.ok) {
      converted = sofficeConverted;
    } else {
      return {
        ok: false,
        error: `COM:${comConverted.error || "失败"}；Soffice:${sofficeConverted.error || "失败"}`,
        cleanupPaths: [workDir],
      };
    }
  }
  let previewHtml = "";
  let rawText = "";
  try {
    const buf = fs.readFileSync(outDocx);
    rawText = await parseBufferToText(".docx", buf, outDocx);
    const docxPreview = await parseDocxPreviewHtml(buf);
    if (docxPreview) {
      // 优先使用 DOCX 生成的 HTML 预览，编码更稳定，避免 .doc->html 乱码。
      previewHtml = docxPreview;
    }
  } catch {
    rawText = "";
  }
  if (!previewHtml) {
    try {
      const htmlRaw = decodeBufferWithFallback(fs.readFileSync(outHtml));
      const inlined = inlineLocalImagesInHtml(htmlRaw, workDir);
      const body = normalizeWordHtmlForPreview(extractBodyHtml(inlined));
      previewHtml = body ? `<article class="doc-preview doc-preview--word">${sanitizePreviewHtml(body)}</article>` : "";
    } catch {
      previewHtml = "";
    }
  }
  return { ok: true, previewHtml, rawText, cleanupPaths: [workDir], via: comConverted.ok ? "com" : "soffice" };
}

async function parseFileToText(filePath, options = {}) {
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  const passwords =
    options.passwords ||
    collectIngestPasswordHints(options.batchFilePaths || [filePath], filePath);
  return parseBufferToText(ext, buf, filePath, { passwords });
}

async function removeChunksByIds(userDataPath, libraryId, chunkIds) {
  const ids = (chunkIds || []).map((x) => String(x || "")).filter(Boolean);
  if (!ids.length) {
    return;
  }
  const libDir = libraryDir(userDataPath, libraryId);
  const fts = loadFtsIndex(libDir);
  for (const id of ids) {
    await lanceDeleteByChunkId(userDataPath, libraryId, id).catch(() => {});
    removeChunkFromIndex(fts, id);
  }
  saveFtsIndex(libDir, fts);
}

async function removeDocumentFromLibrary(userDataPath, libraryId, docId) {
  const st = loadStore(userDataPath, libraryId);
  const before = st.chunks.length;
  st.documents = st.documents.filter((d) => d.id !== docId);
  st.chunks = st.chunks.filter((c) => c.docId !== docId);
  ensureGraphSnapshot(st, true);
  await lanceDeleteByDocId(userDataPath, libraryId, docId).catch(() => {});
  const libDir = libraryDir(userDataPath, libraryId);
  const fts = removeDocFromFtsIndex(loadFtsIndex(libDir), docId);
  saveFtsIndex(libDir, fts);
  saveStore(userDataPath, libraryId, st);
  return before - st.chunks.length;
}

async function applyIncrementalDocumentUpdate(userDataPath, libraryId, options) {
  const {
    host,
    model,
    st,
    docId,
    docRecord,
    pieces,
    docName,
    sourcePath,
    ext,
    corrected,
  } = options;
  const libDir = libraryDir(userDataPath, libraryId);
  const oldChunks = (st.chunks || []).filter((c) => String(c.docId) === String(docId));
  const specs = buildChunkSpecs(pieces, docName, sourcePath);
  const plan = planChunkIncrementalUpdate(oldChunks, specs);
  const dim0 = existingEmbeddingDim(st);

  let embeddings = [];
  if (plan.toEmbed.length) {
    const texts = plan.toEmbed.map((s) => s.indexedText);
    try {
      await assertOllamaEmbedReady(host, model);
      embeddings = await ollamaEmbedBatch(host, model, texts, 8, { role: "passage" });
    } catch (err) {
      throw new Error(err.message || String(err));
    }
    if (embeddings.length !== texts.length) {
      throw new Error("批量嵌入结果数量与待更新分片不一致");
    }
  }

  await removeChunksByIds(userDataPath, libraryId, plan.removeChunkIds);

  const finalChunks = [];
  plan.reuse.forEach(({ oldChunk, spec }) => {
    finalChunks.push({
      ...oldChunk,
      docId,
      docName,
      text: spec.indexedText,
      chunkIndex: spec.chunkIndex,
      charStart: spec.piece.charStart ?? oldChunk.charStart ?? 0,
      charEnd: spec.piece.charEnd ?? oldChunk.charEnd ?? spec.piece.text.length,
      chunkHash: spec.contentHash,
      docKind: spec.piece.docKind || oldChunk.docKind || detectDocKind(ext, corrected),
      updatedAt: new Date().toISOString(),
    });
  });

  const embeddedNew = [];
  plan.toEmbed.forEach((spec, idx) => {
    const emb = normalizeEmbedding(embeddings[idx], model);
    if (dim0 && emb.length !== dim0) {
      throw new Error(
        `嵌入维度与库中已有向量不一致（已有 ${dim0}维，当前 ${emb.length} 维）。请删除已有文档或统一 Ollama 嵌入模型后重试。`
      );
    }
    const chunk = {
      id: crypto.randomUUID(),
      docId,
      docName,
      text: spec.indexedText,
      chunkIndex: spec.chunkIndex,
      charStart: spec.piece.charStart ?? 0,
      charEnd: spec.piece.charEnd ?? spec.piece.text.length,
      chunkHash: spec.contentHash,
      docKind: spec.piece.docKind || detectDocKind(ext, corrected),
      embedding: emb,
      embeddingVersion: 1,
      ftsVersion: 1,
      updatedAt: new Date().toISOString(),
    };
    finalChunks.push(chunk);
    embeddedNew.push(chunk);
  });

  finalChunks.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));

  if (embeddedNew.length) {
    await lanceAppendChunks(userDataPath, libraryId, embeddedNew);
  }

  const fts = loadFtsIndex(libDir);
  finalChunks.forEach((chunk) => upsertChunkInIndex(fts, chunk, docRecord));
  saveFtsIndex(libDir, fts);

  st.chunks = (st.chunks || []).filter((c) => String(c.docId) !== String(docId)).concat(finalChunks);
  const docIdx = (st.documents || []).findIndex((d) => String(d.id) === String(docId));
  if (docIdx >= 0) {
    st.documents[docIdx] = {
      ...st.documents[docIdx],
      ...docRecord,
      chunkCount: finalChunks.length,
    };
  }

  return { finalChunks, plan };
}

/**
 * 单库混合召回（向量 + 关键词 + FTS），供 kb-search 并行调用。
 * @param {object} opts
 */
async function performLibraryRecall(opts) {
  const {
    userDataPath,
    libId,
    libDir,
    libName,
    libIndex,
    libTotal,
    st,
    q,
    queryVec,
    vectorEnabled,
    keywordRecallEnabled,
    candidateK,
    keywordLimit,
    queryType,
    hybridWeight,
    useRrf,
    profile,
    dim0,
    emitProgress,
  } = opts;
  const tLib = Date.now();
  emitProgress?.({
    phase: "recall_lib",
    message: `正在检索「${libName}」（${libIndex + 1}/${libTotal}）…`,
    detail: { libraryId: libId, libraryName: libName, index: libIndex, total: libTotal },
  });

  const chunkById = new Map((st.chunks || []).map((c) => [String(c.id), c]));
  const docById = new Map((st.documents || []).map((d) => [String(d.id), d]));
  const enrichHit = (h) => {
    const chunkMeta = chunkById.get(String(h.chunkId || "")) || {};
    const docMeta = docById.get(String(h.docId || chunkMeta.docId || "")) || {};
    const autoLearnMeta = docMeta.autoLearnMeta || null;
    const credibility =
      h.credibility || autoLearnMeta?.credibility || (docMeta.autoLearn ? "unconfirmed" : "");
    return {
      ...h,
      text: h.text || chunkMeta.text || "",
      chunkIndex: h.chunkIndex ?? chunkMeta.chunkIndex ?? null,
      charStart: h.charStart ?? chunkMeta.charStart ?? null,
      charEnd: h.charEnd ?? chunkMeta.charEnd ?? null,
      sourcePath: h.sourcePath || docMeta.sourcePath || "",
      sourceFile: h.sourceFile || docMeta.name || h.docName || "",
      libraryId: libId,
      libraryName: libName,
      autoLearn: docMeta.autoLearn === true,
      autoLearnMeta,
      credibility,
      sourceType: autoLearnMeta?.sourceType || "",
    };
  };
  const getMeta = (c) => {
    const docMeta = docById.get(String(c.docId || "")) || {};
    return { docName: c.docName, sourcePath: docMeta.sourcePath || "" };
  };

  const skipped = [];
  const recallStats = { vector: 0, keyword: 0, metadata: 0, fts: 0 };
  let vectorHits = [];
  if (vectorEnabled && queryVec) {
    const chunkTotal = await lanceCountChunks(userDataPath, libId, st);
    if (!chunkTotal) {
      skipped.push(`${libName}：无向量分片`);
    } else if (dim0 && queryVec.length !== dim0) {
      skipped.push(`${libName}：向量维度不匹配（库中 ${dim0}，查询 ${queryVec.length}）`);
    } else {
      let partial = [];
      try {
        partial = await lanceSearchByEmbedding(userDataPath, libId, queryVec, candidateK);
      } catch {
        hydrateChunkEmbeddings(libDir, st.chunks);
        partial = st.chunks
          .map((c) => ({
            score: cosineSimilarity(queryVec, c.embedding),
            docName: c.docName,
            docId: c.docId,
            chunkId: c.id,
            text: c.text,
          }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, candidateK);
      }
      vectorHits = partial.map((h) =>
        enrichHit({
          ...h,
          vectorScore: Number(h.score || 0),
        })
      );
      recallStats.vector += vectorHits.length;
    }
  }

  const keywordHits = keywordRecallEnabled
    ? scanChunksByKeyword(st.chunks, q, {
        limit: keywordLimit,
        getMeta,
        queryType,
      }).map(enrichHit)
    : [];
  recallStats.keyword += keywordHits.length;

  const literalQuery = queryType === "literal" || queryType === "doc_ref" || queryType === "section";
  const topicKeywordQuery = queryType === "topic_keyword";
  const metadataHits =
    keywordRecallEnabled && !literalQuery
      ? scanMetadataHits(st.chunks, q, {
          limit: topicKeywordQuery ? Math.min(60, keywordLimit * 2) : Math.min(30, keywordLimit),
          getMeta,
          minMetadataScore: topicKeywordQuery ? 0.68 : 0.45,
          dedupeByDoc: true,
        }).map(enrichHit)
      : [];
  recallStats.metadata += metadataHits.length;

  let ftsHits = [];
  if (keywordRecallEnabled && !literalQuery) {
    const ftsIndex = loadFtsIndex(libDir);
    if (!ftsIndex.docCount && (st.chunks || []).length) {
      const rebuilt = rebuildFtsIndex(st.chunks, st.documents);
      saveFtsIndex(libDir, rebuilt);
      ftsHits = searchFtsIndex(rebuilt, q, keywordLimit).map(enrichHit);
    } else {
      ftsHits = searchFtsIndex(ftsIndex, q, keywordLimit).map((row) => {
        const chunkMeta = chunkById.get(String(row.chunkId || "")) || {};
        return enrichHit({
          ...row,
          text: chunkMeta.text || "",
          ftsScore: row.ftsScore,
        });
      });
    }
    recallStats.fts += ftsHits.length;
  }

  const hits = mergeAndFuseHits(vectorHits, keywordHits, q, keywordRecallEnabled, hybridWeight, {
    metadataHits,
    ftsHits,
    queryType,
    useRrf,
    metadataWeight: profile.metadataBoost || 0.15,
  });
  const libMs = Date.now() - tLib;
  emitProgress?.({
    phase: "recall_lib_done",
    message: `「${libName}」完成：向量 ${recallStats.vector} · 关键词 ${recallStats.keyword} · 全文 ${recallStats.fts} · ${libMs}ms`,
    detail: { libraryId: libId, libraryName: libName, ms: libMs, recallStats, skipped },
  });
  return { hits, skipped, recallStats, libMs };
}

function buildChunksByDocId(chunks) {
  const map = new Map();
  (chunks || []).forEach((chunk) => {
    const docId = String(chunk.docId || "");
    if (!docId) {
      return;
    }
    if (!map.has(docId)) {
      map.set(docId, []);
    }
    map.get(docId).push(chunk);
  });
  map.forEach((list, docId) => {
    list.sort((a, b) => Number(a.chunkIndex) - Number(b.chunkIndex));
    map.set(docId, list);
  });
  return map;
}

function enrichAdjacentHitsFromStores(hits, storesByLibId) {
  return (hits || []).map((hit) => {
    if (hit.text) {
      return hit;
    }
    const libId = String(hit.libraryId || "");
    const st = storesByLibId.get(libId);
    const chunk = (st?.chunks || []).find((c) => String(c.id) === String(hit.chunkId || hit.id || ""));
    if (!chunk) {
      return hit;
    }
    return {
      ...hit,
      text: chunk.text || "",
      chunkIndex: hit.chunkIndex ?? chunk.chunkIndex ?? null,
      charStart: hit.charStart ?? chunk.charStart ?? null,
      charEnd: hit.charEnd ?? chunk.charEnd ?? null,
    };
  });
}

const KB_SEARCH_HIT_TEXT_IPC_MAX = 12000;

function sanitizeSearchHitForIpc(hit) {
  if (!hit || typeof hit !== "object") {
    return hit;
  }
  const out = { ...hit };
  delete out.embedding;
  if (typeof out.text === "string" && out.text.length > KB_SEARCH_HIT_TEXT_IPC_MAX) {
    out.text = out.text.slice(0, KB_SEARCH_HIT_TEXT_IPC_MAX);
  }
  return out;
}

function sanitizeSearchResultForIpc(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const hits = Array.isArray(result.hits) ? result.hits.map(sanitizeSearchHitForIpc) : [];
  return { ...result, hits };
}

/**
 * @param {import("electron").IpcMain} ipcMain
 * @param {{
 *   getUserDataPath: () => string,
 *   readOllamaSettings: () => { host?: string },
 *   verifyTextOnline?: (payload: { docName: string, text: string }) => Promise<{ correctedText?: string, summary?: string, sources?: string[] }>,
 *   webSearchBlockBuilder?: (query: string) => Promise<string>
 * }} deps
 */
function registerKnowledgeBaseHandlers(ipcMain, deps) {
  const { getUserDataPath, readOllamaSettings, verifyTextOnline, webSearchBlockBuilder } = deps;
  const ud = () => getUserDataPath();
  const activeLibraryId = () => readKbMeta(ud()).activeLibraryId;

  function emitKbIngestProgress(sender, payload) {
    try {
      if (sender && !sender.isDestroyed()) {
        sender.send("kb-ingest-progress", payload);
      }
    } catch {
      // ignore destroyed webContents
    }
  }

  function emitKbSearchProgress(sender, payload) {
    try {
      if (sender && !sender.isDestroyed()) {
        sender.send("kb-search-progress", payload);
      }
    } catch {
      // ignore destroyed webContents
    }
  }

  function emitKbSearchResult(sender, payload) {
    try {
      if (sender && !sender.isDestroyed()) {
        sender.send("kb-search-result", payload);
      }
    } catch {
      // ignore destroyed webContents
    }
  }

  /** @type {Map<string, (value: { ok: boolean, password?: string, remember?: boolean, canceled?: boolean }) => void>} */
  const pendingPasswordPrompts = new Map();

  function requestDocumentPasswordFromRenderer(sender, meta) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      pendingPasswordPrompts.set(requestId, resolve);
      emitKbIngestProgress(sender, {
        phase: "needs-password",
        requestId,
        filePath: meta.filePath,
        fileName: meta.fileName || path.basename(String(meta.filePath || "")),
        libraryId: meta.libraryId,
        fileMd5: meta.fileMd5 || "",
        message: meta.message || "该文档已加密，请输入密码以继续。",
        reason: meta.reason || "ingest",
      });
      try {
        if (sender && !sender.isDestroyed()) {
          sender.send("kb-document-password-request", {
            requestId,
            filePath: meta.filePath,
            fileName: meta.fileName || path.basename(String(meta.filePath || "")),
            libraryId: meta.libraryId,
            fileMd5: meta.fileMd5 || "",
            message: meta.message || "该文档已加密，请输入密码以继续。",
            reason: meta.reason || "ingest",
          });
        }
      } catch {
        pendingPasswordPrompts.delete(requestId);
        resolve({ ok: false, canceled: true });
      }
    });
  }

  function resolvePasswordPrompt(requestId, result) {
    const resolve = pendingPasswordPrompts.get(String(requestId || ""));
    if (resolve) {
      pendingPasswordPrompts.delete(String(requestId || ""));
      resolve(result);
    }
  }

  function mergeIngestPasswords(filePath, fileMd5, batchFilePaths, extraPasswords = []) {
    const hints = collectIngestPasswordHints(batchFilePaths, filePath);
    const vault = getPasswordsForFile(fileMd5, path.dirname(filePath));
    return [...new Set([...hints, ...vault, ...(extraPasswords || [])].map((x) => String(x || "").trim()).filter(Boolean))];
  }

  function removeLockedDocumentStub(st, doc) {
    if (!doc) {
      return;
    }
    st.documents = (st.documents || []).filter((d) => d.id !== doc.id);
    st.chunks = (st.chunks || []).filter((c) => c.docId !== doc.id);
  }

  async function registerLockedDocument(filePath, libraryId, options = {}) {
    const fp = String(filePath || "").trim();
    const libId = String(libraryId || activeLibraryId());
    const st = loadStore(ud(), libId);
    const docName = path.basename(fp);
    const fileMd5 = String(options.fileMd5 || computeFileMd5(fp));
    const existingPathDoc = findDocBySourcePath(st, fp);
    const dupMd5Doc = findDocByFileMd5(st, fileMd5, existingPathDoc?.id);
    const existing = existingPathDoc || dupMd5Doc;
    if (existing && existing.encryptionStatus !== "locked") {
      return {
        ok: true,
        skipped: true,
        reason: "unchanged",
        path: fp,
        name: docName,
        docId: existing.id,
      };
    }
    if (existing && existing.encryptionStatus === "locked") {
      return {
        ok: true,
        locked: true,
        path: fp,
        name: docName,
        docId: existing.id,
        message: `已登记加密文档（待解锁）：${docName}`,
      };
    }
    const fileStat = fs.statSync(fp);
    const docId = crypto.randomUUID();
    st.documents.push({
      id: docId,
      name: docName,
      sourcePath: fp,
      fileMd5,
      fileSize: fileStat.size,
      fileMtime: fileStat.mtime.toISOString(),
      normalizedPath: "",
      chunkCount: 0,
      encryptionStatus: "locked",
      createdAt: new Date().toISOString(),
      conversion: { applied: false, note: "文档已加密，待输入密码后完成索引" },
      verification: { enabled: false, summary: "" },
    });
    ensureGraphSnapshot(st, true);
    saveStore(ud(), libId, st);
    return {
      ok: true,
      locked: true,
      path: fp,
      name: docName,
      docId,
      message: `已登记加密文档（待解锁）：${docName}`,
    };
  }

  async function unlockDocumentWithPassword(docId, libraryId, password, options = {}) {
    const libId = String(libraryId || activeLibraryId());
    const st = loadStore(ud(), libId);
    const doc = (st.documents || []).find((d) => String(d?.id || "") === String(docId || ""));
    if (!doc) {
      return { ok: false, error: "未找到对应文档" };
    }
    const fp = String(doc.sourcePath || "").trim();
    if (!fp || !fs.existsSync(fp)) {
      return { ok: false, error: "源文件不存在或路径已失效" };
    }
    const pwd = String(password || "").trim();
    if (!pwd) {
      return { ok: false, error: "密码不能为空" };
    }
    if (options.remember !== false) {
      saveDocumentPassword(doc.fileMd5, pwd, path.dirname(fp));
    }
    removeLockedDocumentStub(st, doc);
    saveStore(ud(), libId, st);
    const ingested = await ingestOneFile(fp, libId, {
      extraPasswords: [pwd],
      batchFilePaths: [fp],
    });
    if (ingested.needsPassword) {
      await registerLockedDocument(fp, libId, { fileMd5: doc.fileMd5 });
      return { ok: false, error: "密码不正确或无法解密该文档", needsPassword: true };
    }
    if (!ingested.ok) {
      if (ingested.skipped) {
        return ingested;
      }
      return ingested;
    }
    return { ok: true, ...ingested, unlocked: true };
  }

  async function ingestWithPasswordPrompt(sender, filePath, libraryId, ingestOptions = {}) {
    let result = await ingestOneFile(filePath, libraryId, ingestOptions);
    let attempts = 0;
    while (result.needsPassword && sender && attempts < 5) {
      attempts += 1;
      const prompt = await requestDocumentPasswordFromRenderer(sender, {
        filePath,
        fileName: path.basename(filePath),
        libraryId,
        fileMd5: result.fileMd5,
        message: result.error || "该文档已加密，请输入密码以完成入库。",
        reason: "ingest",
      });
      if (!prompt.ok || !prompt.password) {
        const locked = await registerLockedDocument(filePath, libraryId, { fileMd5: result.fileMd5 });
        return { ...locked, passwordCanceled: true };
      }
      if (prompt.remember !== false) {
        saveDocumentPassword(result.fileMd5, prompt.password, path.dirname(filePath));
      }
      result = await ingestOneFile(filePath, libraryId, {
        ...ingestOptions,
        extraPasswords: [prompt.password],
      });
    }
    return result;
  }

  function listLibrariesState() {
    const meta = readKbMeta(ud());
    return {
      activeLibraryId: meta.activeLibraryId,
      libraries: meta.libraries,
    };
  }

  function findDocBySourcePath(st, filePath) {
    const normFp = path.normalize(String(filePath || "").trim());
    return (
      (st.documents || []).find((d) => {
        const sp = String(d?.sourcePath || "").trim();
        return sp && !sp.startsWith("ai://") && path.normalize(sp) === normFp;
      }) || null
    );
  }

  function findDocByFileMd5(st, fileMd5, excludeDocId = "") {
    const md5 = String(fileMd5 || "").trim();
    if (!md5) {
      return null;
    }
    return (
      (st.documents || []).find((d) => {
        if (excludeDocId && String(d?.id || "") === String(excludeDocId)) {
          return false;
        }
        return String(d?.fileMd5 || "") === md5;
      }) || null
    );
  }

  function normalizeIncomingFilePaths(filePaths) {
    const seenPath = new Set();
    const uniquePaths = [];
    (filePaths || []).forEach((fp) => {
      const raw = String(fp || "").trim();
      if (!raw) {
        return;
      }
      const norm = path.normalize(raw).toLowerCase();
      if (seenPath.has(norm)) {
        return;
      }
      seenPath.add(norm);
      uniquePaths.push(raw);
    });
    return uniquePaths;
  }

  /** 同一批选择中内容（MD5）相同的文件只保留一份，避免误报「重复」且阻断入库。 */
  function dedupeIncomingFilesByMd5(filePaths) {
    const paths = normalizeIncomingFilePaths(filePaths);
    const uniquePaths = [];
    const batchDuplicates = [];
    const md5ToFirstPath = new Map();
    for (const fp of paths) {
      if (!fs.existsSync(fp)) {
        uniquePaths.push(fp);
        continue;
      }
      let fileMd5 = "";
      try {
        fileMd5 = computeFileMd5(fp);
      } catch {
        uniquePaths.push(fp);
        continue;
      }
      const keptPath = md5ToFirstPath.get(fileMd5);
      if (keptPath) {
        batchDuplicates.push(
          buildIngestSkipPayload(fp, "duplicate-batch", null, {
            fileMd5,
            keptPath,
            message: `与本次已选「${path.basename(keptPath)}」内容相同，已自动合并：${path.basename(fp)}`,
          })
        );
        continue;
      }
      md5ToFirstPath.set(fileMd5, fp);
      uniquePaths.push(fp);
    }
    return { uniquePaths, batchDuplicates };
  }

  function findDocByFileMd5InLibrary(userDataPath, libraryId, fileMd5, excludeDocId = "") {
    const st = loadStore(userDataPath, libraryId);
    return findDocByFileMd5(st, fileMd5, excludeDocId);
  }

  function buildIngestSkipPayload(filePath, reason, existingDoc, extra = {}) {
    const fp = String(filePath || "").trim();
    const docName = path.basename(fp);
    const existingName = String(existingDoc?.name || "").trim();
    const existingPath = String(existingDoc?.sourcePath || "").trim();
    let message = String(extra.message || "").trim();
    if (!message) {
      if (reason === "unchanged") {
        message = `文件未变更，已跳过：${docName}`;
      } else if (reason === "duplicate-md5") {
        const libHint = extra.libraryName ? `（知识库「${extra.libraryName}」）` : "";
        message = `与已入库文档「${existingName || "未命名"}」${libHint}内容相同，已跳过：${docName}`;
      } else if (reason === "duplicate-batch") {
        const kept = String(extra.keptPath || "").trim();
        message = kept
          ? `与本次已选「${path.basename(kept)}」内容相同，已自动合并：${docName}`
          : `本次选择中已包含相同内容文件，已自动合并：${docName}`;
      } else if (reason === "password-hint") {
        message = String(extra.message || `密码提示文件，已跳过：${docName}`);
      } else {
        message = `重复文档已跳过：${docName}`;
      }
    }
    return {
      ok: true,
      skipped: true,
      reason,
      path: fp,
      name: docName,
      docId: existingDoc?.id || "",
      existingDocId: existingDoc?.id || "",
      existingName,
      existingPath,
      message,
      ...extra,
    };
  }

  async function inspectIngestDuplicates(filePaths, libraryId) {
    const st = loadStore(ud(), libraryId);
    const libName =
      (readKbMeta(ud()).libraries || []).find((x) => String(x.id || "") === String(libraryId || ""))?.name ||
      libraryId;
    const duplicates = [];
    const toIngest = [];
    const batchMd5 = new Set();
    for (const fp of filePaths || []) {
      const filePath = String(fp || "").trim();
      if (!filePath || !fs.existsSync(filePath)) {
        toIngest.push(filePath);
        continue;
      }
      let fileMd5 = "";
      try {
        fileMd5 = computeFileMd5(filePath);
      } catch {
        toIngest.push(filePath);
        continue;
      }
      const existingPathDoc = findDocBySourcePath(st, filePath);
      if (existingPathDoc && String(existingPathDoc.fileMd5 || "") === fileMd5) {
        duplicates.push(buildIngestSkipPayload(filePath, "unchanged", existingPathDoc, { fileMd5 }));
        continue;
      }
      const dupMd5Doc = findDocByFileMd5(st, fileMd5, existingPathDoc?.id);
      if (dupMd5Doc) {
        const chunkCount = (st.chunks || []).filter((c) => String(c.docId || "") === String(dupMd5Doc.id || "")).length;
        duplicates.push(
          buildIngestSkipPayload(filePath, "duplicate-md5", dupMd5Doc, {
            fileMd5,
            libraryName: libName,
            existingChunkCount: chunkCount,
            message:
              chunkCount > 0
                ? undefined
                : `与已入库文档「${dupMd5Doc.name || "未命名"}」内容相同，但该文档无有效分块，建议在文档列表删除后重新入库：${path.basename(filePath)}`,
          })
        );
        continue;
      }
      batchMd5.add(fileMd5);
      toIngest.push(filePath);
    }
    return { duplicates, toIngest, batchMd5 };
  }

  async function ingestOneFile(filePath, libraryId, options = {}) {
    const fp = String(filePath || "").trim();
    const report = (step) => {
      if (typeof options.onProgress === "function") {
        options.onProgress({ step });
      }
    };
    if (!fp || !fs.existsSync(fp)) {
      return { ok: false, error: "文件不存在" };
    }
    report("checking");
    const libId = String(libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const jobId = crypto.randomUUID();
    upsertIngestJob(libDir, {
      id: jobId,
      status: "running",
      filePath: fp,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    let st = loadStore(ud(), libId);
    const normFp = path.normalize(fp);
    const docName = path.basename(fp);
    const ext = path.extname(fp).toLowerCase();
    let fileMd5 = "";
    let existingPathDoc = null;
    let dupMd5Doc = null;
    try {
      fileMd5 = computeFileMd5(fp);
      existingPathDoc = findDocBySourcePath(st, fp);
      if (existingPathDoc && String(existingPathDoc.fileMd5 || "") === fileMd5) {
        if (existingPathDoc.encryptionStatus === "locked" && (options.extraPasswords || []).length) {
          removeLockedDocumentStub(st, existingPathDoc);
          existingPathDoc = null;
        } else if (existingPathDoc.encryptionStatus !== "locked") {
          const skipped = buildIngestSkipPayload(fp, "unchanged", existingPathDoc, { fileMd5 });
          upsertIngestJob(libDir, {
            id: jobId,
            status: "skipped",
            filePath: fp,
            docId: existingPathDoc.id,
            updatedAt: new Date().toISOString(),
            result: { reason: "unchanged" },
          });
          return skipped;
        }
      }
      dupMd5Doc = findDocByFileMd5(st, fileMd5, existingPathDoc?.id);
      if (dupMd5Doc && dupMd5Doc.encryptionStatus === "locked") {
        removeLockedDocumentStub(st, dupMd5Doc);
        dupMd5Doc = null;
      }
      if (dupMd5Doc) {
        const skipped = buildIngestSkipPayload(fp, "duplicate-md5", dupMd5Doc, { fileMd5 });
        upsertIngestJob(libDir, {
          id: jobId,
          status: "skipped",
          filePath: fp,
          docId: dupMd5Doc.id,
          updatedAt: new Date().toISOString(),
          result: { reason: "duplicate-md5" },
        });
        return skipped;
      }
      if (options.batchSeenMd5 instanceof Set) {
        if (options.batchSeenMd5.has(fileMd5)) {
          const skipped = buildIngestSkipPayload(fp, "duplicate-batch", null, { fileMd5 });
          upsertIngestJob(libDir, {
            id: jobId,
            status: "skipped",
            filePath: fp,
            updatedAt: new Date().toISOString(),
            result: { reason: "duplicate-batch" },
          });
          return skipped;
        }
        options.batchSeenMd5.add(fileMd5);
      }
    } catch (err) {
      return { ok: false, error: `文件校验失败：${err.message || String(err)}` };
    }

    report("parsing");
    const batchFilePaths = Array.isArray(options.batchFilePaths) ? options.batchFilePaths : [fp];
    const passwordHints = mergeIngestPasswords(fp, fileMd5, batchFilePaths, options.extraPasswords);
    if (isEmptyPasswordHintFile(fp)) {
      const pwd = extractPasswordFromHintFileName(docName);
      const skipped = buildIngestSkipPayload(fp, "password-hint", null, {
        message: `密码提示文件（密码：${pwd}），已用于解密同目录 Excel，无需单独入库：${docName}`,
      });
      upsertIngestJob(libDir, {
        id: jobId,
        status: "skipped",
        filePath: fp,
        updatedAt: new Date().toISOString(),
        result: { reason: "password-hint" },
      });
      return skipped;
    }
    let text = "";
    try {
      text = await parseFileToText(fp, { passwords: passwordHints, batchFilePaths });
    } catch (err) {
      if (isEncryptedDocumentError(err)) {
        upsertIngestJob(libDir, {
          id: jobId,
          status: "needs-password",
          filePath: fp,
          updatedAt: new Date().toISOString(),
          result: { reason: "needs-password", fileMd5 },
        });
        return {
          ok: false,
          needsPassword: true,
          path: fp,
          name: docName,
          fileMd5,
          libraryId: libId,
          error: formatIngestParseError(err, ext, fp),
        };
      }
      return {
        ok: false,
        path: fp,
        error: formatIngestParseError(err, ext, fp),
      };
    }
    const plain = text.replace(/\u0000/g, "").trim();
    if (!plain) {
      if (isPasswordHintTextFile(fp)) {
        const skipped = buildIngestSkipPayload(fp, "password-hint", null, {
          message: `密码提示文件无可读正文，已跳过：${docName}`,
        });
        upsertIngestJob(libDir, {
          id: jobId,
          status: "skipped",
          filePath: fp,
          updatedAt: new Date().toISOString(),
          result: { reason: "password-hint" },
        });
        return skipped;
      }
      return {
        ok: false,
        path: fp,
        error:
          ext === ".txt" || ext === ".md" || ext === ".markdown"
            ? "文本文件为空或无可读内容"
            : "未能解析出文本（已尝试扫描版 OCR；请确保图像清晰或文档含可复制文本）",
      };
    }
    const { chunkSize, chunkOverlap, embedModel, chunkStrategy } = st.settings;
    const normalizedByAdapter = !CANONICAL_KB_EXTS.has(ext);
    let corrected = plain;
    let verifySummary = "";
    let verifySources = [];
    if (st.settings.autoWebVerify && typeof verifyTextOnline === "function") {
      try {
        const vr = await verifyTextOnline({ docName, text: plain });
        const next = String(vr?.correctedText || "").trim();
        if (next) {
          corrected = next;
        }
        verifySummary = String(vr?.summary || "").trim();
        verifySources = Array.isArray(vr?.sources) ? vr.sources : [];
      } catch (err) {
        verifySummary = `联网核验未完成：${err.message || String(err)}`;
      }
    }
    report("chunking");
    const pieces = chunkText(corrected, chunkSize, chunkOverlap, chunkStrategy || "semantic", ext);
    if (!pieces.length) {
      return { ok: false, path: fp, error: "分片后为空" };
    }
    let normalizedPath = "";
    if (normalizedByAdapter) {
      normalizedPath = saveNormalizedTextArtifact(ud(), libId, fp, corrected);
    }
    const host = readOllamaSettings().host;
    const model = String(embedModel || "bge-m3").trim();
    const fileStat = fs.statSync(fp);
    const conversion = normalizedByAdapter
      ? { applied: true, fromExt: ext || "", to: "normalized-txt", note: "自动转换为文本后入库" }
      : { applied: false, fromExt: ext || "", to: "", note: "" };
    const verification = st.settings.autoWebVerify
      ? { enabled: true, summary: verifySummary || "已自动联网核验并尝试修正。", sources: verifySources }
      : { enabled: false, summary: "" };

    async function finishIngest(docId, chunkCount, extra = {}) {
      ensureGraphSnapshot(st, true);
      saveStore(ud(), libId, st);
      upsertIngestJob(libDir, {
        id: jobId,
        status: "done",
        filePath: fp,
        docId,
        updatedAt: new Date().toISOString(),
        result: { chunkCount, name: docName, ...extra },
      });
      return {
        ok: true,
        path: fp,
        docId,
        name: docName,
        chunkCount,
        verification: st.settings.autoWebVerify ? { summary: verifySummary, sources: verifySources } : null,
        ...extra,
      };
    }

    const targetDoc = existingPathDoc || null;
    if (targetDoc) {
      const docId = targetDoc.id;
      const docRecord = {
        id: docId,
        name: docName,
        sourcePath: fp,
        fileMd5,
        fileSize: fileStat.size,
        fileMtime: fileStat.mtime.toISOString(),
        normalizedPath: normalizedPath || targetDoc.normalizedPath || "",
        conversion: normalizedByAdapter ? conversion : targetDoc.conversion || conversion,
        createdAt: targetDoc.createdAt || new Date().toISOString(),
        verification: st.settings.autoWebVerify ? verification : targetDoc.verification || verification,
        encryptionStatus: "",
      };
      try {
        report("embedding");
        const { finalChunks, plan } = await applyIncrementalDocumentUpdate(ud(), libId, {
          host,
          model,
          st,
          docId,
          docRecord,
          pieces,
          docName,
          sourcePath: fp,
          ext,
          corrected,
        });
        report("saving");
        return finishIngest(docId, finalChunks.length, {
          incremental: true,
          reusedChunks: plan.reusedCount,
          embeddedChunks: plan.embedCount,
          removedChunks: plan.removedCount,
        });
      } catch (err) {
        return { ok: false, path: fp, error: err.message || String(err) };
      }
    }

    const dim0 = existingEmbeddingDim(st);
    const docId = crypto.randomUUID();
    const specs = buildChunkSpecs(pieces, docName, fp);
    let embeddings;
    try {
      report("embedding");
      await assertOllamaEmbedReady(host, model);
      embeddings = await ollamaEmbedBatch(
        host,
        model,
        specs.map((s) => s.indexedText),
        8,
        { role: "passage" }
      );
    } catch (err) {
      return { ok: false, path: fp, error: err.message || String(err) };
    }
    if (embeddings.length !== specs.length) {
      return { ok: false, path: fp, error: "批量嵌入结果数量与分片不一致" };
    }
    const newChunks = [];
    for (let idx = 0; idx < specs.length; idx += 1) {
      const emb = normalizeEmbedding(embeddings[idx], model);
      if (dim0 && emb.length !== dim0) {
        return {
          ok: false,
          path: fp,
          error: `嵌入维度与库中已有向量不一致（已有 ${dim0}维，当前 ${emb.length} 维）。请删除已有文档或统一 Ollama 嵌入模型后重试。`,
        };
      }
      const spec = specs[idx];
      newChunks.push({
        id: crypto.randomUUID(),
        docId,
        docName,
        text: spec.indexedText,
        chunkIndex: spec.chunkIndex,
        charStart: spec.piece.charStart ?? 0,
        charEnd: spec.piece.charEnd ?? spec.piece.text.length,
        chunkHash: spec.contentHash,
        docKind: spec.piece.docKind || detectDocKind(ext, corrected),
        embedding: emb,
        embeddingVersion: 1,
        ftsVersion: 1,
      });
    }
    st.documents.push({
      id: docId,
      name: docName,
      sourcePath: fp,
      fileMd5,
      fileSize: fileStat.size,
      fileMtime: fileStat.mtime.toISOString(),
      normalizedPath,
      conversion,
      chunkCount: newChunks.length,
      createdAt: new Date().toISOString(),
      verification,
      encryptionStatus: "",
    });
    st.chunks.push(...newChunks);
    report("saving");
    await lanceAppendChunks(ud(), libId, newChunks);
    const fts = loadFtsIndex(libDir);
    const docMeta = st.documents.find((d) => d.id === docId) || { id: docId, name: docName, sourcePath: fp };
    newChunks.forEach((chunk) => upsertChunkInIndex(fts, chunk, docMeta));
    saveFtsIndex(libDir, fts);
    return finishIngest(docId, newChunks.length, { incremental: false });
  }

  const kbWatch = createKbWatchService({
    ingestFile: async (fp, libraryId) => {
      const r = await ingestOneFile(fp, libraryId, { batchFilePaths: [fp] });
      if (r.needsPassword) {
        return registerLockedDocument(fp, libraryId, { fileMd5: r.fileMd5 });
      }
      return r;
    },
    loadLibrarySettings: (libraryId) => loadStore(ud(), libraryId).settings || {},
    listLibraryIds: () => (readKbMeta(ud()).libraries || []).map((x) => String(x.id || "")).filter(Boolean),
  });

  async function commitAutoLearnIngest(libId, payload, options = {}) {
    const p = payload && typeof payload === "object" ? payload : {};
    const question = normalizeAutoLearnText(p.question || p.query || "", 2000);
    const answer = normalizeAutoLearnText(p.answer || p.reply || "", 7000);
    const st = loadStore(ud(), libId);
    const sourceType = String(p.sourceType || "chat").trim() || "chat";
    const model = String(st.settings.embedModel || "bge-m3").trim();
    const host = readOllamaSettings().host;
    const dedupSeed = `${question}\n${answer}`.toLowerCase();
    const autoLearnKey = crypto.createHash("sha1").update(dedupSeed).digest("hex");
    const existed = (st.documents || []).some((d) => String(d?.autoLearnKey || "") === autoLearnKey);
    if (existed) {
      return { ok: true, skipped: true, reason: "duplicate", libraryId: libId };
    }
    const recordId = crypto.randomUUID();
    const autoLearnMeta = buildAutoLearnMeta({
      ...p,
      question,
      answer,
      sourceType,
      credibility: options.credibility || p.credibility || st.settings.autoLearnCredibilityDefault,
      recordId,
      sessionId: p.sessionId,
      modelName: p.modelName,
    });
    const docText = buildAutoLearnDocText(question, answer, sourceType);
    const pieces = chunkText(
      docText,
      st.settings.chunkSize,
      st.settings.chunkOverlap,
      st.settings.chunkStrategy || "semantic"
    );
    if (!pieces.length) {
      return { ok: false, error: "自动学习分片为空" };
    }
    const dim0 = existingEmbeddingDim(st);
    const docId = crypto.randomUUID();
    const docName = `自动学习_${sourceType}_${new Date().toISOString().slice(0, 10)}_${autoLearnKey.slice(0, 6)}`;
    const sourcePath = `ai://auto-learn/${sourceType}`;
    const specs = buildChunkSpecs(pieces, docName, sourcePath);
    const embeddings = await ollamaEmbedBatch(
      host,
      model,
      specs.map((s) => s.indexedText),
      8,
      { role: "passage" }
    );
    const newChunks = [];
    for (let idx = 0; idx < specs.length; idx += 1) {
      const emb = normalizeEmbedding(embeddings[idx], model);
      if (dim0 && emb.length !== dim0) {
        throw new Error(`自动学习入库失败：向量维度不一致（已有 ${dim0}，当前 ${emb.length}）`);
      }
      const spec = specs[idx];
      newChunks.push({
        id: crypto.randomUUID(),
        docId,
        docName,
        text: spec.indexedText,
        chunkIndex: spec.chunkIndex,
        charStart: spec.piece.charStart ?? 0,
        charEnd: spec.piece.charEnd ?? spec.piece.text.length,
        chunkHash: spec.contentHash,
        embedding: emb,
        embeddingVersion: 1,
        ftsVersion: 1,
        updatedAt: new Date().toISOString(),
      });
    }
    st.documents.push({
      id: docId,
      name: docName,
      sourcePath,
      normalizedPath: "",
      chunkCount: newChunks.length,
      createdAt: new Date().toISOString(),
      autoLearn: true,
      autoLearnKey,
      autoLearnMeta,
      questionPreview: question.slice(0, 160),
      verification: { enabled: false, summary: "由自动学习模式生成（待人工确认可提高检索权重）" },
    });
    st.chunks.push(...newChunks);
    ensureGraphSnapshot(st, true);
    await lanceAppendChunks(ud(), libId, newChunks);
    const libDir = libraryDir(ud(), libId);
    const fts = loadFtsIndex(libDir);
    const docMeta = st.documents.find((d) => d.id === docId) || { id: docId, name: docName, sourcePath };
    newChunks.forEach((chunk) => upsertChunkInIndex(fts, chunk, docMeta));
    saveFtsIndex(libDir, fts);
    saveStore(ud(), libId, st);
    appendAutoLearnAudit(libDir, {
      id: crypto.randomUUID(),
      libraryId: libId,
      docId,
      queueId: String(options.queueId || ""),
      action: options.auditAction || "ingest",
      questionPreview: question,
      answerPreview: answer,
      sourceType,
      credibility: autoLearnMeta.credibility,
      meta: { autoLearnKey, recordId },
    });
    return {
      ok: true,
      libraryId: libId,
      docId,
      name: docName,
      chunkCount: newChunks.length,
      autoLearnMeta,
      recordId,
    };
  }

  async function ingestAutoLearnTurn(payload) {
    const p = payload && typeof payload === "object" ? payload : {};
    const question = normalizeAutoLearnText(p.question || p.query || "", 2000);
    const answer = normalizeAutoLearnText(p.answer || p.reply || "", 7000);
    if (!question || !answer) {
      return { ok: false, error: "question 与 answer 不能为空" };
    }
    const libIdRaw = String(p.libraryId || "").trim();
    const meta = readKbMeta(ud());
    const libId = meta.libraries.some((x) => x.id === libIdRaw) ? libIdRaw : activeLibraryId();
    const st = loadStore(ud(), libId);
    if (st.settings.autoLearnEnabled !== true) {
      return { ok: true, skipped: true, reason: "auto-learn-disabled", libraryId: libId };
    }
    const threshold = meetsAutoLearnThreshold(question, answer, st.settings);
    if (!threshold.ok) {
      return { ok: true, skipped: true, reason: threshold.reason, libraryId: libId, threshold };
    }
    const dedupSeed = `${question}\n${answer}`.toLowerCase();
    const autoLearnKey = crypto.createHash("sha1").update(dedupSeed).digest("hex");
    const existed = (st.documents || []).some((d) => String(d?.autoLearnKey || "") === autoLearnKey);
    if (existed) {
      return { ok: true, skipped: true, reason: "duplicate", libraryId: libId };
    }
    if (shouldQueueAutoLearn(st.settings) && p.forceIngest !== true) {
      const queueId = crypto.randomUUID();
      const libDir = libraryDir(ud(), libId);
      enqueueAutoLearn(libDir, {
        id: queueId,
        libraryId: libId,
        question,
        answer,
        sourceType: String(p.sourceType || "chat").trim() || "chat",
        status: QUEUE_STATUS.PENDING,
        credibility: normalizeCredibility(st.settings.autoLearnCredibilityDefault),
        sessionId: String(p.sessionId || ""),
        modelName: String(p.modelName || ""),
        payload: p,
      });
      appendAutoLearnAudit(libDir, {
        id: crypto.randomUUID(),
        libraryId: libId,
        queueId,
        action: "queued",
        questionPreview: question,
        answerPreview: answer,
        sourceType: String(p.sourceType || "chat"),
        credibility: normalizeCredibility(st.settings.autoLearnCredibilityDefault),
      });
      return {
        ok: true,
        queued: true,
        queueId,
        libraryId: libId,
        reason: "pending-review",
      };
    }
    try {
      return await commitAutoLearnIngest(libId, p, {
        credibility: normalizeCredibility(st.settings.autoLearnCredibilityDefault),
        auditAction: "ingest",
      });
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  }

  ipcMain.handle("kb-get-state", async () => {
    const meta = readKbMeta(ud());
    const st = loadStore(ud(), meta.activeLibraryId);
    const storageSetting = readKbStorageSettings(ud());
    const resolvedRoot = kbRoot(ud());
    const rootDetails = kbRootDetails(ud());
    const chunkTotal = await lanceCountChunks(ud(), meta.activeLibraryId, st);
    const graph = ensureGraphSnapshot(st, false);
    saveStore(ud(), meta.activeLibraryId, st);
    const allLibIds = (meta.libraries || []).map((x) => x.id);
    const globalGraph = ensureGlobalGraphSnapshot(ud(), meta, allLibIds, false);
    const docsByLibrary = (meta.libraries || []).map((lib) => {
      const ls = loadStore(ud(), lib.id);
      return {
        id: lib.id,
        name: lib.name || lib.id,
        docCount: Array.isArray(ls.documents) ? ls.documents.length : 0,
        chunkCount: Array.isArray(ls.chunks) ? ls.chunks.length : 0,
        documents: (ls.documents || []).map((d) => ({
          id: d.id,
          name: d.name,
          chunkCount: d.chunkCount,
          createdAt: d.createdAt,
          verification: d.verification || null,
          autoLearn: d.autoLearn === true,
          autoLearnMeta: d.autoLearnMeta || null,
          questionPreview: d.questionPreview || "",
        })),
      };
    });
    return {
      activeLibraryId: meta.activeLibraryId,
      libraries: meta.libraries,
      storageRoot: resolvedRoot,
      storageCustomRoot: storageSetting.customRoot || "",
      storageRootMode: rootDetails.mode,
      settings: st.settings,
      documents: st.documents.map((d) => ({
        id: d.id,
        name: d.name,
        chunkCount: d.chunkCount,
        createdAt: d.createdAt,
        verification: d.verification || null,
        autoLearn: d.autoLearn === true,
        autoLearnMeta: d.autoLearnMeta || null,
        questionPreview: d.questionPreview || "",
      })),
      docsByLibrary,
      chunkTotal,
      graphSummary: graph?.summary || { nodeCount: 0, edgeCount: 0, docNodeCount: 0, sectionNodeCount: 0, topNodes: [] },
      watchStatus: kbWatch.getLibraryStatus(meta.activeLibraryId),
      watchStatuses: kbWatch.getAllStatus(),
      globalGraphSummary: globalGraph?.summary || {
        nodeCount: 0,
        edgeCount: 0,
        docNodeCount: 0,
        sectionNodeCount: 0,
        topNodes: [],
      },
      storageBackend: "sqlite",
      sqlitePath: sqliteDbPath(libraryDir(ud(), meta.activeLibraryId)),
    };
  });

  ipcMain.handle("kb-library-list", () => listLibrariesState());

  ipcMain.handle("kb-storage-choose-dir", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "选择知识库存储目录",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: res.filePaths[0] };
  });

  ipcMain.handle("kb-storage-set-dir", (_e, dirPath) => {
    let p = "";
    try {
      p = dirPath ? assertAbsolutePath(dirPath, { label: "存储目录" }) : "";
    } catch (err) {
      return { ok: false, error: err?.message || "无效存储目录" };
    }
    if (p && !fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
    writeKbStorageSettings(ud(), { customRoot: p });
    ensureKbInitialized(ud());
    const details = kbRootDetails(ud());
    writeKbStorageSettings(ud(), { resolvedKbRoot: details.root });
    return { ok: true, storageRoot: details.root, storageCustomRoot: p, storageRootMode: details.mode };
  });

  ipcMain.handle("kb-open-library-dir", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const dir = libraryDir(ud(), libId);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const result = await shell.openPath(dir);
    if (result) {
      return { ok: false, error: `打开失败：${result}` };
    }
    return { ok: true, path: dir };
  });

  ipcMain.handle("kb-library-create", (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const name = String(p.name || "").trim();
    if (!name) {
      return { ok: false, error: "知识库名称不能为空" };
    }
    const meta = readKbMeta(ud());
    let id = normalizeLibraryId(p.id || name);
    if (meta.libraries.some((x) => x.id === id)) {
      id = `${id}-${Date.now()}`;
    }
    const item = { id, name, createdAt: new Date().toISOString() };
    meta.libraries.push(item);
    if (p.setActive !== false) {
      meta.activeLibraryId = id;
    }
    saveKbMeta(ud(), meta);
    saveStore(ud(), id, defaultStore());
    return { ok: true, library: item, activeLibraryId: meta.activeLibraryId, libraries: meta.libraries };
  });

  ipcMain.handle("kb-library-set-active", (_e, libraryId) => {
    let id = "";
    try {
      id = assertKbLibraryId(libraryId);
    } catch (err) {
      return { ok: false, error: err?.message || "无效知识库 id" };
    }
    const meta = readKbMeta(ud());
    if (!meta.libraries.some((x) => x.id === id)) {
      return { ok: false, error: "未找到该知识库目录" };
    }
    meta.activeLibraryId = id;
    saveKbMeta(ud(), meta);
    return { ok: true, activeLibraryId: id, libraries: meta.libraries };
  });

  ipcMain.handle("kb-library-rename", (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let id = "";
    try {
      id = assertKbLibraryId(p.id, "知识库目录 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少知识库目录 id" };
    }
    const name = String(p.name || "").trim();
    if (!name) {
      return { ok: false, error: "知识库名称不能为空" };
    }
    const meta = readKbMeta(ud());
    const idx = meta.libraries.findIndex((x) => x.id === id);
    if (idx < 0) {
      return { ok: false, error: "未找到该知识库目录" };
    }
    meta.libraries[idx] = {
      ...meta.libraries[idx],
      name,
      updatedAt: new Date().toISOString(),
    };
    saveKbMeta(ud(), meta);
    return { ok: true, library: meta.libraries[idx], activeLibraryId: meta.activeLibraryId, libraries: meta.libraries };
  });

  ipcMain.handle("kb-library-delete", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let id = "";
    try {
      id = assertKbLibraryId(p.id, "知识库目录 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少知识库目录 id" };
    }
    const meta = readKbMeta(ud());
    if (meta.libraries.length <= 1) {
      return { ok: false, error: "至少保留一个知识库目录" };
    }
    const idx = meta.libraries.findIndex((x) => x.id === id);
    if (idx < 0) {
      return { ok: false, error: "未找到该知识库目录" };
    }
    const libDir = libraryDir(ud(), id);
    const deletedName = meta.libraries[idx]?.name || id;
    const warnings = [];
    try {
      kbWatch.stopWatch(id);
      closeLibraryDb(libDir);
      closeAllLibraryDbs();
      meta.libraries.splice(idx, 1);
      if (meta.activeLibraryId === id) {
        meta.activeLibraryId = meta.libraries[0]?.id || "default";
      }
      saveKbMeta(ud(), meta);
      try {
        await dropLanceTable(ud(), id);
      } catch (err) {
        warnings.push(`向量索引清理失败：${err?.message || String(err)}`);
      }
      try {
        if (fs.existsSync(libDir)) {
          fs.rmSync(libDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
        }
      } catch (err) {
        warnings.push(`目录文件清理失败：${err?.message || String(err)}`);
      }
      try {
        const normRoot = path.join(kbRoot(ud()), "normalized", id);
        if (fs.existsSync(normRoot)) {
          fs.rmSync(normRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
        }
      } catch (err) {
        warnings.push(`规范化目录清理失败：${err?.message || String(err)}`);
      }
      return {
        ok: true,
        deletedId: id,
        deletedName,
        activeLibraryId: meta.activeLibraryId,
        libraries: meta.libraries,
        warning: warnings.filter(Boolean).join("；"),
      };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-set-settings", async (_e, payload) => {
    const st = loadStore(ud(), activeLibraryId());
    const p = payload && typeof payload === "object" ? payload : {};
    if (p.chunkSize != null) {
      st.settings.chunkSize = Math.max(200, Math.min(4000, Number(p.chunkSize)));
    }
    if (p.chunkOverlap != null) {
      st.settings.chunkOverlap = Math.max(0, Math.min(2000, Number(p.chunkOverlap)));
    }
    if (p.embedModel != null) {
      st.settings.embedModel = String(p.embedModel).trim() || st.settings.embedModel;
    }
    if (p.searchTopK != null) {
      st.settings.searchTopK = Math.max(1, Math.min(20, Number(p.searchTopK)));
    }
    if (p.searchMinScore != null) {
      st.settings.searchMinScore = Math.max(0, Math.min(1, Number(p.searchMinScore)));
    }
    if (p.searchCandidateK != null) {
      st.settings.searchCandidateK = Math.max(20, Math.min(300, Number(p.searchCandidateK)));
    }
    if (p.hybridSearch != null) {
      st.settings.hybridSearch = Boolean(p.hybridSearch);
    }
    if (p.hybridVectorWeight != null) {
      st.settings.hybridVectorWeight = Math.max(0.1, Math.min(0.95, Number(p.hybridVectorWeight)));
    }
    if (p.useRrfRanking != null) {
      st.settings.useRrfRanking = Boolean(p.useRrfRanking);
    }
    if (p.rerankEnabled != null) {
      st.settings.rerankEnabled = Boolean(p.rerankEnabled);
    }
    if (p.rerankModel != null) {
      st.settings.rerankModel = String(p.rerankModel).trim() || st.settings.rerankModel;
    }
    if (p.rerankProvider != null) {
      const rp = String(p.rerankProvider || "").trim().toLowerCase();
      st.settings.rerankProvider = ["auto", "ollama", "onnx"].includes(rp) ? rp : "auto";
    }
    if (p.rerankTopN != null) {
      st.settings.rerankTopN = Math.max(5, Math.min(80, Number(p.rerankTopN)));
    }
    if (p.rerankWeight != null) {
      st.settings.rerankWeight = Math.max(0.1, Math.min(0.95, Number(p.rerankWeight)));
    }
    if (p.keywordRecallLimit != null) {
      st.settings.keywordRecallLimit = Math.max(10, Math.min(150, Number(p.keywordRecallLimit)));
    }
    if (p.searchMode != null) {
      const mode = String(p.searchMode || "").trim().toLowerCase();
      st.settings.searchMode = ["auto", "semantic", "keyword", "hybrid"].includes(mode) ? mode : "auto";
    }
    if (p.chunkStrategy != null) {
      const mode = String(p.chunkStrategy || "").trim().toLowerCase();
      st.settings.chunkStrategy = mode === "fixed" ? "fixed" : "semantic";
    }
    if (p.autoWebVerify != null) {
      st.settings.autoWebVerify = Boolean(p.autoWebVerify);
    }
    if (p.aiVerifyWriteback != null) {
      st.settings.aiVerifyWriteback = Boolean(p.aiVerifyWriteback);
    }
    if (p.autoLearnEnabled != null) {
      st.settings.autoLearnEnabled = Boolean(p.autoLearnEnabled);
    }
    if (p.autoLearnRequireConfirm != null) {
      st.settings.autoLearnRequireConfirm = Boolean(p.autoLearnRequireConfirm);
    }
    if (p.autoLearnMinAnswerChars != null) {
      st.settings.autoLearnMinAnswerChars = Math.max(20, Math.min(2000, Number(p.autoLearnMinAnswerChars)));
    }
    if (p.autoLearnMinQuestionChars != null) {
      st.settings.autoLearnMinQuestionChars = Math.max(1, Math.min(200, Number(p.autoLearnMinQuestionChars)));
    }
    if (p.autoLearnCredibilityDefault != null) {
      st.settings.autoLearnCredibilityDefault = normalizeCredibility(p.autoLearnCredibilityDefault);
    }
    if (p.watchDirEnabled != null) {
      st.settings.watchDirEnabled = Boolean(p.watchDirEnabled);
    }
    if (p.watchDirPath != null) {
      const raw = String(p.watchDirPath || "").trim();
      if (!raw) {
        st.settings.watchDirPath = "";
      } else {
        try {
          st.settings.watchDirPath = assertAbsolutePath(raw, { mustExist: true, label: "监控目录" });
        } catch (err) {
          return { ok: false, error: err?.message || "无效监控目录" };
        }
      }
    }
    if (p.watchDirRecursive != null) {
      st.settings.watchDirRecursive = Boolean(p.watchDirRecursive);
    }
    const validated = validateKbSettings(st.settings);
    if (validated.errors.length) {
      return { ok: false, error: validated.errors.join(" ") };
    }
    Object.assign(st.settings, validated.settings);
    const libId = activeLibraryId();
    saveStore(ud(), libId, st);
    const watchSync = await kbWatch.syncLibrary(libId);
    return { ok: true, settings: st.settings, watchSync };
  });

  ipcMain.handle("kb-watch-choose-dir", async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "选择监控目录（新增/修改文件将自动入库）",
      properties: ["openDirectory"],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, canceled: true };
    }
    return { ok: true, path: res.filePaths[0] };
  });

  ipcMain.handle("kb-watch-scan-now", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const meta = readKbMeta(ud());
    if (!(meta.libraries || []).some((x) => x.id === libId)) {
      return { ok: false, error: "知识库不存在" };
    }
    return kbWatch.scanDirectory(libId, "manual-scan");
  });

  ipcMain.handle("kb-auto-learn-ingest", async (_e, payload) => {
    try {
      return await ingestAutoLearnTurn(payload);
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  function mapAutoLearnQueueRow(row) {
    if (!row) {
      return null;
    }
    let payload = {};
    try {
      payload = JSON.parse(row.payload_json || "{}");
    } catch {
      payload = {};
    }
    return {
      id: row.id,
      libraryId: row.library_id,
      question: row.question,
      answer: row.answer,
      sourceType: row.source_type,
      status: row.status,
      credibility: row.credibility,
      sessionId: row.session_id,
      modelName: row.model_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      payload,
    };
  }

  ipcMain.handle("kb-auto-learn-queue-list", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const status = String(p.status || "pending");
    const limit = Math.max(1, Math.min(200, Number(p.limit) || 50));
    const rows = listAutoLearnQueue(libDir, status, limit);
    return {
      ok: true,
      libraryId: libId,
      status,
      pendingCount: countAutoLearnQueue(libDir, "pending"),
      items: rows.map(mapAutoLearnQueueRow),
    };
  });

  ipcMain.handle("kb-auto-learn-approve", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let queueId = "";
    try {
      queueId = assertUuid(p.queueId, "队列 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少队列 id" };
    }
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const row = getAutoLearnQueueItem(libDir, queueId);
    if (!row) {
      return { ok: false, error: "待审核条目不存在" };
    }
    if (row.status !== QUEUE_STATUS.PENDING) {
      return { ok: false, error: `条目状态为 ${row.status}，无法批准` };
    }
    let ingestPayload = {};
    try {
      ingestPayload = JSON.parse(row.payload_json || "{}");
    } catch {
      ingestPayload = {};
    }
    ingestPayload.question = row.question;
    ingestPayload.answer = row.answer;
    ingestPayload.sourceType = row.source_type;
    ingestPayload.sessionId = row.session_id;
    ingestPayload.modelName = row.model_name;
    ingestPayload.forceIngest = true;
    try {
      const result = await commitAutoLearnIngest(libId, ingestPayload, {
        queueId,
        credibility: normalizeCredibility(p.credibility || CREDIBILITY.CONFIRMED),
        auditAction: "approve",
      });
      if (!result.ok) {
        return result;
      }
      updateAutoLearnQueueItem(libDir, queueId, {
        status: QUEUE_STATUS.INGESTED,
        credibility: normalizeCredibility(p.credibility || CREDIBILITY.CONFIRMED),
      });
      return { ok: true, ...result, queueId };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-auto-learn-reject", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let queueId = "";
    try {
      queueId = assertUuid(p.queueId, "队列 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少队列 id" };
    }
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const row = getAutoLearnQueueItem(libDir, queueId);
    if (!row) {
      return { ok: false, error: "待审核条目不存在" };
    }
    if (row.status !== QUEUE_STATUS.PENDING) {
      return { ok: false, error: `条目状态为 ${row.status}，无法拒绝` };
    }
    updateAutoLearnQueueItem(libDir, queueId, { status: QUEUE_STATUS.REJECTED });
    appendAutoLearnAudit(libDir, {
      id: crypto.randomUUID(),
      libraryId: libId,
      queueId,
      action: "reject",
      questionPreview: row.question,
      answerPreview: row.answer,
      sourceType: row.source_type,
      credibility: row.credibility,
    });
    return { ok: true, queueId, libraryId: libId };
  });

  ipcMain.handle("kb-auto-learn-promote", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let docId = "";
    try {
      docId = assertUuid(p.docId, "文档 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少文档 id" };
    }
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const st = loadStore(ud(), libId);
    const doc = (st.documents || []).find((d) => d.id === docId);
    if (!doc) {
      return { ok: false, error: "文档不存在" };
    }
    if (doc.autoLearn !== true) {
      return { ok: false, error: "仅自动学习文档可提升可信度" };
    }
    const nextCred = normalizeCredibility(p.credibility || CREDIBILITY.CONFIRMED);
    doc.autoLearnMeta = {
      ...(doc.autoLearnMeta || {}),
      credibility: nextCred,
      promotedAt: new Date().toISOString(),
    };
    doc.verification = {
      enabled: true,
      summary:
        nextCred === CREDIBILITY.VERIFIED
          ? "已人工确认并标记为联网核验级可信"
          : "已人工确认有效，检索权重已提升",
    };
    saveStore(ud(), libId, st);
    const libDir = libraryDir(ud(), libId);
    appendAutoLearnAudit(libDir, {
      id: crypto.randomUUID(),
      libraryId: libId,
      docId,
      action: "promote",
      questionPreview: doc.questionPreview || doc.autoLearnMeta?.questionPreview || "",
      answerPreview: doc.autoLearnMeta?.answerPreview || "",
      sourceType: doc.autoLearnMeta?.sourceType || "chat",
      credibility: nextCred,
    });
    return { ok: true, libraryId: libId, docId, credibility: nextCred };
  });

  ipcMain.handle("kb-auto-learn-rollback", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let docId = "";
    try {
      docId = assertUuid(p.docId, "文档 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少文档 id" };
    }
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const st = loadStore(ud(), libId);
    const doc = (st.documents || []).find((d) => d.id === docId);
    if (!doc) {
      return { ok: false, error: "文档不存在" };
    }
    if (doc.autoLearn !== true) {
      return { ok: false, error: "仅自动学习文档可回滚删除" };
    }
    const libDir = libraryDir(ud(), libId);
    appendAutoLearnAudit(libDir, {
      id: crypto.randomUUID(),
      libraryId: libId,
      docId,
      action: "rollback",
      questionPreview: doc.questionPreview || doc.autoLearnMeta?.questionPreview || "",
      answerPreview: doc.autoLearnMeta?.answerPreview || "",
      sourceType: doc.autoLearnMeta?.sourceType || "chat",
      credibility: doc.autoLearnMeta?.credibility || "unconfirmed",
      meta: { docName: doc.name },
    });
    const removedChunks = await removeDocumentFromLibrary(ud(), libId, docId);
    return { ok: true, libraryId: libId, docId, removedChunks };
  });

  ipcMain.handle("kb-auto-learn-audit-list", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const limit = Math.max(1, Math.min(200, Number(p.limit) || 30));
    const rows = listAutoLearnAudit(libDir, limit);
    return {
      ok: true,
      libraryId: libId,
      items: rows.map((row) => ({
        id: row.id,
        libraryId: row.library_id,
        docId: row.doc_id,
        queueId: row.queue_id,
        action: row.action,
        questionPreview: row.question_preview,
        answerPreview: row.answer_preview,
        sourceType: row.source_type,
        credibility: row.credibility,
        createdAt: row.created_at,
      })),
    };
  });

  const KB_OPS_ACTION_LABELS = {
    ingest: "自动学习入库",
    queued: "加入待审核",
    approve: "批准入库",
    reject: "拒绝入库",
    promote: "提升可信度",
    rollback: "回滚删除",
    pending: "入库排队",
    running: "入库处理中",
    completed: "入库完成",
    failed: "入库失败",
    skipped: "入库跳过",
  };

  ipcMain.handle("kb-ops-log-list", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const libDir = libraryDir(ud(), libId);
    const limit = Math.max(1, Math.min(200, Number(p.limit) || 80));
    const category = String(p.category || "all").trim() || "all";
    const items = [];

    if (category === "all" || category === "auto-learn") {
      listAutoLearnAudit(libDir, limit).forEach((row) => {
        items.push({
          id: `audit:${row.id}`,
          category: "auto-learn",
          action: row.action,
          actionLabel: KB_OPS_ACTION_LABELS[row.action] || row.action || "自动学习",
          title: String(row.question_preview || row.answer_preview || "").slice(0, 120) || "（无标题）",
          source: String(row.source_type || ""),
          createdAt: row.created_at,
          detail: String(row.answer_preview || "").slice(0, 200),
        });
      });
    }

    if (category === "all" || category === "search") {
      listSearchLogs(libDir, limit).forEach((row) => {
        const hitCount = Number(row.hit_count || 0);
        const elapsed = Number(row.elapsed_ms || 0);
        items.push({
          id: `search:${row.id}`,
          category: "search",
          action: "search",
          actionLabel: `检索 · ${hitCount} 条 · ${elapsed}ms`,
          title: String(row.query || "").slice(0, 120) || "（空查询）",
          source: String(row.search_mode || row.query_type || ""),
          createdAt: row.created_at,
          detail: row.low_confidence ? "低置信结果" : "",
        });
      });
    }

    if (category === "all" || category === "ingest") {
      listIngestJobs(libDir, limit).forEach((row) => {
        const fileName = path.basename(String(row.file_path || "")) || String(row.file_path || "未知文件");
        const status = String(row.status || "pending");
        items.push({
          id: `ingest:${row.id}`,
          category: "ingest",
          action: status,
          actionLabel: KB_OPS_ACTION_LABELS[status] || status,
          title: fileName,
          source: "文件入库",
          createdAt: row.updated_at || row.created_at,
          detail: String(row.error || "").slice(0, 200),
        });
      });
    }

    items.sort((a, b) => {
      const ta = Date.parse(String(a.createdAt || "").replace(/\//g, "-")) || 0;
      const tb = Date.parse(String(b.createdAt || "").replace(/\//g, "-")) || 0;
      return tb - ta;
    });

    return {
      ok: true,
      libraryId: libId,
      category,
      items: items.slice(0, limit),
    };
  });

  ipcMain.handle("kb-pick-and-ingest", async (event, payload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const res = await dialog.showOpenDialog(win || undefined, {
      title: "选择要入库的文件",
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "知识库文档",
          extensions: [
            "txt",
            "md",
            "markdown",
            "pdf",
            "doc",
            "docx",
            "xlsx",
            "xls",
            "png",
            "jpg",
            "jpeg",
            "bmp",
            "webp",
            "tif",
            "tiff",
            "csv",
            "json",
            "log",
            "rtf",
            "html",
            "htm",
            "xml",
            "yml",
            "yaml",
          ],
        },
        { name: "所有文件", extensions: ["*"] },
      ],
    });
    if (res.canceled || !res.filePaths?.length) {
      return { ok: false, canceled: true };
    }
    const results = [];
    const req = payload && typeof payload === "object" ? payload : {};
    const targetLibraryId = String(req.libraryId || "").trim();
    const libraries = readKbMeta(ud()).libraries || [];
    const libId = libraries.some((x) => x.id === targetLibraryId) ? targetLibraryId : activeLibraryId();
    const lib = libraries.find((x) => x.id === libId);
    const libraryName = String(lib?.name || libId || "").trim() || libId;
    const { uniquePaths, batchDuplicates } = dedupeIncomingFilesByMd5(res.filePaths);
    const { duplicates, toIngest, batchMd5 } = await inspectIngestDuplicates(uniquePaths, libId);

    if (duplicates.length) {
      const detailLines = duplicates
        .slice(0, 12)
        .map((item) => {
          if (item.reason === "unchanged") {
            return `• ${item.name}（文件未变更，已在库中）`;
          }
          if (item.existingName) {
            const loc = item.existingPath ? `\n    已入库路径：${item.existingPath}` : "";
            return `• ${item.name}（与「${item.existingName}」内容相同）${loc}`;
          }
          return `• ${item.name}`;
        });
      if (duplicates.length > 12) {
        detailLines.push(`• … 另有 ${duplicates.length - 12} 个重复文件`);
      }
      if (batchDuplicates.length) {
        detailLines.unshift(
          `• 另有 ${batchDuplicates.length} 个为本次选择中的相同内容副本（已自动合并，不影响入库）`
        );
      }
      const detail = detailLines.join("\n");
      const buttons = toIngest.length ? ["继续入库", "取消"] : ["知道了"];
      const choice = await dialog.showMessageBox(win || undefined, {
        type: "warning",
        title: "检测到重复文档",
        message:
          toIngest.length > 0
            ? `库中已有 ${duplicates.length} 个重复文档将跳过；${toIngest.length} 个新文件将继续入库。`
            : `所选文件均已在库中（${duplicates.length} 个），无需重复入库。`,
        detail,
        buttons,
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (!toIngest.length || choice.response === 1) {
        results.push(...duplicates, ...batchDuplicates);
        emitKbIngestProgress(event.sender, {
          phase: "done",
          total: res.filePaths.length,
          libraryId: libId,
          libraryName,
          ok: 0,
          skipped: results.length,
          fail: 0,
        });
        return {
          ok: true,
          canceled: toIngest.length > 0 && choice.response === 1,
          results,
          duplicates: duplicates.length + batchDuplicates.length,
        };
      }
      results.push(...duplicates);
    }

    const total = toIngest.length;
    const batchSeenMd5 = new Set();
    emitKbIngestProgress(event.sender, {
      phase: "start",
      total,
      index: 0,
      libraryId: libId,
      libraryName,
      step: "running",
    });
    for (let i = 0; i < toIngest.length; i += 1) {
      const fp = toIngest[i];
      const fileName = path.basename(fp);
      emitKbIngestProgress(event.sender, {
        phase: "running",
        index: i + 1,
        total,
        libraryId: libId,
        libraryName,
        filePath: fp,
        fileName,
        step: "running",
      });
      const onProgress = (detail) => {
        emitKbIngestProgress(event.sender, {
          phase: "running",
          index: i + 1,
          total,
          libraryId: libId,
          libraryName,
          filePath: fp,
          fileName,
          step: detail?.step || "running",
        });
      };
      try {
        const r = await ingestWithPasswordPrompt(event.sender, fp, libId, {
          onProgress,
          batchSeenMd5,
          batchFilePaths: uniquePaths,
        });
        results.push(r);
      } catch (err) {
        results.push({ ok: false, path: fp, error: err.message || String(err) });
      }
      emitKbIngestProgress(event.sender, {
        phase: "file-done",
        index: i + 1,
        total,
        libraryId: libId,
        libraryName,
        fileName,
        ok: results[results.length - 1]?.ok === true,
        skipped: results[results.length - 1]?.skipped === true,
      });
    }
    if (batchDuplicates.length) {
      results.push(...batchDuplicates);
    }
    const ok = results.filter((r) => r.ok && !r.skipped).length;
    const skipped = results.filter((r) => r.ok && r.skipped).length;
    const fail = results.filter((r) => !r.ok).length;
    emitKbIngestProgress(event.sender, {
      phase: "done",
      total: res.filePaths.length,
      libraryId: libId,
      libraryName,
      ok,
      skipped,
      fail,
    });
    return { ok: true, results, duplicates: duplicates.length + batchDuplicates.length };
  });

  ipcMain.handle("kb-ingest-path", async (_e, filePath) => {
    try {
      const fp = assertAccessibleFilePath(filePath, {
        mustExist: true,
        allowedRoots: kbAllowedReadRoots(),
        label: "文件路径",
      });
      return await ingestOneFile(fp, activeLibraryId());
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-parse-local-file", async (_e, payload) => {
    try {
      const p = payload && typeof payload === "object" ? payload : { filePath: payload };
      let fp = "";
      if (p.filePath) {
        fp = assertAccessibleFilePath(p.filePath, {
          mustExist: true,
          allowedRoots: kbAllowedReadRoots(),
          label: "文件路径",
        });
      }
      const fileName = String(p.fileName || (fp ? path.basename(fp) : "") || "").trim();
      const ext = String(p.ext || (fileName ? path.extname(fileName) : "") || (fp ? path.extname(fp) : "")).toLowerCase();
      let raw = "";
      let previewHtml = "";
      let previewWarn = "";
      let realPath = fp;
      /** @type {string[]} */
      const tempCleanupPaths = [];
      let docPathForConvert = fp;
      if (fp) {
        raw = await parseFileToText(fp);
        if (ext === ".docx") {
          const buf = fs.readFileSync(fp);
          previewHtml = await parseDocxPreviewHtml(buf);
        }
      } else {
        const base64 = assertMaxBase64Size(p.base64, KB_MAX_UPLOAD_BYTES, "上传文件");
        const buf = Buffer.from(base64, "base64");
        raw = await parseBufferToText(ext, buf, "");
        if (ext === ".docx") {
          previewHtml = await parseDocxPreviewHtml(buf);
        }
        if (ext === ".doc") {
          const tmpDoc = path.join(
            os.tmpdir(),
            `kb-upload-doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.doc`
          );
          fs.writeFileSync(tmpDoc, buf);
          tempCleanupPaths.push(tmpDoc);
          docPathForConvert = tmpDoc;
        }
        realPath = "";
      }
      if (ext === ".doc") {
        const rich = await tryConvertDocToRichPreview(docPathForConvert);
        if (Array.isArray(rich?.cleanupPaths)) {
          tempCleanupPaths.push(...rich.cleanupPaths);
        }
        if (rich?.ok) {
          previewHtml = String(rich.previewHtml || "").trim();
          const richText = String(rich.rawText || "").trim();
          if (richText) {
            raw = richText;
          }
          previewWarn =
            rich?.via === "soffice"
              ? "已按本机 soffice 转换为接近原文档图文预览。"
              : "已按本机 Office/WPS 转换为接近原文档图文预览。";
        } else {
          const reason = String(rich?.error || "").trim();
          const shortReason = reason ? ` 原因：${reason.slice(0, 180)}` : "";
          previewWarn = `未完成 DOC 富预览转换，当前为文本兼容展示。建议另存为 DOCX 获得更完整图文。${shortReason}`;
        }
      }
      const cleanedRaw = cleanDocPreviewNoise(raw);
      if (ext === ".doc" && !previewHtml) {
        previewWarn =
          previewWarn ||
          "旧版 DOC 暂不支持原位图片还原，建议另存为 DOCX 查看图文版式。";
      }
      const text = normalizeAutoLearnText(
        cleanedRaw,
        Number(p.maxChars) > 0 ? Math.max(500, Math.min(30000, Number(p.maxChars))) : 10000
      );
      const fullLen = String(cleanedRaw || "").trim().length;
      tempCleanupPaths.forEach((tmpPath) => {
        if (!tmpPath || !fs.existsSync(tmpPath)) return;
        try {
          const st = fs.statSync(tmpPath);
          if (st.isDirectory()) {
            fs.rmSync(tmpPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(tmpPath);
          }
        } catch {
          /* ignore */
        }
      });
      return {
        ok: true,
        filePath: realPath,
        fileName: fileName || (fp ? path.basename(fp) : ""),
        ext,
        text,
        textLength: fullLen,
        truncated: text.length < fullLen,
        previewHtml,
        previewWarn,
      };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-delete-document", async (_e, docId) => {
    let id = "";
    try {
      id = assertUuid(docId, "文档 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少文档 id" };
    }
    try {
      const removedChunks = await removeDocumentFromLibrary(ud(), activeLibraryId(), id);
      return { ok: true, removedChunks };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-move-document", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let docId = "";
    let fromLibraryId = "";
    let targetLibraryId = "";
    try {
      docId = assertUuid(p.docId, "文档 id");
      fromLibraryId = assertKbLibraryId(p.fromLibraryId, "源知识库 id");
      targetLibraryId = assertKbLibraryId(p.targetLibraryId, "目标知识库 id");
    } catch (err) {
      return { ok: false, error: err?.message || "缺少迁移参数" };
    }
    if (fromLibraryId === targetLibraryId) {
      return { ok: false, error: "文件已存在于目标目录" };
    }
    const meta = readKbMeta(ud());
    if (!meta.libraries.some((x) => x.id === fromLibraryId) || !meta.libraries.some((x) => x.id === targetLibraryId)) {
      return { ok: false, error: "迁移失败：目录不存在或无权限" };
    }
    const fromStore = loadStore(ud(), fromLibraryId);
    const toStore = loadStore(ud(), targetLibraryId);
    const doc = (fromStore.documents || []).find((d) => String(d?.id || "") === docId);
    if (!doc) {
      return { ok: false, error: "迁移失败：未找到原目录文档" };
    }
    const duplicate = (toStore.documents || []).some(
      (d) =>
        String(d?.name || "") === String(doc?.name || "") &&
        String(d?.sourcePath || "") === String(doc?.sourcePath || "") &&
        String(d?.normalizedPath || "") === String(doc?.normalizedPath || "")
    );
    if (duplicate) {
      return { ok: false, error: "文件已存在于目标目录" };
    }
    const movingChunks = (fromStore.chunks || []).filter((c) => String(c?.docId || "") === docId);
    const fromNext = {
      ...fromStore,
      documents: (fromStore.documents || []).filter((d) => String(d?.id || "") !== docId),
      chunks: (fromStore.chunks || []).filter((c) => String(c?.docId || "") !== docId),
    };
    const movedDoc = { ...doc, movedAt: new Date().toISOString(), movedFromLibraryId: fromLibraryId };
    const toNext = {
      ...toStore,
      documents: [...(toStore.documents || []), movedDoc],
      chunks: [...(toStore.chunks || []), ...movingChunks],
    };
    try {
      if (movingChunks.length) {
        await lanceAppendChunks(ud(), targetLibraryId, movingChunks);
        await lanceDeleteByDocId(ud(), fromLibraryId, docId);
      }
      const fromFts = removeDocFromFtsIndex(loadFtsIndex(libraryDir(ud(), fromLibraryId)), docId);
      saveFtsIndex(libraryDir(ud(), fromLibraryId), fromFts);
      const toFts = loadFtsIndex(libraryDir(ud(), targetLibraryId));
      movingChunks.forEach((chunk) => upsertChunkInIndex(toFts, chunk, movedDoc));
      saveFtsIndex(libraryDir(ud(), targetLibraryId), toFts);
      ensureGraphSnapshot(fromNext, true);
      ensureGraphSnapshot(toNext, true);
      saveStore(ud(), fromLibraryId, fromNext);
      saveStore(ud(), targetLibraryId, toNext);
      return {
        ok: true,
        docId,
        fromLibraryId,
        targetLibraryId,
        movedChunkCount: movingChunks.length,
      };
    } catch (err) {
      return { ok: false, error: `迁移失败：${err.message || String(err)}` };
    }
  });

  ipcMain.handle("kb-search", async (event, payload) => {
    abortPendingEmbedWarm();
    kbSearchInFlight += 1;
    const searchPhases = {};
    const sender = event?.sender;
    try {
      return await withKbOpTimeout(
        (async () => {
    const t0 = Date.now();
    const p = payload && typeof payload === "object" ? payload : {};
    const searchId = String(p.searchId || "").trim() || crypto.randomUUID();
    const emitProgress = (data) =>
      emitKbSearchProgress(sender, {
        searchId,
        elapsedMs: Date.now() - t0,
        ...(data && typeof data === "object" ? data : {}),
      });
    const q = String(p.query || "").trim();
    if (!q) {
      return { ok: false, error: "query 不能为空", searchId };
    }
    emitProgress({ phase: "start", message: "准备检索…" });
    const meta = readKbMeta(ud());
    let targetLibraryIds = resolveRequestedLibraryIds(meta, p);
    const requestedAll =
      String(p.libraryId || "").trim() === "__all__" ||
      (Array.isArray(p.libraryIds) && p.libraryIds.some((x) => String(x || "").trim() === "__all__"));
    if (requestedAll) {
      targetLibraryIds = targetLibraryIds.filter((libId) => {
        const libDir = libraryDir(ud(), libId);
        return countLibraryChunks(libDir) > 0;
      });
      if (!targetLibraryIds.length) {
        return { ok: false, error: "所有知识库均无已入库文档，请先导入文档后再检索。", searchId };
      }
    }
    if (!targetLibraryIds.length) {
      return { ok: true, hits: [], note: "未找到可检索的知识库目录", elapsedMs: Date.now() - t0, searchId };
    }
    emitProgress({
      phase: "plan",
      message: `将检索 ${targetLibraryIds.length} 个知识库`,
      detail: { libraryIds: targetLibraryIds },
    });
    const activeSt = loadStore(ud(), activeLibraryId());
    const queryType = classifyQuery(q);
    const profile = inferQueryProfile(q);
    const autoTune = p.autoTune !== false;
    const searchMode = String(p.searchMode || activeSt.settings.searchMode || "auto").toLowerCase();
    let effectiveMode =
      searchMode === "auto"
        ? queryType === "filename" ||
          queryType === "identifier" ||
          queryType === "code" ||
          queryType === "literal" ||
          queryType === "doc_ref" ||
          queryType === "section"
          ? "keyword"
          : queryType === "semantic_question" || queryType === "summary"
            ? "semantic"
            : "hybrid"
        : searchMode;
    // 协议编号 / URL 等锚点查询：即使用户选了「混合/语义」也强制走关键词，避免 FTS/向量误召回
    if (queryType === "literal" || queryType === "doc_ref" || queryType === "section") {
      effectiveMode = "keyword";
    }
    const baseTopK = Math.max(1, Math.min(20, Number(p.topK) || activeSt.settings.searchTopK || 10));
    const topK = Math.min(20, baseTopK + (autoTune ? profile.topKBoost : 0));
    const configuredMin = Math.max(
      0,
      Math.min(1, Number(p.minScore ?? activeSt.settings.searchMinScore ?? 0.55))
    );
    const minScore = autoTune ? Math.min(configuredMin, profile.minScore) : configuredMin;
    const hybridEnabled = p.hybridSearch != null ? Boolean(p.hybridSearch) : activeSt.settings.hybridSearch !== false;
    const configuredWeight = Math.max(
      0.1,
      Math.min(0.95, Number(p.hybridVectorWeight ?? activeSt.settings.hybridVectorWeight ?? 0.6))
    );
    const hybridWeight = autoTune && p.hybridVectorWeight == null ? profile.vectorWeight : configuredWeight;
    const useRrf = p.useRrfRanking != null ? Boolean(p.useRrfRanking) : activeSt.settings.useRrfRanking !== false;
    const keywordLimit = Math.max(
      10,
      Math.min(150, Number(p.keywordRecallLimit ?? activeSt.settings.keywordRecallLimit ?? KEYWORD_RECALL_LIMIT))
    );
    const vectorEnabled = effectiveMode !== "keyword";
    const keywordRecallEnabled = hybridEnabled && effectiveMode !== "semantic";
    const model = String(p.embedModel || activeSt.settings.embedModel || "bge-m3").trim();
    const host = readOllamaSettings().host;
    const candidateK = resolveCandidateK(
      topK,
      autoTune && p.searchCandidateK == null ? profile.vectorTopN : p.searchCandidateK ?? activeSt.settings.searchCandidateK
    );
    let queryVec = null;
    let embedDevice = null;
    let embedMs = 0;
    let recallMs = 0;
    let embedDevicePromise = Promise.resolve(null);
    if (vectorEnabled) {
      emitProgress({ phase: "embed", message: `正在生成查询向量（${model}）…` });
      const tEmbed = Date.now();
      try {
        queryVec = await ollamaEmbed(host, model, q, { role: "query" });
        embedMs = Date.now() - tEmbed;
        searchPhases.embedMs = embedMs;
        emitProgress({
          phase: "embed_done",
          message: `向量嵌入完成（${embedMs}ms）`,
          detail: { embedMs, model },
        });
        embedDevicePromise = withKbOpTimeout(
          inspectOllamaEmbedDevice(host, model, readOllamaSettingsFromRuntime()),
          3000,
          "算力检测"
        ).catch(() => null);
      } catch (err) {
        searchPhases.embedMs = Date.now() - tEmbed;
        emitProgress({ phase: "error", message: `嵌入失败：${err.message || String(err)}` });
        return { ok: false, error: `嵌入失败：${err.message || String(err)}`, searchPhases, searchId };
      }
    }
    const tRecall = Date.now();
    emitProgress({ phase: "recall", message: "正在各库召回候选片段…" });
    const libNameById = new Map((meta.libraries || []).map((x) => [String(x.id || ""), String(x.name || x.id || "")]));
    const skipped = [];
    const recallStats = { vector: 0, keyword: 0, metadata: 0, fts: 0 };
    const libTotal = targetLibraryIds.length;
    const libResults = await Promise.all(
      targetLibraryIds.map(async (libId, libIndex) => {
        const libDir = libraryDir(ud(), libId);
        const st = loadStoreForSearch(ud(), libId);
        const libName = libNameById.get(libId) || libId;
        const dim0 = sampleEmbeddingDim(libDir) || existingEmbeddingDim(st);
        return {
          libId,
          st,
          ...(await performLibraryRecall({
            userDataPath: ud(),
            libId,
            libDir,
            libName,
            libIndex,
            libTotal,
            st,
            q,
            queryVec,
            vectorEnabled,
            keywordRecallEnabled,
            candidateK,
            keywordLimit,
            queryType,
            hybridWeight,
            useRrf,
            profile,
            dim0,
            emitProgress,
          })),
        };
      })
    );
    const storesByLibId = new Map();
    libResults.forEach((result) => {
      if (result?.libId && result?.st) {
        storesByLibId.set(String(result.libId), result.st);
      }
    });
    let scored = [];
    libResults.forEach((result) => {
      scored.push(...(result.hits || []));
      skipped.push(...(result.skipped || []));
      recallStats.vector += result.recallStats?.vector || 0;
      recallStats.keyword += result.recallStats?.keyword || 0;
      recallStats.metadata += result.recallStats?.metadata || 0;
      recallStats.fts += result.recallStats?.fts || 0;
    });
    embedDevice = await embedDevicePromise;
    if (embedDevice) {
      embedDevice.embedMs = embedMs;
    }
    recallMs = Date.now() - tRecall;
    searchPhases.recallMs = recallMs;
    searchPhases.libraries = targetLibraryIds.length;
    scored = scored.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    const rerankEnabled =
      p.rerankEnabled != null ? Boolean(p.rerankEnabled) : activeSt.settings.rerankEnabled !== false;
    let rerankMs = 0;
    let rerankProvider = rerankEnabled ? "pending" : "disabled";
    let rerankModelUsed = String(p.rerankModel || activeSt.settings.rerankModel || "bge-reranker-v2-m3").trim();
    if (rerankEnabled && scored.length) {
      emitProgress({
        phase: "rerank",
        message: `正在用 ${rerankModelUsed} 重排序（${Math.min(scored.length, Number(activeSt.settings.rerankTopN ?? 30) || 30)} 条候选）…`,
      });
      try {
        const rerankSettings = {
          rerankEnabled: true,
          rerankModel: rerankModelUsed,
          rerankProvider: String(p.rerankProvider || activeSt.settings.rerankProvider || "auto").toLowerCase(),
          rerankTopN: Number(p.rerankTopN ?? activeSt.settings.rerankTopN ?? 30),
          rerankWeight: Number(p.rerankWeight ?? activeSt.settings.rerankWeight ?? 0.75),
        };
        const rerankOut = await withKbOpTimeout(
          rerankSearchHits(scored, q, rerankSettings, { host, userDataPath: ud() }),
          180000,
          "重排序"
        );
        scored = rerankOut.hits || scored;
        rerankMs = Number(rerankOut.rerankMs || 0);
        rerankProvider = String(rerankOut.rerankProvider || "unknown");
        searchPhases.rerankMs = rerankMs;
        emitProgress({
          phase: "rerank_done",
          message: `重排完成（${rerankProvider} · ${rerankMs}ms）`,
          detail: { rerankMs, rerankProvider, rerankModel: rerankModelUsed },
        });
      } catch (err) {
        rerankProvider = "failed";
        searchPhases.rerankError = String(err?.message || err);
        emitProgress({
          phase: "rerank_skip",
          message: `重排跳过：${err?.message || String(err)}`,
        });
      }
    }
    const forAgent = p.forAgent === true;
    const expandAdjacent =
      forAgent || p.expandAdjacent === true || shouldExpandAdjacentChunks(q, queryType);
    let chunksByDocId = new Map();
    if (expandAdjacent && scored.length) {
      storesByLibId.forEach((st) => {
        buildChunksByDocId(st.chunks).forEach((list, docId) => {
          if (!chunksByDocId.has(docId)) {
            chunksByDocId.set(docId, list);
          }
        });
      });
      const before = scored.length;
      scored = expandAdjacentChunkHits(scored, chunksByDocId, {
        radius: forAgent ? 3 : 1,
        maxExtra: forAgent ? 14 : 6,
        seedCount: Math.min(8, scored.length),
      });
      scored = enrichAdjacentHitsFromStores(scored, storesByLibId);
      const beforeSection = scored.length;
      scored = expandSectionRangeChunkHits(scored, chunksByDocId, q, { forAgent });
      scored = enrichAdjacentHitsFromStores(scored, storesByLibId);
      if (scored.length > before || scored.length > beforeSection) {
        emitProgress({
          phase: "expand_adjacent",
          message: `已补充相邻/章节分块（+${Math.max(0, scored.length - before)} 相邻 · +${Math.max(0, scored.length - beforeSection)} 章节）`,
          detail: { addedAdjacent: Math.max(0, scored.length - before), addedSection: Math.max(0, scored.length - beforeSection) },
        });
      }
    }
    emitProgress({ phase: "rank", message: "正在过滤与截取结果…" });
    scored = scored.filter((h) => hitMeetsMinScore(h, minScore));
    if (forAgent && isApiSpecQuery(q)) {
      scored = scored.filter((h) => !isTocLikeChunk(h.text || "") && !isRevisionHistoryLikeChunk(h.text || ""));
    }
    scored = finalizeAgentSearchHits(scored, q, topK, forAgent, { queryType });
    const bestScore = scored[0]?.score ?? 0;
    const noAnswerThreshold = Math.max(minScore, autoTune && (queryType === "semantic_question" || queryType === "summary") ? 0.62 : minScore);
    const lowConfidence = scored.length === 0 || bestScore < noAnswerThreshold;
    const noteParts = [];
    if (skipped.length) {
      noteParts.push(`已跳过：${skipped.join("；")}`);
    }
    if (lowConfidence) {
      noteParts.push(
        queryType === "literal"
          ? "未在知识库中找到完全一致的 URL/地址/端点，请确认该内容是否已入库"
          : queryType === "doc_ref"
            ? "未找到与协议编号/文档代号匹配的入库文档，请确认编号是否正确或文档是否已入库"
            : queryType === "section"
              ? "未找到对应章节标题的内容，请确认章节号与标题是否正确，或该章节是否已入库"
              : "未找到可靠答案，建议换关键词或检查文档是否已入库"
      );
    } else if (!scored.length && minScore > 0) {
      noteParts.push(`无结果达到相似度阈值 ${minScore.toFixed(2)}，可降低「最低相似度」后重试`);
    }
    if (autoTune) {
      noteParts.push(
        `查询策略：${profile.label}（${effectiveMode}）· 候选 ${candidateK} · 关键词池 ${keywordLimit} · RRF ${useRrf ? "开" : "关"} · 重排 ${rerankEnabled ? rerankProvider : "关"}`
      );
    }
    const elapsedMs = Date.now() - t0;
    const fullResult = sanitizeSearchResultForIpc({
      ok: true,
      hits: scored,
      model: vectorEnabled ? model : "",
      lowConfidence,
      noAnswer: lowConfidence,
      bestScore,
      minScore,
      hybridSearch: keywordRecallEnabled,
      hybridVectorWeight: hybridWeight,
      searchCandidateK: candidateK,
      keywordRecallLimit: keywordLimit,
      queryProfile: autoTune ? profile.label : undefined,
      queryType,
      searchMode: effectiveMode,
      useRrfRanking: useRrf,
      rerankEnabled,
      rerankModel: rerankModelUsed,
      rerankProvider,
      rerankMs,
      recallStats,
      debug: {
        queryType,
        effectiveMode,
        vectorEnabled,
        keywordRecallEnabled,
        candidateK,
        keywordLimit,
        hybridWeight,
        minScore,
        noAnswerThreshold,
        useRrf,
        rerankEnabled,
        rerankProvider,
        rerankMs,
        rerankError: searchPhases.rerankError || undefined,
        elapsedMs,
        recallStats,
      },
      elapsedMs,
      note: noteParts.join("；"),
      searchedLibraryIds: targetLibraryIds,
      embedDevice,
      embedMs: vectorEnabled ? embedMs : 0,
      recallMs,
      rerankMs,
      searchPhases,
      searchId,
    });
    emitKbSearchResult(sender, fullResult);
    emitProgress({
      phase: "done",
      message: `检索完成：命中 ${scored.length} 条 · ${elapsedMs}ms`,
      detail: { hitCount: scored.length, elapsedMs, embedMs, recallMs },
    });
    setImmediate(() => {
      try {
        const logLibId = targetLibraryIds[0] || activeLibraryId();
        appendSearchLog(libraryDir(ud(), logLibId), {
          query: q,
          queryType,
          searchMode: effectiveMode,
          hitCount: scored.length,
          elapsedMs,
          lowConfidence,
          debug: { recallStats, minScore, noAnswerThreshold },
        });
      } catch {
        /* ignore search log failures */
      }
    });
    return {
      ok: true,
      searchId,
      hitCount: scored.length,
      hits: scored.map(sanitizeSearchHitForIpc),
      elapsedMs,
      lowConfidence,
      noAnswer: lowConfidence,
      bestScore,
      model: vectorEnabled ? model : "",
      hybridSearch: keywordRecallEnabled,
      searchMode: effectiveMode,
      queryProfile: autoTune ? profile.label : undefined,
      queryType,
      minScore,
      searchCandidateK: candidateK,
      recallStats,
      rerankEnabled,
      rerankProvider,
      rerankMs,
      embedMs: vectorEnabled ? embedMs : 0,
      recallMs,
      note: noteParts.join("；"),
    };
        })(),
        KB_SEARCH_HANDLER_TIMEOUT_MS,
        "检索"
      );
    } catch (err) {
      return { ok: false, error: String(err?.message || err || "检索失败"), searchPhases };
    } finally {
      kbSearchInFlight -= 1;
    }
  });

  ipcMain.handle("kb-warm-embed-model", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const activeSt = loadStore(ud(), activeLibraryId());
    const model = String(p.embedModel || activeSt.settings.embedModel || "bge-m3").trim();
    const s = readOllamaSettingsFromRuntime();
    try {
      await warmOllamaEmbedModel(s.host, model, s);
      const device = await inspectOllamaEmbedDevice(s.host, model, s);
      return { ok: true, model, embedDevice: device };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  setTimeout(() => {
    if (kbSearchInFlight > 0) {
      return;
    }
    abortPendingEmbedWarm();
    const ac = new AbortController();
    kbEmbedWarmAbort = ac;
    const s = readOllamaSettingsFromRuntime();
    const activeSt = loadStore(ud(), activeLibraryId());
    const model = String(activeSt.settings.embedModel || "bge-m3").trim();
    warmOllamaEmbedModel(s.host, model, s, ac.signal)
      .catch(() => {})
      .finally(() => {
        if (kbEmbedWarmAbort === ac) {
          kbEmbedWarmAbort = null;
        }
      });
  }, 4000);

  async function buildLibraryHealth(userDataPath, libraryId) {
    const libDir = libraryDir(userDataPath, libraryId);
    const st = loadStore(userDataPath, libraryId);
    const lanceCount = await lanceCountChunks(userDataPath, libraryId, st);
    const fts = loadFtsIndex(libDir);
    const ftsCount = Number(fts.docCount || Object.keys(fts.chunks || {}).length || 0);
    return checkIndexHealth(libDir, { lanceChunkCount: lanceCount, ftsChunkCount: ftsCount });
  }

  ipcMain.handle("kb-index-health", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const meta = readKbMeta(ud());
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    if (!(meta.libraries || []).some((x) => x.id === libId)) {
      return { ok: false, error: "知识库不存在" };
    }
    try {
      const health = await buildLibraryHealth(ud(), libId);
      return {
        ok: true,
        libraryId: libId,
        storageBackend: "sqlite",
        sqlitePath: sqliteDbPath(libraryDir(ud(), libId)),
        ...health,
      };
    } catch (err) {
      return { ok: false, error: `健康检查失败：${err.message || String(err)}` };
    }
  });

  ipcMain.handle("kb-model-health-check", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    try {
      const activeSt = loadStore(ud(), activeLibraryId());
      const settings = { ...activeSt.settings };
      if (p.embedModel != null) {
        settings.embedModel = String(p.embedModel).trim() || settings.embedModel;
      }
      if (p.rerankEnabled != null) {
        settings.rerankEnabled = Boolean(p.rerankEnabled);
      }
      if (p.rerankProvider != null) {
        settings.rerankProvider = String(p.rerankProvider || settings.rerankProvider || "auto");
      }
      if (p.rerankModel != null) {
        settings.rerankModel = String(p.rerankModel).trim() || settings.rerankModel;
      }
      const report = await runKbModelHealthCheck({
        settings,
        host: readOllamaSettings().host,
        userDataPath: ud(),
        appVersion: app.getVersion(),
        ollamaSettings: readOllamaSettingsFromRuntime(),
      });
      return {
        ok: true,
        report,
        diagnostics: buildKbModelHealthDiagnostics(report),
      };
    } catch (err) {
      return { ok: false, error: `模型健康检测失败：${err.message || String(err)}` };
    }
  });

  ipcMain.handle("kb-rebuild-embeddings", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const meta = readKbMeta(ud());
    if (!(meta.libraries || []).some((x) => x.id === libId)) {
      return { ok: false, error: "知识库不存在" };
    }
    const st = loadStore(ud(), libId);
    const chunks = Array.isArray(st.chunks) ? st.chunks : [];
    if (!chunks.length) {
      return { ok: true, rebuilt: 0, note: "当前知识库无分片" };
    }
    const host = readOllamaSettings().host;
    const model = String(st.settings.embedModel || "bge-m3").trim();
    const texts = chunks.map((c) => String(c.text || "").trim()).filter(Boolean);
    if (texts.length !== chunks.length) {
      return { ok: false, error: "存在空分片，无法重建向量" };
    }
    try {
      const embeddings = await ollamaEmbedBatch(host, model, texts, 8, { role: "passage" });
      if (embeddings.length !== chunks.length) {
        return { ok: false, error: "批量嵌入结果数量与分片不一致" };
      }
      for (let i = 0; i < chunks.length; i += 1) {
        chunks[i].embedding = normalizeEmbedding(embeddings[i], model);
      }
      st.chunks = chunks;
      await dropLanceTable(ud(), libId);
      await lanceAppendChunks(ud(), libId, chunks);
      saveStore(ud(), libId, st);
      return {
        ok: true,
        rebuilt: chunks.length,
        libraryId: libId,
        model,
        note: "已按最新嵌入策略重建向量索引（建议新入库文档将自动带元数据头）。",
      };
    } catch (err) {
      return { ok: false, error: `重建向量失败：${err.message || String(err)}` };
    }
  });

  ipcMain.handle("kb-rebuild-fts-index", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const libId = assertKbLibraryId(p.libraryId || activeLibraryId());
    const meta = readKbMeta(ud());
    if (!(meta.libraries || []).some((x) => x.id === libId)) {
      return { ok: false, error: "知识库不存在" };
    }
    const st = loadStore(ud(), libId);
    const chunks = Array.isArray(st.chunks) ? st.chunks : [];
    if (!chunks.length) {
      return { ok: true, rebuilt: 0, note: "当前知识库无分片" };
    }
    try {
      const rebuilt = rebuildFtsIndex(chunks, st.documents || []);
      saveFtsIndex(libraryDir(ud(), libId), rebuilt);
      return {
        ok: true,
        rebuilt: rebuilt.docCount,
        libraryId: libId,
        note: "已重建全文倒排索引（BM25）。",
      };
    } catch (err) {
      return { ok: false, error: `重建全文索引失败：${err.message || String(err)}` };
    }
  });

  ipcMain.handle("kb-web-verify-query", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : { query: payload };
    const q = String(p.query || "").trim();
    if (!q) {
      return { ok: false, error: "query 不能为空" };
    }
    const st = loadStore(ud(), activeLibraryId());
    let targetChunkId = "";
    let targetDocId = "";
    try {
      if (p.chunkId) {
        targetChunkId = assertUuid(p.chunkId, "分片 id");
      }
      if (p.docId) {
        targetDocId = assertUuid(p.docId, "文档 id");
      }
    } catch (err) {
      return { ok: false, error: err?.message || "无效文档参数" };
    }
    const targetChunk = targetChunkId
      ? st.chunks.find((c) => c.id === targetChunkId && (!targetDocId || c.docId === targetDocId))
      : null;
    if (targetChunk && typeof verifyTextOnline === "function") {
      const vr = await verifyTextOnline({ docName: targetChunk.docName || "未命名文档", text: targetChunk.text || "" });
      const corrected = String(vr?.correctedText || "").trim();
      const summary = String(vr?.summary || "").trim();
      const sources = Array.isArray(vr?.sources) ? vr.sources : [];
      let writebackApplied = false;
      if (st.settings.aiVerifyWriteback === true && corrected && corrected !== String(targetChunk.text || "").trim()) {
        const host = readOllamaSettings().host;
        const model = String(st.settings.embedModel || "bge-m3").trim();
        const emb = normalizeEmbedding(await ollamaEmbed(host, model, corrected, { role: "passage" }), model);
        const dim0 = existingEmbeddingDim(st);
        if (dim0 && emb.length !== dim0) {
          throw new Error(`回写失败：向量维度不一致（库中 ${dim0}，当前 ${emb.length}）`);
        }
        targetChunk.text = corrected;
        targetChunk.embedding = emb;
        targetChunk.updatedAt = new Date().toISOString();
        await lanceDeleteByChunkId(ud(), activeLibraryId(), targetChunk.id);
        await lanceAppendChunks(ud(), activeLibraryId(), [targetChunk]);
        const doc = st.documents.find((d) => d.id === targetChunk.docId);
        if (doc) {
          doc.lastWritebackAt = new Date().toISOString();
          doc.lastWritebackSummary = summary || "已执行联网核验回写";
          if (doc.autoLearn === true) {
            doc.autoLearnMeta = {
              ...(doc.autoLearnMeta || {}),
              sourceType: SOURCE_TYPES.WEB_VERIFY,
              credibility: CREDIBILITY.VERIFIED,
              verifiedAt: new Date().toISOString(),
            };
            doc.verification = { enabled: true, summary: summary || "联网核验回写，已标记为已核验" };
          }
        }
        ensureGraphSnapshot(st, true);
        saveStore(ud(), activeLibraryId(), st);
        writebackApplied = true;
      }
      return {
        ok: true,
        query: q,
        summary,
        correctedText: corrected,
        sources,
        writebackEnabled: st.settings.aiVerifyWriteback === true,
        writebackApplied,
      };
    }
    if (typeof webSearchBlockBuilder !== "function") {
      return { ok: false, error: "未启用联网核验能力" };
    }
    const block = await webSearchBlockBuilder(q);
    return { ok: true, query: q, block, writebackEnabled: st.settings.aiVerifyWriteback === true, writebackApplied: false };
  });

  ipcMain.handle("kb-graph-snapshot", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const meta = readKbMeta(ud());
    const targetLibraryIds = resolveRequestedLibraryIds(meta, p);
    if (targetLibraryIds.length > 1) {
      const graph = ensureGlobalGraphSnapshot(ud(), meta, targetLibraryIds, false);
      return { ok: true, scope: "global", libraryIds: targetLibraryIds, graph };
    }
    const libId = targetLibraryIds[0] || activeLibraryId();
    const st = loadStore(ud(), libId);
    const graph = ensureGraphSnapshot(st, false);
    saveStore(ud(), libId, st);
    return { ok: true, scope: "library", libraryId: libId, graph };
  });

  ipcMain.handle("kb-graph-rebuild", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const meta = readKbMeta(ud());
    const targetLibraryIds = resolveRequestedLibraryIds(meta, p);
    if (targetLibraryIds.length > 1) {
      const graph = ensureGlobalGraphSnapshot(ud(), meta, targetLibraryIds, true);
      return { ok: true, scope: "global", libraryIds: targetLibraryIds, graph };
    }
    const libId = targetLibraryIds[0] || activeLibraryId();
    const st = loadStore(ud(), libId);
    const graph = ensureGraphSnapshot(st, true);
    saveStore(ud(), libId, st);
    return { ok: true, scope: "library", libraryId: libId, graph };
  });

  ipcMain.handle("kb-submit-document-password", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const requestId = String(p.requestId || "");
    if (!requestId) {
      return { ok: false, error: "缺少 requestId" };
    }
    resolvePasswordPrompt(requestId, {
      ok: true,
      password: String(p.password || ""),
      remember: p.remember !== false,
    });
    return { ok: true };
  });

  ipcMain.handle("kb-cancel-document-password", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    const requestId = String(p.requestId || "");
    if (!requestId) {
      return { ok: false, error: "缺少 requestId" };
    }
    resolvePasswordPrompt(requestId, { ok: false, canceled: true });
    return { ok: true };
  });

  ipcMain.handle("kb-unlock-document", async (_e, payload) => {
    try {
      const p = payload && typeof payload === "object" ? payload : {};
      const docId = assertUuid(p.docId, "文档 id");
      const libId = p.libraryId ? assertKbLibraryId(p.libraryId) : activeLibraryId();
      const password = String(p.password || "").trim();
      if (!password) {
        return { ok: false, error: "密码不能为空" };
      }
      return await unlockDocumentWithPassword(docId, libId, password, { remember: p.remember !== false });
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle("kb-open-document", async (_e, payload) => {
    const p = payload && typeof payload === "object" ? payload : {};
    let docId = "";
    let reqLibraryId = "";
    try {
      docId = assertUuid(p.docId, "文档 id");
      if (p.libraryId) {
        reqLibraryId = assertKbLibraryId(p.libraryId);
      }
    } catch (err) {
      return { ok: false, error: err?.message || "缺少文档 id" };
    }
    const located = findDocumentInLibraries(ud(), docId, reqLibraryId);
    if (!located) {
      return { ok: false, error: "未找到对应文档（可能已删除或不在当前知识库）" };
    }
    const { libId, doc } = located;
    const extraPaths = Array.isArray(p.sourcePaths)
      ? p.sourcePaths.map((x) => String(x || "").trim()).filter(Boolean)
      : [];
    const candidates = [
      String(doc.sourcePath || "").trim(),
      String(p.sourcePath || "").trim(),
      ...extraPaths,
      String(doc.normalizedPath || "").trim(),
    ].filter((value, index, list) => value && list.indexOf(value) === index);
    const targetPath = resolveFirstExistingPath(candidates);
    if (!targetPath) {
      const shown = candidates[0] || String(p.sourcePath || "").trim() || "（无路径）";
      return {
        ok: false,
        error: `源文件不存在或路径已失效：${shown}。请确认文件未移动/删除，或在原路径重新入库。`,
        missingPath: shown,
      };
    }
    if (doc.encryptionStatus === "locked") {
      const stored = getPasswordsForFile(doc.fileMd5, path.dirname(targetPath));
      if (!stored.length) {
        return {
          ok: false,
          needsPassword: true,
          docId,
          libraryId: libId,
          name: doc.name || path.basename(targetPath),
          path: targetPath,
          error: "该文档已加密且尚未解锁，请输入密码。",
        };
      }
      const unlocked = await unlockDocumentWithPassword(docId, libId, stored[0], { remember: true });
      if (!unlocked.ok) {
        return {
          ok: false,
          needsPassword: true,
          docId,
          libraryId: libId,
          name: doc.name || path.basename(targetPath),
          path: targetPath,
          error: unlocked.error || "已保存的密码无法解密该文档，请重新输入。",
        };
      }
    }
    const opened = await openPathInSystemShell(targetPath);
    if (!opened.ok) {
      return {
        ok: false,
        error: `系统无法打开该文件：${opened.error}（路径：${opened.path || targetPath}）`,
        path: opened.path || targetPath,
      };
    }
    return { ok: true, path: opened.path || targetPath };
  });

  void kbWatch.syncAll();

  return { kbWatch };
}

module.exports = { registerKnowledgeBaseHandlers };
