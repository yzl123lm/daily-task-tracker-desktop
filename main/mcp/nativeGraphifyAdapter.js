const fs = require("fs");
const path = require("path");

const GRAPHIFY_TOOLS = [
  {
    name: "graphify_query_graph",
    description:
      "在 graphify 代码库知识图谱中按自然语言问题检索相关节点与邻域（BFS）。需已生成 graphify-out/graph.json。",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "架构/模块/依赖相关问题" },
        budget: { type: "number", description: "返回摘要大致字符上限，默认 4000" },
      },
      required: ["question"],
    },
  },
  {
    name: "graphify_get_node",
    description: "按节点 id 获取 graphify 图谱中的节点详情与一度邻居。",
    parameters: {
      type: "object",
      properties: {
        node_id: { type: "string", description: "graphify 节点 id" },
      },
      required: ["node_id"],
    },
  },
  {
    name: "graphify_god_nodes",
    description: "返回 graphify 图谱中度数最高的枢纽节点（god nodes），用于理解架构核心。",
    parameters: { type: "object", properties: { limit: { type: "number", description: "返回条数，默认 15" } } },
  },
  {
    name: "graphify_graph_stats",
    description: "返回 graphify-out 图谱统计：节点数、边数、是否可读 GRAPH_REPORT。",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "graphify_shortest_path",
    description: "在 graphify 无向图中求两节点间最短路径。",
    parameters: {
      type: "object",
      properties: {
        source: { type: "string", description: "起点节点 id 或 label 关键词" },
        target: { type: "string", description: "终点节点 id 或 label 关键词" },
      },
      required: ["source", "target"],
    },
  },
];

function normalizeToken(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ");
}

