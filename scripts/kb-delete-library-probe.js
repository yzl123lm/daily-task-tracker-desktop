/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
process.chdir(projectRoot);

const userData =
  process.env.KB_PROBE_USER_DATA ||
  path.join(process.env.APPDATA || "", "daily-task-tracker-desktop");

const {
  closeLibraryDb,
  closeAllLibraryDbs,
  openLibraryDb,
} = require("../utils/kbSqliteStore.js");

function readKbStorageSettings(userDataPath) {
  const p = path.join(userDataPath, "kb-storage-settings.json");
  if (!fs.existsSync(p)) {
    return { customRoot: "" };
  }
  try {
    return { customRoot: String(JSON.parse(fs.readFileSync(p, "utf8")).customRoot || "").trim() };
  } catch {
    return { customRoot: "" };
  }
}

function kbRoot(userDataPath) {
  const raw = readKbStorageSettings(userDataPath).customRoot;
  if (!raw) {
    return path.join(userDataPath, "knowledge-base");
  }
  const modern = path.join(raw, "鲸落AI-知识库");
  const modernHas = fs.existsSync(path.join(modern, "kb-meta.json"));
  const directHas = fs.existsSync(path.join(raw, "kb-meta.json"));
  if (modernHas || !directHas) {
    return modern;
  }
  return raw;
}

function readKbMeta(userDataPath) {
  const p = path.join(kbRoot(userDataPath), "kb-meta.json");
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function saveKbMeta(userDataPath, meta) {
  fs.writeFileSync(path.join(kbRoot(userDataPath), "kb-meta.json"), JSON.stringify(meta), "utf8");
}

function libraryDir(userDataPath, libraryId) {
  return path.join(kbRoot(userDataPath), "libraries", libraryId);
}

const targetId = process.argv[2] || "yy012";
const dryRun = process.argv.includes("--dry-run");

const root = kbRoot(userData);
const meta = readKbMeta(userData);
const idx = meta.libraries.findIndex((x) => x.id === targetId);
if (idx < 0) {
  console.error("library not found in meta:", targetId);
  process.exit(1);
}
if (meta.libraries.length <= 1) {
  console.error("cannot delete last library");
  process.exit(1);
}

const libDir = libraryDir(userData, targetId);
console.log("kbRoot:", root);
console.log("target:", targetId, "dir:", libDir);

openLibraryDb(libDir);
try {
  fs.rmSync(libDir, { recursive: true, force: true });
  console.log("rm without close: unexpectedly succeeded");
} catch (err) {
  console.log("rm without close:", err.code || err.message);
}

closeLibraryDb(libDir);
closeAllLibraryDbs();
try {
  if (fs.existsSync(libDir)) {
    fs.rmSync(libDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 120 });
  }
  console.log("rm after close: ok");
} catch (err) {
  console.log("rm after close failed:", err.code || err.message);
}

if (dryRun) {
  console.log("dry-run: meta not changed");
  process.exit(0);
}

meta.libraries.splice(idx, 1);
if (meta.activeLibraryId === targetId) {
  meta.activeLibraryId = meta.libraries[0]?.id || "default";
}
saveKbMeta(userData, meta);
console.log("meta saved:", JSON.stringify(readKbMeta(userData), null, 2));
