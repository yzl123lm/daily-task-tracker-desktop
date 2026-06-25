/** Timing probe for real custom KB path (read-only). */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

function kbCustomSubfolderPath(raw) {
  const names = ["鲸落AI-知识库", "每日工作任务记录工具-知识库"];
  for (const name of names) {
    const candidate = path.join(raw, name);
    if (
      fs.existsSync(path.join(candidate, "kb-meta.json")) ||
      fs.existsSync(path.join(candidate, "libraries"))
    ) {
      return candidate;
    }
  }
  return path.join(raw, names[0]);
}

function tableNameForLibrary(libraryId) {
  const raw = String(libraryId || "default").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized) return `kb_chunks_${normalized}`;
  const fallbackHash = crypto.createHash("sha1").update(raw || "default").digest("hex").slice(0, 24);
  return `kb_chunks_lib_${fallbackHash}`;
}

async function main() {
  const settings = JSON.parse(
    fs.readFileSync(
      path.join(process.env.APPDATA, "daily-task-tracker-desktop", "kb-storage-settings.json"),
      "utf8"
    )
  );
  const kbRoot = kbCustomSubfolderPath(settings.customRoot);
  console.log("kbRoot:", kbRoot);
  const meta = JSON.parse(fs.readFileSync(path.join(kbRoot, "kb-meta.json"), "utf8"));

  const projectRoot = path.join(__dirname, "..");
  process.chdir(projectRoot);
  const { loadStoreFromSqlite } = require(path.join(projectRoot, "utils/kbSqliteStore.js"));
  const { rebuildFtsIndex, searchFtsIndex, loadFtsIndex } = require(path.join(projectRoot, "utils/kbFtsIndex.js"));
  const { scanChunksByKeyword } = require(path.join(projectRoot, "utils/kbRetrieval.js"));
  const defaultStore = () => ({ documents: [], chunks: [], graph: { nodes: [], edges: [] }, settings: {} });

  const q = "订单激活下发报竣协议 3.11";
  const tEmbed0 = Date.now();
  const res = await fetch("http://127.0.0.1:11434/api/embed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "bge-m3",
      input: q,
      options: { num_gpu: 999, main_gpu: 0 },
      keep_alive: "30m",
    }),
    signal: AbortSignal.timeout(90000),
  });
  const data = await res.json();
  const vec = data.embeddings?.[0] || data.embedding;
  console.log("embed ms:", Date.now() - tEmbed0, "dim:", vec?.length);

  const lancedb = require("@lancedb/lancedb");
  const lanceRoot = path.join(kbRoot, "lancedb");

  for (const lib of meta.libraries || []) {
    const libId = lib.id;
    const libDir = path.join(kbRoot, "libraries", libId);
    console.log("\n=== library:", libId, lib.name, "===");
    const tLoad = Date.now();
    const st = loadStoreFromSqlite(libDir, () => defaultStore());
    console.log("loadStore ms:", Date.now() - tLoad, "chunks:", (st.chunks || []).length);

    if (!(st.chunks || []).length) continue;

    const tableName = tableNameForLibrary(libId);
    console.log("lance table:", tableName);
    const tLance = Date.now();
    if (!fs.existsSync(lanceRoot)) fs.mkdirSync(lanceRoot, { recursive: true });
    const db = await lancedb.connect(lanceRoot);
    let table = (await db.tableNames()).includes(tableName) ? await db.openTable(tableName) : null;
    if (!table) {
      console.log("creating lance table...");
      const rows = (st.chunks || [])
        .filter((c) => Array.isArray(c.embedding) && c.embedding.length)
        .map((c) => ({
          id: c.id,
          libraryId: String(libId),
          docId: c.docId,
          docName: c.docName,
          text: c.text,
          embedding: c.embedding,
        }));
      table = await db.createTable(tableName, rows, { mode: "create", existOk: true });
      console.log("createTable ms:", Date.now() - tLance, "rows:", rows.length);
    } else {
      console.log("openTable ms:", Date.now() - tLance);
    }

    const tSearch = Date.now();
    const hits = await table.vectorSearch(vec).limit(200).toArray();
    console.log("vectorSearch ms:", Date.now() - tSearch, "hits:", hits.length);

    const tFts = Date.now();
    const fts = loadFtsIndex(libDir);
    let ftsHits;
    if (!fts.docCount) {
      console.log("rebuilding fts...");
      const rebuilt = rebuildFtsIndex(st.chunks, st.documents);
      ftsHits = searchFtsIndex(rebuilt, q, 50);
      console.log("rebuildFts ms:", Date.now() - tFts, "ftsHits:", ftsHits.length);
    } else {
      ftsHits = searchFtsIndex(fts, q, 50);
      console.log("searchFts ms:", Date.now() - tFts, "ftsHits:", ftsHits.length);
    }

    const tKw = Date.now();
    const kw = scanChunksByKeyword(st.chunks, q, { limit: 50 });
    console.log("keyword ms:", Date.now() - tKw, "kw:", kw.length);
  }
  console.log("\nDONE total ms:", Date.now() - tEmbed0);
}

main().catch((e) => {
  console.error("FAIL:", e.stack || e);
  process.exit(1);
});
