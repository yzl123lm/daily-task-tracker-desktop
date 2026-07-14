const crypto = require("crypto");

function nextRetryAt(attempts) {
  const delayMs = Math.min(3600000, 5000 * 2 ** Math.max(0, Number(attempts) || 0));
  return new Date(Date.now() + delayMs).toISOString();
}

function scanOrphans(health) {
  const issues = Array.isArray(health?.issues) ? health.issues : [];
  return issues.filter((x) =>
    ["lance_chunk_mismatch", "fts_chunk_mismatch", "orphan_chunks", "stale_deleting", "pending_delete_jobs"].includes(
      x.code
    )
  );
}

function collectOrphanDocIds(store) {
  const docs = new Set((store?.documents || []).map((d) => String(d.id || "")).filter(Boolean));
  const orphanDocIds = new Set();
  for (const c of store?.chunks || []) {
    const docId = String(c?.docId || "");
    if (docId && !docs.has(docId)) {
      orphanDocIds.add(docId);
    }
  }
  return [...orphanDocIds];
}

function collectStaleDeletingDocIds(store) {
  return (store?.documents || [])
    .filter((d) => String(d?.deleteStatus || "") === "deleting")
    .map((d) => String(d.id || ""))
    .filter(Boolean);
}

async function repairDocumentDelete(ctx, jobRow) {
  const {
    userDataPath,
    libraryId,
    libraryDir,
    loadStore,
    saveStore,
    lanceDeleteByDocId,
    removeDocFromFtsIndex,
    loadFtsIndex,
    saveFtsIndex,
    upsertDeleteJob,
    ensureGraphSnapshot,
  } = ctx;
  const docId = String(jobRow.doc_id || jobRow.docId || "");
  const jobId = String(jobRow.job_id || jobRow.jobId || "");
  const stage = String(jobRow.stage || "lance");
  const attempts = Number(jobRow.attempts || 0) + 1;
  const stages = [];
  const deletedCounts = { sqlite: 0, lance: 0, fts: 0 };

  if (!docId || !libraryId) {
    return { ok: false, error: "缺少 docId 或 libraryId" };
  }

  const st = loadStore(userDataPath, libraryId);
  const doc = (st.documents || []).find((d) => String(d.id) === docId);
  const chunkCount = (st.chunks || []).filter((c) => String(c.docId) === docId).length;

  if (stage === "lance" || stage === "fts" || stage === "sqlite") {
    try {
      const lanceResult = await lanceDeleteByDocId(userDataPath, libraryId, docId);
      if (lanceResult?.ok === false) {
        throw new Error(lanceResult.reason || "lance_delete_failed");
      }
      deletedCounts.lance = chunkCount;
      stages.push({
        stage: "lance",
        ok: true,
        deleted: lanceResult?.deleted === true,
        reason: lanceResult?.reason || "",
      });
    } catch (err) {
      upsertDeleteJob(libraryDir, {
        jobId: jobId || crypto.randomUUID(),
        docId,
        libraryId,
        stage: "lance",
        status: "pending",
        attempts,
        maxAttempts: Number(jobRow.max_attempts || 5),
        nextRetryAt: nextRetryAt(attempts),
        lastError: err?.message || String(err),
      });
      return { ok: false, status: "partial", failedStage: "lance", lastError: err?.message || String(err), stages };
    }
  }

  try {
    const fts = removeDocFromFtsIndex(loadFtsIndex(libraryDir), docId);
    saveFtsIndex(libraryDir, fts);
    deletedCounts.fts = chunkCount;
    stages.push({ stage: "fts", ok: true });
  } catch (err) {
    upsertDeleteJob(libraryDir, {
      jobId: jobId || crypto.randomUUID(),
      docId,
      libraryId,
      stage: "fts",
      status: "pending",
      attempts,
      maxAttempts: Number(jobRow.max_attempts || 5),
      nextRetryAt: nextRetryAt(attempts),
      lastError: err?.message || String(err),
    });
    return { ok: false, status: "partial", failedStage: "fts", lastError: err?.message || String(err), stages };
  }

  const before = (st.chunks || []).length;
  st.documents = (st.documents || []).filter((d) => String(d.id) !== docId);
  st.chunks = (st.chunks || []).filter((c) => String(c.docId) !== docId);
  deletedCounts.sqlite = before - st.chunks.length;
  ensureGraphSnapshot(st, true);
  saveStore(userDataPath, libraryId, st);
  stages.push({ stage: "sqlite", ok: true });

  upsertDeleteJob(libraryDir, {
    jobId: jobId || crypto.randomUUID(),
    docId,
    libraryId,
    stage: "done",
    status: "completed",
    attempts,
    maxAttempts: Number(jobRow.max_attempts || 5),
    nextRetryAt: "",
    lastError: "",
  });

  return { ok: true, status: "deleted", deletedCounts, stages, docExisted: Boolean(doc) };
}

