/**
 * A3 project policy — trusted workspace gates (opt-in, default ASSISTED_DEV).
 *
 * TRUSTED_WORKSPACE enables:
 *   - autoApplyFixPatches: FixLoop may apply in-scope fix patches without Diff UI
 *   - draft PR create (still requires explicit userApproved at IPC for network)
 */
const PERMISSION_MODE = {
  ASSISTED_DEV: "ASSISTED_DEV",
  TRUSTED_WORKSPACE: "TRUSTED_WORKSPACE",
};

function normalizePermissionMode(mode) {
  const m = String(mode || PERMISSION_MODE.ASSISTED_DEV).trim().toUpperCase();
  if (m === PERMISSION_MODE.TRUSTED_WORKSPACE || m === "TRUSTED") {
    return PERMISSION_MODE.TRUSTED_WORKSPACE;
  }
  return PERMISSION_MODE.ASSISTED_DEV;
}

function isTrustedWorkspace(projectOrMode) {
  const mode =
    typeof projectOrMode === "string"
      ? projectOrMode
      : projectOrMode?.permissionMode || projectOrMode?.permission_mode;
  return normalizePermissionMode(mode) === PERMISSION_MODE.TRUSTED_WORKSPACE;
}

/**
 * Spec: optional autoApplyFixPatches on trusted projects only.
 * Env WB_A3_AUTO_APPLY=0 disables even for trusted.
 */
function allowsAutoApplyFixPatches(project) {
  if (String(process.env.WB_A3_AUTO_APPLY || "1") === "0") {
    return false;
  }
  return isTrustedWorkspace(project);
}

module.exports = {
  PERMISSION_MODE,
  normalizePermissionMode,
  isTrustedWorkspace,
  allowsAutoApplyFixPatches,
};
