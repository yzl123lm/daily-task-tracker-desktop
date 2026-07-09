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
    const remote = await window.electronAPI.wbChatsList({ withSummary: true });
    // 以服务端 ACTIVE 列表为唯一真相源，禁止把本地已删除会话合并回去（否则删除后会回弹）。
    const next = (Array.isArray(remote) ? remote : [])
      .filter((chat) => chat?.id)
      .sort((a, b) => {
        const ta = Date.parse(a?.updatedAt || a?.createdAt || 0) || 0;
        const tb = Date.parse(b?.updatedAt || b?.createdAt || 0) || 0;
        return tb - ta;
      });
    window.__wbStore?.setChats?.(next);
    window.__wbChatSessionStore?.syncSessionsFromApi?.(next);
    window.__wbRenderChats?.();
  } catch (err) {
    console.error("[wb] refreshChats failed:", err);
    window.__wbRenderChats?.();
  }
}

function initWorkbenchDev() {
  if (!wbReady()) {
    return;
  }
  window.__wbChatSessionStore?.loadFromStorage?.();
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
    await window.__wbRepairOrphanChatSession?.();
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
        window.__wbStore?.setActiveModule?.("chat");
        window.__jlSyncWorkbenchSidePanelView?.("sessions");
        window.__jlSyncWorkbenchNavRailActive?.("sessions");
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
      const latest = window.__wbStore?.getState?.() || {};
      const latestModule =
        typeof window.__wbResolveActiveModule === "function"
          ? window.__wbResolveActiveModule(latest)
          : latest.activeModule || latest.mode || "chat";
      if (latestModule === "project") {
        const projects = latest.projects || [];
        const projectId = latest.selectedProjectId || projects[0]?.id;
        if (projectId) {
          if (!latest.selectedProjectId) {
            window.__wbStore?.selectProject?.(projectId);
          }
          await window.__wbSwitchWorkspaceModule?.("project");
          return;
        }
      }
      window.__wbChatSessionStore?.setActiveSessionId?.(chatId);
      await window.__wbSwitchChat?.(chatId);
    } else {
      window.__wbStore?.setActiveModule?.("chat");
      window.__jlSyncWorkbenchSidePanelView?.("sessions");
      window.__jlSyncWorkbenchNavRailActive?.("sessions");
      window.__wbApplyMainView?.();
    }
    window.__wbChatSessionStore?.persistToStorage?.();
  })();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkbenchDev);
} else {
  initWorkbenchDev();
}
