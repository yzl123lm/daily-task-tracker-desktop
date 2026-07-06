function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let confirmResolve = null;

function closeWbConfirm(result) {
  const modal = document.getElementById("wbConfirmModal");
  if (modal) {
    modal.hidden = true;
  }
  const resolve = confirmResolve;
  confirmResolve = null;
  if (typeof resolve === "function") {
    resolve(Boolean(result));
  }
}

function ensureConfirmModal() {
  let modal = document.getElementById("wbConfirmModal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "wbConfirmModal";
  modal.className = "wb-modal wb-confirm-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-confirm-close="1"></div>
    <div class="wb-modal__panel wb-confirm-modal__panel" role="alertdialog" aria-modal="true" aria-labelledby="wbConfirmTitle" aria-describedby="wbConfirmDetail">
      <header class="wb-modal__head">
        <h2 id="wbConfirmTitle">确认操作</h2>
        <button type="button" class="wb-modal__close" data-wb-confirm-close="1" aria-label="关闭">×</button>
      </header>
      <div class="wb-confirm-modal__body">
        <p id="wbConfirmMessage" class="wb-confirm-modal__message"></p>
        <p id="wbConfirmDetail" class="wb-confirm-modal__detail"></p>
      </div>
      <footer class="wb-modal__foot wb-confirm-modal__foot">
        <button type="button" class="secondary" id="wbConfirmCancelBtn" data-wb-confirm-close="1">取消</button>
        <button type="button" class="primary" id="wbConfirmOkBtn">确定</button>
      </footer>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (ev) => {
    if (ev.target?.dataset?.wbConfirmClose === "1") {
      closeWbConfirm(false);
    }
  });
  document.getElementById("wbConfirmOkBtn")?.addEventListener("click", () => {
    closeWbConfirm(true);
  });
  document.addEventListener("keydown", (ev) => {
    const m = document.getElementById("wbConfirmModal");
    if (!m || m.hidden) {
      return;
    }
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeWbConfirm(false);
    }
  });
  return modal;
}

function showWbConfirm({
  title = "确认操作",
  message = "",
  detail = "",
  confirmLabel = "确定",
  cancelLabel = "取消",
  danger = false,
} = {}) {
  return new Promise((resolve) => {
    if (confirmResolve) {
      closeWbConfirm(false);
    }
    const modal = ensureConfirmModal();
    confirmResolve = resolve;
    const titleEl = document.getElementById("wbConfirmTitle");
    const messageEl = document.getElementById("wbConfirmMessage");
    const detailEl = document.getElementById("wbConfirmDetail");
    const okBtn = document.getElementById("wbConfirmOkBtn");
    const cancelBtn = document.getElementById("wbConfirmCancelBtn");
    if (titleEl) {
      titleEl.textContent = title;
    }
    if (messageEl) {
      messageEl.textContent = message;
      messageEl.hidden = !message;
    }
    if (detailEl) {
      detailEl.textContent = detail;
      detailEl.hidden = !detail;
    }
    if (okBtn) {
      okBtn.textContent = confirmLabel;
      okBtn.className = danger ? "danger" : "primary";
    }
    if (cancelBtn) {
      cancelBtn.textContent = cancelLabel;
    }
    modal.hidden = false;
    window.setTimeout(() => okBtn?.focus(), 0);
  });
}

window.__wbConfirm = showWbConfirm;
