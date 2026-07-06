const { spawnSync } = require("child_process");
const path = require("path");

const READONLY_GIT = new Set(["git_status", "git_branch_list"]);
const WRITE_GIT = new Set(["git_commit", "git_checkout_branch"]);

function runGit(cwd, args, { timeoutMs = 30000 } = {}) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: timeoutMs,
    windowsHide: true,
  });
  return {
    exitCode: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
    success: result.status === 0,
  };
}

function isGitRepo(cwd) {
  const res = runGit(cwd, ["rev-parse", "--is-inside-work-tree"]);
  return res.success && /true/i.test(res.stdout);
}

function gitStatus(cwd) {
  if (!isGitRepo(cwd)) {
    return { isRepo: false, porcelain: "", branch: null, clean: true };
  }
  const branchRes = runGit(cwd, ["branch", "--show-current"]);
  const statusRes = runGit(cwd, ["status", "--porcelain"]);
  const porcelain = statusRes.stdout;
  return {
    isRepo: true,
    branch: branchRes.stdout || null,
    porcelain,
    clean: !porcelain.trim(),
    lines: porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [],
  };
}

function createTaskBranch(cwd, taskId) {
  if (!isGitRepo(cwd)) {
    return { created: false, reason: "not_a_git_repo" };
  }
  const safeId = String(taskId || "task").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const branchName = `wb/${safeId}/${stamp}`;
  const checkout = runGit(cwd, ["checkout", "-b", branchName]);
  if (!checkout.success) {
    const err = new Error(checkout.stderr || "创建 Git 分支失败");
    err.code = "GIT_BRANCH_FAILED";
    throw err;
  }
  return { created: true, branchName, checkout };
}

function gitCommit(cwd, message, { userApproved } = {}) {
  if (!userApproved) {
    const err = new Error("Git commit 需要用户确认");
    err.code = "USER_APPROVAL_REQUIRED";
    err.status = 403;
    throw err;
  }
  if (!isGitRepo(cwd)) {
    return { committed: false, reason: "not_a_git_repo" };
  }
  const add = runGit(cwd, ["add", "-A"]);
  if (!add.success) {
    throw new Error(add.stderr || "git add 失败");
  }
  const msg = String(message || "wb: controlled dev commit").slice(0, 240);
  const commit = runGit(cwd, ["commit", "-m", msg]);
  if (!commit.success && !/nothing to commit/i.test(commit.stdout + commit.stderr)) {
    throw new Error(commit.stderr || commit.stdout || "git commit 失败");
  }
  const hashRes = runGit(cwd, ["rev-parse", "--short", "HEAD"]);
  return {
    committed: commit.success,
    message: msg,
    shortHash: hashRes.success ? hashRes.stdout : null,
    output: commit.stdout || commit.stderr,
  };
}

module.exports = {
  READONLY_GIT,
  WRITE_GIT,
  isGitRepo,
  gitStatus,
  createTaskBranch,
  gitCommit,
  runGit,
};
