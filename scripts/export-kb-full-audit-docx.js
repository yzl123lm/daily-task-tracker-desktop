/**
 * 导出「本地知识库能力完整技术排查报告」Word 文档
 * 运行：node scripts/export-kb-full-audit-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "本地知识库能力排查报告.docx");
const GENERATED_AT = new Date().toISOString().slice(0, 19).replace("T", " ");

function heading(text, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text, heading: level, spacing: { before: 240, after: 120 } });
}

function para(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: String(text), ...opts })],
  });
}

function bullet(text) {
  return new Paragraph({ text: String(text), bullet: { level: 0 }, spacing: { after: 80 } });
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
                children: [new TextRun({ text: String(text), bold: ri === 0, size: ri === 0 ? 20 : 18 })],
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

function section(children) {
  return children.flat();
}

// ── 能力清单 46 项 ──
const capabilityRows = [
  ["能力", "是否支持", "实现方式", "证据位置", "风险或限制"],
  ["1. 知识库创建/编辑/删除", "是", "kb-meta.json + IPC", "knowledgeBaseMain.js kb-library-create/rename/delete L4241-L4359", "至少保留 1 个库"],
  ["2. 知识库列表查询", "是", "kb-library-list IPC", "preload.js L185; registerKnowledgeBaseHandlers", "单用户桌面，无远程 API"],
  ["3. 文档上传", "是", "文件选择器/路径入库", "kb-pick-and-ingest L4813; kb-ingest-path L4996", "单文件 ≤50MB"],
  ["4. 文档删除", "是", "SQLite+Lance+FTS 同步删", "removeDocumentFromLibrary L2834; kb-delete-document L5114", "不删用户磁盘原文件"],
  ["5. 文档重新解析", "部分", "同路径变更 MD5 触发增量", "ingestOneFile 增量分支 L3815", "无独立「仅重解析」按钮"],
  ["6. 文档重新索引", "是", "kb-rebuild-embeddings/fts", "knowledgeBaseMain.js L5689-L5755", "全量重建，耗时随分片数增长"],
  ["7. 批量导入", "是", "多选文件/目录监控", "kb-pick-and-ingest batch; kbWatchDir.js", "批内 MD5 去重"],
  ["8. 支持 PDF", "是", "pdf-parse + OCR 回退", "parseBufferToText L2415-L2423", "扫描版仅前 50 页 OCR"],
  ["9. 支持 Word", "是", ".docx mammoth; .doc word-extractor", "parseBufferToText L2364-L2413", ".doc 依赖本机 COM/LibreOffice 回退"],
  ["10. 支持 Excel", "是", "xlsx + 加密 COM", "parseBufferToText L2425; kb-excel-to-text.ps1", "加密表需密码"],
  ["11. 支持 PPT", "是", ".pptx JSZip+XML", "parseBufferToText L2368", "仅文本提取，版式/图不保留"],
  ["12. 支持 TXT/MD/HTML", "是", "直接解码/HTML 清洗", "parseBufferToText L2361; AUTO_TEXT_EXTS L266", "—"],
  ["13. 支持图片/扫描件", "是", "Tesseract.js OCR", "IMAGE_EXTS L252; ocrImagePathWithTesseract L2076", "chi_sim+eng，质量依赖图像"],
  ["14. 支持 OCR", "是", "Tesseract + pdf-to-png", "ocrScannedPdfBuffer L2086; PDF_OCR_MAX_PAGES=50 L2069", "无 GPU OCR 加速"],
  ["15. 文档解析", "是", "parseFileToText/parseBufferToText", "knowledgeBaseMain.js L2359+", "二进制/超大文件受限"],
  ["16. 文本清洗", "部分", "去 NUL/换行归一/HTML 剥离", "ingestOneFile plain L3732; htmlLikeToText L307", "无专业 NLP 清洗管线"],
  ["17. 文本切分", "是", "fixed/semantic chunk", "utils/kbRetrieval.js chunkTextFixed L41; chunkTextSemantic L67", "默认 semantic"],
  ["18. 按标题/段落/页码/章节切分", "部分", "semantic 按段落；API 文档按章节检索", "chunkTextSemantic; app.js inferSectionRefsForQuery L3681", "无 PDF 页码级 chunk 元数据"],
  ["19. Embedding 向量化", "是", "Ollama bge-m3", "ollamaEmbed L1487; ollamaEmbedBatch L1558", "需本机 Ollama"],
  ["20. 向量索引创建", "是", "LanceDB createTable", "lanceAppendChunks L435; tableNameForLibrary L272", "每库一表 kb_chunks_{id}"],
  ["21. 向量索引更新", "是", "增量 embed + lance add/delete", "applyIncrementalDocumentUpdate L2848", "维度变更需全量重建"],
  ["22. 向量删除", "是", "lanceDeleteByDocId/ChunkId", "lanceDeleteByDocId L419", "失败时 .catch 静默"],
  ["23. 关键词检索", "是", "scanChunksByKeyword", "utils/kbRetrieval.js L1014+; performLibraryRecall L3048", "limit 默认 50"],
  ["24. 向量检索", "是", "LanceDB vectorSearch", "lanceSearchByEmbedding L475; cosine 回退 L3025", "candidateK 默认 200"],
  ["25. 混合检索", "是", "向量+关键词+元数据+FTS+RRF", "mergeAndFuseHits L1062; hybridSearch 默认 true", "—"],
  ["26. rerank 重排序", "是", "Ollama/ONNX bge-reranker", "utils/kbRerank.js rerankSearchHits L257", "默认开启，可配置关闭"],
  ["27. 多轮问答", "部分", "AI 会话上下文 + kb_search 单次检索", "ai.js 会话; app.js kb_search L3653", "KB 检索本身无会话状态"],
  ["28. Prompt 拼接", "是", "kb_search grounding payload", "app.js L3653-L4015", "由 LLM 二次生成，非模板引擎"],
  ["29. LLM 答案生成", "是", "ai-chat IPC + function calling", "main.js ai-chat L2148; skills.js kb_search L347", "kb_search 默认技能关闭"],
  ["30. 流式输出", "否", "ai-chat stream:false", "main.js L2280 stream:false", "检索与对话均为非流式"],
  ["31. 引用来源展示", "是", "UI 显示文档名/路径/分块", "knowledgeBase.js formatHitTrace L1907", "—"],
  ["32. 页码/段落溯源", "部分", "charStart/charEnd/chunkIndex", "kb_chunks 字段; knowledgeBase.js L1912", "无 PDF 页码字段"],
  ["33. 点击查看原文", "是", "kb-open-document IPC", "knowledgeBase.js L2708; preload L244", "依赖 sourcePath 仍存在"],
  ["34. 权限控制", "否（多用户）", "单用户 Electron 桌面", "未发现 userId 绑定 KB", "无服务端 ACL"],
  ["35. 多租户隔离", "否", "—", "未发现 tenant 实体", "—"],
  ["36. 用户级隔离", "否", "本机 userData 目录隔离", "kbRoot(userData) L558", "仅 OS 用户级"],
  ["37. 知识库级隔离", "是", "libraryId 分库/分表", "tableNameForLibrary; libraryDir", "检索可跨库 __all__"],
  ["38. 文档级隔离", "部分", "按 docId 过滤命中", "检索结果含 docId", "无独立文档 ACL"],
  ["39. 增量更新", "是", "planChunkIncrementalUpdate", "applyIncrementalDocumentUpdate L2848", "同路径文件变更"],
  ["40. 定时同步", "部分", "目录 fs.watch 监控", "main/kbWatchDir.js createKbWatchService", "默认关闭 watchDirEnabled"],
  ["41. 失败重试", "部分", "入库 job 记录；搜索超时", "kb_ingest_jobs; withKbOpTimeout L134", "无自动指数退避重试队列"],
  ["42. 任务队列/异步", "部分", "入库 job 表；watch 队列", "kb_ingest_jobs L91; kbWatchDir", "无异步 Worker 进程"],
  ["43. 日志监控", "部分", "kb_search_logs + ops log", "appendSearchLog L629; kb-ops-log-list", "无 Prometheus/ELK"],
  ["44. 效果评估", "部分", "kb-eval + golden.json", "scripts/kb-eval.js; config/kb-eval-golden.json", "无线上 A/B"],
  ["45. 用户反馈(点赞/点踩)", "否", "—", "未发现 KB QA 反馈表", "仅有 auto-learn 审核"],
  ["46. 管理后台", "部分", "知识库面板/设置/运维日志", "knowledgeBase.js; index.html #panel-knowledge-base", "非独立 Web Admin"],
];

const componentRows = [
  ["组件类型", "使用组件", "配置位置", "调用位置", "说明", "风险"],
  ["向量存储", "LanceDB @lancedb/lancedb 0.27.2", "kbRoot/lancedb/", "lanceSearchByEmbedding L475", "每库表 kb_chunks_{libraryId}", "原生绑定需 unpacked"],
  ["元数据/Chunk", "SQLite node:sqlite", "libraries/{id}/kb-store.sqlite", "utils/kbSqliteStore.js ensureSchema L45", "含 embedding_json 回退", "单文件 DB"],
  ["全文检索", "自研 BM25 JSON", "libraries/{id}/fts-index.json", "utils/kbFtsIndex.js", "非 Elasticsearch", "大库重建耗时"],
  ["Embedding", "Ollama bge-m3 (本地)", "utils/kbConfigLayout.js embedModel", "ollamaEmbed L1487", "维度 1024", "模型未安装则失败"],
  ["Rerank", "dengcao/bge-reranker-v2-m3", "DEFAULT rerankModel L70", "utils/kbRerank.js", "Ollama 优先，ONNX 降级", "ONNX 约 570MB"],
  ["LLM", "多提供商(Ollama/云端)", "ai-settings / localModels.js", "main.js ai-chat L2148", "kb_search 后由 LLM 生成", "stream:false"],
  ["PDF 解析", "pdf-parse", "package.json", "parseBufferToText L2416", "文本层优先", "表格结构弱"],
  ["Word 解析", "mammoth / word-extractor", "package.json", "parseBufferToText L2364", "—", ".doc 兼容性"],
  ["OCR", "tesseract.js + pdf-to-png", "package.json", "ocrScannedPdfBuffer L2086", "chi_sim+eng", "慢、精度有限"],
  ["Excel", "xlsx + PowerShell COM", "kb-excel-to-text.ps1", "parseSpreadsheetBuffer", "—", "Windows 加密表"],
  ["任务/队列", "内存 watch 队列 + SQLite jobs", "kb_ingest_jobs 表", "upsertIngestJob L646", "非 Celery/Kafka", "进程退出即停"],
  ["对象存储", "未使用", "—", "—", "本地文件系统", "—"],
  ["缓存", "DB 连接缓存; rerank ONNX cache", "dbCache Map; transformers-cache", "kbRerank.js; kbSqliteStore L6", "—", "—"],
];

const apiRows = [
  ["接口用途", "协议", "通道/入口", "请求参数", "响应结构", "鉴权", "证据"],
  ["创建知识库", "IPC", "kb-library-create", "{name}", "{ok, library}", "本机 Electron", "preload L187"],
  ["更新知识库", "IPC", "kb-library-rename", "{id,name}", "{ok, library}", "本机", "preload L191"],
  ["删除知识库", "IPC", "kb-library-delete", "{id}", "{ok, deletedId}", "本机", "preload L192; L4304"],
  ["列表", "IPC", "kb-library-list", "—", "{libraries}", "本机", "preload L185"],
  ["详情/状态", "IPC", "kb-get-state", "{light?}", "库+设置+统计", "本机", "preload L183"],
  ["上传文档", "IPC", "kb-pick-and-ingest", "{libraryId?}", "{ok, docId, chunkCount}", "本机", "preload L202; L4813"],
  ["路径入库", "IPC", "kb-ingest-path", "filePath", "同上", "本机", "preload L204"],
  ["删除文档", "IPC", "kb-delete-document", "docId", "{ok, removedChunks}", "本机", "preload L208"],
  ["文档列表", "IPC", "kb-get-state", "—", "documents[]", "本机", "knowledgeBaseMain.js"],
  ["解析状态", "IPC", "kb-get-state / ingest job", "—", "kb_ingest_jobs", "本机", "kbSqliteStore L646"],
  ["重新索引", "IPC", "kb-rebuild-embeddings", "{libraryId}", "{ok, rebuilt}", "本机", "preload L216; L5689"],
  ["重建 FTS", "IPC", "kb-rebuild-fts-index", "{libraryId}", "{ok, rebuilt}", "本机", "preload L217"],
  ["检索", "IPC", "kb-search", "{query, topK, libraryId...}", "{ok, hits[], elapsedMs}", "本机", "preload L212; L5201"],
  ["问答", "IPC+Tool", "kb_search → kb-search → ai-chat", "{query, top_k}", "grounding+LLM 回复", "技能开关", "app.js L3653; skills.js L347"],
  ["引用/打开原文", "IPC", "kb-open-document", "{sourcePath, docId}", "{ok}", "本机", "preload L244"],
  ["权限管理", "—", "未发现", "—", "—", "—", "未发现证据"],
  ["用户反馈", "—", "未发现", "—", "—", "—", "未发现证据"],
];

const configRows = [
  ["配置项", "默认值", "所在文件", "含义", "环境变量覆盖", "风险/建议"],
  ["embedModel", "bge-m3", "utils/kbConfigLayout.js L59", "嵌入模型", "否（UI 可改）", "需 ollama pull"],
  ["chunkSize", "800", "kbConfigLayout L57", "分片长度", "否", "300-2000"],
  ["chunkOverlap", "120", "kbConfigLayout L58", "重叠", "否", "须 < chunkSize"],
  ["searchTopK", "5", "kbConfigLayout L60", "返回条数", "否", "检索 UI 默认"],
  ["searchMinScore", "0.7(归一化0.55)", "kbConfigLayout L61,L111", "最低分", "否", "autoTune 可降低"],
  ["searchCandidateK", "200", "kbConfigLayout L62", "向量召回数", "否", "20-1000"],
  ["hybridVectorWeight", "0.7", "kbConfigLayout L63", "混合权重", "否", "—"],
  ["rerankEnabled", "true", "kbConfigLayout L69", "启用重排", "否", "featureGates 可关"],
  ["rerankTopN", "30", "kbConfigLayout L72", "重排候选数", "否", "—"],
  ["rerankWeight", "0.75", "kbConfigLayout L73", "重排融合权重", "否", "—"],
  ["hybridSearch", "true", "kbConfigLayout L67", "混合检索", "否", "—"],
  ["useRrfRanking", "true", "kbConfigLayout L68", "RRF 融合", "否", "—"],
  ["KB_MAX_UPLOAD_BYTES", "50MB", "knowledgeBaseMain.js L105", "上传上限", "否", "—"],
  ["PDF_OCR_MAX_PAGES", "50", "knowledgeBaseMain.js L2069", "OCR 页上限", "否", "长扫描 PDF 截断"],
  ["OLLAMA host", "本地设置", "readOllamaSettings", "Ollama 地址", "否", "—"],
  ["HF_ENDPOINT", "—", "kbRerank.js L141", "ONNX 下载镜像", "是", "离线需预下载"],
  ["autoWebVerify", "false", "kbConfigLayout L79", "入库联网核验", "否", "默认关"],
  ["watchDirEnabled", "false", "kbConfigLayout L80", "目录监控", "否", "默认关"],
];

const securityRows = [
  ["风险项", "当前状态", "证据位置", "风险等级", "修复建议"],
  ["多租户/用户隔离", "不支持", "KB 无 userId/tenant 字段", "中(桌面单用户低)", "若做多用户需加 ACL+过滤"],
  ["跨库检索", "支持 __all__", "kb-search resolveRequestedLibraryIds L5224", "低", "确认用户意图"],
  ["检索权限过滤", "仅库级", "performLibraryRecall 按 libraryId", "中(企业场景)", "加 metadata filter"],
  ["删除一致性", "基本同步", "removeDocumentFromLibrary L2834", "低", "lance 删除失败静默需监控"],
  ["Prompt Injection", "部分防护", "ai.js AI_SYSTEM L5; grounding 规则", "中", "加强 ignore-instructions 提示"],
  ["原文件未复制", "仅存 sourcePath", "ingestOneFile docRecord L3818", "中", "原文件删除后无法打开"],
  ["日志敏感信息", "debug_json 可能含片段", "kb_search_logs L110", "中", "生产脱敏"],
  ["越权测试用例", "未发现", "—", "中", "补充安全测试"],
];

const riskRows = [
  ["编号", "类型", "描述", "影响", "等级", "证据", "建议"],
  ["R01", "架构", "无 HTTP 服务化，仅 Electron IPC", "无法远程集成", "P2", "preload.js", "按需封装 API"],
  ["R02", "数据安全", "原文件不复制，依赖 sourcePath", "链接失效", "P1", "ingestOneFile L3821", "可选归档副本"],
  ["R03", "权限", "无多用户 ACL", "企业共用机风险", "P1", "kbSqliteStore schema", "加用户/角色字段"],
  ["R04", "Prompt Injection", "文档内容进入 LLM 上下文", "指令劫持", "P1", "app.js grounding", "强化 system 隔离"],
  ["R05", "删除一致", "lanceDelete .catch 静默", "孤儿向量", "P1", "L2840", "失败告警+补偿"],
  ["R06", "检索效果", "无页码级 chunk", "引用不准", "P2", "chunk 元数据", "PDF 保留 pageNo"],
  ["R07", "幻觉", "依赖 LLM+规则", "错误答案", "P1", "ai.js L7", "低置信度+web verify"],
  ["R08", "性能", "入库同步 embed", "大文件阻塞", "P1", "ingestOneFile", "后台队列化"],
  ["R09", "运维", "无 trace_id/APM", "难排障", "P2", "kb_search_logs", "加 requestId"],
  ["R10", "部署", "依赖 Ollama+Lance 原生", "离线装复杂", "P1", "environmentManifest.json", "打包自检脚本"],
];

const verifyRows = [
  ["验证目标", "操作步骤", "预期结果", "检查位置", "通过标准"],
  ["PDF 解析", "上传可复制文本 PDF", "chunk>0, 可检索", "知识库 UI / kb-store.sqlite", "正文与源一致"],
  ["Word 解析", "上传 .docx", "mammoth 提取成功", "kb_documents", "可搜索标题"],
  ["Excel 结构", "上传 .xlsx", "表格转文本", "chunk text", "列名可检索"],
  ["扫描 PDF OCR", "上传扫描版 PDF", "OCR 文本入库", "ingest 日志", "前50页有字"],
  ["DB 状态", "查 kb_ingest_jobs", "status=done", "kb-store.sqlite", "doc_id 非空"],
  ["向量写入", "kb-index-health", "lance≈sqlite count", "IPC kb-index-health", "healthy=true"],
  ["有答案问题", "kb-search 已知词", "hits≥1, score≥阈值", "检索试用 UI", "命中正确文档"],
  ["无答案问题", "ZZ-99999 类查询", "lowConfidence 或空", "kb-eval KB-030", "不胡编"],
  ["引用来源", "AI 开启 kb_search 提问", "回复含文档名", "聊天区", "与 evidence 一致"],
  ["跨库隔离", "两库各导入后指定 libraryId", "仅目标库命中", "kb-search payload", "无交叉"],
  ["删除同步", "删文档后 index-health", "chunk 减少", "SQLite+Lance", "计数一致"],
  ["服务降级", "停 Ollama 后检索", "明确错误", "kb-search 返回", "不静默失败"],
];

const children = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "本地知识库能力排查报告", bold: true, size: 36 })],
  }),
  para(`生成时间：${GENERATED_AT}`, { italics: true, color: "666666" }),
  para("项目：鲸落AI 桌面客户端（daily-task-tracker-desktop）", { italics: true, color: "666666" }),
  para("排查方法：代码、配置、IPC、SQLite 模型、部署清单、测试脚本交叉验证", { italics: true, color: "666666" }),
  spacer(),

  heading("1. 结论摘要"),
  bullet("1) 具备本地知识库能力：是。完整 RAG 管线已在 Electron 主进程实现（knowledgeBaseMain.js ~6076 行）。"),
  bullet("2) 属于 RAG 架构：是。检索增强 = kb_search/kb-search 召回片段 → LLM 生成答案。"),
  bullet("3) 检索方案：混合检索（向量 LanceDB + 关键词扫描 + 元数据 + 自研 BM25 FTS + RRF/加权融合 + 可选 bge-reranker 重排）。"),
  bullet("4) 本地/离线/私有化：支持。默认本机 Ollama + 本地文件存储；离线需预装 bge-m3、rerank 模型及 LanceDB 原生模块。"),
  bullet("5) 核心能力：多库管理、文档入库、OCR、分块、向量化、混合检索、重排、AI 问答、引用溯源、目录监控、自动学习、图谱浏览、索引健康检查。"),
  bullet("6) 核心组件：Embedding=bge-m3(Ollama)；向量库=LanceDB；元数据=SQLite；FTS=JSON BM25；Rerank=bge-reranker-v2-m3；LLM=ai-chat 多源；解析=mammoth/pdf-parse/xlsx/tesseract。"),
  bullet("7) 成熟度：完整可用（桌面单用户场景）。不支持多租户 HTTP API、流式问答、点赞点踩反馈；企业级权限与 APM 待建设。"),
  spacer(),

  heading("2. 本地知识库能力总览"),
  para("本系统为 Electron 桌面应用内置模块，非独立微服务。用户入口：index.html #panel-knowledge-base、knowledgeBase.js、AI 技能中心 rag-kb/kb_search。数据默认存储于 %APPDATA%/daily-task-tracker-desktop/knowledge-base/（可通过 kb-storage-set-dir 自定义）。"),
  para("与 graphify 代码库图谱（graphify-out/）相互独立：前者检索业务文档，后者检索仓库代码结构。"),
  spacer(),

  heading("3. 能力清单"),
  tableFromRows(capabilityRows, [22, 10, 22, 28, 18]),
  spacer(),

  heading("4. 系统架构分析"),
  heading("4.1 文字架构图", HeadingLevel.HEADING_2),
  para("用户上传文档(kb-pick-and-ingest) → 解析(parseFileToText) → 清洗(去NUL/trim) → 切分(chunkText) → Ollama嵌入(ollamaEmbedBatch) → 写入LanceDB+SQLite+FTS → 用户提问(kb-search/kb_search) → 查询嵌入(ollamaEmbed query) → 多路召回(performLibraryRecall) → 融合(mergeAndFuseHits) → 重排(rerankSearchHits) → Prompt拼接(app.js grounding) → LLM(ai-chat) → 答案+引用"),
  heading("4.2 分层映射", HeadingLevel.HEADING_2),
  bullet("入口层：knowledgeBase.js, app/kbDashboard.js, app.js(kb_search), ai.js(技能开关)"),
  bullet("服务层：knowledgeBaseMain.js registerKnowledgeBaseHandlers (IPC)"),
  bullet("文档处理：parseBufferToText, ingestOneFile, main/kbWatchDir.js"),
  bullet("向量化：ollamaEmbed/ollamaEmbedBatch, formatEmbeddingInput (BGE 前缀)"),
  bullet("存储：kbRoot/libraries/{id}/, lancedb/, normalized/"),
  bullet("检索：performLibraryRecall, kbRetrieval.js, kbFtsIndex.js, kbRerank.js"),
  bullet("生成：main.js ai-chat + app.js kb_search grounding"),
  bullet("权限：本机 OS 用户级；库级 libraryId 隔离"),
  bullet("运维：kb_search_logs, kb_ingest_jobs, kb-ops-log-list, kb-index-health"),
  bullet("部署：Electron NSIS/npm run ship:latest-client；无 Docker/K8s（未发现证据）"),
  spacer(),

  heading("5. 文档入库链路"),
  bullet("入口：UI 文件选择 kb-pick-and-ingest(L4813) / 路径 kb-ingest-path / 目录监控 kbWatchDir / 自动学习 kb-auto-learn-ingest"),
  bullet("协议：Electron IPC（非 HTTP）。参数：filePath, libraryId, passwords 等。响应：{ok, docId, chunkCount, error?}"),
  bullet("原文件：不复制到 KB 目录，仅记录 sourcePath(kb_documents.source_path)。非标准格式额外存 normalized/*.normalized.txt"),
  bullet("支持类型：.txt/.md/.docx/.doc/.pdf/.pptx/.xlsx/.xls/图片/.html/.json/.csv 等（见 CANONICAL_KB_EXTS/IMAGE_EXTS/AUTO_TEXT_EXTS）"),
  bullet("切分参数：chunkSize=800, chunkOverlap=120, chunkStrategy=semantic（utils/kbConfigLayout.js）"),
  bullet("向量：bge-m3, 维度 1024(utils/kbModelHealth.js), batchSize=8"),
  bullet("状态：kb_ingest_jobs 表记录 pending/running/done/skipped/needs-password"),
  bullet("失败：返回 {ok:false, error}; job 记 error 字段；无自动重试队列"),
  bullet("删除：removeDocumentFromLibrary 同步删 SQLite chunks、Lance 向量、FTS 索引；不删用户磁盘原文件"),
  spacer(),

  heading("6. 检索与问答链路"),
  bullet("入口：知识库「检索试用」kb-search；AI 工具 kb_search(app.js L3653)"),
  bullet("查询处理：classifyQuery + inferQueryProfile 自动调参；literal/doc_ref/section 强制关键词模式(L5264)"),
  bullet("向量化：与入库同一模型 bge-m3，query 角色加 BGE 检索前缀(kbRetrieval.js formatEmbeddingInput)"),
  bullet("top_k：默认 5(UI)，AI kb_search 默认 12(max 15)；candidateK 默认 200；minScore 默认 0.7(归一化下限 0.55)"),
  bullet("混合融合：RRF_K=60 + 加权 hybridVectorWeight=0.7(mergeAndFuseHits)"),
  bullet("Rerank：topN=30, weight=0.75, 模型 dengcao/bge-reranker-v2-m3"),
  bullet("权限过滤：按 libraryId 选库；__all__ 检索所有有数据库；无 user/tenant filter（未发现证据）"),
  bullet("Prompt：app.js 构造 grounding(evidence, fieldNames, sectionRefs)；ai.js system 要求基于 evidence 回答"),
  bullet("低置信：lowConfidence 标志 + 可选 kbWebVerifyQuery 联网核验"),
  bullet("流式：ai-chat stream:false(main.js L2280)，检索同步 IPC"),
  bullet("引用：返回 sourceFile, sourcePath, chunkIndex, libraryName；UI 可 kb-open-document 打开原文"),
  spacer(),

  heading("7. 核心组件分析"),
  tableFromRows(componentRows, [14, 16, 16, 18, 18, 18]),
  spacer(),

  heading("8. 数据库与数据模型"),
  tableFromRows([
    ["实体/表", "字段概要", "关系", "证据", "说明"],
    ["kb_documents", "id,name,source_path,file_md5,chunk_count,encryption_status...", "1:N chunks", "kbSqliteStore L55", "文档元数据"],
    ["kb_chunks", "id,doc_id,text,chunk_index,char_start/end,embedding_json", "N:1 document", "kbSqliteStore L75", "分片+向量回退"],
    ["kb_ingest_jobs", "id,status,file_path,doc_id,error", "关联 doc", "kbSqliteStore L91", "入库任务"],
    ["kb_search_logs", "query,hit_count,elapsed_ms,debug_json", "—", "kbSqliteStore L101", "检索日志"],
    ["kb_auto_learn_queue", "question,answer,status,credibility", "可入库为文档", "kbSqliteStore L116", "对话沉淀"],
    ["LanceDB kb_chunks_{libId}", "id,libraryId,docId,docName,text,embedding", "映射 chunk id", "lanceAppendChunks L435", "向量主存"],
    ["fts-index.json", "BM25 postings", "按 chunkId", "kbFtsIndex.js", "全文索引"],
    ["kb-meta.json", "libraries[],activeLibraryId", "库注册表", "kbRoot", "多库配置"],
    ["knowledge_base/document/embedding 独立 ORM 表", "—", "—", "—", "未发现；使用 SQLite 表代替"],
    ["tenant/organization/permission", "—", "—", "—", "未发现证据"],
  ], [18, 22, 14, 22, 24]),
  spacer(),

  heading("9. API 接口清单"),
  para("说明：本项目无 REST HTTP 知识库 API；下表「通道」为 Electron IPC（preload.js → ipcMain.handle）。"),
  tableFromRows(apiRows, [14, 8, 18, 18, 16, 10, 16]),
  spacer(),

  heading("10. 配置项清单"),
  tableFromRows(configRows, [18, 12, 20, 18, 14, 18]),
  spacer(),

  heading("11. 权限、安全与隔离分析"),
  tableFromRows(securityRows, [18, 14, 22, 10, 36]),
  spacer(),

  heading("12. 日志、监控与运维能力"),
  tableFromRows([
    ["运维能力", "是否支持", "证据", "当前实现", "缺失/建议"],
    ["上传日志", "部分", "kb_ingest_jobs", "状态+错误", "无集中日志服务"],
    ["解析日志", "部分", "ingest progress 事件", "UI 进度", "—"],
    ["向量化日志", "部分", "ingest job result", "chunkCount", "无逐条 embed 耗时"],
    ["检索耗时", "是", "kb_search_logs.elapsed_ms", "每次搜索记录", "—"],
    ["Rerank 耗时", "是", "searchPhases.rerankMs", "debug_json", "—"],
    ["LLM 耗时", "部分", "ai-chat 未专项", "—", "加 token/耗时"],
    ["trace_id", "否", "—", "searchId 仅搜索", "统一 requestId"],
    ["Prometheus/ELK/Sentry", "否", "—", "—", "桌面应用未接入"],
    ["健康检查", "是", "kb-index-health, kb-model-health-check", "Lance/SQLite/Ollama", "—"],
    ["失败补偿", "部分", "kb-rebuild-embeddings", "手动重建", "自动补偿队列"],
  ], [18, 10, 22, 22, 28]),
  spacer(),

  heading("13. 部署架构分析"),
  tableFromRows([
    ["服务/组件", "部署方式", "端口", "环境变量", "依赖", "说明"],
    ["鲸落AI 客户端", "Electron NSIS/便携包", "—", "—", "Windows", "npm run ship:latest-client"],
    ["Ollama", "本机安装/winget", "11434", "OLLAMA_MODELS", "bge-m3,rerank", "environmentManifest.json"],
    ["LanceDB", "嵌入客户端 native", "—", "—", "@lancedb/lancedb", "app.asar.unpacked"],
    ["知识库数据", "本地目录", "—", "APPDATA", "userData/knowledge-base", "可自定义根"],
    ["Docker/K8s", "未使用", "—", "—", "—", "未发现证据"],
    ["独立解析/Embedding 服务", "无", "—", "—", "进程内调用", "—"],
  ], [16, 16, 10, 16, 18, 24]),
  spacer(),

  heading("14. 质量评估能力"),
  tableFromRows([
    ["评估能力", "是否支持", "证据", "说明", "建议"],
    ["测试问题集", "是", "config/kb-eval-golden.json 32条", "queryType 标注", "扩充领域集"],
    ["标准答案", "否", "golden 仅 expectProfile", "无 gold answer", "加标注答案"],
    ["召回率/准确率", "部分", "scripts/kb-eval.js", "规则断言", "加 RAGAS"],
    ["引用准确性", "否", "—", "未自动评测", "加 citation match"],
    ["用户反馈", "否", "—", "无点赞点踩", "product 需求"],
    ["无答案记录", "部分", "lowConfidence+queryType no_answer", "KB-020/030", "持久化统计"],
    ["自动化脚本", "是", "npm run kb:eval", "CI 可集成", "—"],
  ], [18, 10, 22, 22, 28]),
  spacer(),

  heading("15. 性能与容量风险"),
  tableFromRows([
    ["性能环节", "当前实现", "可能瓶颈", "证据", "优化建议"],
    ["文档入库", "同步解析+embed", "大 PDF/OCR 阻塞 UI", "ingestOneFile", "Worker 队列"],
    ["Embedding 批处理", "batchSize=8", "超大文档慢", "ollamaEmbedBatch L1558", "可配置 batch"],
    ["向量写入", "Lance append", "海量 chunk", "lanceAppendChunks", "分批提交"],
    ["检索", "并行多库 Promise.all", "rerank+embed 串行段", "kb-search L5327", "缓存 query vec"],
    ["同步阻塞", "ingest 主进程", "卡顿", "knowledgeBaseMain.js", "child_process"],
    ["限流/超时", "withKbOpTimeout", "搜索 360s 上限", "KB_SEARCH_HANDLER_TIMEOUT_MS L123", "—"],
  ], [14, 18, 18, 22, 28]),
  spacer(),

  heading("16. 风险清单"),
  tableFromRows(riskRows, [8, 12, 22, 12, 8, 18, 18]),
  spacer(),

  heading("17. 建议验证动作"),
  tableFromRows(verifyRows, [14, 22, 18, 18, 28]),
  spacer(),

  heading("18. 待确认问题"),
  bullet("1) LanceDB 索引类型(HNSW/IVF)与距离度量：代码仅调用 table.vectorSearch，具体索引参数由 LanceDB 默认策略决定，源码未显式配置（待确认）。"),
  bullet("2) 是否计划将知识库服务拆为独立 HTTP 微服务：仅 .cursor/kb-requirements-extract.txt 早期设想，运行时代码未发现（文档提及，代码未发现实现）。"),
  bullet("3) ChromaDB/FAISS/Milvus：仅需求草稿出现，运行时代码未发现。"),
  bullet("4) 多用户企业部署下的权限模型：待产品确认。"),
  spacer(),

  heading("19. 优化建议优先级"),
  heading("P0（高风险）", HeadingLevel.HEADING_2),
  bullet("删除链路加固：lanceDelete 失败应告警并支持 kb-index-health 自动修复（证据：removeDocumentFromLibrary L2840 .catch）"),
  bullet("Prompt Injection：强化 system 指令，明确忽略文档内嵌指令（证据：ai.js AI_SYSTEM）"),
  bullet("原文件归档选项：避免 sourcePath 失效导致无法溯源（证据：ingest 仅存路径）"),
  heading("P1（重要改进）", HeadingLevel.HEADING_2),
  bullet("入库异步队列化，避免大文档阻塞主进程"),
  bullet("补充 kb-eval 标准答案与 citation 准确性评测"),
  bullet("检索/LLM 统一 requestId + 耗时/token 监控"),
  bullet("PDF 页码元数据写入 chunk，提升引用精度"),
  heading("P2（体验/长期）", HeadingLevel.HEADING_2),
  bullet("可选 HTTP API 层供第三方集成"),
  bullet("流式问答 stream:true"),
  bullet("用户反馈（点赞/点踩）与无答案聚类"),
  bullet("多租户 ACL 与企业级权限模型"),
  spacer(),
  para("— 报告结束 —", { italics: true, color: "888888" }),
];

const doc = new Document({
  creator: "鲸落AI 技术审计",
  title: "本地知识库能力排查报告",
  description: "基于代码仓库交叉验证的 RAG/知识库完整技术排查",
  sections: [{ properties: {}, children }],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT_PATH, buffer);
  console.log(`已生成：${OUT_PATH}`);
});
