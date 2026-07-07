const WB_TEST_RESULT_EVENT = "wb:test-result-change";
const STORAGE_KEY = "wb_test_results_v1";
const MAX_RUNS = 24;

function taskKey(projectId, taskId) {
  return `${projectId || ""}:${taskId || ""}`;
}

function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function recordRun(projectId, taskId, run) {
  const key = taskKey(projectId, taskId);
  const all = loadAll();
  const list = Array.isArray(all[key]) ? all[key] : [];
  const entry = {
    id: `tr_${Date.now()}`,
    command: run.command || "",
    success: Boolean(run.success),
    exitCode: run.exitCode ?? null,
    stdout: String(run.stdout || "").slice(0, 4000),
    stderr: String(run.stderr || "").slice(0, 2000),
    fixCount: Number(run.fixCount) || 0,
    createdAt: new Date().toISOString(),
  };
  list.unshift(entry);
  all[key] = list.slice(0, MAX_RUNS);
  saveAll(all);
  window.dispatchEvent(
    new CustomEvent(WB_TEST_RESULT_EVENT, { detail: { projectId, taskId } })
  );
  return entry;
}

function getRuns(projectId, taskId) {
  const all = loadAll();
  return Array.isArray(all[taskKey(projectId, taskId)]) ? all[taskKey(projectId, taskId)] : [];
}

function getStats(projectId, taskId) {
  const runs = getRuns(projectId, taskId);
  if (!runs.length) {
    return { total: 0, passed: 0, passRate: null, last: null };
  }
  const passed = runs.filter((r) => r.success).length;
  return {
    total: runs.length,
    passed,
    passRate: Math.round((passed / runs.length) * 100),
    last: runs[0],
  };
}

window.__wbTestResultStore = {
  WB_TEST_RESULT_EVENT,
  recordRun,
  getRuns,
  getStats,
};
