const {
  TEST_WHITELIST_PATTERNS,
  isWhitelistedTestCommand,
  runCommand,
} = require("./shellRunnerService.js");

function runWhitelistedCommand(cwd, command, options) {
  const cmd = String(command || "").trim();
  if (!isWhitelistedTestCommand(cmd)) {
    const err = new Error(`命令不在白名单：${cmd}`);
    err.code = "COMMAND_NOT_ALLOWED";
    err.status = 403;
    throw err;
  }
  return runCommand(cwd, cmd, options);
}

module.exports = {
  WHITELIST_PATTERNS: TEST_WHITELIST_PATTERNS,
  isWhitelistedTestCommand,
  runWhitelistedCommand,
};
