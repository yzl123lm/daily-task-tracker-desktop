const WB_EVENT = "wb:state-change";
const WB_ACTIVE_MODULE_KEY = "wb_active_module_v1";
const WB_SELECTED_PROJECT_KEY = "wb_selected_project_id_v1";
const WB_SELECTED_TASK_KEY = "wb_selected_task_id_v1";

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

function readPersistedSelectedProjectId() {
  try {
    const saved = localStorage.getItem(WB_SELECTED_PROJECT_KEY);
    return saved ? String(saved) : null;
  } catch {
    /* ignore */
  }
  return null;
}

function persistSelectedProjectId(projectId) {
  try {
    const id = projectId ? String(projectId) : "";
    if (id) {
      localStorage.setItem(WB_SELECTED_PROJECT_KEY, id);
    } else {
      localStorage.removeItem(WB_SELECTED_PROJECT_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readPersistedSelectedTaskId() {
  try {
    const saved = localStorage.getItem(WB_SELECTED_TASK_KEY);
    return saved ? String(saved) : null;
  } catch {
    /* ignore */
  }
  return null;
}

function persistSelectedTaskId(taskId) {
  try {
    const id = taskId ? String(taskId) : "";
    if (id) {
      localStorage.setItem(WB_SELECTED_TASK_KEY, id);
    } else {
      localStorage.removeItem(WB_SELECTED_TASK_KEY);
    }
  } catch {
    /* ignore */
  }
}

const initialModule = readPersistedActiveModule();

const state = {
  activeModule: initialModule,
  mode: initialModule,
  selectedProjectId: readPersistedSelectedProjectId(),
  selectedTaskId: readPersistedSelectedTaskId(),
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
        selectedTaskId: state.selectedTaskId,
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
  const projectChanged = state.selectedProjectId !== id;
  state.selectedProjectId = id;
  persistSelectedProjectId(id);
  if (projectChanged) {
    state.selectedTaskId = null;
    persistSelectedTaskId(null);
  }
  if (id) {
    state.activeModule = "project";
    state.mode = "project";
    persistActiveModule("project");
  }
  emitChange();
}

function selectTask(taskId) {
  const id = taskId ? String(taskId) : null;
  if (state.selectedTaskId === id) {
    return;
  }
  state.selectedTaskId = id;
  persistSelectedTaskId(id);
  emitChange();
}

function setSelectedChatId(chatId) {
  state.selectedChatId = chatId ? String(chatId) : null;
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
  persistSelectedProjectId(null);
  state.selectedTaskId = null;
  persistSelectedTaskId(null);
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

function removeChat(chatId) {
  const id = chatId ? String(chatId) : "";
  if (!id) {
    return;
  }
  state.chats = state.chats.filter((c) => c.id !== id);
  if (state.selectedChatId === id) {
    state.selectedChatId = null;
  }
  emitChange();
}

function upsertChat(chat) {
  const item = chat && typeof chat === "object" ? chat : null;
  if (!item?.id) {
    return;
  }
  const id = String(item.id);
  const idx = state.chats.findIndex((c) => c.id === id);
  if (idx >= 0) {
    state.chats[idx] = { ...state.chats[idx], ...item };
  } else {
    state.chats.unshift(item);
  }
  emitChange();
}

function setTasks(tasks) {
  const next = Array.isArray(tasks) ? tasks : [];
  state.tasks = next;
  // 仅在「已加载到任务列表」且选中项不在列表中时清除；空数组刷新时不要清掉选中，
  // 否则 Diff 面板会误判「请选择任务」
  if (
    next.length > 0 &&
    state.selectedTaskId &&
    !next.some((t) => t && t.id === state.selectedTaskId)
  ) {
    state.selectedTaskId = null;
    persistSelectedTaskId(null);
  }
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
  selectTask,
  setSelectedChatId,
  selectChat,
  clearSelection,
  setProjects,
  setChats,
  removeChat,
  upsertChat,
  setTasks,
  setLoading,
};