function tokenize(s) {
  return normalizeToken(s)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

class NativeGraphifyAdapter {
  constructor(getGraphifyOutDir) {
    this.getGraphifyOutDir = getGraphifyOutDir;
    this.cache = null;
  }

  getPaths() {
    const root = this.getGraphifyOutDir();
    return {
      root,
      graphJson: path.join(root, "graph.json"),
      reportMd: path.join(root, "GRAPH_REPORT.md"),
    };
  }

  isAvailable() {
    const { graphJson } = this.getPaths();
    return fs.existsSync(graphJson);
  }

  loadGraph() {
    const { graphJson, reportMd, root } = this.getPaths();
    if (!fs.existsSync(graphJson)) {
      return null;
    }
    const stat = fs.statSync(graphJson);
    if (this.cache && this.cache.mtimeMs === stat.mtimeMs) {
      return this.cache.data;
    }
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(graphJson, "utf8"));
    } catch {
      return null;
    }
    const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const edges = Array.isArray(raw.edges) ? raw.edges : [];
    const byId = new Map();
    nodes.forEach((n) => {
      if (n && n.id) {
        byId.set(String(n.id), n);
      }
    });
    const adj = new Map();
    const addEdge = (a, b, edge) => {
      if (!adj.has(a)) {
        adj.set(a, []);
      }
      adj.get(a).push({ id: b, relation: edge?.relation || "", confidence: edge?.confidence || "" });
    };
    edges.forEach((e) => {
      const s = String(e?.source || "");
      const t = String(e?.target || "");
      if (!s || !t) {
        return;
      }
      addEdge(s, t, e);
      addEdge(t, s, e);
    });
    let reportExcerpt = "";
    if (fs.existsSync(reportMd)) {
      reportExcerpt = fs.readFileSync(reportMd, "utf8").slice(0, 2000);
    }
    const data = {
      root,
      graphJson,
      nodes,
      edges,
      byId,
      adj,
      reportExcerpt,
    };
    this.cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  }

  resolveNodeId(ref, graph) {
    const key = String(ref || "").trim();
    if (!key || !graph) {
      return "";
    }
    if (graph.byId.has(key)) {
      return key;
    }
    const lower = key.toLowerCase();
    const byLabel = graph.nodes.find((n) => String(n.label || "").toLowerCase() === lower);
    if (byLabel) {
      return String(byLabel.id);
    }
    const partial = graph.nodes.find(
      (n) =>
        String(n.id || "").toLowerCase().includes(lower) ||
        String(n.label || "").toLowerCase().includes(lower)
    );
    return partial ? String(partial.id) : "";
  }

  listOpenAiTools() {
    return GRAPHIFY_TOOLS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  getStatus() {
    const paths = this.getPaths();
    const graph = this.loadGraph();
    return {
      mode: "native",
      available: Boolean(graph),
      graphPath: paths.graphJson,
      graphifyOutDir: paths.root,
      nodeCount: graph?.nodes?.length || 0,
      edgeCount: graph?.edges?.length || 0,
      hasReport: fs.existsSync(paths.reportMd),
      hint: graph
        ? "已加载 graphify-out 图谱（本地 native 适配）"
        : `未找到 ${paths.graphJson}，请在本项目根目录运行 graphify 流水线`,
    };
  }

  bfsContext(startIds, graph, maxNodes = 24) {
    const seen = new Set();
    const queue = [...startIds];
    const out = [];
    while (queue.length && out.length < maxNodes) {
      const id = queue.shift();
      if (!id || seen.has(id)) {
        continue;
      }
      seen.add(id);
      const node = graph.byId.get(id);
      if (node) {
        out.push(node);
      }
      (graph.adj.get(id) || []).forEach((nb) => {
        if (!seen.has(nb.id)) {
          queue.push(nb.id);
        }
      });
    }
    return out;
  }

  callTool(name, args) {
    const graph = this.loadGraph();
    if (!graph) {
      return {
        ok: false,
        error: "graphify-out/graph.json 不存在，请先在项目根执行 graphify 流水线",
      };
    }
    const a = args && typeof args === "object" ? args : {};
    switch (name) {
      case "graphify_query_graph": {
        const question = String(a.question || a.query || "").trim();
        if (!question) {
          return { ok: false, error: "缺少 question" };
        }
        const budget = Math.max(800, Math.min(12000, Number(a.budget) || 4000));
        const qTokens = tokenize(question);
        const scored = graph.nodes
          .map((n) => {
            const hay = normalizeToken(`${n.id} ${n.label || ""} ${n.source_file || ""}`);
            let score = 0;
            qTokens.forEach((t) => {
              if (hay.includes(t)) {
                score += 1;
              }
            });
            return { n, score };
          })
          .filter((x) => x.score > 0)
          .sort((x, y) => y.score - x.score)
          .slice(0, 8);
        const seeds = scored.length ? scored.map((x) => String(x.n.id)) : graph.nodes.slice(0, 3).map((n) => String(n.id));
        const contextNodes = this.bfsContext(seeds, graph, 20);
        const lines = contextNodes.map((n) => {
          const nbs = (graph.adj.get(String(n.id)) || [])
            .slice(0, 6)
            .map((x) => `${x.id}(${x.relation || "rel"})`)
            .join(", ");
          return `- ${n.id} | ${n.label || ""} | ${n.source_file || ""}${nbs ? ` → ${nbs}` : ""}`;
        });
        let text = `问题: ${question}\n匹配种子: ${seeds.join(", ")}\n\n相关节点:\n${lines.join("\n")}`;
        if (graph.reportExcerpt) {
          text += `\n\nGRAPH_REPORT 摘要:\n${graph.reportExcerpt.slice(0, Math.min(1200, budget - text.length))}`;
        }
        if (text.length > budget) {
          text = `${text.slice(0, budget)}\n…(已截断)`;
        }
        return { ok: true, mode: "native", question, nodeCount: contextNodes.length, result: text };
      }
      case "graphify_get_node": {
        const nodeId = this.resolveNodeId(a.node_id || a.nodeId || a.id, graph);
        if (!nodeId) {
          return { ok: false, error: "未找到节点" };
        }
        const node = graph.byId.get(nodeId);
        const neighbors = (graph.adj.get(nodeId) || []).slice(0, 20).map((nb) => {
          const nn = graph.byId.get(nb.id);
          return {
            id: nb.id,
            label: nn?.label || "",
            relation: nb.relation,
            confidence: nb.confidence,
          };
        });
        return { ok: true, mode: "native", node, neighbors };
      }
      case "graphify_god_nodes": {
        const limit = Math.max(1, Math.min(50, Number(a.limit) || 15));
        const ranked = [...graph.adj.entries()]
          .map(([id, list]) => ({ id, degree: list.length, node: graph.byId.get(id) }))
          .sort((x, y) => y.degree - x.degree)
          .slice(0, limit)
          .map((x) => ({
            id: x.id,
            label: x.node?.label || "",
            degree: x.degree,
            source_file: x.node?.source_file || "",
          }));
        return { ok: true, mode: "native", godNodes: ranked };
      }
      case "graphify_graph_stats": {
        return {
          ok: true,
          mode: "native",
          nodeCount: graph.nodes.length,
          edgeCount: graph.edges.length,
          graphPath: graph.graphJson,
          hasReport: Boolean(graph.reportExcerpt),
          reportPreview: graph.reportExcerpt.slice(0, 500),
        };
      }
      case "graphify_shortest_path": {
        const src = this.resolveNodeId(a.source, graph);
        const tgt = this.resolveNodeId(a.target, graph);
        if (!src || !tgt) {
          return { ok: false, error: "无法解析 source/target 节点" };
        }
        if (src === tgt) {
          return { ok: true, mode: "native", path: [src] };
        }
        const prev = new Map();
        const q = [src];
        prev.set(src, null);
        let found = false;
        while (q.length) {
          const cur = q.shift();
          if (cur === tgt) {
            found = true;
            break;
          }
          (graph.adj.get(cur) || []).forEach((nb) => {
            if (!prev.has(nb.id)) {
              prev.set(nb.id, cur);
              q.push(nb.id);
            }
          });
        }
        if (!found) {
          return { ok: false, error: "两节点之间无路径" };
        }
        const pathIds = [];
        let walk = tgt;
        while (walk) {
          pathIds.unshift(walk);
          walk = prev.get(walk);
        }
        return {
          ok: true,
          mode: "native",
          path: pathIds.map((id) => ({
            id,
            label: graph.byId.get(id)?.label || "",
          })),
        };
      }
      default:
        return { ok: false, error: `未知 graphify 工具: ${name}` };
    }
  }
}

module.exports = { NativeGraphifyAdapter, GRAPHIFY_TOOLS };
