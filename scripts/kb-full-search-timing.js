/** Full kb-search path timing (read-only). */
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const projectRoot = path.join(__dirname, "..");
process.chdir(projectRoot);

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

function kbRoot(userDataPath) {
  const settingsPath = path.join(userDataPath, "kb-storage-settings.json");
  let customRoot = "";
  if (fs.existsSync(settingsPath)) {
    try {
      customRoot = String(JSON.parse(fs.readFileSync(settingsPath, "utf8")).customRoot || "").trim();
    } catch {
      customRoot = "";
    }
  }
  if (customRoot) {
    const modern = kbCustomSubfolderPath(customRoot);
    const modernHas =
      fs.existsSync(path.join(modern, "kb-meta.json")) ||
      fs.existsSync(path.join(modern, "libraries"));
    const directHas =
      fs.existsSync(path.join(customRoot, "kb-meta.json")) ||
      fs.existsSync(path.join(customRoot, "libraries"));
    if (modernHas || !directHas) return modern;
    return customRoot;
  }
  return path.join(userDataPath, "knowledge-base");
}

function tableNameForLibrary(libraryId) {
  const raw = String(libraryId || "default").trim().toLowerCase();
  const normalized = raw
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (normalized) return `kb_chunks_${normalized}`;
  return `kb_chunks_lib_${crypto.createHash("sha1").update(raw || "default").digest("hex").slice(0, 24)}`;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms)
    ),
  ]);
}

async function main() {
  const userData = path.join(process.env.APPDATA, "daily-task-tracker-desktop");
  const root = kbRoot(userData);
  console.log("kbRoot:", root);
  const meta = JSON.parse(fs.readFileSync(path.join(root, "kb-meta.json"), "utf8"));
  const libIds = (meta.libraries || []).map((x) => x.id);
  console.log("libraries:", libIds);

  const q = "订单激活下发报竣协议 3.11";
  const { fetchOllamaEmbedJson, buildOllamaEmbedPayload } = require(path.join(projectRoot, "main/ollamaRuntime.js"));
  const { loadStoreFromSqlite } = require(path.join(projectRoot, "utils/kbSqliteStore.js"));
  const { rebuildFtsIndex, searchFtsIndex, loadFtsIndex } = require(path.join(projectRoot, "utils/kbFtsIndex.js"));
  const {
    scanChunksByKeyword,
    scanMetadataHits,
    mergeAndFuseHits,
    classifyQuery,
    inferQueryProfile,
    resolveCandidateK,
    vectorScoreFromDistance,
  } = require(path.join(projectRoot, "utils/kbRetrieval.js"));
  const lancedb = require("@lancedb/lancedb");
  const defaultStore = () => ({ documents: [], chunks: [], graph: { nodes: [], edges: [] }, settings: {} });

  const t0 = Date.now();
  const settings = { inferenceDevice: "gpu", numThread: null, host: "http://127.0.0.1:11434" };
  const vec = (
    await withTimeout(
      fetchOllamaEmbedJson(
        "http://127.0.0.1:11434/api/embed",
        buildOllamaEmbedPayload("bge-m3", q, settings)
      ),
      120000,
      "embed"
    )
  ).embeddings?.[0];
  console.log("embed ms:", Date.now() - t0, "dim:", vec?.length);

  const profile = inferQueryProfile(q);
  const candidateK = resolveCandidateK(5, profile.vectorTopN);
  console.log("candidateK:", candidateK);

  for (const libId of libIds) {
    console.log("\n--- lib", libId, "---");
    const tLib = Date.now();
    const libDir = path.join(root, "libraries", libId);
    const st = loadStoreFromSqlite(libDir, defaultStore);
    console.log("loadStore ms:", Date.now() - tLib, "chunks:", (st.chunks || []).length);
    if (!(st.chunks || []).length) continue;

    const tLance = Date.now();
    const lanceRoot = path.join(root, "lancedb");
    const db = await withTimeout(lancedb.connect(lanceRoot), 60000, "lance connect");
    const tableName = tableNameForLibrary(libId);
    const names = await withTimeout(db.tableNames(), 30000, "tableNames");
    let table = names.includes(tableName) ? await withTimeout(db.openTable(tableName), 30000, "openTable") : null;
    if (!table) {
      console.log("creating table...");
      const rows = st.chunks
        .filter((c) => Array.isArray(c.embedding) && c.embedding.length)
        .map((c) => ({
          id: c.id,
          libraryId: String(libId),
          docId: c.docId,
          docName: c.docName,
          text: c.text,
          embedding: c.embedding,
        }));
      table = await withTimeout(
        db.createTable(tableName, rows, { mode: "create", existOk: true }),
        120000,
        "createTable"
      );
    }
    console.log("lance ready ms:", Date.now() - tLance);
    const tVs = Date.now();
    const rows = await withTimeout(table.vectorSearch(vec).limit(candidateK).toArray(), 60000, "vectorSearch");
    console.log("vectorSearch ms:", Date.now() - tVs, "hits:", rows.length);

    const tFts = Date.now();
    const ftsIndex = loadFtsIndex(libDir);
    let ftsHits = [];
    if (!ftsIndex.docCount) {
      const rebuilt = rebuildFtsIndex(st.chunks, st.documents);
      ftsHits = searchFtsIndex(rebuilt, q, 50);
    } else {
      ftsHits = searchFtsIndex(ftsIndex, q, 50);
    }
    console.log("fts ms:", Date.now() - tFts, "hits:", ftsHits.length);

    const tKw = Date.now();
    const kw = scanChunksByKeyword(st.chunks, q, { limit: 50 });
    const metaHits = scanMetadataHits(st.chunks, q, { limit: 30 });
    console.log("keyword ms:", Date.now() - tKw, "kw:", kw.length, "meta:", metaHits.length);

    const tMerge = Date.now();
    mergeAndFuseHits(
      rows.map((r) => ({
        score: vectorScoreFromDistance(r._distance, vec, r.embedding),
        docName: r.docName,
        docId: r.docId,
        chunkId: r.id,
        text: r.text,
        vectorScore: vectorScoreFromDistance(r._distance, vec, r.embedding),
      })),
      kw,
      q,
      true,
      0.6,
      { metadataHits: metaHits, ftsHits, queryType: classifyQuery(q), useRrf: true, metadataWeight: 0.12 }
    );
    console.log("merge ms:", Date.now() - tMerge);
    console.log("lib total ms:", Date.now() - tLib);
  }
  console.log("\nTOTAL ms:", Date.now() - t0);
}

main().catch((e) => {
  console.error("FAIL:", e.message || e);
  process.exit(1);
});
