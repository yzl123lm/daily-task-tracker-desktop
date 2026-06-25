const path = require("path");
const fs = require("fs");
const { app, safeStorage } = require("electron");
const { readJsonFile, writeJsonFile } = require("./settingsStore.js");

function vaultPath() {
  return path.join(app.getPath("userData"), "kb-document-passwords.json");
}

function encryptPlain(plain) {
  const text = String(plain || "").trim();
  if (!text) {
    return "";
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return Buffer.from(safeStorage.encryptString(text)).toString("base64");
    } catch {
      return "";
    }
  }
  return Buffer.from(text, "utf8").toString("base64");
}

function decryptStored(stored) {
  const enc = String(stored || "").trim();
  if (!enc) {
    return "";
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(enc, "base64"));
    } catch {
      /* fall through */
    }
  }
  try {
    return Buffer.from(enc, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function readVault() {
  return readJsonFile(vaultPath(), { version: 1, byMd5: {}, byFolder: {} });
}

function writeVault(data) {
  writeJsonFile(vaultPath(), data);
}

function md5Key(fileMd5) {
  return String(fileMd5 || "").trim().toLowerCase();
}

function folderKey(dirPath) {
  const norm = path.normalize(String(dirPath || "").trim()).toLowerCase();
  return norm || "";
}

function saveDocumentPassword(fileMd5, password, folderPath) {
  const pwd = String(password || "").trim();
  if (!pwd) {
    return false;
  }
  const vault = readVault();
  const enc = encryptPlain(pwd);
  if (!enc) {
    return false;
  }
  const md5 = md5Key(fileMd5);
  if (md5) {
    vault.byMd5[md5] = { enc, updatedAt: new Date().toISOString() };
  }
  const folder = folderKey(folderPath);
  if (folder) {
    vault.byFolder[folder] = { enc, updatedAt: new Date().toISOString() };
  }
  writeVault(vault);
  return true;
}

function getPasswordsForFile(fileMd5, folderPath) {
  const vault = readVault();
  const out = [];
  const md5 = md5Key(fileMd5);
  if (md5 && vault.byMd5[md5]?.enc) {
    const pwd = decryptStored(vault.byMd5[md5].enc);
    if (pwd) {
      out.push(pwd);
    }
  }
  const folder = folderKey(folderPath);
  if (folder && vault.byFolder[folder]?.enc) {
    const pwd = decryptStored(vault.byFolder[folder].enc);
    if (pwd && !out.includes(pwd)) {
      out.push(pwd);
    }
  }
  return out;
}

function removeDocumentPassword(fileMd5, folderPath) {
  const vault = readVault();
  let changed = false;
  const md5 = md5Key(fileMd5);
  if (md5 && vault.byMd5[md5]) {
    delete vault.byMd5[md5];
    changed = true;
  }
  const folder = folderKey(folderPath);
  if (folder && vault.byFolder[folder]) {
    delete vault.byFolder[folder];
    changed = true;
  }
  if (changed) {
    writeVault(vault);
  }
  return changed;
}

module.exports = {
  saveDocumentPassword,
  getPasswordsForFile,
  removeDocumentPassword,
};
