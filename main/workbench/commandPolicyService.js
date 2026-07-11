/** Classify shell / npm commands for verification and policy enforcement. */

const VERIFY_SCRIPT_NAMES = new Set(["build", "test", "lint", "typecheck", "type-check", "check"]);

const LONG_RUNNING_PATTERNS = [
  /^npm run dev\b/i,
  /^npm start\b/i,
  /^npm run watch\b/i,
  /^node .*--watch/i,
];

const DANGEROUS_PATTERNS = [
  /^git push\b/i,
  /^git reset\b/i,
  /^npm install\b/i,
  /^npm i\b/i,
  /^npm ci\b/i,
  /^pnpm install\b/i,
  /^yarn install\b/i,
  /^bun install\b/i,
  /^python -m pip install\b/i,
  /^pip install\b/i,
  /^docker compose\b/i,
  /^docker-compose\b/i,
  /^docker build\b/i,
  /^rm\b/i,
  /^del\b/i,
  /^format\b/i,
  /^shutdown\b/i,
];

const FORBIDDEN_PATTERNS = [
  /&&/,
  /\|\|/,
  /;/,
  /\|/,
  />/,
  /</,
  /`/,
  /\$\(/,
  /\$\{/,
  /\n/,
  /Invoke-Expression/i,
  /powershell\s+-e/i,
  /certutil/i,
  /regsvr32/i,
];

function classifyCommand(command) {
  const cmd = String(command || "").trim();
  if (!cmd) {
    return { category: "forbidden", reason: "空命令" };
  }
  for (const re of FORBIDDEN_PATTERNS) {
    if (re.test(cmd)) {
      return { category: "forbidden", reason: "命令包含禁止片段" };
    }
  }
  for (const re of DANGEROUS_PATTERNS) {
    if (re.test(cmd)) {
      return { category: "dangerous", reason: "危险命令需单独审批" };
    }
  }
  for (const re of LONG_RUNNING_PATTERNS) {
    if (re.test(cmd)) {
      return { category: "long-running", reason: "长时间运行命令" };
    }
  }
  const npmRun = cmd.match(/^npm run ([a-z0-9:@._/-]+)$/i);
  if (npmRun && VERIFY_SCRIPT_NAMES.has(npmRun[1].toLowerCase())) {
    return { category: "verify", scriptName: npmRun[1], reason: "验证脚本" };
  }
  const pnpmRun = cmd.match(/^pnpm run ([a-z0-9:@._/-]+)$/i);
  if (pnpmRun && VERIFY_SCRIPT_NAMES.has(pnpmRun[1].toLowerCase())) {
    return { category: "verify", scriptName: pnpmRun[1], reason: "验证脚本" };
  }
  const yarnRun = cmd.match(/^yarn ([a-z0-9:@._/-]+)$/i);
  if (yarnRun && VERIFY_SCRIPT_NAMES.has(yarnRun[1].toLowerCase())) {
    return { category: "verify", scriptName: yarnRun[1], reason: "验证脚本" };
  }
  if (/^npm run build$/i.test(cmd) || /^npm test$/i.test(cmd)) {
    return { category: "verify", reason: "验证命令" };
  }
  if (/^git status\b/i.test(cmd) || /^git diff\b/i.test(cmd)) {
    return { category: "read", reason: "只读 Git 命令" };
  }
  return { category: "controlled", reason: "受控命令" };
}

function assertCommandAllowed(command, { allowDangerous = false, allowLongRunning = false } = {}) {
  const info = classifyCommand(command);
  if (info.category === "forbidden") {
    const err = new Error(info.reason || "命令被禁止");
    err.code = "COMMAND_FORBIDDEN";
    throw err;
  }
  if (info.category === "dangerous" && !allowDangerous) {
    const err = new Error(info.reason || "危险命令需审批");
    err.code = "COMMAND_DANGEROUS";
    throw err;
  }
  if (info.category === "long-running" && !allowLongRunning) {
    const err = new Error(info.reason || "长时间命令需审批");
    err.code = "COMMAND_LONG_RUNNING";
    throw err;
  }
  return info;
}

module.exports = {
  VERIFY_SCRIPT_NAMES,
  classifyCommand,
  assertCommandAllowed,
};
