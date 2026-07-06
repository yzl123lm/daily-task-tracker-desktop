const { execFile } = require("child_process");
const path = require("path");
const fs = require("fs");

const MCP_TOOL_MAP = {
  query_graph: "graphify_query_graph",
  get_node: "graphify_get_node",
  get_neighbors: "graphify_get_node",
  god_nodes: "graphify_god_nodes",
  graph_stats: "graphify_graph_stats",
  shortest_path: "graphify_shortest_path",
};

function execFilePromise(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true, ...opts }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(String(stderr || err.message || err));
        e.code = err.code;
        reject(e);
        return;
      }
      resolve(String(stdout || ""));
    });
  });
}

async function resolvePythonCommand() {
  const candidates = ["python", "python3", "py"];
  for (const cmd of candidates) {
    try {
      const out = await execFilePromise(cmd, ["-c", "import sys; print(sys.executable)"], { timeout: 8000 });
      const exe = out.trim().split(/\r?\n/).pop();
      if (exe) {
        return exe;
      }
    } catch {
      /* try next */
    }
  }
  return "";
}

async function probeGraphifyMcp(pythonExe, graphJsonPath) {
  if (!pythonExe || !graphJsonPath || !fs.existsSync(graphJsonPath)) {
    return { ok: false, reason: "missing-python-or-graph" };
  }
  try {
    await execFilePromise(pythonExe, ["-c", "import graphify"], { timeout: 12000 });
  } catch {
    return { ok: false, reason: "graphify-not-installed" };
  }
  return { ok: true, pythonExe, graphJsonPath };
}

class GraphifyMcpClient {
  constructor() {
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.tools = [];
    this.lastError = "";
  }

  async connect(pythonExe, graphJsonPath) {
    if (this.connected) {
      return true;
    }
    try {
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      this.transport = new StdioClientTransport({
        command: pythonExe,
        args: ["-m", "graphify.serve", path.resolve(graphJsonPath)],
        stderr: "pipe",
      });
      this.client = new Client({ name: "jingluo-ai", version: "1.0.0" });
      await this.client.connect(this.transport);
      const listed = await this.client.listTools();
      this.tools = listed?.tools || [];
      this.connected = true;
      this.lastError = "";
      return true;
    } catch (err) {
      this.lastError = String(err?.message || err);
      await this.disconnect();
      return false;
    }
  }

  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
      }
    } catch {
      /* ignore */
    }
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.tools = [];
  }

  listOpenAiTools() {
    return this.tools
      .map((t) => {
        const mapped = MCP_TOOL_MAP[t.name];
        if (!mapped) {
          return null;
        }
        return {
          type: "function",
          function: {
            name: mapped,
            description: `[MCP graphify] ${t.description || t.name}`,
            parameters: t.inputSchema || { type: "object", properties: {} },
          },
        };
      })
      .filter(Boolean);
  }

  async callTool(openAiName, args) {
    if (!this.connected || !this.client) {
      return { ok: false, error: "MCP 未连接" };
    }
    const entry = Object.entries(MCP_TOOL_MAP).find(([, v]) => v === openAiName);
    const mcpName = entry ? entry[0] : "";
    if (!mcpName) {
      return { ok: false, error: `MCP 不支持工具 ${openAiName}` };
    }
    const payload = { ...args };
    if (mcpName === "query_graph" && payload.question && !payload.query) {
      payload.query = payload.question;
    }
    if (mcpName === "get_node" && payload.node_id && !payload.nodeId) {
      payload.nodeId = payload.node_id;
    }
    try {
      const result = await this.client.callTool({ name: mcpName, arguments: payload });
      const textParts = (result?.content || [])
        .filter((c) => c && c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return { ok: !result?.isError, mode: "mcp", result: textParts || result, raw: result };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }
}

module.exports = {
  GraphifyMcpClient,
  resolvePythonCommand,
  probeGraphifyMcp,
  MCP_TOOL_MAP,
};
