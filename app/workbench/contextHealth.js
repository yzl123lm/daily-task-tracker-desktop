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

async function restoreSnapshot(namespace, snapshotId) {
  const api = wbApi();
  if (typeof api.wbContextSnapshotRestore !== "function" || !snapshotId) {
    return null;
  }
  const ok = window.confirm(`确认恢复压缩快照 rev 关联记录？\n快照 ID: ${snapshotId}`);
  if (!ok) {
    return null;
  }
  return api.wbContextSnapshotRestore({ namespace, snapshotId });
}

function renderSnapshotHistory(container, snapshots, namespace) {
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
    const ratio =
      snap.tokensBefore > 0
        ? `${Math.round((snap.tokensAfter / snap.tokensBefore) * 100)}%`
        : "—";
    li.innerHTML = `
      <span class="wb-snapshot-history__rev">rev ${snap.revision}</span>
      <span class="wb-snapshot-history__meta">${snap.validationStatus} · ${snap.riskLevel || "LOW"}</span>
      <span class="wb-snapshot-history__tokens">${snap.tokensBefore || 0} → ${snap.tokensAfter || 0} tokens (${ratio})</span>
    `;
    if (namespace && snap.id) {
      const restoreBtn = document.createElement("button");
      restoreBtn.type = "button";
      restoreBtn.className = "wb-pws-btn wb-pws-btn--ghost wb-snapshot-restore-btn";
      restoreBtn.textContent = "恢复";
      restoreBtn.addEventListener("click", () => {
        void (async () => {
          try {
            await restoreSnapshot(namespace, snap.id);
            alert("快照已恢复为最新版本");
            const projectId = namespace.split(":")[1];
            const taskId = namespace.split(":")[2];
            if (projectId && taskId) {
              await window.__wbLoadTaskContext?.(projectId, taskId);
            }
          } catch (err) {
            alert(err?.message || "恢复快照失败");
          }
        })();
      });
      li.appendChild(restoreBtn);
    }
    list.appendChild(li);
  });
  container.appendChild(list);
}

window.__wbContextHealth = {
  renderHealthBadge,
  fetchHealth,
  manualCompress,
  listSnapshots,
  restoreSnapshot,
  renderSnapshotHistory,
  STATUS_LABELS,
};
