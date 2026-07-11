const { spawn } = require("child_process");

const MAX_COMMAND_LEN = 240;

const BLOCKED_FRAGMENTS = [
  "&&",
  "||",
  ";",
  "|",
  ">",
  "<",
  "`",
  "$(",
  "${",
  "\n",
  "\r",
  "Invoke-Expression",
  "iex ",
  "Remove-Item",
  "rmdir ",
  "del /",
  "del ",
  "rm -rf",
  "rm -fr",
  "rm ",
  "format ",
  "shutdown",
  "curl ",
  "wget ",
  "certutil",
  "bitsadmin",
  "regsvr32",
  "mshta",
  "powershell -e",
  "powershell -enc",
  "cmd /c",
  "taskkill",
  "reg add",
  "reg delete",
];

const BLOCKED_GIT_WRITE = /^git\s+(push|commit|reset|checkout|merge|rebase|clean|stash|pull|fetch)\b/i;

const TEST_WHITELIST_PATTERNS = [
  /^npm run wb-[a-z0-9:-]+$/i,
  /^npm run test\b/i,
  /^npm run build$/i,
  /^npm run lint$/i,
  /^npm run typecheck$/i,
  /^npm run type-check$/i,
  /^npm run check$/i,
  /^npm run kb-[a-z0-9:-]+$/i,
  /^node scripts\/wb-[a-z0-9-]+-test\.js$/i,
  /^node scripts\/wb-namespace-test\.js$/i,
  /^node scripts\/wb-compression-test\.js$/i,
  /^node scripts\/wb-plan-output-test\.js$/i,
  /^node scripts\/wb-code-read-test\.js$/i,
  /^node scripts\/wb-controlled-dev-test\.js$/i,
  /^node scripts\/wb-backup-restore-test\.js$/i,
  /^node scripts\/wb-manage-test\.js$/i,
  /^node scripts\/wb-shell-test\.js$/i,
];

const CONTROLLED_SHELL_PATTERNS = [
  /^npm run [a-z0-9:@._/-]+$/i,
  /^npm test(?:\s|$)/i,
  /^npm run build$/i,
  /^node scripts\/[a-zA-Z0-9_./-]+\.js$/i,
  /^git status(?:\s|$)/i,
  /^git diff(?:\s|$)/i,
  /^git log(?:\s|$)/i,
  /^git branch(?:\s|$)/i,
  /^python scripts\/[a-zA-Z0-9_./-]+\.py$/i,
];

const SHELL_PRESETS = [
  "npm run build",
  "npm run test",
  "git status",
  "git diff",
  "node scripts/wb-namespace-test.js",
  "node scripts/wb-manage-test.js",
];

function assertSafeCommandShape(command) {
  const cmd = String(command || "").trim();
  if (!cmd) {
    throw new Error("命令不能为空");
  }
  if (cmd.length > MAX_COMMAND_LEN) {
    throw new Error(`命令过长（上限 ${MAX_COMMAND_LEN} 字符）`);
  }
  const lower = cmd.toLowerCase();
  for (const frag of BLOCKED_FRAGMENTS) {
    if (lower.includes(frag.toLowerCase())) {
      throw new Error(`命令包含禁止片段：${frag.trim()}`);
    }
  }
  if (BLOCKED_GIT_WRITE.test(cmd)) {
    throw new Error("Git 写操作请使用专用 Git 工具（status/diff/log/branch 可用 shell）");
  }
  return cmd;
}

function classifyCommand(command) {
  const cmd = assertSafeCommandShape(command);
  if (TEST_WHITELIST_PATTERNS.some((re) => re.test(cmd))) {
    return { cmd, tier: "test" };
  }
  if (CONTROLLED_SHELL_PATTERNS.some((re) => re.test(cmd))) {
    return { cmd, tier: "controlled" };
  }
  const err = new Error(`命令不在受控 shell 白名单：${cmd}`);
  err.code = "COMMAND_NOT_ALLOWED";
  err.status = 403;
  throw err;
}

function isWhitelistedTestCommand(command) {
  const cmd = String(command || "").trim();
  return TEST_WHITELIST_PATTERNS.some((re) => re.test(cmd));
}

function isControlledShellCommand(command) {
  try {
    classifyCommand(command);
    return true;
  } catch {
    return false;
  }
}

function runCommand(cwd, command, { timeoutMs = 120000 } = {}) {
  const { cmd } = classifyCommand(command);
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      shell: true,
      windowsHide: true,
      env: { ...process.env, CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("命令执行超时"));
    }, timeoutMs);
    child.stdout.on("data", (buf) => {
      stdout += String(buf);
    });
    child.stderr.on("data", (buf) => {
      stderr += String(buf);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command: cmd,
        exitCode: code,
        stdout: stdout.slice(0, 16000),
        stderr: stderr.slice(0, 16000),
        success: code === 0,
      });
    });
  });
}

module.exports = {
  TEST_WHITELIST_PATTERNS,
  CONTROLLED_SHELL_PATTERNS,
  SHELL_PRESETS,
  assertSafeCommandShape,
  classifyCommand,
  isWhitelistedTestCommand,
  isControlledShellCommand,
  runCommand,
};
