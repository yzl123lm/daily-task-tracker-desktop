/**
 * REQ-011: Detect merge conflicts between parallel branch patch sets.
 */
function parseHunkRanges(unifiedDiff) {
  const ranges = [];
  const lines = String(unifiedDiff || "").split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
    if (!m) continue;
    const oldStart = Number(m[1]);
    const oldCount = m[2] != null ? Number(m[2]) : 1;
    const newStart = Number(m[3]);
    const newCount = m[4] != null ? Number(m[4]) : 1;
    ranges.push({
      oldStart,
      oldEnd: oldStart + Math.max(oldCount, 1) - 1,
      newStart,
      newEnd: newStart + Math.max(newCount, 1) - 1,
    });
  }
  return ranges;
}

function rangesOverlap(a, b) {
  const oldOverlap = a.oldStart <= b.oldEnd && b.oldStart <= a.oldEnd;
  const newOverlap = a.newStart <= b.newEnd && b.newStart <= a.newEnd;
  return oldOverlap || newOverlap;
}

function normalizePath(p) {
  return String(p || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .trim();
}

/**
 * @param {Array<{ branchId: string, patches: Array<{ id?, filePath, unifiedDiff }> }>} branches
 */
function detectPatchMergeConflicts(branches) {
  const byPath = new Map();
  for (const branch of branches || []) {
    const bid = String(branch.branchId || branch.id || "branch");
    for (const patch of branch.patches || []) {
      const filePath = normalizePath(patch.filePath || patch.path);
      if (!filePath) continue;
      if (!byPath.has(filePath)) byPath.set(filePath, []);
      byPath.get(filePath).push({
        branchId: bid,
        patchId: patch.id || null,
        ranges: parseHunkRanges(patch.unifiedDiff),
        summary: patch.summary || "",
      });
    }
  }

  const conflicts = [];
  const clean = [];
  for (const [filePath, entries] of byPath.entries()) {
    if (entries.length < 2) {
      clean.push({ filePath, branches: entries.map((e) => e.branchId) });
      continue;
    }
    const pairs = [];
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        const a = entries[i];
        const b = entries[j];
        // Same file from two branches: conflict if any hunk overlaps OR either has empty ranges (whole-file)
        let overlap = !a.ranges.length || !b.ranges.length;
        if (!overlap) {
          for (const ra of a.ranges) {
            for (const rb of b.ranges) {
              if (rangesOverlap(ra, rb)) {
                overlap = true;
                break;
              }
            }
            if (overlap) break;
          }
        }
        if (overlap) {
          pairs.push({
            branches: [a.branchId, b.branchId],
            patchIds: [a.patchId, b.patchId],
            hunks: { a: a.ranges, b: b.ranges },
          });
        }
      }
    }
    if (pairs.length) {
      conflicts.push({
        path: filePath,
        severity: "high",
        pairs,
        branchIds: [...new Set(entries.map((e) => e.branchId))],
      });
    } else {
      clean.push({ filePath, branches: entries.map((e) => e.branchId) });
    }
  }

  return {
    ok: conflicts.length === 0,
    conflictCount: conflicts.length,
    conflicts,
    cleanFiles: clean,
    fileCount: byPath.size,
  };
}

/**
 * Merge non-conflicting patches: prefer later branch order for same non-overlapping file.
 * When conflicts exist, returns conflict report and does not produce merged list unless force.
 */
function planMergedPatches(branches, { forcePreferBranchId = null } = {}) {
  const report = detectPatchMergeConflicts(branches);
  const merged = [];
  const skippedConflictPaths = new Set((report.conflicts || []).map((c) => c.path));

  for (const branch of branches || []) {
    for (const patch of branch.patches || []) {
      const filePath = normalizePath(patch.filePath || patch.path);
      if (skippedConflictPaths.has(filePath) && !forcePreferBranchId) {
        continue;
      }
      if (skippedConflictPaths.has(filePath) && forcePreferBranchId) {
        if (String(branch.branchId || branch.id) !== String(forcePreferBranchId)) continue;
      }
      // last write wins for same path among clean files
      const idx = merged.findIndex((p) => normalizePath(p.filePath) === filePath);
      const entry = {
        ...patch,
        filePath,
        fromBranch: branch.branchId || branch.id,
      };
      if (idx >= 0) merged[idx] = entry;
      else merged.push(entry);
    }
  }

  return {
    ...report,
    mergedPatches: merged,
    mergeStatus: report.ok ? "CLEAN" : forcePreferBranchId ? "FORCED" : "MERGE_CONFLICT",
  };
}

module.exports = {
  parseHunkRanges,
  rangesOverlap,
  detectPatchMergeConflicts,
  planMergedPatches,
  normalizePath,
};
