const WB_EVENT = "wb:state-change";
const WB_ACTIVE_MODULE_KEY = "wb_active_module_v1";

function readPersistedActiveModule() {
  try {
    const saved = localStorage.getItem(WB_ACTIVE_MODULE_KEY);
    if (saved === "project" || saved === "chat") {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return "chat";
}

function persistActiveModule(module) {
  try {
    if (module === "project" || module === "chat") {
      localStorage.setItem(WB_ACTIVE_MODULE_KEY, module);
    }
  } catch {
    /* ignore */
  }
}

const initialModule = readPersistedActiveModule();

const state = {
  activeModule: initialModule,
  mode: initialModule,
  selectedProjectId: null,
  selectedChatId: null,
  projects: [],
  chats: [],
  tasks: [],
  loading: false,
};

function emitChange() {
  window.dispatchEvent(
    new CustomEvent(WB_EVENT, {
      detail: {
        activeModule: state.activeModule,
        mode: state.mode,
        selectedProjectId: state.selectedProjectId,
        selectedChatId: state.selectedChatId,
      },
    })
  );
  window.__wbScheduleMainView?.();
}

function getState() {
  return { ...state };
}

function getActiveModule() {
  return state.activeModule;
}

function setActiveModule(module) {
  const next =
    module === "project" ? "project" : module === "chat" ? "chat" : "idle";
  state.activeModule = next;
  state.mode = next === "idle" ? "idle" : next;
  if (next === "project" || next === "chat") {
    persistActiveModule(next);
  }
  emitChange();
}

function selectProject(projectId) {
  const id = projectId ? String(projectId) : null;
  state.selectedProjectId = id;
  if (id) {
    state.activeModule = "project";
    state.mode = "project";
    persistActiveModule("project");
  }
  emitChange();
}

function selectChat(chatId) {
  const id = chatId ? String(chatId) : null;
  state.selectedChatId = id;
  if (id) {
    state.activeModule = "chat";
    state.mode = "chat";
    persistActiveModule("chat");
  }
  emitChange();
}

function clearSelection() {
  state.selectedProjectId = null;
  state.selectedChatId = null;
  state.activeModule = "idle";
  state.mode = "idle";
  emitChange();
}

function setProjects(projects) {
  state.projects = Array.isArray(projects) ? projects : [];
}

function setChats(chats) {
  state.chats = Array.isArray(chats) ? chats : [];
}

function setTasks(tasks) {
  state.tasks = Array.isArray(tasks) ? tasks : [];
}

function setLoading(loading) {
  state.loading = Boolean(loading);
}

window.__wbStore = {
  WB_EVENT,
  getState,
  getActiveModule,
  setActiveModule,
  selectProject,
  selectChat,
  clearSelection,
  setProjects,
  setChats,
  setTasks,
  setLoading,
};
