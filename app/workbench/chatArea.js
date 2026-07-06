function wbApi() {
  return window.electronAPI || {};
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ensureEditChatModal() {
  let modal = document.getElementById("wbEditChatModal");
  if (modal) {
    return modal;
  }
  modal = document.createElement("div");
  modal.id = "wbEditChatModal";
  modal.className = "wb-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="wb-modal__backdrop" data-wb-close="1"></div>
    <div class="wb-modal__panel" role="dialog" aria-labelledby="wbEditChatTitle">
      <header class="wb-modal__head">
        <h2 id="wbEditChatTitle">重命名会话</h2>
        <button type="button" class="wb-modal__close" data-wb-close="1" aria-label="关闭">×</button>
      </header>
      <form id="wbEditChatForm" class="wb-modal__body">
        <input type="hidden" id="wbEditChatId" value="" />
        <label class="wb-field">
          <span>会话标题</span>
          <input id="wbEditChatTitleInput" type="text" maxlength="120" required placeholder="例如：React 学习笔记" />
        </label>
        <p id="wbEditChatError" class="wb-form-error" hidden></p>
        <footer class="wb-modal__foot">
          <button type="button" class="secondary" data-wb-close="1">取消</button>
          <button type="submit" class="primary">保存</button>
        </footer>
      </form>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (ev) => {
    if (ev.target?.dataset?.wbClose === "1") {
      modal.hidden = true;
    }
  });
  return modal;
}

function openEditChatModal(chat) {
  const modal = ensureEditChatModal();
  const err = document.getElementById("wbEditChatError");
  if (err) {
    err.hidden = true;
    err.textContent = "";
  }
  document.getElementById("wbEditChatId").value = chat.id;
  document.getElementById("wbEditChatTitleInput").value = chat.title || "";
  modal.hidden = false;
  document.getElementById("wbEditChatTitleInput")?.focus();
}

async function submitEditChat(ev) {
  ev.preventDefault();
  const api = wbApi();
  const chatId = document.getElementById("wbEditChatId")?.value?.trim();
  const title = document.getElementById("wbEditChatTitleInput")?.value?.trim();
  const errEl = document.getElementById("wbEditChatError");
  if (!chatId || !title) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = "请填写会话标题";
    }
    return;
  }
  try {
    await api.wbChatUpdate({ chatId, title });
    document.getElementById("wbEditChatModal").hidden = true;
    await window.__wbRefreshChats?.();
  } catch (err) {
    if (errEl) {
      errEl.hidden = false;
      errEl.textContent = err?.message || "保存失败";
    }
  }
}

async function afterChatRemoved(chatId) {
  const wasSelected = window.__wbStore?.getState?.().selectedChatId === chatId;
  await window.__wbRefreshChats?.();
  if (!wasSelected) {
    return;
  }
  const chats = window.__wbStore?.getState?.().chats || [];
  if (chats[0]?.id) {
    await window.__wbSwitchChat?.(chats[0].id);
  } else {
    window.__wbStore?.clearSelection?.();
    const aiMain = document.getElementById("aiPanelMain");
    if (aiMain) {
      aiMain.hidden = false;
    }
    if (typeof window.__aiClearChatLog === "function") {
      window.__aiClearChatLog();
    }
  }
}

async function archiveChat(chat) {
  const api = wbApi();
  if (!chat?.id || typeof api.wbChatArchive !== "function") {
    return;
  }
  const ok = window.confirm(`归档会话「${chat.title}」？\n\n归档后将从列表隐藏，消息仍保留。`);
  if (!ok) {
    return;
  }
  window.__wbPersistActiveChatSnapshot?.();
  await api.wbChatArchive({ chatId: chat.id });
  await afterChatRemoved(chat.id);
}

async function deleteChat(chat) {
  const api = wbApi();
  if (!chat?.id || typeof api.wbChatDelete !== "function") {
    return;
  }
  const ok = window.confirm(`删除会话「${chat.title}」？\n\n此为软删除，会话将从列表移除。`);
  if (!ok) {
    return;
  }
  window.__wbPersistActiveChatSnapshot?.();
  await api.wbChatDelete({ chatId: chat.id });
  const snapshots = JSON.parse(localStorage.getItem("wb_chat_snapshots_v1") || "{}");
  delete snapshots[chat.id];
  localStorage.setItem("wb_chat_snapshots_v1", JSON.stringify(snapshots));
  await afterChatRemoved(chat.id);
}

function renderChatSessionList() {
  const list = document.getElementById("jlAiSessionList");
  if (!list) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const chats = store.chats || [];
  list.replaceChildren();
  if (!chats.length) {
    const empty = document.createElement("p");
    empty.className = "jl-workbench-nav__zone-empty";
    empty.textContent = "暂无会话，点击 + 新建";
    list.appendChild(empty);
    return;
  }
  chats.forEach((chat) => {
    const card = document.createElement("div");
    card.className = "wb-list-card";
    card.dataset.chatId = chat.id;
    card.innerHTML = `
      <button type="button" class="jl-ai-session-item wb-list-card__body">
        <span class="wb-chat-item__title">${escapeHtml(chat.title || "未命名对话")}</span>
        ${chat.summary ? `<span class="wb-chat-item__summary">${escapeHtml(chat.summary)}</span>` : ""}
      </button>
      <div class="wb-list-card__actions" role="group" aria-label="会话操作">
        <button type="button" class="wb-icon-btn" data-action="rename" title="重命名" aria-label="重命名">✎</button>
        <button type="button" class="wb-icon-btn" data-action="archive" title="归档" aria-label="归档">📦</button>
        <button type="button" class="wb-icon-btn wb-icon-btn--danger" data-action="delete" title="删除" aria-label="删除">🗑</button>
      </div>
    `;
    card.classList.toggle("is-active", chat.id === store.selectedChatId);
    card.querySelector(".wb-list-card__body")?.addEventListener("click", () => {
      void window.__wbSwitchChat?.(chat.id);
    });
    card.querySelector('[data-action="rename"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      openEditChatModal(chat);
    });
    card.querySelector('[data-action="archive"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void archiveChat(chat);
    });
    card.querySelector('[data-action="delete"]')?.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void deleteChat(chat);
    });
    list.appendChild(card);
  });
}

async function createChatSession() {
  const api = wbApi();
  if (typeof api.wbChatCreate !== "function") {
    return;
  }
  const chat = await api.wbChatCreate({ title: `对话 ${Date.now().toString().slice(-4)}` });
  await window.__wbRefreshChats?.();
  await window.__wbSwitchChat?.(chat.id);
}

function bindChatArea() {
  ensureEditChatModal();
  const newBtn = document.getElementById("jlAiNewSessionBtn");
  if (newBtn && newBtn.dataset.wbBound !== "1") {
    newBtn.dataset.wbBound = "1";
    newBtn.addEventListener("click", (ev) => {
      if (typeof wbApi().wbChatCreate === "function") {
        ev.stopImmediatePropagation();
        void createChatSession();
      }
    }, true);
  }
  const form = document.getElementById("wbEditChatForm");
  if (form && form.dataset.wbBound !== "1") {
    form.dataset.wbBound = "1";
    form.addEventListener("submit", submitEditChat);
  }
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", renderChatSessionList);
}

window.__wbRenderChats = renderChatSessionList;
window.__wbBindChatArea = bindChatArea;
