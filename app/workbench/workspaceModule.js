function resolveActiveModule(store = {}) {
  return store.activeModule || store.mode || "chat";
}

function syncModuleChrome(module) {
  const isProject = module === "project";
  window.__jlSyncWorkbenchSidePanelView?.(isProject ? "project" : "sessions");
  window.__jlSyncWorkbenchNavRailActive?.(isProject ? "project" : "sessions");
}

async function switchWorkspaceModule(module) {
  const target = module === "project" ? "project" : "chat";
  const store = window.__wbStore?.getState?.() || {};
  window.__wbStore?.setActiveModule?.(target);
  syncModuleChrome(target);

  if (target === "chat") {
    window.__wbShowChatView?.();
    if (typeof window.activateRoute === "function") {
      window.activateRoute("ai", { syncHash: true, skipWorkbenchGuard: true });
    }
    let chatId = store.selectedChatId;
    if (!chatId) {
      const chats = window.__wbStore?.getState?.().chats || [];
      chatId = chats[0]?.id || null;
    }
    if (chatId && typeof window.__wbSwitchChat === "function") {
      await window.__wbSwitchChat(chatId);
    } else {
      window.__wbApplyMainView?.();
    }
    return;
  }

  let projectId = store.selectedProjectId;
  if (!projectId) {
    const projects = window.__wbStore?.getState?.().projects || [];
    projectId = projects[0]?.id || null;
    if (projectId) {
      window.__wbStore?.selectProject?.(projectId);
    }
  }

  if (projectId) {
    if (typeof window.activateRoute === "function") {
      window.activateRoute("project-dev", {
        syncHash: true,
        skipWorkbenchGuard: true,
        projectId,
        skipProjectLoad: false,
      });
    } else if (typeof window.__wbShowProjectWorkspace === "function") {
      await window.__wbShowProjectWorkspace(projectId);
    }
    return;
  }

  window.__wbApplyMainView?.();
}

window.__wbSwitchWorkspaceModule = switchWorkspaceModule;
window.__wbResolveActiveModule = resolveActiveModule;
