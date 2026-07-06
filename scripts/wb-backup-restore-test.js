const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { getDb, newId, nowIso } = require("../main/workbench/db.js");
const { writeProjectFile } = require("../main/workbench/projectWriteService.js");
const {
  listFileBackups,
  restoreFileFromBackup,
} = require("../main/workbench/backupRestoreService.js");
const { createProject, createTask } = require("../main/workbench/projectService.js");

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bak-"));
const codeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-bak-code-"));
const getUserDataPath = () => userData;
const getDefaultProjectRoot = () => codeRoot;

const project = createProject(getUserDataPath, "local-user", {
  name: "备份测试项目",
  localPath: codeRoot,
});
const task = createTask(getUserDataPath, "local-user", project.id, {
  title: "还原任务",
});

const rel = "restore-me.txt";
fs.writeFileSync(path.join(codeRoot, rel), "version-1\n", "utf8");

writeProjectFile(getUserDataPath, "local-user", codeRoot, rel, "version-2\n", {
  projectId: project.id,
  taskId: task.id,
});

const backups = listFileBackups(getUserDataPath, "local-user", project.id, task.id);
assert.ok(backups.length >= 1);
assert.strictEqual(backups[0].hadOriginal, true);
assert.ok(backups[0].canRestore);

const restoreRes = restoreFileFromBackup(
  getUserDataPath,
  "local-user",
  {
    projectId: project.id,
    taskId: task.id,
    backupId: backups[0].id,
    userApproved: true,
  },
  { getDefaultProjectRoot }
);
assert.strictEqual(restoreRes.mode, "restored_content");
assert.strictEqual(fs.readFileSync(path.join(codeRoot, rel), "utf8"), "version-1\n");

try {
  restoreFileFromBackup(
    getUserDataPath,
    "local-user",
    {
      projectId: project.id,
      taskId: task.id,
      backupId: backups[0].id,
      userApproved: false,
    },
    { getDefaultProjectRoot }
  );
  assert.fail("should require approval");
} catch (err) {
  assert.strictEqual(err.code, "USER_APPROVAL_REQUIRED");
}

fs.rmSync(codeRoot, { recursive: true, force: true });
try {
  fs.rmSync(userData, { recursive: true, force: true });
} catch {
  /* sqlite lock */
}

console.log("wb-backup-restore-test: OK");
