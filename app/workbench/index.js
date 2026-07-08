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
    const store = window.__wbStore?.getState?.() || {};
    const module =
      typeof window.__wbResolveActiveModule === "function"
        ? window.__wbResolveActiveModule(store)
        : store.activeModule || store.mode || "chat";

    if (module === "project") {
      const projects = window.__wbStore?.getState?.().projects || [];
      let projectId = window.__wbStore?.getState?.().selectedProjectId || projects[0]?.id;
      if (projectId) {
        if (!store.selectedProjectId) {
          window.__wbStore?.selectProject?.(projectId);
        }
        await window.__wbSwitchWorkspaceModule?.("project");
      } else {
        window.__jlSyncWorkbenchSidePanelView?.("project");
        window.__jlSyncWorkbenchNavRailActive?.("project");
        window.__wbApplyMainView?.();
      }
      return;
    }

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
    } else {
      window.__jlSyncWorkbenchSidePanelView?.("sessions");
      window.__jlSyncWorkbenchNavRailActive?.("sessions");
      window.__wbApplyMainView?.();
    }
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkbenchDev);
} else {
  initWorkbenchDev();
}
