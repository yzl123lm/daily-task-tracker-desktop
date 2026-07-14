#!/usr/bin/env node
/**
 * 原文件归档 helper 测试
 * 用法：npm run kb:archive-test
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const {
  archiveSourceFile,
  resolveReadableDocumentPath,
  shouldArchiveOnIngest,
  normalizeArchivePolicy,
} = require("../utils/kbArchive.js");
const { normalizeKbSettings } = require("../utils/kbConfigLayout.js");

function md5File(fp) {
  return crypto.createHash("md5").update(fs.readFileSync(fp)).digest("hex");
}

function main() {
  const libDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-archive-"));
  const src = path.join(libDir, "source.txt");
  fs.writeFileSync(src, "hello archive test", "utf8");
  const md5 = md5File(src);
  const docId = "doc-1";

  const r1 = archiveSourceFile(libDir, docId, src, md5, []);
  assert.strictEqual(r1.ok, true);
  assert.ok(fs.existsSync(r1.archivedPath));

  const r2 = archiveSourceFile(libDir, "doc-2", src, md5, [
    { id: docId, archivedPath: r1.archivedPath, archiveMd5: md5 },
  ]);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(r2.archivedPath, r1.archivedPath);
  assert.strictEqual(r2.archiveStatus, "dedup");

  const moved = path.join(libDir, "moved.txt");
  fs.renameSync(src, moved);
  const readable = resolveReadableDocumentPath({ sourcePath: src, archivedPath: r1.archivedPath });
  assert.strictEqual(readable.kind, "archive");
  assert.ok(fs.existsSync(readable.path));

  assert.strictEqual(normalizeArchivePolicy("invalid"), "ask");
  assert.strictEqual(shouldArchiveOnIngest("never"), false);
  assert.strictEqual(shouldArchiveOnIngest("ask", { fromWatch: true }), false);
  assert.strictEqual(shouldArchiveOnIngest("ask", {}), false);
  assert.strictEqual(shouldArchiveOnIngest("ask", { archiveConfirmed: true }), true);
  assert.strictEqual(shouldArchiveOnIngest("always"), true);
  assert.strictEqual(shouldArchiveOnIngest("watch-ref-only", { fromWatch: true }), false);
  assert.strictEqual(shouldArchiveOnIngest("watch-ref-only", {}), true);

  const persisted = normalizeKbSettings({ archivePolicy: "never", chunkSize: 800 });
  assert.strictEqual(persisted.archivePolicy, "never");
  const defaultAsk = normalizeKbSettings({});
  assert.strictEqual(defaultAsk.archivePolicy, "ask");

  console.log("kb-archive-test: OK");
}

main();
