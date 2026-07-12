/**
 * BL-021 / TOOL-010 + UX-008: MCP gateway + versioned extension packs for Workbench.
 * MCP tools use independent permission domain, timeout, and trust labels (not Shell sandbox).
 */
const fs = require("fs");
const path = require("path");
const { createGraphifyService } = require("../mcp/graphifyService.js");

const TRUST = {
  SYSTEM: "system",
  UNTRUSTED_MCP: "untrusted_mcp",
  EXTENSION: "extension",
};

const DEFAULT_MCP_TIMEOUT_MS = Number(process.env.WB_MCP_TOOL_TIMEOUT_MS || 8000);

let graphifySingleton = null;
let getAppRootFn = null;

function mcpAgentEnabled() {
  return String(process.env.WB_AGENT_MCP || "1") !== "0";
}

function configureMcpGateway({ getAppRoot } = {}) {
  if (typeof getAppRoot === "function") {
    getAppRootFn = getAppRoot;
    graphifySingleton = null;
  }
}

function getGraphify() {
  if (!graphifySingleton) {
    const getAppRoot =
      getAppRootFn ||
      (() => {
        try {
          return require("electron").app.getAppPath();
        } catch {
          return process.cwd();
        }
      });
    graphifySingleton = createGraphifyService({ getAppRoot });
  }
  return graphifySingleton;
}

function packsPath(getUserDataPath) {
  return path.join(String(getUserDataPath() || ""), "wb-extension-packs.json");
}

function defaultPacks() {
  return {
    version: 1,
    packs: [
      {
        id: "graphify-mcp",
        kind: "mcp",
        name: "graphify 代码库图谱",
        version: "1.0.0",
        enabled: true,
        thirdParty: false,
        permissions: ["MCP_READ"],
        compatibility: { workbench: ">=1.24.0" },
        tools: [
          "graphify_query_graph",
          "graphify_get_node",
          "graphify_god_nodes",
          "graphify_list_communities",
          "graphify_community_report",
        ],
        trust: TRUST.SYSTEM,
        timeoutMs: DEFAULT_MCP_TIMEOUT_MS,
      },
      {
        id: "sample-third-party-mcp",
        kind: "mcp",
        name: "示例第三方 MCP（默认禁用）",
        version: "0.0.1",
        enabled: false,
        thirdParty: true,
        permissions: ["MCP_READ"],
        compatibility: { workbench: ">=1.24.0" },
        tools: [],
        trust: TRUST.UNTRUSTED_MCP,
        timeoutMs: DEFAULT_MCP_TIMEOUT_MS,
      },
    ],
  };
}

function loadExtensionPacks(getUserDataPath) {
  const file = packsPath(getUserDataPath);
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      if (raw && Array.isArray(raw.packs)) {
        return raw;
      }
    }
  } catch {
    /* fall through */
  }
  const defaults = defaultPacks();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(defaults, null, 2), "utf8");
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveExtensionPacks(getUserDataPath, data) {
  const file = packsPath(getUserDataPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    version: 1,
    packs: Array.isArray(data?.packs) ? data.packs : defaultPacks().packs,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

/**
 * Enable/disable pack. Third-party requires adminApproved=true (TOOL-010 / UX-008).
 */
function setPackEnabled(getUserDataPath, packId, enabled, { adminApproved = false } = {}) {
  const data = loadExtensionPacks(getUserDataPath);
  const pack = data.packs.find((p) => p.id === packId);
  if (!pack) {
    const err = new Error(`扩展包不存在: ${packId}`);
    err.code = "PACK_NOT_FOUND";
    throw err;
  }
  if (pack.thirdParty && enabled && !adminApproved) {
    const err = new Error("第三方 MCP/扩展需管理员批准后才能启用");
    err.code = "ADMIN_APPROVAL_REQUIRED";
    throw err;
  }
  pack.enabled = Boolean(enabled);
  pack.updatedAt = new Date().toISOString();
  return saveExtensionPacks(getUserDataPath, data);
}

function listEnabledMcpPacks(getUserDataPath) {
  return loadExtensionPacks(getUserDataPath).packs.filter(
    (p) => p.kind === "mcp" && p.enabled && Array.isArray(p.tools)
  );
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`MCP 工具超时 (${ms}ms)`);
        err.code = "MCP_TIMEOUT";
        reject(err);
      }, ms);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * ObservationEnvelope for MCP results (TOOL-011-lite + TOOL-010 trust label).
 */
