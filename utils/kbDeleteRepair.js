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
      await lanceDeleteByDocId(userDataPath, libraryId, docId);
      deletedCounts.lance = chunkCount;
      stages.push({ stage: "lance", ok: true });
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
  const { libraryDir, listDeleteJobs, buildLibraryHealth } = ctx;
  const health = await buildLibraryHealth();
  const orphanIssues = scanOrphans(health);
  const jobs = listDeleteJobs(libraryDir, { status: "pending", limit: maxBatch });
  const results = { dryRun, repaired: [], skipped: [], health, orphanIssues };

  if (dryRun) {
    results.pendingJobs = jobs.length;
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
  results.healthAfter = await buildLibraryHealth();
  return results;
}

module.exports = {
  nextRetryAt,
  scanOrphans,
  repairDocumentDelete,
  repairLibraryIndex,
};
