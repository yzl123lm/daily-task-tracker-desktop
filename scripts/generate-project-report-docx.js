/**
 * 生成《鲸落AI 项目详细报告书》Word 文档
 * 用法: node scripts/generate-project-report-docx.js
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  PageBreak,
} = require("docx");

const pkg = require("../package.json");
const OUT_DIR = path.join(__dirname, "..");
const OUT_FILE = path.join(OUT_DIR, `鲸落AI项目详细报告书_v${pkg.version}.docx`);

const FONT_MAIN = "宋体";
const FONT_HEAD = "黑体";
const today = new Date().toISOString().slice(0, 10);

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT_HEAD, bold: true, size: 36 })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160 },
    children: [new TextRun({ text, font: FONT_HEAD, bold: true, size: 30 })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, font: FONT_HEAD, bold: true, size: 26 })],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    indent: opts.indent ? { firstLine: 480 } : undefined,
    children: [
      new TextRun({
        text,
        font: FONT_MAIN,
        size: 24,
        bold: !!opts.bold,
        color: opts.color,
      }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { after: 80 },
    bullet: { level: 0 },
    children: [new TextRun({ text, font: FONT_MAIN, size: 24 })],
  });
}

function cell(text, bold = false) {
  return new TableCell({
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text, font: FONT_MAIN, size: 22, bold })],
      }),
    ],
  });
}

function tableRow(cells) {
  return new TableRow({ children: cells.map((c) => cell(c.text, c.bold)) });
}

function moduleTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      tableRow([
        { text: "模块名称", bold: true },
        { text: "主要功能", bold: true },
        { text: "关键文件/入口", bold: true },
      ]),
      ...rows.map((r) => tableRow([{ text: r[0] }, { text: r[1] }, { text: r[2] }])),
    ],
  });
}

const doc = new Document({
  creator: "鲸落AI",
  title: "鲸落AI 项目详细报告书",
  description: "功能模块、技术栈与能力说明",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 2400, after: 400 },
          children: [
            new TextRun({ text: "鲸落AI", font: FONT_HEAD, bold: true, size: 56 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "项目详细报告书", font: FONT_HEAD, bold: true, size: 44 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `版本：${pkg.version}`, font: FONT_MAIN, size: 26 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 120 },
          children: [
            new TextRun({ text: `生成日期：${today}`, font: FONT_MAIN, size: 26 }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 800 },
          children: [
            new TextRun({
              text: "Electron 桌面客户端 · 智能工作助手",
              font: FONT_MAIN,
              size: 24,
              color: "666666",
            }),
          ],
        }),
        p(
          "本报告基于当前代码库（daily-task-tracker-desktop）梳理，涵盖产品定位、功能模块划分、技术栈选型、核心能力清单、架构与交付方式，供项目评审、交接与对外说明使用。",
          { indent: true },
        ),

        h1("一、项目概述"),
        p(
          "鲸落AI 是一款面向日常办公场景的 Electron 桌面客户端，产品定位是「智能工作助手」。它将每日工作任务跟进、AI 对话助手、本地知识库（RAG）、本地大模型部署、语音与多媒体能力整合在同一工作台中，支持 Windows 完整交付（NSIS 安装包 + 便携版），并可在 macOS 上本地开发与打包。",
          { indent: true },
        ),
        p("核心价值：", { bold: true }),
        bullet("任务全生命周期管理：登记、筛选、看板、列表、备注、完结与提醒"),
        bullet("AI 原生工作流：通过 Function Calling / Skill 直接操作任务、生成报表、检索知识库"),
        bullet("本地优先：Ollama 本地模型、LanceDB 向量库、本机文档入库，降低数据外泄风险"),
        bullet("可扩展能力层：联网检索、ASR/TTS、文生图/图像理解、农历黄历、文档导出等"),

        h1("二、功能模块清单"),
        h2("2.1 主导航模块"),
        moduleTable([
          [
            "新增待处理事项",
            "五步表单（问题类型、内容、人员、优先级、附件与备注）；支持拖拽上传附件；可配置任务附件存储根目录",
            "index.html #panel-new · taskAttachmentsUI.js",
          ],
          [
            "查询筛选",
            "多条件组合筛选（状态、类型、人员、时间、关键词等）；结果导出与跳转详情",
            "index.html #panel-filter · app.js",
          ],
          [
            "数据看板",
            "任务状态/类型/人员等维度 Canvas 图表（饼图、折线、柱状）；快照供 AI Skill 调用",
            "index.html #panel-dashboard · taskAnalytics.js",
          ],
          [
            "任务列表",
            "全量任务表格视图；增量 DOM 渲染；详情弹窗含备注历史与附件列表",
            "index.html #panel-list · app/taskListView.js",
          ],
          [
            "AI 助手",
            "多轮对话、模型配置、联网检索、知识库开关、长期记忆、文档预览、语音输入/播报；对话/文生图/图像理解三模式",
            "index.html #panel-ai · ai.js · ai/aiDocVisual.js",
          ],
          [
            "记录助手",
            "麦克风录音 → ASR 转写 → AI 分析；支持导出与自动分析",
            "index.html #panel-record · recorder.js",
          ],
          [
            "本地知识库",
            "文档入库、向量+关键词混合检索、重排序、目录监听、自动学习队列、模型健康检查、检索调试",
            "index.html #panel-knowledge-base · knowledgeBase.js · knowledgeBaseMain.js",
          ],
        ]),

        h2("2.2 设置与能力中心（顶部「能力设置」对话框）"),
        moduleTable([
          [
            "AI 路由与模型",
            "统一/模块化路由；多 Profile（云端 API + 本地 Ollama）；模型搜索与管理",
            "capability.js · main/aiSessionStore.js",
          ],
          [
            "语音能力（ASR/TTS）",
            "Whisper 兼容 ASR；TTS 引擎与音色；AI 回复自动播报；按住说话语音问答",
            "capability.js · recorder.js · preload ASR/TTS IPC",
          ],
          [
            "图像能力",
            "文生图、图像理解（Vision）；MiniMax 等原生图像接口适配",
            "capability.js · media.js · ai.js",
          ],
          [
            "本地模型部署",
            "连接 Ollama；浏览模型库；拉取/删除本机模型；硬件推荐；一键写入 AI 配置",
            "localModels.js · main/ollamaRuntime.js",
          ],
          [
            "Skill 管理",
            "任务操作、检索统计、日报周报、风险预警、知识库 RAG、农历黄历、文档导出等可开关 Skill",
            "skills.js · capability.js",
          ],
          [
            "运行环境向导",
            "检测 Python/Ollama/模型；安装路径配置；自动修复与预热",
            "environmentSetup.js · main/environment/*",
          ],
        ]),

        h2("2.3 后台与支撑模块"),
        bullet("任务附件存储：按「问题类型+日期」分文件夹；IPC 读写、打开、删除（main/taskAttachments.js）"),
        bullet("AI 会话持久化：多会话、历史消息、长期记忆摘要（main/aiSessionStore.js）"),
        bullet("联网检索管道：查询改写、多源抓取、摘要生成、规则配置（searchPipeline.js）"),
        bullet("文档预览：右侧分栏预览 PDF/Word/图片/HTML（docPreviewController.js）"),
        bullet("正式公文导出：Markdown → Word（docx）/ PDF（wordFormalExport.js · pdfFormalExport.js）"),
        bullet("启动与预热：Splash 窗口、环境检测、嵌入模型预热（main/startup/*）"),
        bullet("客户端交付：一键 build + 归档 + 静默安装（scripts/ship-latest-client-win.ps1）"),

        new Paragraph({ children: [new PageBreak()] }),

        h1("三、技术栈与依赖"),
        h2("3.1 应用框架"),
        moduleTable([
          ["Electron", "41.x", "跨平台桌面壳；主进程 + 渲染进程 + preload 安全桥"],
          ["electron-builder", "26.x", "Windows NSIS/便携版、macOS DMG/ZIP 打包"],
          ["原生 HTML/CSS/JS", "—", "无 React/Vue；index.html + 模块化 JS 文件"],
        ]),

        h2("3.2 核心 npm 依赖"),
        moduleTable([
          ["@lancedb/lancedb + apache-arrow", "向量存储", "知识库语义检索、文档分块嵌入"],
          ["@huggingface/transformers", "本地推理", "部分嵌入/模型相关能力"],
          ["docx / pdfkit / pdf-parse", "文档处理", "Word/PDF 导出与 PDF 文本提取"],
          ["mammoth / word-extractor", "Office", "Word 文档解析入库"],
          ["xlsx", "表格", "Excel 任务导出；知识库 xlsx 解析"],
          ["tesseract.js + pdf-to-png-converter", "OCR", "扫描件 PDF 文字识别"],
          ["jszip", "压缩", "docx 等格式处理"],
          ["sql.js", "SQLite", "知识库 FTS 关键词索引（utils/kbSqliteStore.js）"],
          ["lunar-javascript", "历法", "公农历互转、节假日（本地计算）"],
          ["opencc-js", "简繁", "可选中文转换"],
        ]),

        h2("3.3 外部运行时（可选/推荐）"),
        bullet("Node.js 18+（开发/打包；推荐 LTS）"),
        bullet("Ollama：本地 LLM、Embedding（bge-m3 等）、Reranker（bge-reranker-v2-m3）"),
        bullet("Python 3：cnlunar 黄历 Skill；图标生成脚本；部分 Windows Excel 加密解析"),
        bullet("OpenAI 兼容 API：硅基流动、OpenRouter、DeepSeek、MiniMax 等云端模型"),

        h2("3.4 架构模式"),
        bullet("主进程 IPC 按域拆分：会话、导出、环境、嵌入、知识库、任务附件、农历等（main/ipc/*）"),
        bullet("preload contextBridge 暴露 electronAPI，渲染进程无 Node 直接访问"),
        bullet("用户数据：Electron userData 目录；任务与配置 localStorage + JSON 文件"),
        bullet("CSP 内容安全策略：限制 script/style/connect 来源（index.html meta CSP）"),
        bullet("UI 主题：styles.css 基础 + ui-nebula-theme.css Nebula 主题覆盖"),

        h1("四、核心能力清单"),
        h2("4.1 任务管理能力"),
        bullet("字段：序列号、事物 ID、问题类型、内容、反馈人、处理人、登记时间、优先级、截止日期、状态、备注"),
        bullet("状态流转：待处理 / 处理中 / 已阻塞 / 已挂起 / 已完结 / 已取消"),
        bullet("备注历史时间线；完结操作；未完结任务定时提醒（每分钟轮询）"),
        bullet("任务模板：日常跟进、缺陷修复、需求评审等预设 + 自定义模板"),
        bullet("自定义报表：按维度聚合生成结构化报表（供 AI 与人工使用）"),
        bullet("Excel 导出：任务列表导出 .xlsx"),

        h2("4.2 AI 助手能力"),
        bullet("OpenAI Chat Completions 兼容协议；流式/非流式对话"),
        bullet("Function Calling：20+ 工具（任务 CRUD、统计、报表、风险、知识库检索、导出等）"),
        bullet("三模式：对话 / 文生图 / 图像理解（拖入或粘贴图片）"),
        bullet("联网检索：客户端经公开接口拉取摘要写入上下文（可配置来源与规则）"),
        bullet("长期记忆：历史问答摘要沉淀，后续对话引用（最多 50 条）"),
        bullet("文档预览：对话引用附件时在右侧分栏预览"),
        bullet("语音：按住说话 ASR 输入；TTS 自动播报回复"),
        bullet("快捷指令：总结待办、生成周报、查询知识库等 Chip"),
        bullet("AI 创建任务时附件同步至任务附件目录"),

        h2("4.3 知识库（RAG）能力"),
        bullet("多库管理：创建/重命名/删除/切换知识库；自定义存储目录"),
        bullet("支持格式：PDF、Word、Excel、Markdown、TXT、代码/JSON 等；加密文档密码库"),
        bullet("入库流水线：解析 → 分块（可配置 size/overlap/strategy）→ 嵌入 → LanceDB + FTS"),
        bullet("检索模式：向量 / 关键词 / 混合；RRF 融合；可选 Rerank 二次排序"),
        bullet("目录监听：指定文件夹自动扫描入库"),
        bullet("自动学习：AI 问答候选入库队列，人工审核后写入知识库"),
        bullet("模型健康检查：Ollama、Embed、Rerank 连通性与建议"),
        bullet("检索调试：可解释排序、检索历史、操作日志"),

        h2("4.4 本地模型与语音图像"),
        bullet("Ollama：列出/拉取/删除模型；进度回调；本机已装模型标注"),
        bullet("CPU/GPU 硬件推荐与本地 LLM 提示"),
        bullet("ASR：OpenAI Whisper 兼容接口；多语言；热词 Prompt"),
        bullet("TTS：多引擎/音色；测试播报"),
        bullet("文生图 / 图像理解：独立媒体面板 + AI 助手内嵌模式"),

        h2("4.5 Skill 体系（AI 可调用）"),
        p("内置 Skill 目录（skills.js），可按优先级 P0–P2 开关：", { indent: true }),
        bullet("P0：任务操作、任务检索与聚合、日报/周报、风险预警（黄/橙/红）"),
        bullet("P1：数据分析、文案润色、高逻辑模式、八字命理、农历/黄历、文档导出、运行环境评估、BGE 嵌入"),
        bullet("P1/P2：知识库 RAG（kb_search）、任务 Excel 导出"),
        bullet("规划中：企业微信/飞书/钉钉/邮件催办提醒"),

        h2("4.6 环境与交付能力"),
        bullet("首次启动环境向导：Python / Ollama / 模型三步检测与修复"),
        bullet("安装路径可配置：Python、Ollama、Models 目录"),
        bullet("ship:latest-client：构建 → 归档至「最新客户端/」→ NSIS 静默安装 → 快捷方式"),
        bullet("双模式运行：Electron 完整版；亦可浏览器打开 index.html 使用基础任务功能（localStorage）"),

        h1("五、项目结构（核心目录）"),
        p("main.js / main/** — Electron 主进程（窗口、IPC、Ollama、知识库主逻辑、附件、导出）", { indent: true }),
        p("preload.js — 渲染进程安全桥 electronAPI", { indent: true }),
        p("index.html + app.js + styles.css — 任务工作台 UI 与业务逻辑", { indent: true }),
        p("ai.js / skills.js / capability.js — AI 助手、Skill、能力配置", { indent: true }),
        p("knowledgeBase.js / knowledgeBaseMain.js / utils/kb* — 知识库前端与检索工具", { indent: true }),
        p("localModels.js / environmentSetup.js — 本地模型与环境向导", { indent: true }),
        p("scripts/ — 打包、安装、GitHub 推送、知识库评测脚本", { indent: true }),
        p("build/ — 应用图标；最新客户端/ — 版本归档产物", { indent: true }),

        h1("六、版本与许可"),
        p(`当前版本：${pkg.version}（package.json）`, { indent: true }),
        p("许可证：MIT（README.md · LICENSE）", { indent: true }),
        p("产品名称：鲸落AI（electron-builder productName）", { indent: true }),
        p(`报告生成：${today}，由 scripts/generate-project-report-docx.js 自动生成`, { indent: true }),

        h1("七、总结"),
        p(
          "鲸落AI 是一个功能完整的「任务 + AI + 知识库」一体化桌面工作台。其技术路线以 Electron 为壳、原生 Web 为 UI、主进程承载重计算与本地 IO，通过 Skill 与 IPC 将大模型能力深度嵌入日常工作流。项目在本地隐私（Ollama + LanceDB）、云端模型灵活接入、办公文档处理与正式导出等方面具备较完整的能力闭环，适合作为个人或小团队的智能办公助手基座持续迭代。",
          { indent: true },
        ),
      ],
    },
  ],
});

async function main() {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_FILE, buffer);
  console.log(`已生成: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
