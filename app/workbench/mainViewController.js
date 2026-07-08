function applyMainView() {
  const store = window.__wbStore?.getState?.() || {};
  const module =
    typeof window.__wbResolveActiveModule === "function"
      ? window.__wbResolveActiveModule(store)
      : store.activeModule || store.mode || "chat";

  if (module === "project" && store.selectedProjectId) {
    window.__wbEnterProjectWorkspaceShell?.();
    const root = document.getElementById("wbProjectWorkspace");
    const ready =
      root &&
      root.dataset.wbReady === "1" &&
      root.dataset.wbProjectId === store.selectedProjectId;
    if (ready) {
      window.__wbShowProjectView?.(store.selectedProjectId);
      return;
    }
    if (typeof window.__wbShowProjectWorkspace === "function") {
      void window.__wbShowProjectWorkspace(store.selectedProjectId);
    }
    return;
  }

  window.__wbShowChatView?.();
}

let mainViewApplySeq = 0;

function scheduleMainView() {
  const seq = ++mainViewApplySeq;
  queueMicrotask(() => {
    if (seq !== mainViewApplySeq) {
      return;
    }
    applyMainView();
  });
  requestAnimationFrame(() => {
    if (seq !== mainViewApplySeq) {
      return;
    }
    applyMainView();
  });
}

window.__wbApplyMainView = applyMainView;
window.__wbScheduleMainView = scheduleMainView;
