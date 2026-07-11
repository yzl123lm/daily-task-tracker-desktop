/**
 * Kill process tree on timeout (Windows taskkill /T, Unix process group).
 * BL-008 / SEC-009
 */
const { spawnSync } = require("child_process");

function killProcessTree(pid, { signal = "SIGTERM" } = {}) {
  if (!pid || Number(pid) <= 0) return { ok: false, reason: "invalid_pid" };
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      return { ok: true, method: "taskkill" };
    }
    try {
      process.kill(-pid, signal);
      return { ok: true, method: "process_group" };
    } catch {
      process.kill(pid, signal);
      return { ok: true, method: "pid" };
    }
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  killProcessTree,
};
