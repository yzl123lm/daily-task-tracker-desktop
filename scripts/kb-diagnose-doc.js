#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const needle = process.argv[2] || "CTEC-01013";
let kbRoot = process.argv[3] || "";

if (!kbRoot) {
  const userData = path.join(process.env.APPDATA || "", "daily-task-tracker-desktop");
  const storagePath = path.join(userData, "kb-storage-settings.json");
  if (fs.existsSync(storagePath)) {
    try {
      const st = JSON.parse(fs.readFileSync(storagePath, "utf8"));
      kbRoot = String(st.resolvedKbRoot || st.customRoot || "").trim();
    } catch {
      kbRoot = "";
    }
  }
  if (!kbRoot) {
    kbRoot = path.join(userData, "knowledge-base");
  }
}

const defaultStore = () => ({
  version: 2,
  documents: [],
  chunks: [],
  settings: { chunkSize: 800, chunkOverlap: 120, embedModel: "bge-m3", searchMode: "auto" },
});

const { loadStoreFromSqlite } = require("../utils/kbSqliteStore.js");
const metaPath = path.join(kbRoot, "kb-meta.json");

if (!fs.existsSync(metaPath)) {
  console.error("kb-meta.json not found:", metaPath);
  process.exit(1);
}

const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
console.log("kbRoot:", kbRoot);
console.log("activeLibrary:", meta.activeLibraryId);
console.log("libraries:", (meta.libraries || []).map((x) => `${x.id} (${x.name})`).join(", "));
console.log("needle:", needle);
console.log("---");

for (const lib of meta.libraries || []) {
  const libDir = path.join(kbRoot, "libraries", lib.id);
  if (!fs.existsSync(path.join(libDir, "kb-store.sqlite"))) {
    console.log(`[${lib.name}] no sqlite`);
    continue;
  }
  const st = loadStoreFromSqlite(libDir, defaultStore);
  const docCount = (st.documents || []).length;
  const chunkCount = (st.chunks || []).length;
  console.log(`[${lib.name}] docs=${docCount} chunks=${chunkCount}`);

  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  (st.documents || [])
    .filter((d) => re.test(`${d.name || ""}${d.sourcePath || ""}${d.fileMd5 || ""}`))
    .forEach((d) => {
      const actual = (st.chunks || []).filter((c) => c.docId === d.id).length;
      console.log("  DOC:", {
        id: d.id,
        name: d.name,
        source_path: d.sourcePath,
        file_md5: String(d.fileMd5 || "").slice(0, 12),
        chunk_count: d.chunkCount,
        actual_chunks: actual,
      });
    });

  (st.chunks || [])
    .filter((c) => re.test(c.text || "") || re.test(c.docName || ""))
    .slice(0, 5)
    .forEach((c) => console.log("  CHUNK:", c.docName, (c.text || "").slice(0, 120)));
}
