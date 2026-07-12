/**
 * UX-006: Unified instruction / Skills / MCP extension catalog for Workbench.
 */
const fs = require("fs");
const path = require("path");
const { discoverInstructionFiles, loadProjectInstructions } = require("./instructionContextService.js");
const { loadExtensionPacks, setPackEnabled } = require("./mcpGatewayService.js");

function catalogPrefsPath(getUserDataPath) {
  return path.join(String(getUserDataPath() || ""), "wb-instruction-catalog.json");
}

function loadCatalogPrefs(getUserDataPath) {
  try {
    const p = catalogPrefsPath(getUserDataPath);
    if (!fs.existsSync(p)) return { version: 1, disabledIds: [], disabledPaths: [] };
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    return {
      version: 1,
      disabledIds: Array.isArray(raw.disabledIds) ? raw.disabledIds : [],
      disabledPaths: Array.isArray(raw.disabledPaths) ? raw.disabledPaths : [],
    };
  } catch {
    return { version: 1, disabledIds: [], disabledPaths: [] };
  }
}

function saveCatalogPrefs(getUserDataPath, prefs) {
  const p = catalogPrefsPath(getUserDataPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify({ version: 1, ...prefs }, null, 2), "utf8");
  return loadCatalogPrefs(getUserDataPath);
}

function scanSkillMarkdownDirs(appRoot) {
  const roots = [
    path.join(appRoot, ".cursor", "skills"),
    path.join(appRoot, ".agents", "skills"),
    path.join(appRoot, ".cursor", "skills-cursor"),
  ];
  const items = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const skillMd = path.join(root, ent.name, "SKILL.md");
      if (!fs.existsSync(skillMd)) continue;
      let preview = "";
      try {
        preview = fs.readFileSync(skillMd, "utf8").slice(0, 240);
      } catch {
        preview = "";
      }
      items.push({
        id: `skill:${ent.name}`,
        kind: "agent_skill",
        name: ent.name,
        path: path.relative(appRoot, skillMd).replace(/\\/g, "/"),
        trust: "system",
        priority: 4,
        preview,
      });
    }
  }
  return items.slice(0, 80);
}

function listInstructionCatalog(getUserDataPath, { projectRoot, appRoot } = {}) {
  const prefs = loadCatalogPrefs(getUserDataPath);
  const disabledIds = new Set(prefs.disabledIds || []);
  const disabledPaths = new Set(prefs.disabledPaths || []);
  const items = [];

  if (projectRoot) {
    const discovered = discoverInstructionFiles(projectRoot);
    for (const d of discovered) {
      const id = `instr:${d.path}`;
      items.push({
        id,
        kind: "project_instruction",
        name: d.path,
        path: d.path,
        scope: d.scope,
        trust: d.trust || "system",
        priority: d.priority || 5,
        enabled: !disabledIds.has(id) && !disabledPaths.has(d.path),
      });
    }
  }

  try {
    const packs = loadExtensionPacks(getUserDataPath);
    for (const pack of packs.packs || []) {
      const id = `pack:${pack.id}`;
      items.push({
        id,
        kind: "mcp_extension",
        name: pack.name || pack.id,
        path: pack.id,
        trust: pack.trust || "extension",
        priority: 7,
        enabled: Boolean(pack.enabled) && !disabledIds.has(id),
        thirdParty: Boolean(pack.thirdParty),
        tools: pack.tools || [],
      });
    }
  } catch {
    /* optional */
  }

  if (appRoot) {
    for (const s of scanSkillMarkdownDirs(appRoot)) {
      items.push({
        ...s,
        enabled: !disabledIds.has(s.id),
      });
    }
  }

  items.sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.name).localeCompare(String(b.name)));
  return {
    version: 1,
    prefs,
    items,
    counts: {
      total: items.length,
      enabled: items.filter((i) => i.enabled).length,
      instructions: items.filter((i) => i.kind === "project_instruction").length,
      packs: items.filter((i) => i.kind === "mcp_extension").length,
      skills: items.filter((i) => i.kind === "agent_skill").length,
    },
  };
}

function setCatalogItemEnabled(getUserDataPath, { id, path: itemPath, enabled, kind } = {}) {
  const prefs = loadCatalogPrefs(getUserDataPath);
  const disabledIds = new Set(prefs.disabledIds || []);
  const disabledPaths = new Set(prefs.disabledPaths || []);

  if (kind === "mcp_extension" || String(id || "").startsWith("pack:")) {
    const packId = String(id || "").replace(/^pack:/, "") || itemPath;
    setPackEnabled(getUserDataPath, packId, Boolean(enabled), {
      adminApproved: true,
    });
  }

  if (enabled) {
    if (id) disabledIds.delete(id);
    if (itemPath) disabledPaths.delete(itemPath);
  } else {
    if (id) disabledIds.add(id);
    if (itemPath) disabledPaths.add(itemPath);
  }

  return saveCatalogPrefs(getUserDataPath, {
    disabledIds: [...disabledIds],
    disabledPaths: [...disabledPaths],
  });
}

/**
 * Filter discovered instructions by catalog prefs (for context pack).
 */
function filterInstructionsByPrefs(getUserDataPath, instructions = []) {
  const prefs = loadCatalogPrefs(getUserDataPath);
  const disabledPaths = new Set(prefs.disabledPaths || []);
  const disabledIds = new Set(prefs.disabledIds || []);
  return (instructions || []).filter((ins) => {
    const p = ins.path || ins.relPath || "";
    const id = `instr:${p}`;
    return !disabledPaths.has(p) && !disabledIds.has(id);
  });
}

function previewCatalogInjection(getUserDataPath, { projectRoot } = {}) {
  if (!projectRoot) return { ok: false, text: "", files: [] };
  const loaded = loadProjectInstructions(projectRoot);
  const files = filterInstructionsByPrefs(getUserDataPath, loaded.files || []);
  const text = files
    .map((f) => `## ${f.path}\n${String(f.content || "").slice(0, 500)}`)
    .join("\n\n")
    .slice(0, 8000);
  return { ok: true, files, text, count: files.length };
}

module.exports = {
  listInstructionCatalog,
  setCatalogItemEnabled,
  loadCatalogPrefs,
  saveCatalogPrefs,
  filterInstructionsByPrefs,
  previewCatalogInjection,
  scanSkillMarkdownDirs,
};
