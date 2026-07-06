const path = require("path");
const { NativeGraphifyAdapter } = require("./nativeGraphifyAdapter.js");
const { GraphifyMcpClient, resolvePythonCommand, probeGraphifyMcp } = require("./mcpClientManager.js");

function createGraphifyService({ getAppRoot }) {
  const native = new NativeGraphifyAdapter(() => path.join(getAppRoot(), "graphify-out"));
  const mcpClient = new GraphifyMcpClient();
  let preferMcp = false;
  let mcpProbe = null;

  async function ensureMcpProbe() {
    if (mcpProbe) {
      return mcpProbe;
    }
    const graphJson = path.join(getAppRoot(), "graphify-out", "graph.json");
    const pythonExe = await resolvePythonCommand();
    mcpProbe = await probeGraphifyMcp(pythonExe, graphJson);
    return mcpProbe;
  }

  async function getStatus() {
    const base = native.getStatus();
    const probe = await ensureMcpProbe();
    return {
      ...base,
      mcpCapable: probe.ok,
      mcpConnected: mcpClient.connected,
      mcpPython: probe.pythonExe || "",
      mcpLastError: mcpClient.lastError || "",
      activeMode: mcpClient.connected ? "mcp" : base.available ? "native" : "none",
      preferMcp,
    };
  }

  async function tryConnectMcp() {
    const probe = await ensureMcpProbe();
    if (!probe.ok) {
      return false;
    }
    preferMcp = true;
    return mcpClient.connect(probe.pythonExe, probe.graphJsonPath);
  }

  function listOpenAiTools() {
    if (mcpClient.connected && mcpClient.listOpenAiTools().length) {
      return mcpClient.listOpenAiTools();
    }
    return native.listOpenAiTools();
  }

  async function callTool(name, args) {
    const toolName = String(name || "").trim();
    if (!toolName.startsWith("graphify_")) {
      return { ok: false, error: "非 graphify 工具" };
    }
    if (preferMcp || mcpClient.connected) {
      if (!mcpClient.connected) {
        await tryConnectMcp();
      }
      if (mcpClient.connected) {
        const out = await mcpClient.callTool(toolName, args);
        if (out.ok) {
          return out;
        }
      }
    }
    return native.callTool(toolName, args);
  }

  async function shutdown() {
    await mcpClient.disconnect();
    mcpProbe = null;
    preferMcp = false;
  }

  return {
    getStatus,
    tryConnectMcp,
    listOpenAiTools,
    callTool,
    shutdown,
    isToolAvailable: () => native.isAvailable(),
  };
}

module.exports = { createGraphifyService };
