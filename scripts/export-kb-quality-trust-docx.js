/**
 * 导出「检索质量与可信回答配置」详细 Word 文档
 * 运行：node scripts/export-kb-quality-trust-docx.js
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
const { DEFAULT_KB_RETRIEVAL_SETTINGS, normalizeKbSettings } = require("../utils/kbConfigLayout.js");

const OUT_PATH = path.join(__dirname, "..", "检索质量与可信回答配置报告.docx");
const GENERATED_AT = new Date().toISOString().slice(0, 10);
const DEFAULTS = normalizeKbSettings(DEFAULT_KB_RETRIEVAL_SETTINGS);

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
        children: cells.map((text) =>
          new TableCell({
            borders,
            width: widths ? { size: widths[cells.indexOf(text)] || undefined, type: WidthType.PERCENTAGE } : undefined,
            children: [
              new Paragraph({
                children: [new TextRun({ text: String(text), bold: ri === 0 })],
              }),
            ],
          })
        ),
      })
    ),
  });
}

function fixedTable(rows, widths) {
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
                children: [new TextRun({ text: String(text), bold: ri === 0 })],
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

const queryProfileRows = [
  ["查询类型", "识别规则（摘要）", "minScore", "vectorWeight", "vectorTopN", "keywordTopN", "topKBoost"],
  ["filename", "含 .docx/.pdf 等扩展名", "0.35", "0.15", "50", "100", "+2"],
  ["identifier", "编号如 A-2024、3.16.1", "0.35", "0.10", "50", "100", "+2"],
  ["code", "函数名、驼峰标识符", "0.45", "0.20", "100", "100", "+2"],
  ["summary", "讲什么/概述/总结", "0.50", "0.78", "300", "30", "+2"],
  ["semantic_question", "是什么/如何/为什么/?", "0.55", "0.68", "250", "40", "0"],
  ["date_filter", "2025年/上周/本月", "0.45", "0.40", "200", "50", "+1"],
  ["hybrid（默认）", "其他一般查询", "0.55", "0.60", "200", "50", "0"],
];

const doc = new Document({
  creator: "鲸落AI",
  title: "检索质量与可信回答配置报告",
  description: "鲸落AI 本地知识库检索质量调优参数与可信回答机制说明",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "鲸落AI 检索质量与可信回答配置报告", bold: true, size: 36 }),
          ],
        }),
        para(`生成日期：${GENERATED_AT}`, { italics: true, color: "666666" }),
        para("适用范围：鲸落AI 桌面客户端 v1.9.0 内置本地知识库（knowledgeBaseMain.js / utils/kbRetrieval.js）", {
          italics: true,
          color: "666666",
        }),
        spacer(),

        heading("一、报告目的"),
        para(
          "本文档说明项目如何通过可配置参数与多层机制保障「检索质量」与「可信回答」，涵盖：入库分块、四路召回、融合排序、重排序、阈值过滤、低置信判定、AI 助手 grounding 指令、内容可信度分级、联网核验与自动学习等。参数默认值来自 utils/kbConfigLayout.js（DEFAULT_KB_RETRIEVAL_SETTINGS），可在知识库配置面板修改并持久化到各库的 kb-store.sqlite。"
        ),

        heading("二、配置参数总览（当前默认值）"),
        fixedTable(
          [
            ["配置项", "默认值", "合法范围", "作用"],
            ["chunkSize", String(DEFAULTS.chunkSize), "300–2000", "单块最大字符数，影响召回粒度"],
            ["chunkOverlap", String(DEFAULTS.chunkOverlap), "0–500（须 < chunkSize）", "相邻块重叠，减少边界截断"],
            ["chunkStrategy", DEFAULTS.chunkStrategy, "semantic | fixed", "语义分块（段落优先）或固定长度"],
            ["embedModel", DEFAULTS.embedModel, "任意 Ollama 嵌入名", "向量嵌入模型"],
            ["searchTopK", String(DEFAULTS.searchTopK), "1–30", "最终返回条数上限"],
            ["searchMinScore", String(DEFAULTS.searchMinScore), "0.2–0.95（normalize 下限 0.55）", "最低有效相似度/信号阈值"],
            ["searchCandidateK", String(DEFAULTS.searchCandidateK), "20–1000", "向量召回候选池大小"],
            ["keywordRecallLimit", String(DEFAULTS.keywordRecallLimit), "10–500", "关键词/BM25 每库召回上限"],
            ["hybridSearch", DEFAULTS.hybridSearch ? "true" : "false", "开关", "是否启用混合检索（非纯语义）"],
            ["hybridVectorWeight", String(DEFAULTS.hybridVectorWeight), "0.1–0.95", "非 RRF 模式下向量分权重"],
            ["useRrfRanking", DEFAULTS.useRrfRanking ? "true" : "false", "开关", "Reciprocal Rank Fusion 融合"],
            ["searchMode", DEFAULTS.searchMode, "auto|semantic|keyword|hybrid", "检索模式；auto 按查询类型切换"],
            ["rerankEnabled", DEFAULTS.rerankEnabled ? "true" : "false", "开关", "bge-reranker 精排"],
            ["rerankModel", DEFAULTS.rerankModel, "文本", "重排模型 ID"],
            ["rerankProvider", DEFAULTS.rerankProvider, "auto|onnx|ollama", "重排推理后端"],
            ["rerankTopN", String(DEFAULTS.rerankTopN), "5–80", "参与重排的候选条数"],
            ["rerankWeight", String(DEFAULTS.rerankWeight), "0.1–0.95", "重排分在最终分中的权重"],
            ["aiVerifyWriteback", DEFAULTS.aiVerifyWriteback ? "true" : "false", "开关", "联网核验后是否回写修正分块"],
            ["autoWebVerify", DEFAULTS.autoWebVerify ? "true" : "false", "开关（UI 隐藏）", "入库时自动联网核验正文"],
            ["autoLearnEnabled", DEFAULTS.autoLearnEnabled ? "true" : "false", "开关", "对话要点自动写入知识库"],
            ["autoLearnRequireConfirm", DEFAULTS.autoLearnRequireConfirm ? "true" : "false", "开关", "自动学习是否进审核队列"],
            ["autoLearnMinQuestionChars", String(DEFAULTS.autoLearnMinQuestionChars), "1–50", "自动学习最短问题长度"],
            ["autoLearnMinAnswerChars", String(DEFAULTS.autoLearnMinAnswerChars), "20–1000", "自动学习最短回答长度"],
          ],
          [22, 14, 18, 46]
        ),
        spacer(),
        para("配置入口：知识库 → 配置侧边栏（index.html 中 kbSearchTopK、kbSearchMinScore、kbHybridSearch 等控件）。修改后通过 kb-save-settings IPC 写入当前库 settings。", {
          italics: true,
        }),

        heading("三、检索质量保障机制"),
        heading("3.1 入库阶段（影响后续检索质量）", HeadingLevel.HEADING_2),
        bullet("MD5 去重：相同文件内容不重复入库；内容变更触发增量更新（planChunkIncrementalUpdate）"),
        bullet("分块元数据头：新文档每块前缀 [文档]、[路径]、[分块] n/m，提升文件名/路径检索命中"),
        bullet("BGE 非对称嵌入：文档块使用 passage 前缀 Represent this sentence for retrieval:"),
        bullet("批量嵌入 batchSize=8，降低 Ollama 延迟与超时风险"),
        bullet("FTS 索引同步：入库后 upsertChunkInIndex 更新 fts-index.json（BM25）"),
        bullet("可选 autoWebVerify：入库前 verifyTextOnline 修正正文（默认关闭，显著增加耗时）"),

        heading("3.2 查询理解与自适应调参（autoTune）", HeadingLevel.HEADING_2),
        para(
          "kb-search 默认 autoTune=true（payload.autoTune !== false）。系统先用 classifyQuery 识别查询类型，再用 inferQueryProfile 选择 preset，动态覆盖 minScore、vectorWeight、candidateK、topK 等，无需用户手动切换模式。"
        ),
        fixedTable(queryProfileRows, [14, 28, 10, 12, 10, 12, 10]),
        spacer(),
        para("searchMode=auto 时的 effectiveMode 映射：", { bold: true }),
        bullet("filename / identifier / code → keyword（偏重关键词与元数据）"),
        bullet("semantic_question / summary → semantic（纯向量路，关键词路关闭）"),
        bullet("其他 → hybrid（四路全开）"),
        bullet("topK 在 autoTune 下可 +topKBoost（filename/identifier/code/summary 最多 +2）"),

        heading("3.3 四路召回与打分公式", HeadingLevel.HEADING_2),
        fixedTable(
          [
            ["召回路", "实现", "关键参数"],
            ["向量", "LanceDB lanceSearchByEmbedding", `candidateK 默认 ${DEFAULTS.searchCandidateK}，失败回退 cosineSimilarity`],
            ["关键词", "scanChunksByKeyword", `minKeywordScore=0.35，limit=keywordRecallLimit（${DEFAULTS.keywordRecallLimit}）`],
            ["元数据", "scanMetadataHits", "minMetadataScore=0.45，limit=min(30, keywordLimit)"],
            ["BM25 全文", "searchFtsIndex（fts-index.json）", "k1=1.2, b=0.75；缺索引时自动 rebuild"],
          ],
          [14, 42, 44]
        ),
        spacer(),
        para("融合（mergeAndFuseHits）：", { bold: true }),
        bullet("RRF 模式（useRrfRanking=true，默认）：RRF_K=60，四路 rank 求 1/(k+rank) 之和，再与 fieldBoost、metadataBoost 合成"),
        bullet("RRF 归一化：fused = max(signal, signal×0.65 + rrfNorm×0.35)，signal=max(vector, keyword, fts, metadata)"),
        bullet("加权模式（RRF 关）：fuseHybridScore = vectorWeight×vector + (1-vectorWeight)×max(keyword, fts, metadata)"),
        bullet("fieldBoost：文件名/路径/正文命中加分；OCR 置信度 <0.5 减 0.08；可信度/来源 penalize（见第五节）"),
        bullet("关键词保底：recallSource 含 keyword 且 keywordScore≥0.45 时，fused ≥ keywordScore×0.9 + fieldBoost"),
        bullet("元数据强命中：metadataScore≥0.85 时，fused ≥ metadataScore×0.95 + fieldBoost"),

        heading("3.4 重排序（精排）", HeadingLevel.HEADING_2),
        para("在融合排序之后、阈值过滤之前执行 rerankSearchHits："),
        bullet(`取 Top rerankTopN=${DEFAULTS.rerankTopN} 候选，用 bge-reranker-v2-m3 打分`),
        bullet(`combined = rerankWeight×rerankScore + (1-rerankWeight)×baseScore（默认 rerankWeight=${DEFAULTS.rerankWeight}）`),
        bullet("provider=onnx（默认）：@huggingface/transformers 加载 ONNX q8，超时 180s；失败则跳过并记录 rerank_skip"),
        bullet("TopN 之外的 tail 候选保持原序追加，不参与重排"),

        heading("3.5 后处理与结果扩展", HeadingLevel.HEADING_2),
        bullet("相邻块扩展：forAgent 或 expandAdjacent 时 radius=3、maxExtra=14；UI 试用 radius=1、maxExtra=6"),
        bullet("章节范围扩展：expandSectionRangeChunkHits（API 规范类查询）"),
        bullet("API 规范查询（isApiSpecQuery）：过滤目录块 isTocLikeChunk、修订历史块 isRevisionHistoryLikeChunk"),
        bullet("finalizeAgentSearchHits：AI 助手 forAgent=true 时 cap=max(topK,18)，API 查询优先保留 section_range 块"),

        heading("3.6 阈值过滤与低置信判定", HeadingLevel.HEADING_2),
        para("hitMeetsMinScore：候选保留条件为 maxRecallSignal ≥ minScore 或 fused ≥ minScore。"),
        para("maxRecallSignal = max(vectorScore, keywordScore, metadataScore, ftsScore, preRerankScore)。"),
        spacer(),
        para("低置信（lowConfidence / noAnswer）判定逻辑（kb-search）：", { bold: true }),
        bullet("configuredMin = 用户 settings.searchMinScore 或 payload.minScore（默认 0.7；代码 fallback 0.55）"),
        bullet("autoTune 时 minScore = min(configuredMin, profile.minScore) — 问句类可能降到 0.55"),
        bullet("noAnswerThreshold = max(minScore, 语义问句/摘要类 ? 0.62 : minScore)"),
        bullet("lowConfidence = 过滤后 hits 为空 OR bestScore < noAnswerThreshold"),
        bullet("note 提示：「未找到可靠答案，建议换关键词或检查文档是否已入库」"),
        spacer(),
        fixedTable(
          [
            ["置信层级", "判定条件", "系统行为"],
            ["高（AI 助手）", "bestScore ≥ 0.75 且非 lowConfidence", "grounding.confidence=「高」，正常基于 evidence 作答"],
            ["中", "有命中且 bestScore < 0.75", "confidence=「中」，仍要求引用 evidence"],
            ["低 / 无答案", "lowConfidence 或 hits 为空", "confidence=「低」；answerInstruction 要求明确说不确定、禁止编造"],
          ],
          [16, 36, 48]
        ),

        heading("四、检索流水线时序（kb-search）"),
        para("1. classifyQuery → 2. 解析 effectiveMode / topK / minScore / hybridWeight / candidateK"),
        para("3. Ollama embed(query, role=query) → 4. 各库 performLibraryRecall（四路）→ 5. 全局 sort by score"),
        para("6. rerankSearchHits（可选）→ 7. expandAdjacent / sectionRange → 8. hitMeetsMinScore 过滤"),
        para("9. finalizeAgentSearchHits → 10. 计算 lowConfidence → 11. appendSearchLog（含 low_confidence 标记）"),
        spacer(),
        fixedTable(
          [
            ["运行时限制", "值", "说明"],
            ["KB_SEARCH_HANDLER_TIMEOUT_MS", "360000（6 分钟）", "整次检索 IPC 超时"],
            ["重排序超时", "180000（3 分钟）", "rerank 阶段 withKbOpTimeout"],
            ["Ollama embed 检测", "3000ms", "算力/设备探测"],
            ["RRF_K", "60", "Reciprocal Rank Fusion 常数"],
            ["KEYWORD_RECALL_LIMIT", "50", "kbRetrieval 默认关键词上限"],
          ],
          [28, 22, 50]
        ),

        heading("五、可信回答与内容可信度机制"),
        heading("5.1 可信度三级（utils/kbAutoLearn.js）", HeadingLevel.HEADING_2),
        fixedTable(
          [
            ["级别", "枚举值", "含义", "检索 fieldBoost 惩罚"],
            ["未确认", "unconfirmed", "自动学习/对话写入默认", "-0.12"],
            ["已确认", "confirmed", "人工审核通过", "-0.03"],
            ["已核验", "verified", "联网核验回写后标记", "0（无惩罚）"],
          ],
          [14, 16, 38, 32]
        ),
        spacer(),
        para("来源类型（sourceType）：chat | image-vision | web-verify | manual。AI 生成内容 sourcePath 以 ai:// 开头额外 -0.05；ai://auto-learn -0.12。"),

        heading("5.2 AI 助手 grounding（app.js kb_search）", HeadingLevel.HEADING_2),
        bullet("检索参数：forAgent=true, expandAdjacent=true, topK 默认 8"),
        bullet("evidence 字段含 document、chunkIndex、finalScore、各分路分数、text（最长 12000 字符）"),
        bullet("noAnswer 时 answerInstruction：「本地知识库未找到可靠依据。请明确告知用户不确定，不要编造内容。」"),
        bullet("正常时：「请仅基于 evidence 中的 text 字段回答，并在回答中引用文档名与分块序号作为依据。」"),
        bullet("API 规范类查询附加严格字段表/JSON 约束，禁止用修订历史代替字段表、禁止虚构字段"),
        bullet("小参数本地模型（≤7B）evidence text 截断至 9000 字符"),

        heading("5.3 低置信联网核验（用户授权）", HeadingLevel.HEADING_2),
        para("当 kb_search 返回 lowConfidence=true 时，app.js 弹出 confirm 询问是否授权联网核验。"),
        bullet("用户同意 → kbWebVerifyQuery：对 Top1 分块 verifyTextOnline，返回 summary/correctedText/sources"),
        bullet("aiVerifyWriteback=true 且 correctedText 有变化 → 回写分块文本+向量，标记 credibility=verified、sourceType=web-verify"),
        bullet("用户拒绝 → 仅返回本地结果，webVerification.denied=true"),
        bullet("入库级 autoWebVerify（默认 false）：ingest 前对整篇正文联网核验，写入 doc.verification"),

        heading("5.4 自动学习（可控写入，默认关闭）", HeadingLevel.HEADING_2),
        bullet("autoLearnEnabled=false：不自动入库对话"),
        bullet("阈值：问题 ≥ autoLearnMinQuestionChars（6），回答 ≥ autoLearnMinAnswerChars（80）"),
        bullet("autoLearnRequireConfirm=true：进审核队列（pending），人工 approve 后入库"),
        bullet("入库文档 autoLearnMeta.credibility 默认 unconfirmed，verification.summary 提示待人工确认"),
        bullet("审核队列与审计：kb_auto_learn_queue、kb_auto_learn_audit 表（SQLite）"),

        heading("5.5 检索日志与质量回归", HeadingLevel.HEADING_2),
        bullet("每次 kb-search 异步写入 kb_search_logs：query、query_type、hit_count、elapsed_ms、low_confidence、debug_json"),
        bullet("npm run kb:eval：对 config/kb-eval-golden.json（30 条黄金查询）做 classifyQuery、RRF、BM25 等单元回归"),
        bullet("kb-index-health：检查 LanceDB 分片数 vs SQLite/FTS 一致性"),
        bullet("kb-rebuild-embeddings / kb-rebuild-fts-index：运维级索引重建"),

        heading("六、按场景的推荐调参"),
        fixedTable(
          [
            ["场景", "建议调整", "原因"],
            ["专有名词/编号搜不到", "hybridSearch 开；keywordRecallLimit↑；或 searchMinScore↓至 0.45", "加强关键词/BM25 路"],
            ["问句召回太杂", "searchMinScore↑至 0.65–0.75；rerankEnabled 开", "提高阈值+精排"],
            ["文件名检索", "保持 searchMode=auto 即可", "auto 会切 keyword 模式且 metadataBoost 高"],
            ["超大库性能", "searchCandidateK↓；keywordRecallLimit↓；rerankTopN↓", "减少候选与重排开销"],
            ["提升 AI 回答可信度", "开启 autoLearnRequireConfirm；核验后 aiVerifyWriteback", "未确认内容降权，核验内容 verified"],
            ["接口/API 文档", "依赖内置 isApiSpecQuery 逻辑，无需额外配置", "自动扩展章节、过滤 TOC/修订史"],
          ],
          [22, 38, 40]
        ),

        heading("七、当前设计的质量边界（诚实说明）"),
        bullet("RRF 分与 0–1 向量分尺度不同，hitMeetsMinScore 用双条件（signal OR fused）缓解误杀"),
        bullet("关键词路为内存扫描+BM25 JSON 索引，非 Elasticsearch 级 FTS，超大库可能变慢"),
        bullet("低置信阈值 0.62 对语义问句较严格，可能增加「无答案」率，但降低幻觉风险"),
        bullet("联网核验依赖 verifyTextOnline / webSearchBlockBuilder 是否注入主进程，非所有构建均启用"),
        bullet("OCR 图片入库质量波动大，ocrConfidence<0.5 会在 fieldBoost 降权"),

        heading("八、关键源码索引"),
        fixedTable(
          [
            ["文件", "职责"],
            ["utils/kbConfigLayout.js", "DEFAULT_KB_RETRIEVAL_SETTINGS、normalizeKbSettings、validateKbSettings"],
            ["utils/kbRetrieval.js", "classifyQuery、mergeAndFuseHits、hitMeetsMinScore、fieldBoost、finalizeAgentSearchHits"],
            ["utils/kbRerank.js", "rerankSearchHits、ONNX/Ollama 重排"],
            ["utils/kbFtsIndex.js", "BM25 倒排 searchFtsIndex"],
            ["utils/kbAutoLearn.js", "credibilitySearchPenalty、自动学习阈值"],
            ["knowledgeBaseMain.js", "kb-search、kb-web-verify-query、ingest autoWebVerify"],
            ["app.js", "kb_search Skill grounding、低置信联网 confirm"],
            ["config/kb-eval-golden.json", "检索回归黄金集 30 条"],
          ],
          [32, 68]
        ),

        heading("九、总结"),
        bullet(
          `检索质量：默认启用混合检索 + RRF + bge-reranker 精排，四路召回（向量/关键词/元数据/BM25），autoTune 按查询类型动态调 minScore（${DEFAULTS.searchMinScore} 基线）、vectorWeight（${DEFAULTS.hybridVectorWeight}）、candidateK（${DEFAULTS.searchCandidateK}）。`
        ),
        bullet(
          "可信回答：低置信判定（bestScore < noAnswerThreshold）→ AI 禁止编造；evidence grounding + 文档/分块引用；可信度三级降权未确认内容；可选联网核验回写为 verified。"
        ),
        bullet("默认偏保守：aiVerifyWriteback、autoWebVerify、autoLearnEnabled 均为 false，需用户显式开启增强写入/核验能力。"),
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
