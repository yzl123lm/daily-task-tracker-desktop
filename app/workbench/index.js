function wbReady() {
  const api = window.electronAPI;
  return api && typeof api.wbProjectsList === "function";
}

async function refreshProjects() {
  if (!wbReady()) {
    return;
  }
  window.__wbStore?.setLoading?.(true);
  try {
    const projects = await window.electronAPI.wbProjectsList({});
    window.__wbStore?.setProjects?.(projects);
    window.__wbRenderProjects?.();
  } finally {
    window.__wbStore?.setLoading?.(false);
  }
}

async function refreshChats() {
  if (!wbReady()) {
    return;
  }
  try {
    const chats = await window.electronAPI.wbChatsList({ withSummary: true });
    window.__wbStore?.setChats?.(chats);
    window.__wbRenderChats?.();
  } catch {
    /* ignore */
  }
}

function initWorkbenchDev() {
  if (!wbReady()) {
    return;
  }
  window.__wbRefreshProjects = refreshProjects;
  window.__wbRefreshChats = refreshChats;
  window.__wbBindProjectArea?.();
  window.__wbBindProjectWorkspace?.();
  window.__wbBindCodePanel?.();
  window.__wbBindChatArea?.();
  void (async () => {
    await window.__wbMigrateLegacyChats?.();
    await refreshProjects();
    await refreshChats();
    window.__wbApplyMainView?.();
    const chats = window.__wbStore?.getState?.().chats || [];
    const storedActive = window.__wbReadStoredActiveChatId?.();
    let chatId = window.__wbStore?.getState?.().selectedChatId;
    if (!chatId && storedActive && chats.some((c) => c.id === storedActive)) {
      chatId = storedActive;
    }
    if (!chatId && chats[0]?.id) {
      chatId = chats[0].id;
    }
    if (chatId) {
      await window.__wbSwitchChat?.(chatId);
    }
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkbenchDev);
} else {
  initWorkbenchDev();
}
