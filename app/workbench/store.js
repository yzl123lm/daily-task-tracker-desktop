const WB_EVENT = "wb:state-change";

const state = {
  mode: "idle",
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
        mode: state.mode,
        selectedProjectId: state.selectedProjectId,
        selectedChatId: state.selectedChatId,
      },
    })
  );
}

function getState() {
  return { ...state };
}

function selectProject(projectId) {
  const id = projectId ? String(projectId) : null;
  state.selectedProjectId = id;
  state.selectedChatId = null;
  state.mode = id ? "project" : "idle";
  emitChange();
}

function selectChat(chatId) {
  const id = chatId ? String(chatId) : null;
  state.selectedChatId = id;
  state.selectedProjectId = null;
  state.mode = id ? "chat" : "idle";
  emitChange();
}

function clearSelection() {
  state.selectedProjectId = null;
  state.selectedChatId = null;
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
  selectProject,
  selectChat,
  clearSelection,
  setProjects,
  setChats,
  setTasks,
  setLoading,
};
