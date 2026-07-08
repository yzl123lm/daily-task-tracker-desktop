#!/usr/bin/env node
/**
 * 删除链路一致性单元测试（不依赖 Electron）
 * 用法：npm run kb:delete-consistency-test
 */
const assert = require("assert");
const { nextRetryAt, scanOrphans } = require("../utils/kbDeleteRepair.js");
const { checkIndexHealth } = require("../utils/kbSqliteStore.js");
const os = require("os");
const path = require("path");
const fs = require("fs");

function testNextRetryAt() {
  const t = nextRetryAt(0);
  assert.ok(Date.parse(t) > Date.now());
  console.log("PASS [retry] nextRetryAt increases with attempts");
}

function testScanOrphans() {
  const health = checkIndexHealth(path.join(os.tmpdir(), "kb-missing-lib"), {
    lanceChunkCount: 5,
    ftsChunkCount: 3,
    staleDeletingCount: 1,
    pendingDeleteJobs: 2,
  });
  const orphans = scanOrphans(health);
  assert.ok(orphans.length >= 2);
  console.log(`PASS [orphans] detected ${orphans.length} issue(s)`);
}

function testCheckIndexHealthMismatch() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kb-health-"));
  const health = checkIndexHealth(tmp, { lanceChunkCount: 10, ftsChunkCount: 8 });
  assert.strictEqual(health.healthy, false);
  console.log("PASS [health] lance/sqlite mismatch flagged");
}

function main() {
  testNextRetryAt();
  testScanOrphans();
  testCheckIndexHealthMismatch();
  console.log("\nkb-delete-consistency-test: OK");
}

main();
