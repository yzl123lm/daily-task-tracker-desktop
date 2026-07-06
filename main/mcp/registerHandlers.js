const { createGraphifyService } = require("./graphifyService.js");

function registerMcpHandlers(ipcMain, { getAppRoot }) {
  const graphify = createGraphifyService({ getAppRoot });

  ipcMain.handle("graphify-status-get", async () => graphify.getStatus());

  ipcMain.handle("graphify-tools-list", async () => ({
    ok: true,
    tools: graphify.listOpenAiTools(),
    available: graphify.isToolAvailable(),
  }));

  ipcMain.handle("graphify-tool-call", async (_event, payload) => {
    const name = String(payload?.name || payload?.tool || "").trim();
    const args = payload?.args && typeof payload.args === "object" ? payload.args : {};
    if (!name) {
      return { ok: false, error: "缺少工具名" };
    }
    return graphify.callTool(name, args);
  });

  ipcMain.handle("graphify-mcp-connect", async () => {
    const ok = await graphify.tryConnectMcp();
    return { ok, status: await graphify.getStatus() };
  });

  return {
    shutdownMcp: () => graphify.shutdown(),
  };
}

module.exports = { registerMcpHandlers };
