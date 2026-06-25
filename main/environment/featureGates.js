const fs = require("fs");
const path = require("path");
const { readCapabilitySettings, writeCapabilitySettings } = require("../credentialSettings.js");

function applyFeatureDegradation(profile, userDataPath) {
  if (!profile || typeof profile !== "object") {
    return { applied: [], profile: null };
  }
  const applied = [];

  if (!profile.features?.kbRerank?.enabled) {
    try {
      const kbSettingsPath = path.join(userDataPath, "knowledge-base", "settings.json");
      if (fs.existsSync(kbSettingsPath)) {
        const raw = JSON.parse(fs.readFileSync(kbSettingsPath, "utf8"));
        if (raw && raw.rerankEnabled !== false) {
          raw.rerankEnabled = false;
          fs.writeFileSync(kbSettingsPath, JSON.stringify(raw, null, 2), "utf8");
          applied.push("kbRerankDisabled");
        }
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const cap = readCapabilitySettings();
    let changed = false;
    if (!profile.features?.localAsr?.enabled && cap.asrEnabled) {
      /* 不强制关闭 ASR，仅记录；云端 ASR 仍可用 */
    }
    if (!profile.features?.localTts?.enabled && cap.ttsEnabled) {
      /* 保留用户 TTS 开关 */
    }
    if (changed) {
      writeCapabilitySettings(cap);
    }
  } catch {
    /* ignore */
  }

  return { applied, profile };
}

function getFeatureGate(profile, featureKey) {
  const f = profile?.features?.[featureKey];
  return {
    enabled: f?.enabled === true,
    reason: f?.reason || "",
  };
}

module.exports = {
  applyFeatureDegradation,
  getFeatureGate,
};
