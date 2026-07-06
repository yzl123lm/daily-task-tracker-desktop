function wbApi() {
  return window.electronAPI || {};
}

const STATUS_LABELS = {
  normal: "上下文充足",
  warning: "上下文增长中",
  compress_recommended: "建议压缩",
  forced: "将强制压缩",
};

function statusClass(status) {
  if (status === "normal") {
    return "wb-ctx-health--normal";
  }
  if (status === "warning") {
    return "wb-ctx-health--warning";
  }
  if (status === "compress_recommended") {
    return "wb-ctx-health--warn";
  }
  return "wb-ctx-health--forced";
}

function renderHealthBadge(container, health) {
  if (!container || !health) {
    return;
  }
  const pct = Math.round((health.usedRatio || 0) * 100);
  const status = health.status || "normal";
  container.replaceChildren();
  const badge = document.createElement("div");
  badge.className = `wb-ctx-health ${statusClass(status)}`;
  badge.innerHTML = `
    <span class="wb-ctx-health__label">${STATUS_LABELS[status] || status}</span>
    <span class="wb-ctx-health__ratio">${pct}%</span>
  `;
  container.appendChild(badge);
}

async function fetchHealth(namespace, messages) {
  const api = wbApi();
  if (typeof api.wbContextHealth !== "function" || !namespace) {
    return null;
  }
  return api.wbContextHealth({ namespace, messages: messages || [] });
}

async function manualCompress(namespace, messages) {
  const api = wbApi();
  if (typeof api.wbContextCompress !== "function") {
    return null;
  }
  return api.wbContextCompress({
    namespace,
    messages: messages || [],
    reason: "manual",
    mode: "normal",
  });
}

async function listSnapshots(namespace) {
  const api = wbApi();
  if (typeof api.wbContextSnapshotsList !== "function") {
    return [];
  }
  return api.wbContextSnapshotsList({ namespace, limit: 10 });
}

function renderSnapshotHistory(container, snapshots) {
  if (!container) {
    return;
  }
  container.replaceChildren();
  if (!snapshots?.length) {
    container.textContent = "暂无压缩快照";
    return;
  }
  const list = document.createElement("ul");
  list.className = "wb-snapshot-history";
  snapshots.forEach((snap) => {
    const li = document.createElement("li");
    li.className = "wb-snapshot-history__item";
    li.textContent = `rev ${snap.revision} · ${snap.validationStatus} · ${snap.tokensBefore || 0}→${snap.tokensAfter || 0} tokens`;
    list.appendChild(li);
  });
  container.appendChild(list);
}

window.__wbContextHealth = {
  renderHealthBadge,
  fetchHealth,
  manualCompress,
  listSnapshots,
  renderSnapshotHistory,
  STATUS_LABELS,
};
