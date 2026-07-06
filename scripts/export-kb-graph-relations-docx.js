/**
 * 导出「知识图谱关系关联机制」Word 文档
 * 运行：node scripts/export-kb-graph-relations-docx.js
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} = require("docx");

const OUT_PATH = path.join(__dirname, "..", "知识图谱关系关联机制说明.docx");
const GENERATED_AT = new Date().toISOString().slice(0, 10);

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text, ...opts })],
  });
}

function bullet(text) {
  return new Paragraph({
    text,
    bullet: { level: 0 },
    spacing: { after: 80 },
  });
}

function tableFromRows(rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cells, ri) =>
      new TableRow({
        children: cells.map((text, ci) =>
          new TableCell({
            borders,
            width: widths && widths[ci] ? { size: widths[ci], type: WidthType.PERCENTAGE } : undefined,
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: String(text),
                    bold: ri === 0,
                  }),
                ],
              }),
            ],
          })
        ),
      })
    ),
  });
}

function spacer() {
  return new Paragraph({ spacing: { after: 80 } });
}

const doc = new Document({
  creator: "鲸落AI",
  title: "知识图谱关系关联机制说明",
  description: "鲸落AI 项目内两套知识图谱的关系关联方式详解",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "知识图谱关系关联机制说明", bold: true, size: 36 }),
          ],
        }),
        para(`生成日期：${GENERATED_AT}`, { italics: true, color: "666666" }),
        para("项目：daily-task-tracker-desktop（鲸落AI 桌面客户端）", { italics: true, color: "666666" }),
        spacer(),

        heading("一、概述"),
        para(
          "本项目内存在两套彼此独立的知识图谱，关系关联方式完全不同，不可混用：① 知识库内置业务图谱（规则抽取，服务于资料浏览）；② graphify 代码库图谱（LLM 抽取，服务于开发辅助与架构理解）。"
        ),

        heading("二、知识库内置业务图谱"),
        para(
          "核心实现在 knowledgeBaseMain.js 的 buildKnowledgeGraphSnapshot 函数。该函数基于已入库的 documents[] 与 chunks[] 全文，通过正则、标题解析、文件名别名匹配等规则抽取节点与边，不使用 LLM，也不连接 Neo4j 等外部图数据库。"
        ),

        heading("2.1 数据流", HeadingLevel.HEADING_2),
        bullet("输入：documents[]（文档元数据）+ chunks[]（分块全文，由 collectDocTextById 按 docId 拼接）"),
        bullet("构建：buildKnowledgeGraphSnapshot(store) → { nodes, edges, summary }"),
        bullet("缓存（单库）：ensureGraphSnapshot — signature = 文档数:分块数:g2，写入 store.graph"),
        bullet("缓存（全局）：ensureGlobalGraphSnapshot — 合并多库，写入 global-graph.json"),
        bullet("IPC：kb-graph-snapshot（读取）、kb-graph-rebuild（强制重建）"),
        bullet("渲染：knowledgeBase.js 通过 SVG + 力导向/聚类布局展示"),

        heading("2.2 节点 ID 约定", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["节点类型", "ID 格式", "含义"],
            ["doc", "doc:<docId>", "每个入库文档一条"],
            ["section", "sec:<docId>:<序号>", "Markdown # 标题或编号标题"],
            ["folder", "folder:<别名前48字符>", "同 sourcePath 目录下的文档聚合"],
            ["concept", "code:<协议码>", "多个文档共享同一协议编号时"],
          ],
          [18, 32, 50]
        ),

        heading("2.3 边关联核心机制（addEdge）", HeadingLevel.HEADING_2),
        para("所有关系均通过内部 addEdge(source, target, type, weight) 写入，规则如下："),
        bullet("自环过滤：source === target 时不建边"),
        bullet("无向规范化：source/target 按字符串字典序排序，较小者作为 source"),
        bullet("去重键：edge.id = 较小节点__较大节点__类型（如 doc:a__doc:b__wiki-link）"),
        bullet("重复累加：同键边再次出现时 weight 累加，不新建边"),
        bullet("节点权重：每条边的 weight 累加到两端节点度数；度数越高节点越「重要」，summary.topNodes 取前 12"),

        heading("2.4 文档别名匹配（normalizeDocAlias）", HeadingLevel.HEADING_2),
        para("Wiki 链接、Markdown 链接、文档互引均依赖别名表 aliasToDocId，别名由文档名经以下规则生成："),
        bullet("转小写、去首尾空白"),
        bullet("去掉文件扩展名（.md、.docx 等）"),
        bullet("去掉引号、括号等标点"),
        bullet("去掉所有空白字符"),
        para("示例：「API 规范 v2.0.md」→ api规范v2.0"),

        heading("2.5 全部边类型与发现规则", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["边类型", "关联方式", "权重", "触发条件 / 备注"],
            ["contains", "文档 → 章节", "1", "extractStructuredHeadings 解析 Markdown # 或编号标题"],
            ["flow", "章节 → 下一章节", "1", "同文档内章节顺序链"],
            ["wiki-link", "文档 → 文档", "2", "正则 [[...]]，别名命中 aliasToDocId，排除自链"],
            ["md-link", "文档 → 文档", "1", "正则 [...](path)，basename 别名匹配库内文档，排除 http/mailto"],
            ["mention", "文档 → 文档", "1", "normalizeDocAlias 后全文包含其他文档名；仅当库内文档数 ≤ 80"],
            ["code-ref", "文档 → 文档", "2", "A 正文含 B 的主协议码（来自 B 的文件名/路径）"],
            ["same-protocol", "文档 ↔ 文档", "2", "多个文档共享同一主协议码，两两建边"],
            ["has-code", "文档 → code:xxx", "1", "2–12 篇共享同一码时建概念节点并连边"],
            ["same-folder", "文档 → folder 节点", "1", "sourcePath 同目录下的文档"],
            ["folder-seq", "文档 → 文档", "1", "同目录内相邻文档顺序；目录内文档数 ≤ 24"],
            ["shared-keyword", "文档 ↔ 文档", "1–3", "关键词 token 交集 ≥ 2；仅当库内文档数 ≤ 120"],
          ],
          [14, 22, 8, 56]
        ),
        spacer(),
        para("协议码抽取（extractDocumentReferenceCodes，位于 utils/kbRetrieval.js）：", { bold: true }),
        bullet("匹配 [xxx-yyy] 方括号形式"),
        bullet("匹配 xxx-P123456 等平台编号"),
        bullet("匹配 xxx-12345 等数字编号"),
        bullet("格式要求：至少 5 字符，符合 [a-z]{2,15}-[a-z0-9-]{2,25} 模式"),

        heading("2.6 关键词共现（shared-keyword）", HeadingLevel.HEADING_2),
        para("extractDocKeywordTokens 从文档名与前 4000 字正文提取 token："),
        bullet("协议码（小写）"),
        bullet("2–8 字中文词（排除 GRAPH_PROTOCOL_STOPWORDS 停用词，如「文档」「协议」「规范」等）"),
        bullet("3 字以上英文词（小写）"),
        para("两文档 token 交集 ≥ 2 时建 shared-keyword 边，weight = min(3, 交集数量)。"),

        heading("2.7 前端关系遍历与展示", HeadingLevel.HEADING_2),
        bullet("selectGraphDisplayNodes：按 weight 截断，最多约 36 文档节点 + 240 边"),
        bullet("buildGraphAdjacency(edges)：构建无向邻接表（source/target 双向可达）"),
        bullet("updateGraphDetailPanel：点击节点时用邻接表展示关联邻居（最多 8 个）"),
        bullet("graphEdgeRank：边显示优先级 code-ref(6) > same-protocol(5) > shared-keyword/same-folder(4) > … > flow(1)"),
        bullet("布局：有结构边时用力导向模拟 + 聚类初始布局；否则用网格布局"),
        bullet("选项：全局图谱、仅文档节点、保留布局、重建图谱、全屏等"),

        heading("2.8 与检索的关系", HeadingLevel.HEADING_2),
        para(
          "内置图谱是辅助浏览与关系发现功能，不参与 kb-search 召回排序主路径。检索仍走向量（LanceDB + bge-m3）+ 关键词 + BM25 + bge-reranker 重排序。"
        ),

        heading("三、graphify 代码库图谱（开发辅助）"),
        para(
          "独立于业务知识库，由 Python 包 graphifyy（Cursor/Claude Skill「graphify」）对整仓代码/文档运行 LLM 实体关系抽取，输出至 graphify-out/ 目录。"
        ),
        tableFromRows(
          [
            ["维度", "graphify（代码库图谱）", "知识库内置图谱"],
            ["输入", "代码、文档、论文、URL 等任意文件夹", "已入库的 documents/chunks"],
            ["抽取", "LLM 实体关系 + EXTRACTED/INFERRED/AMBIGUOUS 审计", "正则 + 标题解析 + 文件名别名"],
            ["输出", "graph.json、GRAPH_REPORT.md、HTML、wiki/", "store.graph / global-graph.json + SVG UI"],
            ["社区发现", "聚类算法划分 community", "无（仅度数权重）"],
            ["检索", "BFS/DFS 图遍历（/graphify query）", "kb-search 向量检索（与图谱无关）"],
            ["增量", "--update / --watch 代码变更重建", "入库或 kb-graph-rebuild 触发"],
          ],
          [16, 42, 42]
        ),
        spacer(),
        para("当前工作区 graphify-out/ 统计（2026-07-02）：2089 节点 · 12522 边 · 152 个社区 · 100% EXTRACTED。"),

        heading("四、关系关联示意"),
        para("业务图谱典型关联结构：", { bold: true }),
        bullet("文档 A ──contains──> 章节 A:1 ──flow──> 章节 A:2"),
        bullet("文档 A ──wiki-link / md-link / mention──> 文档 B"),
        bullet("文档 A ──code-ref──> 文档 B（B 的协议码出现在 A 正文中）"),
        bullet("文档 A、B ──same-protocol──> 共享协议码"),
        bullet("文档 A、B ──same-folder──> 目录节点 folder:xxx"),
        bullet("文档 A、B ──has-code──> 概念节点 code:协议码"),

        heading("五、关键源码索引"),
        tableFromRows(
          [
            ["文件", "职责"],
            ["knowledgeBaseMain.js", "buildKnowledgeGraphSnapshot、ensureGraphSnapshot、ensureGlobalGraphSnapshot、IPC"],
            ["knowledgeBase.js", "SVG 渲染、邻接表、力导向模拟、图谱 UI 交互"],
            ["utils/kbRetrieval.js", "extractDocumentReferenceCodes、检索相关工具"],
            ["scripts/export-kb-architecture-docx.js", "完整架构报告 Word 导出"],
            ["graphify-out/GRAPH_REPORT.md", "代码库图谱统计与社区导航"],
          ],
          [32, 68]
        ),

        heading("六、总结"),
        bullet("业务知识图谱：规则驱动，边通过 source/target/type 三元组去重；文档间主要靠 Wiki/Markdown 链接、别名匹配、协议码引用、同目录与关键词共现关联。"),
        bullet("graphify 图谱：LLM 驱动，面向代码仓库，与知识库 UI 及 kb-search 无数据打通。"),
        bullet("两类图谱均不参与用户检索主链路，图谱功能定位为关系浏览与架构理解辅助。"),
        spacer(),
        para("—— 报告结束 ——", { italics: true, color: "888888" }),
      ],
    },
  ],
});

async function main() {
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buf);
  console.log(`已生成：${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
