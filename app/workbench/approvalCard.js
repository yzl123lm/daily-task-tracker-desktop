function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function riskClass(level) {
  const l = String(level || "MEDIUM").toUpperCase();
  if (l === "HIGH") {
    return "wb-approval-card__risk--high";
  }
  if (l === "LOW") {
    return "wb-approval-card__risk--low";
  }
  return "wb-approval-card__risk--medium";
}

function ensureApprovalMount() {
  let mount = document.getElementById("wbPwsApprovalMount");
  if (mount) {
    return mount;
  }
  const anchor = document.getElementById("wbPwsAgentComposer") || document.querySelector(".wb-pws-agent-composer");
  if (!anchor?.parentNode) {
    return null;
  }
  mount = document.createElement("div");
  mount.id = "wbPwsApprovalMount";
  mount.className = "wb-pws-approval-mount";
  mount.parentNode.insertBefore(mount, anchor);
  return mount;
}

function renderApprovalCard(req) {
  const mount = ensureApprovalMount();
  if (!mount) {
    return;
  }
  if (!req) {
    mount.replaceChildren();
    mount.hidden = true;
    document.body.classList.remove("wb-waiting-approval");
    return;
  }
  mount.hidden = false;
  document.body.classList.add("wb-waiting-approval");
  const store = window.__wbApprovalStore;
  const riskLabel = store.RISK_LABELS[req.riskLevel] || req.riskLevel;
  const actionLabel = store.ACTION_LABELS[req.actionType] || req.title;
  const scopeItems = (req.scope || [])
    .map((s) => `<li class="wb-approval-card__scope-item">${escapeHtml(s)}</li>`)
    .join("");
  mount.innerHTML = `
    <article class="wb-approval-card" data-approval-id="${escapeHtml(req.id)}" role="alertdialog" aria-labelledby="wbApprovalTitle">
      <header class="wb-approval-card__head">
        <div>
          <span class="wb-approval-card__badge">等待审批</span>
          <h4 id="wbApprovalTitle" class="wb-approval-card__title">${escapeHtml(req.title || actionLabel)}</h4>
        </div>
        <span class="wb-approval-card__risk ${riskClass(req.riskLevel)}">${escapeHtml(riskLabel)}</span>
      </header>
      ${req.summary ? `<p class="wb-approval-card__summary">${escapeHtml(req.summary)}</p>` : ""}
      ${scopeItems ? `<ul class="wb-approval-card__scope">${scopeItems}</ul>` : ""}
      <p class="wb-approval-card__rollback">${escapeHtml(req.rollbackHint || "")}</p>
      <div class="wb-approval-card__actions">
        <button type="button" class="wb-pws-btn wb-pws-btn--ghost wb-approval-reject-btn">拒绝</button>
        <button type="button" class="wb-pws-btn wb-pws-btn--primary wb-approval-approve-btn">批准执行</button>
      </div>
    </article>
  `;
  mount.querySelector(".wb-approval-approve-btn")?.addEventListener("click", () => {
    store.approve(req.id);
  });
  mount.querySelector(".wb-approval-reject-btn")?.addEventListener("click", () => {
    const reason = window.prompt("拒绝原因（可选）", "") || "";
    store.reject(req.id, reason);
  });
}

function syncApprovalCard() {
  const req = window.__wbApprovalStore?.getPending?.();
  renderApprovalCard(req);
}

function bindApprovalCard() {
  ensureApprovalMount();
  const eventName = window.__wbApprovalStore?.WB_APPROVAL_EVENT || "wb:approval-change";
  window.addEventListener(eventName, syncApprovalCard);
  syncApprovalCard();
}

window.__wbBindApprovalCard = bindApprovalCard;
window.__wbSyncApprovalCard = syncApprovalCard;
