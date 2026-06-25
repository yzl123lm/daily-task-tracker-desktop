/**
 * 导出「本地知识库架构与知识图谱能力」详细 Word 文档
 * 运行：node scripts/export-kb-architecture-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "本地知识库架构与知识图谱报告.docx");
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
  title: "本地知识库架构与知识图谱报告",
  description: "鲸落AI 桌面客户端本地知识库技术架构、模型选型与知识图谱能力说明",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "鲸落AI 本地知识库架构与知识图谱报告", bold: true, size: 36 }),
          ],
        }),
        para(`生成日期：${GENERATED_AT}`, { italics: true, color: "666666" }),
        para("项目：daily-task-tracker-desktop（鲸落AI 桌面客户端 v1.9.0）", { italics: true, color: "666666" }),
        spacer(),

        heading("一、执行摘要"),
        para(
          "本项目内置一套完全本地化的 RAG（检索增强生成）知识库：文档解析 → 文本分块 → 向量嵌入 → LanceDB 存储 → 多路混合检索 → 可选重排序 → 结果回传 UI 或 AI 助手。所有数据与推理默认在本机完成，不依赖云端向量数据库。"
        ),
        para(
          "需要区分两类「知识图谱」：① 知识库模块内置的文档关系图谱（规则抽取 + SVG 可视化，服务于资料浏览）；② 开发辅助工具 graphify（Python 包，用于将整个代码仓库/build 成独立知识图谱，与业务知识库检索链路相互独立）。"
        ),

        heading("二、总体技术架构"),
        para("系统采用 Electron 桌面四层架构："),
        bullet("表现层：index.html + knowledgeBase.js — 知识库管理、检索试用、图谱预览、配置面板"),
        bullet("桥接层：preload.js — 暴露 kb-* IPC 通道给渲染进程"),
        bullet("业务主进程：knowledgeBaseMain.js — 解析、入库、检索、图谱构建、目录监控、自动学习"),
        bullet("工具模块层：utils/kbRetrieval.js、kbFtsIndex.js、kbSqliteStore.js、kbRerank.js、kbConfigLayout.js 等"),
        spacer(),
        tableFromRows(
          [
            ["层级", "技术组件", "职责"],
            ["桌面运行时", "Electron 41 + Node.js", "主进程执行重计算；渲染进程仅做 UI"],
            ["文档解析", "mammoth、pdf-parse、xlsx、word-extractor、tesseract.js", "多格式转纯文本"],
            ["文本分块", "utils/kbRetrieval.js", "语义分块（段落优先）或固定长度分块"],
            ["向量嵌入", "本机 Ollama /api/embed", "默认 bge-m3，BGE 非对称 query/passage 前缀"],
            ["向量索引", "@lancedb/lancedb 0.27", "按库分表存储 chunk 向量，ANN 检索"],
            ["结构化元数据", "SQLite（kb-store.sqlite）+ JSON 兼容", "文档、分块、任务队列、检索日志"],
            ["关键词检索", "内存扫描 + BM25 倒排（fts-index.json）", "专有名词、文件名、编号兜底"],
            ["重排序", "bge-reranker-v2-m3（ONNX / Ollama）", "对融合候选精排"],
            ["安全边界", "utils/ipcValidate.js", "路径白名单、UUID 校验、上传大小限制"],
          ],
          [16, 26, 58]
        ),
        spacer(),
        para("数据流（入库）：", { bold: true }),
        bullet("用户选文件 / 拖拽 / 监控目录 → parseFileToText → chunkText → ollamaEmbedBatch → LanceDB upsert + SQLite/JSON 持久化 → rebuildFtsIndex → ensureGraphSnapshot"),
        para("数据流（检索）：", { bold: true }),
        bullet("查询 → classifyQuery 自适应参数 → ollamaEmbed(query) → 向量路(LanceDB) + 关键词路 + 元数据路 + BM25 FTS 路 → RRF/加权融合 → rerankSearchHits → topK 返回"),

        heading("三、使用的模型与推理后端"),
        heading("3.1 嵌入模型（Embedding）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["模型", "默认 ID", "维度/特性", "调用方式"],
            ["BGE-M3", "bge-m3（Ollama）/ BAAI/bge-m3（云端 Skill）", "1024 维稠密向量；中英文多语", "知识库主链路：Ollama /api/embed；AI Skill baai_embedding_m3：OpenAI 兼容 /v1/embeddings"],
            ["备选", "nomic-embed-text、e5-*、gte-* 等", "取决于 Ollama 已拉取模型", "settings.embedModel 可配置"],
          ],
          [14, 22, 28, 36]
        ),
        spacer(),
        para("BGE 非对称嵌入（formatEmbeddingInput）：", { bold: true }),
        bullet("查询（query）：前缀 Represent this sentence for searching relevant passages:"),
        bullet("文档块（passage）：前缀 Represent this sentence for retrieval:"),
        bullet("批量入库默认 batchSize=8，减少 Ollama 往返"),

        heading("3.2 重排序模型（Reranker）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["模型", "提供方", "说明"],
            ["bge-reranker-v2-m3", "ONNX（默认）", "@huggingface/transformers 加载 onnx-community/bge-reranker-v2-m3-ONNX（q8），本地免 Ollama"],
            ["dengcao/bge-reranker-v2-m3", "Ollama", "可经 /api/rerank 或 embed 配对打分"],
            ["配置项", "rerankProvider: auto | onnx | ollama", "默认开启 rerankEnabled，TopN=30，权重 0.75"],
          ],
          [22, 22, 56]
        ),

        heading("3.3 对话大模型（非知识库核心，但联动 RAG）", HeadingLevel.HEADING_2),
        bullet("AI 助手通过 Skill「rag-kb / kb_search」调用 kb-search IPC，将检索片段注入对话上下文"),
        bullet("可选「全自动学习」：对话要点写入当前库（utils/kbAutoLearn.js）"),
        bullet("可选「联网核验回写」：低置信命中时授权联网核对并写回库"),

        heading("四、存储架构与目录布局"),
        tableFromRows(
          [
            ["存储介质", "路径/文件", "内容"],
            ["默认根目录", "%APPDATA%/daily-task-tracker-desktop/knowledge-base/", "可配置自定义根路径"],
            ["单库目录", "libraries/<libraryId>/", "每个知识库独立子目录"],
            ["结构化存储", "kb-store.sqlite", "Schema v2：documents、chunks、ingest_jobs、search_logs、auto_learn 队列"],
            ["兼容层", "store.json", "由 kbSqliteStore.js 迁移/双写兼容旧版"],
            ["向量库", "lancedb/（全局）+ 按 libraryId 分表 kb_chunks_*", "LanceDB 表存 chunkId、docId、embedding"],
            ["BM25 索引", "fts-index.json", "倒排 postings + BM25 参数 k1=1.2, b=0.75"],
            ["全局图谱缓存", "global-graph.json", "多库合并图谱快照"],
            ["库级图谱", "store.graph 字段", "单库图谱嵌入 store 结构"],
          ],
          [18, 28, 54]
        ),
        spacer(),
        bullet("去重：文件 MD5（computeFileMd5）+ chunk_hash 增量更新（planChunkIncrementalUpdate）"),
        bullet("监控目录：main/kbWatchDir.js + fs.watch，防抖串行入库"),

        heading("五、文档解析能力"),
        tableFromRows(
          [
            ["格式", "解析库/方法", "备注"],
            [".txt / .md / .markdown", "decodeTextBuffer（UTF-8/GBK/GB18030 自动检测）", "保留段落"],
            [".docx", "mammoth.extractRawText", "正文提取"],
            [".doc / .rtf", "word-extractor / rtfToText", "Windows 可回退 COM 预览转换"],
            [".pdf", "pdf-parse", "文本型 PDF；扫描件质量取决于 OCR"],
            [".xlsx / .xls", "xlsx（Sheet → CSV 拼接）", "按 Sheet 分节"],
            ["图片 .png/.jpg 等", "tesseract.js（chi_sim+eng，失败回退 eng）", "OCR 后入库"],
            [".html/.json/.csv/.log/.xml/.yml 等", "htmlLikeToText / JSON 格式化", "AUTO_TEXT_EXTS 集合"],
          ],
          [20, 30, 50]
        ),

        heading("六、检索架构（混合 RAG）"),
        heading("6.1 默认检索参数（DEFAULT_KB_RETRIEVAL_SETTINGS）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["参数", "默认值", "含义"],
            ["chunkSize / chunkOverlap", "800 / 120", "分块大小与重叠"],
            ["chunkStrategy", "semantic", "语义分块（段落合并，超长再 fixed 切）"],
            ["embedModel", "bge-m3", "Ollama 嵌入模型名"],
            ["searchTopK", "5", "最终返回条数（UI 可覆盖至 10）"],
            ["searchMinScore", "0.7（normalize 下限 0.55）", "最低有效相似度"],
            ["searchCandidateK", "200", "向量候选池"],
            ["hybridSearch", "true", "混合检索开关"],
            ["hybridVectorWeight", "0.7", "向量分权重（非 RRF 模式）"],
            ["useRrfRanking", "true", "Reciprocal Rank Fusion（RRF_K=60）"],
            ["keywordRecallLimit", "50", "关键词/BM25 召回上限"],
            ["searchMode", "auto", "auto | semantic | keyword | hybrid"],
          ],
          [28, 22, 50]
        ),

        heading("6.2 四路召回与融合", HeadingLevel.HEADING_2),
        bullet("向量路：LanceDB lanceSearchByEmbedding；失败时回退内存 cosineSimilarity"),
        bullet("关键词路：scanChunksByKeyword（token 匹配 + 文件名加权）"),
        bullet("元数据路：scanMetadataHits（文件名、路径、章节号匹配）"),
        bullet("全文路：searchFtsIndex（自建 BM25 倒排，fts-index.json）"),
        bullet("融合：mergeAndFuseHits — 支持 RRF 或加权融合；记录 recallSource（vector+keyword+fts 等）"),
        bullet("查询自适应：classifyQuery 识别 filename / identifier / code / semantic_question 等，动态调整 vectorWeight、minScore、候选池"),

        heading("6.3 重排序与后处理", HeadingLevel.HEADING_2),
        bullet("rerankSearchHits：对融合后的候选用 bge-reranker 精排，blend 原分与 rerank 分（rerankWeight）"),
        bullet("finalizeAgentSearchHits：相邻块扩展、目录/修订历史过滤、API 规范查询增强"),
        bullet("评测：npm run kb:eval（config/kb-eval-golden.json 黄金集）"),

        heading("七、知识库内置知识图谱（业务图谱）"),
        para(
          "知识库 UI 中的「知识图谱预览」并非调用 graphify 或外部图数据库，而是由 knowledgeBaseMain.js 中的 buildKnowledgeGraphSnapshot 基于已入库文档**规则抽取**构建，前端 knowledgeBase.js 用 SVG + 力导向布局渲染。"
        ),

        heading("7.1 构建算法与数据来源", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "实现方式", "边类型 / 节点类型"],
            ["文档节点", "每个 documents[] 条目", "type=doc，id=doc:<docId>"],
            ["章节节点", "extractStructuredHeadings（Markdown # 标题、编号标题）", "type=section；边 contains（文档→章节）、flow（章节顺序）"],
            ["Wiki 链接", "正则 \\[\\[...\\]\\]", "边 wiki-link（跨文档，权重 2）"],
            ["Markdown 链接", "正则 [...](path)", "边 md-link（匹配库内文件名别名）"],
            ["文档互引", "normalizeDocAlias 后全文包含其他文档名（≤80 篇时）", "边 mention"],
            ["节点权重", "按边 weight 累加度数", "topNodes 取前 12"],
          ],
          [22, 38, 40]
        ),

        heading("7.2 缓存与范围", HeadingLevel.HEADING_2),
        bullet("单库：ensureGraphSnapshot — signature=文档数:分块数，变更时重建，写入 store.graph"),
        bullet("全局：ensureGlobalGraphSnapshot — 合并多库 documents/chunks，缓存 global-graph.json"),
        bullet("IPC：kb-graph-snapshot（读取）、kb-graph-rebuild（强制重建）"),

        heading("7.3 前端可视化能力", HeadingLevel.HEADING_2),
        bullet("SVG 画布（820×520），最多展示 72 节点 / 180 边（按 weight 排序截断）"),
        bullet("力导向模拟（可开关 kbGraphForceEnabled）"),
        bullet("选项：全局图谱、保留布局、仅文档节点、重置布局、重建图谱"),
        bullet("不使用：Neo4j、GraphRAG、LLM 实体抽取、向量聚类"),

        heading("7.4 与检索的关系", HeadingLevel.HEADING_2),
        para(
          "内置图谱是**辅助浏览与关系发现**功能，不参与 kb-search 召回排序主路径。检索主路径仍走向量 + 关键词 + BM25 + 重排序。"
        ),

        heading("八、graphify 代码库知识图谱（开发辅助，独立于业务知识库）"),
        para(
          "项目 AGENTS.md 约定在 graphify-out/ 维护代码仓库级知识图谱；该能力由 Cursor/Claude Skill「graphify」（Python 包 graphifyy）提供，与鲸落AI 客户端内的文档知识库是两套系统。"
        ),
        tableFromRows(
          [
            ["维度", "graphify（代码库图谱）", "知识库内置图谱"],
            ["输入", "代码、文档、论文、URL 等任意文件夹", "已入库的知识库 documents/chunks"],
            ["抽取", "LLM 实体关系抽取 + EXTRACTED/INFERRED/AMBIGUOUS 审计", "正则 + 标题解析 + 文件名别名"],
            ["输出", "graphify-out/graph.json、GRAPH_REPORT.md、HTML、wiki/", "store.graph / global-graph.json + SVG UI"],
            ["社区发现", "聚类算法划分 community", "无（仅度数权重）"],
            ["检索", "/graphify query BFS/DFS 图遍历", "kb-search 向量检索（与图谱无关）"],
            ["增量", "--update / --watch 代码变更重建", "入库或 kb-graph-rebuild 触发"],
          ],
          [18, 42, 40]
        ),
        spacer(),
        bullet("graphify 可选导出：graph.svg、graph.graphml、Neo4j cypher、Obsidian vault、MCP server"),
        bullet("当前工作区 graphify-out/ 目录若未生成，表示尚未对本仓库执行 /graphify 流水线"),

        heading("九、与 AI 助手 / Skill 集成"),
        tableFromRows(
          [
            ["Skill ID", "能力", "依赖"],
            ["rag-kb", "kb_search — 对话中检索本地库", "Ollama bge-m3 + 已入库文档"],
            ["baai-embed-m3", "云端/OpenAI 兼容嵌入", "BAAI/bge-m3 via /v1/embeddings"],
            ["runtime-env", "环境检测", "Python/MSVC 等前置"],
          ],
          [18, 42, 40]
        ),

        heading("十、关键源码索引"),
        tableFromRows(
          [
            ["文件", "职责"],
            ["knowledgeBaseMain.js", "主进程：解析、入库、检索、图谱、IPC 注册"],
            ["knowledgeBase.js", "渲染进程 UI + 图谱 SVG 交互"],
            ["utils/kbRetrieval.js", "分块、查询分类、混合融合、关键词扫描"],
            ["utils/kbFtsIndex.js", "BM25 倒排索引"],
            ["utils/kbSqliteStore.js", "SQLite 持久化与迁移"],
            ["utils/kbRerank.js", "bge-reranker ONNX/Ollama 重排"],
            ["utils/kbConfigLayout.js", "默认检索参数与配置校验"],
            ["main/ollamaRuntime.js", "Ollama 嵌入/预热/设备探测"],
            ["main/kbWatchDir.js", "目录监控自动入库"],
            ["skills.js", "kb_search / baai_embedding_m3 工具定义"],
          ],
          [32, 68]
        ),

        heading("十一、能力边界与成熟度"),
        tableFromRows(
          [
            ["模块", "成熟度", "说明"],
            ["多格式入库", "★★★★☆", "办公格式齐全；扫描 PDF/OCR 看原件质量"],
            ["语义检索", "★★★★☆", "LanceDB + bge-m3；依赖 Ollama 可用性"],
            ["混合检索 + RRF + BM25", "★★★★☆", "四路召回；非 Elasticsearch 级 FTS"],
            ["重排序", "★★★★☆", "ONNX 默认本地；首次下载约 570MB"],
            ["多库管理", "★★★★☆", "完整"],
            ["内置关系图谱", "★★★☆☆", "规则驱动，适合文档互链浏览"],
            ["graphify 代码图谱", "★★★☆☆", "需单独运行 Python 流水线"],
            ["AI 联动", "★★★★☆", "Skill + 自动学习 + 低置信核验"],
          ],
          [22, 12, 66]
        ),
        spacer(),
        para("已知边界：", { bold: true }),
        bullet("无 Elasticsearch / SQLite FTS5 级全文引擎；超大库关键词扫描可能变慢"),
        bullet("内置图谱不做 NLP 实体识别，无法自动抽取人物/组织/概念三元组"),
        bullet("graphify 图谱与业务知识库数据不自动同步"),
        bullet("纯云端向量库（原需求 ChromaDB）已演进为 LanceDB + SQLite，需求文档 .cursor/kb-requirements-extract.txt 中 ChromaDB/FAISS 为早期规格"),

        heading("十二、总结"),
        bullet("本地知识库架构：Electron 主进程 RAG 管线 + Ollama 嵌入 + LanceDB 向量库 + SQLite 元数据 + 自建 BM25 + bge-reranker 精排。"),
        bullet("核心模型：嵌入 bge-m3（1024 维）；重排 bge-reranker-v2-m3（ONNX 或 Ollama）。"),
        bullet("知识库图谱：规则抽取（标题/Wiki 链接/Markdown 链接/文档互引）+ SVG 力导向可视化，非 LLM 构图。"),
        bullet("graphify：独立 Python 工具链，用于代码/资料库级知识图谱与社区发现，输出 graphify-out/，与 kb-search 检索链路分离。"),
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