async function repairLibraryIndex(ctx, options = {}) {
  const dryRun = options.dryRun === true;
  const maxBatch = Math.max(1, Math.min(50, Number(options.maxBatch) || 10));
  const focusDocId = String(options.docId || "").trim();
  const {
    libraryDir,
    listDeleteJobs,
    buildLibraryHealth,
    loadStore,
    userDataPath,
    libraryId,
    upsertDeleteJob,
  } = ctx;
  const health = await buildLibraryHealth();
  const orphanIssues = scanOrphans(health);
  const pendingJobs = listDeleteJobs(libraryDir, { status: "pending", limit: maxBatch * 2 });
  const store = typeof loadStore === "function" ? loadStore(userDataPath, libraryId) : null;
  const orphanDocIds = store ? collectOrphanDocIds(store) : [];
  const staleDocIds = store ? collectStaleDeletingDocIds(store) : [];
  const pendingDocIds = new Set(pendingJobs.map((j) => String(j.doc_id || "")));

  // 为孤儿分片 / 卡在 deleting 的文档补建删除补偿任务
  const synthesized = [];
  for (const docId of [...new Set([...orphanDocIds, ...staleDocIds])]) {
    if (focusDocId && docId !== focusDocId) continue;
    if (pendingDocIds.has(docId)) continue;
    synthesized.push(docId);
    if (!dryRun && typeof upsertDeleteJob === "function") {
      upsertDeleteJob(libraryDir, {
        jobId: crypto.randomUUID(),
        docId,
        libraryId: String(libraryId),
        stage: "lance",
        status: "pending",
        attempts: 0,
        lastError: orphanDocIds.includes(docId) ? "orphan_chunks" : "stale_deleting",
        nextRetryAt: nextRetryAt(0),
      });
      pendingDocIds.add(docId);
    }
  }

  const jobs = listDeleteJobs(libraryDir, { status: "pending", limit: maxBatch * 2 }).filter((j) =>
    focusDocId ? String(j.doc_id) === focusDocId : true
  );
  const results = {
    dryRun,
    repaired: [],
    skipped: [],
    health,
    orphanIssues,
    synthesizedJobs: synthesized.length,
    pendingJobs: jobs.length,
  };

  if (dryRun) {
    return results;
  }

  for (const job of jobs.slice(0, maxBatch)) {
    const r = await repairDocumentDelete(ctx, job);
    if (r.ok) {
      results.repaired.push({ docId: job.doc_id, ...r });
    } else {
      results.skipped.push({ docId: job.doc_id, ...r });
    }
  }

  // Lance/FTS 计数仍不一致且无待处理 doc 时：对「已删除文档」再扫一轮 Lance 孤儿（按 pending/completed 失败过的 doc 已覆盖）
  // 若仅有计数 mismatch 而无明确 docId，记录到结果供 UI 提示，避免误删全库
  results.healthAfter = await buildLibraryHealth();
  const stillMismatched = scanOrphans(results.healthAfter).some((x) =>
    ["lance_chunk_mismatch", "fts_chunk_mismatch"].includes(x.code)
  );
  if (stillMismatched && !results.repaired.length && !jobs.length && !synthesized.length) {
    results.note = "仍存在索引计数不一致，但未定位到可自动修复的文档；请对具体文档强制删除或重建索引。";
  }
  return results;
}

module.exports = {
  nextRetryAt,
  scanOrphans,
  collectOrphanDocIds,
  collectStaleDeletingDocIds,
  repairDocumentDelete,
  repairLibraryIndex,
};
