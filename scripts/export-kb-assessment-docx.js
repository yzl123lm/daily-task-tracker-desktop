/**
 * 导出「本地知识库能力测评」Word 文档
 * 运行：node scripts/export-kb-assessment-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "本地知识库能力测评报告.docx");

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
  title: "本地知识库能力测评报告",
  description: "鲸落AI 桌面客户端内置本地知识库能力与架构说明",
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({ text: "鲸落AI 本地知识库能力测评报告", bold: true, size: 36 }),
          ],
        }),
        para("生成日期：2026年6月11日", { italics: true, color: "666666" }),
        spacer(),

        heading("一、一句话结论"),
        para(
          "目前的「本地知识库」是运行在鲸落AI 桌面客户端里的、完全本地的文档问答资料库：把文件解析成文字 → 切成小块 → 用本机 Ollama 生成向量 → 存入 LanceDB → 搜索时通过「向量 + 关键词」双路召回找答案。不依赖云端数据库，检索在本机完成。"
        ),

        heading("二、用什么方式搭建的？（技术架构）"),
        para("可以把它理解成四层结构："),
        bullet("界面层：knowledgeBase.js + index.html；AI 助手技能 kb_search"),
        bullet("桥接层：preload.js → Electron IPC"),
        bullet("主进程核心 knowledgeBaseMain.js：解析 / 分块 / 入库、kb-search 检索、图谱 / 监控 / 自动学习"),
        bullet("检索与存储引擎：Ollama 嵌入（bge-m3）、LanceDB 向量库、JSON store + MD5 去重、utils/kbRetrieval.js 分块与混合打分"),
        spacer(),
        tableFromRows(
          [
            ["层级", "技术", "作用"],
            ["桌面壳", "Electron", "客户端主进程跑重活，界面只通过 IPC 调用"],
            ["嵌入模型", "本机 Ollama（默认 bge-m3）", "把文字变成向量；查询和文档用不同提示语（非对称嵌入）"],
            ["向量检索", "LanceDB（@lancedb/lancedb）", "按语义相似度找最相关的文本块"],
            ["元数据与分块", "JSON 文件（store.json）+ kbRetrieval.js", "记文档列表、分块内容、MD5、设置等"],
            ["文档解析", "mammoth、pdf-parse、xlsx、word-extractor、Tesseract OCR 等", "把各种文件变成可检索的纯文本"],
            ["安全", "utils/ipcValidate.js", "限制可读路径、上传大小等"],
          ],
          [18, 28, 54]
        ),
        spacer(),
        heading("数据存储位置", HeadingLevel.HEADING_2),
        bullet("默认：%APPDATA%/daily-task-tracker-desktop/knowledge-base/"),
        bullet("也可在配置里改到自定义目录"),
        bullet("每个知识库一个子目录，里面有 store.json（文档+分块）和 lancedb/（向量表）"),

        heading("三、目前已具备的能力（按功能分类）"),

        heading("1. 知识库管理", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["多知识库目录", "可建多个库、切换、重命名"],
            ["自定义存储根目录", "整个知识库数据可迁到指定文件夹"],
            ["文档列表", "按库展示已入库文档、分块数量"],
            ["删除 / 跨库迁移", "删文档或移到另一个知识库"],
          ],
          [30, 70]
        ),
        spacer(),

        heading("2. 文档入库（解析 → 分块 → 向量化）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["手动选文件入库", "支持多选"],
            ["拖拽 / 路径入库", "kb-ingest-path"],
            ["监控目录自动入库", "fs.watch 监听文件夹，新增/修改自动入库（可配置）"],
            ["MD5 去重", "同文件内容不重复入库；内容变更会更新"],
            ["批量嵌入", "分块批量调 Ollama，减少等待"],
            ["分块元数据头（新文档）", "每块带 [文档]、[路径]、[分块] 信息，方便搜文件名"],
            ["重建向量索引", "对已有库一键按最新嵌入策略重算向量"],
          ],
          [30, 70]
        ),
        spacer(),
        para("支持的文件类型（主要）：", { bold: true }),
        bullet("文本：.txt .md .csv .json .log .html .xml .yml 等"),
        bullet("Office：.doc .docx .xlsx .xls"),
        bullet("PDF：.pdf（可复制文本；扫描版依赖 OCR 质量）"),
        bullet("图片：.png .jpg 等（Tesseract OCR 转文字后入库）"),
        spacer(),

        heading("3. 检索能力（核心）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["语义检索（向量）", "问句转向量，LanceDB 找语义相近的段落"],
            ["关键词补召回", "全库扫描 Top-30 关键词匹配，不依赖向量先命中"],
            ["混合打分", "向量分 × 权重 + 关键词分 × (1-权重) 融合排序"],
            ["查询自适应", "自动识别「文件名 / 编号 / 问句」等，微调阈值和权重"],
            ["多库联合检索", "试用检索和 AI 技能可跨多个知识库搜"],
            ["低置信提示", "结果太差时可触发联网核验（需用户授权）"],
          ],
          [30, 70]
        ),
        spacer(),
        para("当前默认检索参数：", { bold: true }),
        bullet("返回条数 topK：10"),
        bullet("最低相似度：0.55"),
        bullet("向量候选池：200 条"),
        bullet("混合检索：开，向量权重 0.6"),
        spacer(),

        heading("4. 关系图谱", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["文档关系图", "根据分块共现等生成节点/边，SVG 可视化"],
            ["全局 / 单库图谱", "可切换范围"],
            ["力导向布局", "可开关、重置、仅显示文档节点"],
          ],
          [30, 70]
        ),
        spacer(),

        heading("5. 与 AI 助手联动", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["技能 kb_search", "AI 对话时可查本地知识库"],
            ["全自动学习", "可选：把对话要点自动写入当前库"],
            ["联网核验回写", "低置信命中时，授权后可联网核对并写回库"],
          ],
          [30, 70]
        ),
        spacer(),

        heading("6. 配置与运维", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "说明"],
            ["分块大小 / 重叠 / 策略", "语义分块（按段）或固定长度"],
            ["嵌入模型名", "默认 bge-m3，可改"],
            ["混合检索开关、向量权重、候选池", "配置弹窗可调"],
            ["评测脚本", "npm run kb:eval 做检索逻辑回归测试"],
          ],
          [30, 70]
        ),
        spacer(),

        heading("四、检索是怎么工作的？（通俗版）"),
        para("用户输入问题后，系统大致做这些事："),
        bullet("1. 理解问题类型（像文件名？像编号？像普通问句？）→ 自动微调参数"),
        bullet("2. 把问题变成向量（通过 Ollama，带「搜索用」提示语）"),
        bullet("3. 向量路：在 LanceDB 里找最像的约 200 个文本块"),
        bullet("4. 关键词路：在整个库里再扫一遍，找字面最匹配的约 30 块"),
        bullet("5. 两路合并打分，去掉低于阈值的，返回前 10 条"),
        bullet("6. 界面或 AI 助手展示：来源文件、分块位置、向量分/关键词分、召回来源"),
        spacer(),
        para(
          "这不是百度那种「纯关键词全网搜」，而是「懂意思的搜索 + 关键词兜底」。"
        ),

        heading("五、目前还不具备的能力（边界）"),
        tableFromRows(
          [
            ["不具备", "含义"],
            ["独立全文检索引擎", "没有 BM25 / Elasticsearch / SQLite FTS 那种「纯字面索引」"],
            ["纯关键词全库搜索", "关键词路有，但是扫描+打分，不是专业倒排索引，库特别大时会变慢"],
            ["Query Rewrite", "不会先用大模型改写法再搜"],
            ["按文档类型自动切分", "合同/代码/表格没有不同切分策略，统一约 800 字语义块"],
            ["云端知识库", "数据与检索都在本机，换电脑要自带数据目录"],
            ["实时协作 / 权限", "单机个人用，无多用户权限体系"],
          ],
          [30, 70]
        ),
        spacer(),

        heading("六、能力成熟度自评"),
        tableFromRows(
          [
            ["模块", "成熟度", "说明"],
            ["多格式入库", "★★★★☆", "常见办公格式齐全；扫描 PDF/OCR 质量看原件"],
            ["语义检索", "★★★★☆", "LanceDB + bge-m3，依赖本机 Ollama 是否正常"],
            ["关键词 / 专有名词", "★★★☆☆", "已做双路召回，但仍弱于专业 FTS"],
            ["多库管理", "★★★★☆", "完整"],
            ["目录监控", "★★★★☆", "有防抖、串行队列、MD5 更新"],
            ["图谱", "★★★☆☆", "辅助浏览，不是检索主路径"],
            ["AI 联动", "★★★★☆", "技能 + 自动学习 + 低置信核验"],
            ["可运维性", "★★★☆☆", "有重建索引和 kb:eval，缺完整业务评测集"],
          ],
          [22, 14, 64]
        ),
        spacer(),

        heading("七、总结"),
        bullet("是什么：鲸落AI 内置的、完全本地的「文档切片 + 向量语义搜索」知识库。"),
        bullet("怎么搭的：Electron 主进程 + Ollama 嵌入 + LanceDB 向量库 + JSON 元数据 + 多种文档解析器。"),
        bullet(
          "强在哪：多格式入库、混合检索（向量+关键词双路）、多库、监控目录、AI 助手打通；弱在哪：没有专业全文索引，超大库时关键词路性能和精确编号检索仍有限。"
        ),
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
