/** KB P0 feature gates — default on; set env VAR=0 to disable. */
function isEnabled(envKey, defaultOn = true) {
  const raw = process.env[String(envKey || "").trim()];
  if (raw === "0" || raw === "false" || raw === "off") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on") {
    return true;
  }
  return defaultOn;
}

function isKbDeleteRepairEnabled() {
  return isEnabled("KB_DELETE_REPAIR_V1", true);
}

function isKbPromptSafetyEnabled() {
  return isEnabled("KB_PROMPT_SAFETY_V1", true);
}

function isKbSourceArchiveEnabled() {
  return isEnabled("KB_SOURCE_ARCHIVE_V1", true);
}

module.exports = {
  isKbDeleteRepairEnabled,
  isKbPromptSafetyEnabled,
  isKbSourceArchiveEnabled,
};
