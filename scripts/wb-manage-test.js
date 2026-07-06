const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createProject,
  listProjects,
  archiveProject,
  deleteProject,
} = require("../main/workbench/projectService.js");
const {
  createChat,
  listChats,
  archiveChat,
  deleteChat,
  updateChat,
} = require("../main/workbench/chatService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-manage-"));
const getUserDataPath = () => userData;

const project = createProject(getUserDataPath, "local-user", { name: "管理测试项目" });
const chat = createChat(getUserDataPath, "local-user", { title: "管理测试会话" });

let projects = listProjects(getUserDataPath, "local-user");
assert.strictEqual(projects.length, 1);

let chats = listChats(getUserDataPath, "local-user");
assert.strictEqual(chats.length, 1);

updateChat(getUserDataPath, "local-user", chat.id, { title: "已重命名会话" });
const renamed = listChats(getUserDataPath, "local-user")[0];
assert.strictEqual(renamed.title, "已重命名会话");

archiveChat(getUserDataPath, "local-user", chat.id);
chats = listChats(getUserDataPath, "local-user");
assert.strictEqual(chats.length, 0);

archiveProject(getUserDataPath, "local-user", project.id);
projects = listProjects(getUserDataPath, "local-user");
assert.strictEqual(projects.length, 0);

const project2 = createProject(getUserDataPath, "local-user", { name: "待删除" });
deleteProject(getUserDataPath, "local-user", project2.id);
projects = listProjects(getUserDataPath, "local-user");
assert.strictEqual(projects.length, 0);

const chat2 = createChat(getUserDataPath, "local-user", { title: "待删除" });
deleteChat(getUserDataPath, "local-user", chat2.id);
chats = listChats(getUserDataPath, "local-user");
assert.strictEqual(chats.length, 0);

try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}

console.log("wb-manage-test: OK");
