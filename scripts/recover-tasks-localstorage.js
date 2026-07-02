/**
 * Attempt to recover daily_task_tracker_v1 from Chromium Local Storage leveldb logs.
 * Usage: node scripts/recover-tasks-localstorage.js
 */
const fs = require("fs");
const path = require("path");

const userData = process.env.APPDATA
  ? path.join(process.env.APPDATA, "daily-task-tracker-desktop")
  : "";
const leveldb = path.join(userData, "Local Storage", "leveldb");
const outFile = path.join(userData, "tasks-v1.json");

function extractJsonArrays(text) {
  const hits = [];
  const re = /\[\s*\{[\s\S]*?"taskId"[\s\S]*?\}\s*(?:,\s*\{[\s\S]*?\}\s*)*\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed) && parsed.length) {
        hits.push(parsed);
      }
    } catch {
      /* skip */
    }
  }
  return hits;
}

function readAsUtf16(buf) {
  if (buf.length < 4) {
    return "";
  }
  try {
    return buf.toString("utf16le");
  } catch {
    return "";
  }
}

function main() {
  if (!fs.existsSync(leveldb)) {
    console.error("Leveldb not found:", leveldb);
    process.exit(1);
  }
  let best = [];
  for (const name of fs.readdirSync(leveldb)) {
    if (!/\.(log|ldb)$/i.test(name)) {
      continue;
    }
    const fp = path.join(leveldb, name);
    const buf = fs.readFileSync(fp);
    const utf8 = buf.toString("utf8");
    const utf16 = readAsUtf16(buf);
    for (const text of [utf8, utf16]) {
      for (const arr of extractJsonArrays(text)) {
        if (arr.length > best.length) {
          best = arr;
        }
      }
    }
  }
  if (!best.length) {
    console.log("No recoverable task arrays found in leveldb.");
    process.exit(2);
  }
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    recoveredFrom: "localstorage-leveldb",
    tasks: best,
  };
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Recovered ${best.length} tasks -> ${outFile}`);
}

main();
