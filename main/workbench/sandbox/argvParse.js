/**
 * Parse approved shell command strings into argv (no shell interpolation).
 * BL-008 / TOOL-003
 */
function parseCommandToArgv(command) {
  const cmd = String(command || "").trim();
  if (!cmd) {
    const err = new Error("命令不能为空");
    err.code = "ARGV_EMPTY";
    throw err;
  }
  // Ban shell operators / substitution; allow () for node -e snippets in argv strings
  if (/[`$;&|<>]/.test(cmd)) {
    const err = new Error("argv 解析拒绝 shell 元字符");
    err.code = "ARGV_META";
    throw err;
  }
  const parts = cmd.split(/\s+/).filter(Boolean);
  if (!parts.length) {
    const err = new Error("命令不能为空");
    err.code = "ARGV_EMPTY";
    throw err;
  }
  return parts;
}

/**
 * Resolve executable for spawn({shell:false}) on Windows.
 */
function resolveExecutable(argv0) {
  const name = String(argv0 || "");
  if (process.platform === "win32") {
    const lower = name.toLowerCase();
    if (lower === "npm") return "npm.cmd";
    if (lower === "npx") return "npx.cmd";
    if (lower === "node") return process.execPath;
    if (lower === "python" || lower === "python3") return name;
    if (lower === "git") return "git.exe";
  } else if (name === "node") {
    return process.execPath;
  }
  return name;
}

function toSpawnSpec(commandOrArgv) {
  const argv = Array.isArray(commandOrArgv)
    ? commandOrArgv.map(String)
    : parseCommandToArgv(commandOrArgv);
  const file = resolveExecutable(argv[0]);
  const args = argv.slice(1);
  return { file, args, argv: [file, ...args], display: argv.join(" ") };
}

module.exports = {
  parseCommandToArgv,
  resolveExecutable,
  toSpawnSpec,
};
