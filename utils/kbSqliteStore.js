const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const STORE_SCHEMA_VERSION = 3;
const dbCache = new Map();

const DOCUMENT_COLUMNS = [
  "id",
  "name",
  "source_path",
  "file_md5",
  "file_size",
  "file_mtime",
  "normalized_path",
  "chunk_count",
  "created_at",
  "conversion_json",
  "verification_json",
  "auto_learn",
  "auto_learn_key",
  "question_preview",
  "moved_at",
  "moved_from_library_id",
  "last_writeback_at",
  "last_writeback_summary",
  "encryption_status",
  "delete_status",
  "deleted_at",
  "archived_path",
  "archive_md5",
  "archive_status",
  "archive_policy",
  "source_missing_at",
  "relink_path",
];

function sqliteDbPath(libraryDirPath) {
  return path.join(String(libraryDirPath || ""), "kb-store.sqlite");
}

function storeJsonPath(libraryDirPath) {
  return path.join(String(libraryDirPath || ""), "store.json");
}

function ensureColumn(db, table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_documents (
      id TEXT PRIMARY KEY,
      name TEXT,
      source_path TEXT,
      file_md5 TEXT,
      file_size INTEGER,
      file_mtime TEXT,
      normalized_path TEXT,
      chunk_count INTEGER,
      created_at TEXT,
      conversion_json TEXT,
      verification_json TEXT,
      auto_learn INTEGER DEFAULT 0,
      auto_learn_key TEXT,
      question_preview TEXT,
      moved_at TEXT,
      moved_from_library_id TEXT,
      last_writeback_at TEXT,
      last_writeback_summary TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_chunks (
      id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      doc_name TEXT,
      text TEXT NOT NULL,
      chunk_index INTEGER,
      char_start INTEGER,
      char_end INTEGER,
      chunk_hash TEXT,
      doc_kind TEXT,
      embedding_json TEXT,
      updated_at TEXT,
      embedding_version INTEGER DEFAULT 1,
      fts_version INTEGER DEFAULT 1,
      FOREIGN KEY (doc_id) REFERENCES kb_documents(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS kb_ingest_jobs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      file_path TEXT,
      doc_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      error TEXT,
      result_json TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_search_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      query_type TEXT,
      search_mode TEXT,
      hit_count INTEGER,
      elapsed_ms INTEGER,
      low_confidence INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      debug_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON kb_chunks(doc_id);
    CREATE INDEX IF NOT EXISTS idx_documents_file_md5 ON kb_documents(file_md5);
    CREATE INDEX IF NOT EXISTS idx_documents_source_path ON kb_documents(source_path);
    CREATE INDEX IF NOT EXISTS idx_ingest_jobs_status ON kb_ingest_jobs(status, updated_at);
    CREATE TABLE IF NOT EXISTS kb_auto_learn_queue (
      id TEXT PRIMARY KEY,
      library_id TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      source_type TEXT,
      status TEXT NOT NULL,
      credibility TEXT,
      session_id TEXT,
      model_name TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      payload_json TEXT
    );
    CREATE TABLE IF NOT EXISTS kb_auto_learn_audit (
      id TEXT PRIMARY KEY,
      library_id TEXT,
      doc_id TEXT,
      queue_id TEXT,
      action TEXT NOT NULL,
      question_preview TEXT,
      answer_preview TEXT,
      source_type TEXT,
      credibility TEXT,
      created_at TEXT NOT NULL,
      meta_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auto_learn_queue_status ON kb_auto_learn_queue(status, updated_at);
    CREATE INDEX IF NOT EXISTS idx_auto_learn_audit_doc ON kb_auto_learn_audit(doc_id, created_at);
  `);
  ensureColumn(db, "kb_documents", "auto_learn_meta_json", "TEXT");
  ensureColumn(db, "kb_documents", "encryption_status", "TEXT");
  ensureColumn(db, "kb_documents", "delete_status", "TEXT");
  ensureColumn(db, "kb_documents", "deleted_at", "TEXT");
  ensureColumn(db, "kb_documents", "archived_path", "TEXT");
  ensureColumn(db, "kb_documents", "archive_md5", "TEXT");
  ensureColumn(db, "kb_documents", "archive_status", "TEXT");
  ensureColumn(db, "kb_documents", "archive_policy", "TEXT");
  ensureColumn(db, "kb_documents", "source_missing_at", "TEXT");
  ensureColumn(db, "kb_documents", "relink_path", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS kb_delete_jobs (
      job_id TEXT PRIMARY KEY,
      doc_id TEXT NOT NULL,
      library_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER DEFAULT 0,
      max_attempts INTEGER DEFAULT 5,
      next_retry_at TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_delete_jobs_status ON kb_delete_jobs(status, next_retry_at);
    CREATE INDEX IF NOT EXISTS idx_delete_jobs_doc ON kb_delete_jobs(doc_id, library_id);
  `);
  db.prepare("INSERT OR IGNORE INTO kb_meta(key, value) VALUES(?, ?)").run(
    "schema_version",
    String(STORE_SCHEMA_VERSION)
  );
  const curVer = Number(
    db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("schema_version")?.value || 0
  );
  if (curVer < STORE_SCHEMA_VERSION) {
    db.prepare("UPDATE kb_meta SET value = ? WHERE key = ?").run(
      String(STORE_SCHEMA_VERSION),
      "schema_version"
    );
  }
}

function openLibraryDb(libraryDirPath) {
  const fp = sqliteDbPath(libraryDirPath);
  if (dbCache.has(fp)) {
    return dbCache.get(fp);
  }
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const db = new DatabaseSync(fp);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  ensureSchema(db);
  dbCache.set(fp, db);
  return db;
}

function closeLibraryDb(libraryDirPath) {
  const fp = sqliteDbPath(libraryDirPath);
  const db = dbCache.get(fp);
  if (db) {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    dbCache.delete(fp);
  }
}

function closeAllLibraryDbs() {
  for (const fp of [...dbCache.keys()]) {
    const db = dbCache.get(fp);
    if (db) {
      try {
        db.close();
      } catch {
        /* ignore */
      }
    }
    dbCache.delete(fp);
  }
}

function parseJson(value, fallback = null) {
  if (value == null || value === "") {
    return fallback;
  }
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function documentToRow(doc) {
  const d = doc && typeof doc === "object" ? doc : {};
  return {
    id: String(d.id || ""),
    name: String(d.name || ""),
    source_path: String(d.sourcePath || ""),
    file_md5: String(d.fileMd5 || ""),
    file_size: Number(d.fileSize || 0) || null,
    file_mtime: String(d.fileMtime || ""),
    normalized_path: String(d.normalizedPath || ""),
    chunk_count: Number(d.chunkCount || 0) || 0,
    created_at: String(d.createdAt || ""),
    conversion_json: JSON.stringify(d.conversion || null),
    verification_json: JSON.stringify(d.verification || null),
    auto_learn: d.autoLearn ? 1 : 0,
    auto_learn_key: String(d.autoLearnKey || ""),
    question_preview: String(d.questionPreview || ""),
    moved_at: String(d.movedAt || ""),
    moved_from_library_id: String(d.movedFromLibraryId || ""),
    last_writeback_at: String(d.lastWritebackAt || ""),
    last_writeback_summary: String(d.lastWritebackSummary || ""),
    auto_learn_meta_json: JSON.stringify(d.autoLearnMeta || null),
    encryption_status: String(d.encryptionStatus || ""),
    delete_status: String(d.deleteStatus || ""),
    deleted_at: String(d.deletedAt || ""),
    archived_path: String(d.archivedPath || ""),
    archive_md5: String(d.archiveMd5 || ""),
    archive_status: String(d.archiveStatus || ""),
    archive_policy: String(d.archivePolicy || ""),
    source_missing_at: String(d.sourceMissingAt || ""),
    relink_path: String(d.relinkPath || ""),
  };
}

function rowToDocument(row) {
  if (!row) {
    return null;
  }
  const doc = {
    id: row.id,
    name: row.name || "",
    sourcePath: row.source_path || "",
    fileMd5: row.file_md5 || "",
    fileSize: row.file_size != null ? Number(row.file_size) : undefined,
    fileMtime: row.file_mtime || "",
    normalizedPath: row.normalized_path || "",
    chunkCount: Number(row.chunk_count || 0),
    createdAt: row.created_at || "",
    conversion: parseJson(row.conversion_json, { applied: false }),
    verification: parseJson(row.verification_json, { enabled: false, summary: "" }),
  };
  if (row.auto_learn) {
    doc.autoLearn = true;
  }
  if (row.auto_learn_key) {
    doc.autoLearnKey = row.auto_learn_key;
  }
  if (row.question_preview) {
    doc.questionPreview = row.question_preview;
  }
  if (row.moved_at) {
    doc.movedAt = row.moved_at;
  }
  if (row.moved_from_library_id) {
    doc.movedFromLibraryId = row.moved_from_library_id;
  }
  if (row.last_writeback_at) {
    doc.lastWritebackAt = row.last_writeback_at;
  }
  if (row.last_writeback_summary) {
    doc.lastWritebackSummary = row.last_writeback_summary;
  }
  if (row.encryption_status) {
    doc.encryptionStatus = row.encryption_status;
  }
  const autoLearnMeta = parseJson(row.auto_learn_meta_json, null);
  if (autoLearnMeta && typeof autoLearnMeta === "object") {
    doc.autoLearnMeta = autoLearnMeta;
  }
  if (row.delete_status) {
    doc.deleteStatus = row.delete_status;
  }
  if (row.deleted_at) {
    doc.deletedAt = row.deleted_at;
  }
  if (row.archived_path) {
    doc.archivedPath = row.archived_path;
  }
  if (row.archive_md5) {
    doc.archiveMd5 = row.archive_md5;
  }
  if (row.archive_status) {
    doc.archiveStatus = row.archive_status;
  }
  if (row.archive_policy) {
    doc.archivePolicy = row.archive_policy;
  }
  if (row.source_missing_at) {
    doc.sourceMissingAt = row.source_missing_at;
  }
  if (row.relink_path) {
    doc.relinkPath = row.relink_path;
  }
  return doc;
}

function chunkToRow(chunk) {
  const c = chunk && typeof chunk === "object" ? chunk : {};
  return {
    id: String(c.id || ""),
    doc_id: String(c.docId || ""),
    doc_name: String(c.docName || ""),
    text: String(c.text || ""),
    chunk_index: c.chunkIndex != null ? Number(c.chunkIndex) : null,
    char_start: c.charStart != null ? Number(c.charStart) : null,
    char_end: c.charEnd != null ? Number(c.charEnd) : null,
    chunk_hash: String(c.chunkHash || ""),
    doc_kind: String(c.docKind || ""),
    embedding_json: Array.isArray(c.embedding) ? JSON.stringify(c.embedding) : "",
    updated_at: String(c.updatedAt || ""),
    embedding_version: Number(c.embeddingVersion || 1) || 1,
    fts_version: Number(c.ftsVersion || 1) || 1,
  };
}

function rowToChunk(row) {
  if (!row) {
    return null;
  }
  const chunk = {
    id: row.id,
    docId: row.doc_id,
    docName: row.doc_name || "",
    text: row.text || "",
    chunkIndex: row.chunk_index != null ? Number(row.chunk_index) : undefined,
    charStart: row.char_start != null ? Number(row.char_start) : undefined,
    charEnd: row.char_end != null ? Number(row.char_end) : undefined,
    chunkHash: row.chunk_hash || "",
    docKind: row.doc_kind || "",
    embeddingVersion: Number(row.embedding_version || 1),
    ftsVersion: Number(row.fts_version || 1),
  };
  const emb = parseJson(row.embedding_json, null);
  if (Array.isArray(emb)) {
    chunk.embedding = emb;
  }
  if (row.updated_at) {
    chunk.updatedAt = row.updated_at;
  }
  return chunk;
}

function loadStoreFromJson(jsonPath, defaultStoreFn) {
  const d = defaultStoreFn();
  if (!fs.existsSync(jsonPath)) {
    return d;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
    if (!raw || typeof raw !== "object") {
      return d;
    }
    d.settings = { ...d.settings, ...(raw.settings || {}) };
    d.documents = Array.isArray(raw.documents) ? raw.documents : [];
    d.chunks = Array.isArray(raw.chunks) ? raw.chunks : [];
    if (raw.graph && typeof raw.graph === "object") {
      d.graph = raw.graph;
    }
    return d;
  } catch {
    return defaultStoreFn();
  }
}

function loadStoreFromSqlite(libraryDirPath, defaultStoreFn) {
  const db = openLibraryDb(libraryDirPath);
  const store = defaultStoreFn();
  const settingsRows = db.prepare("SELECT key, value FROM kb_settings").all();
  settingsRows.forEach((row) => {
    store.settings[row.key] = parseJson(row.value, row.value);
  });
  store.documents = db.prepare("SELECT * FROM kb_documents ORDER BY created_at ASC").all().map(rowToDocument);
  store.chunks = db.prepare("SELECT * FROM kb_chunks ORDER BY doc_id ASC, chunk_index ASC").all().map(rowToChunk);
  const graphRow = db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("graph_json");
  if (graphRow?.value) {
    const graph = parseJson(graphRow.value, null);
    if (graph && typeof graph === "object") {
      store.graph = graph;
    }
  }
  return store;
}

/** 检索专用：不加载 embedding_json，显著减少 SQLite 读取与 JSON 解析耗时。 */
function loadStoreForSearch(libraryDirPath, defaultStoreFn) {
  const db = openLibraryDb(libraryDirPath);
  const store = defaultStoreFn();
  const settingsRows = db.prepare("SELECT key, value FROM kb_settings").all();
  settingsRows.forEach((row) => {
    store.settings[row.key] = parseJson(row.value, row.value);
  });
  store.documents = db.prepare("SELECT * FROM kb_documents ORDER BY created_at ASC").all().map(rowToDocument);
  store.chunks = db
    .prepare(
      `SELECT id, doc_id, doc_name, text, chunk_index, char_start, char_end, chunk_hash, doc_kind, embedding_version, fts_version, updated_at
       FROM kb_chunks ORDER BY doc_id ASC, chunk_index ASC`
    )
    .all()
    .map(rowToChunk);
  const graphRow = db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("graph_json");
  if (graphRow?.value) {
    const graph = parseJson(graphRow.value, null);
    if (graph && typeof graph === "object") {
      store.graph = graph;
    }
  }
  return store;
}

function countLibraryChunks(libraryDirPath) {
  const db = openLibraryDb(libraryDirPath);
  return Number(db.prepare("SELECT COUNT(*) AS n FROM kb_chunks").get()?.n || 0);
}

function sampleEmbeddingDim(libraryDirPath) {
  const db = openLibraryDb(libraryDirPath);
  const row = db
    .prepare(
      "SELECT embedding_json FROM kb_chunks WHERE embedding_json IS NOT NULL AND embedding_json != '' LIMIT 1"
    )
    .get();
  const emb = parseJson(row?.embedding_json, null);
  return Array.isArray(emb) ? emb.length : 0;
}

/** Lance 失败回退余弦相似度时，按需补全 embedding。 */
function hydrateChunkEmbeddings(libraryDirPath, chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  const missing = list.filter((c) => !Array.isArray(c.embedding) || !c.embedding.length);
  if (!missing.length) {
    return;
  }
  const db = openLibraryDb(libraryDirPath);
  const ids = missing.map((c) => String(c.id || "")).filter(Boolean);
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT id, embedding_json FROM kb_chunks WHERE id IN (${placeholders})`)
    .all(...ids);
  const byId = new Map(
    rows.map((row) => [String(row.id || ""), parseJson(row.embedding_json, null)])
  );
  list.forEach((c) => {
    const emb = byId.get(String(c.id || ""));
    if (Array.isArray(emb) && emb.length) {
      c.embedding = emb;
    }
  });
}

function saveStoreToSqlite(libraryDirPath, store) {
  const db = openLibraryDb(libraryDirPath);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM kb_settings");
    const insSetting = db.prepare("INSERT INTO kb_settings(key, value) VALUES(?, ?)");
    Object.entries(store.settings || {}).forEach(([key, value]) => {
      insSetting.run(String(key), JSON.stringify(value));
    });

    const documents = Array.isArray(store.documents) ? store.documents : [];
    const chunks = Array.isArray(store.chunks) ? store.chunks : [];
    const docIds = documents.map((d) => String(d.id || "")).filter(Boolean);
    const chunkIds = chunks.map((c) => String(c.id || "")).filter(Boolean);

    if (docIds.length) {
      const placeholders = docIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM kb_documents WHERE id NOT IN (${placeholders})`).run(...docIds);
    } else {
      db.exec("DELETE FROM kb_documents");
    }

    const upsertDoc = db.prepare(`
      INSERT INTO kb_documents (
        id, name, source_path, file_md5, file_size, file_mtime, normalized_path, chunk_count, created_at,
        conversion_json, verification_json, auto_learn, auto_learn_key, question_preview,
        moved_at, moved_from_library_id, last_writeback_at, last_writeback_summary, auto_learn_meta_json,
        encryption_status, delete_status, deleted_at, archived_path, archive_md5, archive_status,
        archive_policy, source_missing_at, relink_path
      ) VALUES (
        @id, @name, @source_path, @file_md5, @file_size, @file_mtime, @normalized_path, @chunk_count, @created_at,
        @conversion_json, @verification_json, @auto_learn, @auto_learn_key, @question_preview,
        @moved_at, @moved_from_library_id, @last_writeback_at, @last_writeback_summary, @auto_learn_meta_json,
        @encryption_status, @delete_status, @deleted_at, @archived_path, @archive_md5, @archive_status,
        @archive_policy, @source_missing_at, @relink_path
      )
      ON CONFLICT(id) DO UPDATE SET
        name=excluded.name,
        source_path=excluded.source_path,
        file_md5=excluded.file_md5,
        file_size=excluded.file_size,
        file_mtime=excluded.file_mtime,
        normalized_path=excluded.normalized_path,
        chunk_count=excluded.chunk_count,
        created_at=excluded.created_at,
        conversion_json=excluded.conversion_json,
        verification_json=excluded.verification_json,
        auto_learn=excluded.auto_learn,
        auto_learn_key=excluded.auto_learn_key,
        question_preview=excluded.question_preview,
        moved_at=excluded.moved_at,
        moved_from_library_id=excluded.moved_from_library_id,
        last_writeback_at=excluded.last_writeback_at,
        last_writeback_summary=excluded.last_writeback_summary,
        auto_learn_meta_json=excluded.auto_learn_meta_json,
        encryption_status=excluded.encryption_status,
        delete_status=excluded.delete_status,
        deleted_at=excluded.deleted_at,
        archived_path=excluded.archived_path,
        archive_md5=excluded.archive_md5,
        archive_status=excluded.archive_status,
        archive_policy=excluded.archive_policy,
        source_missing_at=excluded.source_missing_at,
        relink_path=excluded.relink_path
    `);
    documents.forEach((doc) => {
      if (doc?.id) {
        upsertDoc.run(documentToRow(doc));
      }
    });

    if (chunkIds.length) {
      const placeholders = chunkIds.map(() => "?").join(",");
      db.prepare(`DELETE FROM kb_chunks WHERE id NOT IN (${placeholders})`).run(...chunkIds);
    } else {
      db.exec("DELETE FROM kb_chunks");
    }

    const upsertChunk = db.prepare(`
      INSERT INTO kb_chunks (
        id, doc_id, doc_name, text, chunk_index, char_start, char_end, chunk_hash, doc_kind,
        embedding_json, updated_at, embedding_version, fts_version
      ) VALUES (
        @id, @doc_id, @doc_name, @text, @chunk_index, @char_start, @char_end, @chunk_hash, @doc_kind,
        @embedding_json, @updated_at, @embedding_version, @fts_version
      )
      ON CONFLICT(id) DO UPDATE SET
        doc_id=excluded.doc_id,
        doc_name=excluded.doc_name,
        text=excluded.text,
        chunk_index=excluded.chunk_index,
        char_start=excluded.char_start,
        char_end=excluded.char_end,
        chunk_hash=excluded.chunk_hash,
        doc_kind=excluded.doc_kind,
        embedding_json=excluded.embedding_json,
        updated_at=excluded.updated_at,
        embedding_version=excluded.embedding_version,
        fts_version=excluded.fts_version
    `);
    chunks.forEach((chunk) => {
      if (chunk?.id) {
        upsertChunk.run(chunkToRow(chunk));
      }
    });

    db.prepare("INSERT OR REPLACE INTO kb_meta(key, value) VALUES(?, ?)").run(
      "graph_json",
      JSON.stringify(store.graph || {})
    );
    db.prepare("INSERT OR REPLACE INTO kb_meta(key, value) VALUES(?, ?)").run(
      "updated_at",
      new Date().toISOString()
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function migrateJsonStoreIfNeeded(libraryDirPath, defaultStoreFn) {
  const jsonPath = storeJsonPath(libraryDirPath);
  const dbPath = sqliteDbPath(libraryDirPath);
  if (!fs.existsSync(jsonPath)) {
    return { migrated: false, reason: "no-json" };
  }
  const db = openLibraryDb(libraryDirPath);
  const docCount = db.prepare("SELECT COUNT(*) AS n FROM kb_documents").get()?.n || 0;
  const chunkCount = db.prepare("SELECT COUNT(*) AS n FROM kb_chunks").get()?.n || 0;
  if (docCount > 0 || chunkCount > 0) {
    return { migrated: false, reason: "sqlite-not-empty", docCount, chunkCount };
  }
  const store = loadStoreFromJson(jsonPath, defaultStoreFn);
  saveStoreToSqlite(libraryDirPath, store);
  const backupPath = `${jsonPath}.migrated-${Date.now()}.bak`;
  fs.renameSync(jsonPath, backupPath);
  db.prepare("INSERT OR REPLACE INTO kb_meta(key, value) VALUES(?, ?)").run(
    "migrated_from_json_at",
    new Date().toISOString()
  );
  db.prepare("INSERT OR REPLACE INTO kb_meta(key, value) VALUES(?, ?)").run(
    "migrated_from_json_path",
    backupPath
  );
  return {
    migrated: true,
    backupPath,
    docCount: store.documents.length,
    chunkCount: store.chunks.length,
  };
}

function getStoreCounts(libraryDirPath) {
  const db = openLibraryDb(libraryDirPath);
  return {
    documents: Number(db.prepare("SELECT COUNT(*) AS n FROM kb_documents").get()?.n || 0),
    chunks: Number(db.prepare("SELECT COUNT(*) AS n FROM kb_chunks").get()?.n || 0),
    ingestJobs: Number(db.prepare("SELECT COUNT(*) AS n FROM kb_ingest_jobs").get()?.n || 0),
    searchLogs: Number(db.prepare("SELECT COUNT(*) AS n FROM kb_search_logs").get()?.n || 0),
    schemaVersion: Number(
      db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("schema_version")?.value || STORE_SCHEMA_VERSION
    ),
    sqlitePath: sqliteDbPath(libraryDirPath),
    updatedAt: db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("updated_at")?.value || "",
    migratedFromJsonAt:
      db.prepare("SELECT value FROM kb_meta WHERE key = ?").get("migrated_from_json_at")?.value || "",
  };
}

function checkIndexHealth(libraryDirPath, external = {}) {
  const counts = getStoreCounts(libraryDirPath);
  const lanceChunks = Number(external.lanceChunkCount ?? -1);
  const ftsChunks = Number(external.ftsChunkCount ?? -1);
  const issues = [];
  if (lanceChunks >= 0 && lanceChunks !== counts.chunks) {
    issues.push({
      code: "lance_chunk_mismatch",
      severity: "P1",
      message: `LanceDB 分片数 ${lanceChunks} 与 SQLite ${counts.chunks} 不一致`,
    });
  }
  if (ftsChunks >= 0 && ftsChunks !== counts.chunks) {
    issues.push({
      code: "fts_chunk_mismatch",
      severity: "P1",
      message: `全文索引分片数 ${ftsChunks} 与 SQLite ${counts.chunks} 不一致`,
    });
  }
  if (counts.chunks > 0 && counts.documents === 0) {
    issues.push({
      code: "orphan_chunks",
      severity: "P0",
      message: "存在分片但无文档记录",
    });
  }
  const staleDeleting = Number(external.staleDeletingCount ?? 0);
  if (staleDeleting > 0) {
    issues.push({
      code: "stale_deleting",
      severity: "P0",
      message: `有 ${staleDeleting} 个文档处于 deleting 状态未完成清理`,
    });
  }
  const pendingDeleteJobs = Number(external.pendingDeleteJobs ?? 0);
  if (pendingDeleteJobs > 0) {
    issues.push({
      code: "pending_delete_jobs",
      severity: "P0",
      message: `有 ${pendingDeleteJobs} 个删除补偿任务待处理`,
    });
  }
  return {
    healthy: issues.length === 0,
    counts,
    lanceChunkCount: lanceChunks,
    ftsChunkCount: ftsChunks,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

function appendSearchLog(libraryDirPath, entry) {
  const db = openLibraryDb(libraryDirPath);
  db.prepare(`
    INSERT INTO kb_search_logs(query, query_type, search_mode, hit_count, elapsed_ms, low_confidence, created_at, debug_json)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.query || ""),
    String(entry.queryType || ""),
    String(entry.searchMode || ""),
    Number(entry.hitCount || 0),
    Number(entry.elapsedMs || 0),
    entry.lowConfidence ? 1 : 0,
    new Date().toISOString(),
    JSON.stringify(entry.debug || {})
  );
}

function upsertIngestJob(libraryDirPath, job) {
  const db = openLibraryDb(libraryDirPath);
  db.prepare(`
    INSERT INTO kb_ingest_jobs(id, status, file_path, doc_id, created_at, updated_at, error, result_json)
    VALUES(@id, @status, @file_path, @doc_id, @created_at, @updated_at, @error, @result_json)
    ON CONFLICT(id) DO UPDATE SET
      status=excluded.status,
      file_path=excluded.file_path,
      doc_id=excluded.doc_id,
      updated_at=excluded.updated_at,
      error=excluded.error,
      result_json=excluded.result_json
  `).run({
    id: String(job.id || ""),
    status: String(job.status || "pending"),
    file_path: String(job.filePath || ""),
    doc_id: String(job.docId || ""),
    created_at: String(job.createdAt || new Date().toISOString()),
    updated_at: String(job.updatedAt || new Date().toISOString()),
    error: String(job.error || ""),
    result_json: JSON.stringify(job.result || null),
  });
}

function enqueueAutoLearn(libraryDirPath, item) {
  const db = openLibraryDb(libraryDirPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kb_auto_learn_queue(
      id, library_id, question, answer, source_type, status, credibility,
      session_id, model_name, created_at, updated_at, payload_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(item.id || ""),
    String(item.libraryId || ""),
    String(item.question || ""),
    String(item.answer || ""),
    String(item.sourceType || "chat"),
    String(item.status || "pending"),
    String(item.credibility || "unconfirmed"),
    String(item.sessionId || ""),
    String(item.modelName || ""),
    String(item.createdAt || now),
    String(item.updatedAt || now),
    JSON.stringify(item.payload || {})
  );
}

function getAutoLearnQueueItem(libraryDirPath, queueId) {
  const db = openLibraryDb(libraryDirPath);
  return db.prepare("SELECT * FROM kb_auto_learn_queue WHERE id = ?").get(String(queueId || ""));
}

function listAutoLearnQueue(libraryDirPath, status = "pending", limit = 50) {
  const db = openLibraryDb(libraryDirPath);
  return db
    .prepare(
      `SELECT * FROM kb_auto_learn_queue WHERE status = ? ORDER BY datetime(created_at) DESC LIMIT ?`
    )
    .all(String(status || "pending"), Math.max(1, Math.min(200, Number(limit) || 50)));
}

function updateAutoLearnQueueItem(libraryDirPath, queueId, patch = {}) {
  const db = openLibraryDb(libraryDirPath);
  const cur = getAutoLearnQueueItem(libraryDirPath, queueId);
  if (!cur) {
    return null;
  }
  db.prepare(`
    UPDATE kb_auto_learn_queue
    SET status = ?, credibility = ?, updated_at = ?, payload_json = ?
    WHERE id = ?
  `).run(
    String(patch.status ?? cur.status),
    String(patch.credibility ?? cur.credibility ?? "unconfirmed"),
    new Date().toISOString(),
    JSON.stringify(patch.payload ?? parseJson(cur.payload_json, {})),
    String(queueId)
  );
  return getAutoLearnQueueItem(libraryDirPath, queueId);
}

function appendAutoLearnAudit(libraryDirPath, entry) {
  const db = openLibraryDb(libraryDirPath);
  db.prepare(`
    INSERT INTO kb_auto_learn_audit(
      id, library_id, doc_id, queue_id, action, question_preview, answer_preview,
      source_type, credibility, created_at, meta_json
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(entry.id || ""),
    String(entry.libraryId || ""),
    String(entry.docId || ""),
    String(entry.queueId || ""),
    String(entry.action || ""),
    String(entry.questionPreview || "").slice(0, 200),
    String(entry.answerPreview || "").slice(0, 400),
    String(entry.sourceType || ""),
    String(entry.credibility || ""),
    String(entry.createdAt || new Date().toISOString()),
    JSON.stringify(entry.meta || {})
  );
}

function listAutoLearnAudit(libraryDirPath, limit = 30) {
  const db = openLibraryDb(libraryDirPath);
  return db
    .prepare(`SELECT * FROM kb_auto_learn_audit ORDER BY datetime(created_at) DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Number(limit) || 30)));
}

function listSearchLogs(libraryDirPath, limit = 50) {
  const db = openLibraryDb(libraryDirPath);
  return db
    .prepare(`SELECT * FROM kb_search_logs ORDER BY datetime(created_at) DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Number(limit) || 50)));
}

function listIngestJobs(libraryDirPath, limit = 50) {
  const db = openLibraryDb(libraryDirPath);
  return db
    .prepare(`SELECT * FROM kb_ingest_jobs ORDER BY datetime(updated_at) DESC LIMIT ?`)
    .all(Math.max(1, Math.min(200, Number(limit) || 50)));
}

function countAutoLearnQueue(libraryDirPath, status = "pending") {
  const db = openLibraryDb(libraryDirPath);
  return Number(
    db.prepare("SELECT COUNT(*) AS n FROM kb_auto_learn_queue WHERE status = ?").get(String(status || "pending"))
      ?.n || 0
  );
}

function upsertDeleteJob(libraryDirPath, job) {
  const db = openLibraryDb(libraryDirPath);
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO kb_delete_jobs(
      job_id, doc_id, library_id, stage, status, attempts, max_attempts,
      next_retry_at, last_error, created_at, updated_at
    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      stage=excluded.stage,
      status=excluded.status,
      attempts=excluded.attempts,
      max_attempts=excluded.max_attempts,
      next_retry_at=excluded.next_retry_at,
      last_error=excluded.last_error,
      updated_at=excluded.updated_at
  `).run(
    String(job.jobId || job.id || ""),
    String(job.docId || ""),
    String(job.libraryId || ""),
    String(job.stage || "lance"),
    String(job.status || "pending"),
    Number(job.attempts || 0),
    Number(job.maxAttempts || 5),
    String(job.nextRetryAt || ""),
    String(job.lastError || ""),
    String(job.createdAt || now),
    String(job.updatedAt || now)
  );
}

function listDeleteJobs(libraryDirPath, options = {}) {
  const db = openLibraryDb(libraryDirPath);
  const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
  const status = String(options.status || "").trim();
  if (status) {
    return db
      .prepare(
        `SELECT * FROM kb_delete_jobs WHERE status = ? ORDER BY datetime(updated_at) DESC LIMIT ?`
      )
      .all(status, limit);
  }
  return db
    .prepare(`SELECT * FROM kb_delete_jobs ORDER BY datetime(updated_at) DESC LIMIT ?`)
    .all(limit);
}

function countDeleteJobs(libraryDirPath, status = "pending") {
  const db = openLibraryDb(libraryDirPath);
  return Number(
    db.prepare("SELECT COUNT(*) AS n FROM kb_delete_jobs WHERE status = ?").get(String(status || "pending"))?.n || 0
  );
}

function getDeleteJob(libraryDirPath, jobId) {
  const db = openLibraryDb(libraryDirPath);
  return db.prepare("SELECT * FROM kb_delete_jobs WHERE job_id = ?").get(String(jobId || ""));
}

function countDocumentsByDeleteStatus(libraryDirPath, deleteStatus = "deleting") {
  const db = openLibraryDb(libraryDirPath);
  return Number(
    db
      .prepare("SELECT COUNT(*) AS n FROM kb_documents WHERE delete_status = ?")
      .get(String(deleteStatus || "deleting"))?.n || 0
  );
}

module.exports = {
  STORE_SCHEMA_VERSION,
  sqliteDbPath,
  storeJsonPath,
  openLibraryDb,
  closeLibraryDb,
  closeAllLibraryDbs,
  loadStoreFromJson,
  loadStoreFromSqlite,
  loadStoreForSearch,
  countLibraryChunks,
  sampleEmbeddingDim,
  hydrateChunkEmbeddings,
  saveStoreToSqlite,
  migrateJsonStoreIfNeeded,
  getStoreCounts,
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
  upsertDeleteJob,
  listDeleteJobs,
  countDeleteJobs,
  getDeleteJob,
  countDocumentsByDeleteStatus,
  DOCUMENT_COLUMNS,
};
