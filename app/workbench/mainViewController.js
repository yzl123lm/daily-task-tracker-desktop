function applyMainView() {
  const store = window.__wbStore?.getState?.() || {};
  if (store.mode === "chat" && store.selectedChatId) {
    window.__wbShowChatView?.();
    return;
  }
  if (store.mode === "project" && store.selectedProjectId) {
    const root = document.getElementById("wbProjectWorkspace");
    const ready =
      root &&
      root.dataset.wbReady === "1" &&
      root.dataset.wbProjectId === store.selectedProjectId;
    if (ready) {
      window.__wbShowProjectView?.(store.selectedProjectId);
    }
    return;
  }
  window.__wbShowChatView?.();
}

let mainViewApplyQueued = false;

function scheduleMainView() {
  if (mainViewApplyQueued) {
    return;
  }
  mainViewApplyQueued = true;
  queueMicrotask(() => {
    mainViewApplyQueued = false;
    applyMainView();
    requestAnimationFrame(applyMainView);
  });
}

window.__wbApplyMainView = applyMainView;
window.__wbScheduleMainView = scheduleMainView;
