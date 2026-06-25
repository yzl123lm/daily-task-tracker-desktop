const fs = require("fs");

function readJsonFile(filePath, defaults, { merge = true } = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaults, null, 0), "utf8");
    return defaults;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!merge) {
      return raw && typeof raw === "object" ? raw : defaults;
    }
    return { ...defaults, ...(raw && typeof raw === "object" ? raw : {}) };
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(defaults, null, 0), "utf8");
    return defaults;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 0), "utf8");
}

module.exports = { readJsonFile, writeJsonFile };
