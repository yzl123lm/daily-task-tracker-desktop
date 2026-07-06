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

function renderChatSessionList() {
  const list = document.getElementById("jlAiSessionList");
  if (!list) {
    return;
  }
  const store = window.__wbStore?.getState?.() || {};
  const chats = store.chats || [];
  list.replaceChildren();
  chats.forEach((chat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "jl-ai-session-item";
    btn.dataset.chatId = chat.id;
    btn.setAttribute("role", "listitem");
    btn.textContent = chat.title || "未命名对话";
    btn.classList.toggle("is-active", chat.id === store.selectedChatId);
    btn.addEventListener("click", () => {
      window.__wbStore?.selectChat?.(chat.id);
      window.__wbHideProjectWorkspace?.();
      if (typeof window.activateRoute === "function") {
        window.activateRoute("ai", { syncHash: true, skipWorkbenchGuard: true });
      }
    });
    list.appendChild(btn);
  });
}

async function createChatSession() {
  const api = wbApi();
  if (typeof api.wbChatCreate !== "function") {
    return;
  }
  const chat = await api.wbChatCreate({ title: `对话 ${Date.now().toString().slice(-4)}` });
  await window.__wbRefreshChats?.();
  window.__wbStore?.selectChat?.(chat.id);
  window.__wbHideProjectWorkspace?.();
  if (typeof window.activateRoute === "function") {
    window.activateRoute("ai", { syncHash: true, skipWorkbenchGuard: true });
  }
}

function bindChatArea() {
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
  window.addEventListener(window.__wbStore?.WB_EVENT || "wb:state-change", renderChatSessionList);
}

window.__wbRenderChats = renderChatSessionList;
window.__wbBindChatArea = bindChatArea;