function wrapObservation({ ok, trust, source, packId, toolName, data, error, timedOut }) {
  return {
    ok: Boolean(ok),
    trust: trust || TRUST.UNTRUSTED_MCP,
    source: source || "mcp",
    packId: packId || null,
    toolName: toolName || null,
    permissionDomain: "MCP_READ",
    inheritsShellSandbox: false,
    timedOut: Boolean(timedOut),
    data: data ?? null,
    error: error || null,
    retryHint: timedOut ? "增大 WB_MCP_TOOL_TIMEOUT_MS 或检查 MCP 服务" : null,
  };
}

function listMcpToolSchemas(getUserDataPath) {
  if (!mcpAgentEnabled()) return [];
  const packs = listEnabledMcpPacks(getUserDataPath);
  const schemas = [];
  for (const pack of packs) {
    for (const toolName of pack.tools || []) {
      schemas.push({
        type: "function",
        function: {
          name: toolName,
          description: `[MCP:${pack.id} trust=${pack.trust || TRUST.UNTRUSTED_MCP}] ${toolName}`,
          parameters: { type: "object", properties: {}, additionalProperties: true },
        },
        _mcp: {
          packId: pack.id,
          trust: pack.trust || TRUST.UNTRUSTED_MCP,
          timeoutMs: pack.timeoutMs || DEFAULT_MCP_TIMEOUT_MS,
          permissionDomain: "MCP_READ",
        },
      });
    }
  }
  return schemas;
}

function findPackForTool(getUserDataPath, toolName) {
  const packs = listEnabledMcpPacks(getUserDataPath);
  return packs.find((p) => (p.tools || []).includes(toolName)) || null;
}

function isMcpToolName(name) {
  return String(name || "").startsWith("graphify_") || String(name || "").startsWith("mcp_");
}

async function callMcpTool(getUserDataPath, toolName, args = {}, { appRoot } = {}) {
  if (!mcpAgentEnabled()) {
    return wrapObservation({
      ok: false,
      trust: TRUST.SYSTEM,
      toolName,
      error: "Workbench MCP 已禁用 (WB_AGENT_MCP=0)",
    });
  }
  const pack = findPackForTool(getUserDataPath, toolName);
  if (!pack) {
    return wrapObservation({
      ok: false,
      trust: TRUST.UNTRUSTED_MCP,
      toolName,
      error: `MCP 工具未启用或不存在: ${toolName}`,
    });
  }
  if (appRoot && typeof getAppRootFn !== "function") {
    configureMcpGateway({ getAppRoot: () => appRoot });
  }
  const timeoutMs = pack.timeoutMs || DEFAULT_MCP_TIMEOUT_MS;
  try {
    const graphify = getGraphify();
    const raw = await withTimeout(graphify.callTool(toolName, args || {}), timeoutMs);
    return wrapObservation({
      ok: Boolean(raw?.ok !== false),
      trust: pack.trust || TRUST.SYSTEM,
      source: "mcp_gateway",
      packId: pack.id,
      toolName,
      data: raw,
      error: raw?.ok === false ? raw.error || "MCP 调用失败" : null,
    });
  } catch (err) {
    return wrapObservation({
      ok: false,
      trust: pack.trust || TRUST.UNTRUSTED_MCP,
      source: "mcp_gateway",
      packId: pack.id,
      toolName,
      error: err?.message || "MCP 调用异常",
      timedOut: err?.code === "MCP_TIMEOUT",
    });
  }
}

async function getMcpGatewayStatus(getUserDataPath) {
  const packs = loadExtensionPacks(getUserDataPath);
  let graphifyStatus = null;
  try {
    graphifyStatus = await getGraphify().getStatus();
  } catch (err) {
    graphifyStatus = { error: err.message };
  }
  return {
    enabled: mcpAgentEnabled(),
    packs: packs.packs,
    tools: listMcpToolSchemas(getUserDataPath).map((s) => s.function.name),
    graphify: graphifyStatus,
  };
}

module.exports = {
  TRUST,
  mcpAgentEnabled,
  configureMcpGateway,
  loadExtensionPacks,
  saveExtensionPacks,
  setPackEnabled,
  listEnabledMcpPacks,
  listMcpToolSchemas,
  isMcpToolName,
  callMcpTool,
  getMcpGatewayStatus,
  wrapObservation,
  findPackForTool,
};
