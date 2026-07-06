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
    const chats = await window.electronAPI.wbChatsList({});
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
  void refreshProjects();
  void refreshChats();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initWorkbenchDev);
} else {
  initWorkbenchDev();
}
