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
  window.__wbBindChatArea?.();
  void (async () => {
    await window.__wbMigrateLegacyChats?.();
    await refreshProjects();
    await refreshChats();
    const chatId = window.__wbStore?.getState?.().selectedChatId;
    if (chatId) {
      await window.__wbSwitchChat?.(chatId);
    } else {
      const chats = window.__wbStore?.getState?.().chats || [];
      if (chats[0]?.id) {
        await window.__wbSwitchChat?.(chats[0].id);
      }
    }
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkbenchDev);
} else {
  initWorkbenchDev();
}
