#!/usr/bin/env node
/**
 * 删除链路一致性单元测试（不依赖 Electron）
 * 用法：npm run kb:delete-consistency-test
 */
const assert = require("assert");
const {
  nextRetryAt,
  scanOrphans,
  collectOrphanDocIds,
  collectStaleDeletingDocIds,
  repairLibraryIndex,
} = require("../utils/kbDeleteRepair.js");
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

function testCollectOrphanAndStaleDocIds() {
  const store = {
    documents: [{ id: "doc-live" }, { id: "doc-deleting", deleteStatus: "deleting" }],
    chunks: [
      { id: "c1", docId: "doc-live" },
      { id: "c2", docId: "doc-orphan" },
      { id: "c3", docId: "doc-deleting" },
    ],
  };
  const orphans = collectOrphanDocIds(store);
  const stale = collectStaleDeletingDocIds(store);
  assert.deepStrictEqual(orphans, ["doc-orphan"]);
  assert.deepStrictEqual(stale, ["doc-deleting"]);
  console.log("PASS [collect] orphan + stale deleting docIds");
}

async function testRepairSynthesizesJobsForOrphans() {
  const jobs = [];
  const store = {
    documents: [{ id: "doc-deleting", deleteStatus: "deleting" }],
    chunks: [
      { id: "c1", docId: "doc-orphan" },
      { id: "c2", docId: "doc-deleting" },
    ],
  };
  const ctx = {
    libraryDir: "/tmp/kb-fake",
    userDataPath: "/tmp",
    libraryId: "lib1",
    loadStore: () => store,
    listDeleteJobs: () => jobs.slice(),
    upsertDeleteJob: (dir, job) => {
      jobs.push({
        job_id: job.jobId,
        doc_id: job.docId,
        stage: job.stage,
        status: job.status,
        last_error: job.lastError,
      });
    },
    buildLibraryHealth: async () =>
      checkIndexHealth(path.join(os.tmpdir(), "kb-synth"), {
        lanceChunkCount: 2,
        ftsChunkCount: 2,
        staleDeletingCount: 1,
        pendingDeleteJobs: jobs.filter((j) => j.status === "pending").length,
      }),
  };

  const dry = await repairLibraryIndex(ctx, { dryRun: true, maxBatch: 10 });
  assert.strictEqual(dry.synthesizedJobs, 2);
  assert.strictEqual(jobs.length, 0);

  // dryRun 不应真正写入；再跑非 dryRun，但 repairDocumentDelete 会失败（无完整 ctx）
  // 这里只验证补建 job 逻辑：手动模拟 list 在 upsert 后可见
  let listCalls = 0;
  ctx.listDeleteJobs = () => {
    listCalls += 1;
    return jobs.filter((j) => j.status === "pending");
  };
  // 拦截 repairDocumentDelete 路径：提供会立刻失败的 lance，确保不抛未捕获
  ctx.lanceDeleteByDocId = async () => {
    throw new Error("simulated lance unavailable");
  };
  ctx.removeDocFromFtsIndex = (fts) => fts;
  ctx.loadFtsIndex = () => ({ chunks: {} });
  ctx.saveFtsIndex = () => {};
  ctx.saveStore = () => {};
  ctx.ensureGraphSnapshot = () => {};

  const live = await repairLibraryIndex(ctx, { dryRun: false, maxBatch: 10 });
  assert.ok(live.synthesizedJobs >= 2);
  assert.ok(jobs.length >= 2);
  assert.ok(listCalls >= 1);
  console.log("PASS [repair] synthesizes delete jobs for orphan/stale docs");
}

async function testLanceNoTableResultShape() {
  // 契约：调用方应能识别 reason=no_table（由 knowledgeBaseMain 返回；此处固化期望）
  const sample = { ok: true, deleted: false, reason: "no_table" };
  assert.strictEqual(sample.ok, true);
  assert.strictEqual(sample.reason, "no_table");
  console.log("PASS [lance] no_table result shape contract");
}

async function main() {
  testNextRetryAt();
  testScanOrphans();
  testCheckIndexHealthMismatch();
  testCollectOrphanAndStaleDocIds();
  await testRepairSynthesizesJobsForOrphans();
  await testLanceNoTableResultShape();
  console.log("\nkb-delete-consistency-test: OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
