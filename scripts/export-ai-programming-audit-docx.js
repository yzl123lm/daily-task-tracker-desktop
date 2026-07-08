/**
 * 导出「AI 编程能力排查报告」Word 文档
 * 运行：node scripts/export-ai-programming-audit-docx.js
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
  BorderStyle,
} = require("docx");

const OUT_PATH = path.join(__dirname, "..", "AI编程能力排查报告.docx");
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
                    size: ri === 0 ? 22 : 20,
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
  title: "AI 编程能力排查报告",
  description: "Electron Workbench AI 编程能力全面排查 — 基于真实代码",
  sections: [
    {
      properties: {},
      children: [
        heading("AI 编程能力排查报告"),
        para(`生成日期：${GENERATED_AT} · 基于项目真实代码静态排查（未改代码）`, { italics: true }),
        para(
          "说明：本项目为 Electron + 原生 HTML/CSS/JS。Workbench 项目开发工作区位于 app/workbench/，主进程服务位于 main/workbench/，IPC 经 preload.js 暴露。"
        ),

        heading("1. 项目基本信息", HeadingLevel.HEADING_2),
        bullet("项目类型：Electron 桌面客户端「鲸落AI」，内置 Workbench 项目开发工作区（#wbProjectWorkspace）"),
        bullet("技术栈：Electron 41 + 原生 HTML/CSS/JS；主进程 Node.js；SQLite（node:sqlite）；IPC preload.js"),
        bullet(
          "AI 编程入口：projectArea.js 选项目 → projectWorkspace.js → wbProjectAgentRun；辅助入口 projectCodePanel.js（读/搜/写/Diff/Shell/测试/Git）"
        ),
        bullet("代码目录：projects.local_path + wbProjectChooseRoot；未配置时 fallback 应用根目录（registerExtracted.js）"),
        bullet("当前能力等级：L3（工具链完备）/ 有效 AI 智能层约 L2"),
        para(
          "关键结论：受控读写、Diff、Shell、测试、Git、记忆、压缩、审批均已落地；但 ProjectAgent 未接入 LLM，方案与 PLAN Diff 为规则模板。",
          { bold: true }
        ),

        heading("2. 能力总览表", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力模块", "是否已实现", "完成度", "相关文件", "主要问题", "优先级"],
            ["项目隔离", "是", "85%", "projectService.js, namespace.js", "UI 状态切换，无进程隔离", "P2"],
            ["任务管理", "部分", "70%", "projectService.js, projectWorkspace.js", "无任务归档/重试 UI", "P1"],
            ["代码读取", "是", "80%", "projectCodeService.js", "512KB/文本扩展名/树深度限制", "P2"],
            ["代码搜索", "部分", "55%", "projectCodeService.js", "仅子串匹配，无符号检索", "P1"],
            ["项目结构分析", "部分", "40%", "graphifyService.js, planOnlyOutput.js", "graphify 未进 Workbench Agent", "P0"],
            ["PLAN_ONLY", "部分", "50%", "agentOrchestrator.js, planOnlyOutput.js", "规则模板非 LLM", "P0"],
            ["受控写入", "是", "90%", "controlledDevService.js", "需人工编辑或接受 Diff", "P1"],
            ["Diff 审查", "部分", "75%", "diffReviewPanel.js", "方案 Diff 为占位注释", "P1"],
            ["Shell 执行", "是", "80%", "shellRunnerService.js", "白名单+审批", "P1"],
            ["测试构建", "部分", "55%", "testRunnerService.js", "白名单偏 wb 脚本", "P1"],
            ["错误修复", "部分", "35%", "fixSuggestionService.js", "无自动改码闭环", "P0"],
            ["Git 操作", "部分", "65%", "gitService.js, gitChangePanel.js", "无 push/reset", "P2"],
            ["上下文记忆", "是", "85%", "contextMemoryService.js", "namespace 隔离完善", "P2"],
            ["上下文压缩", "是", "85%", "context-compression/*", "手动+自动阈值", "P2"],
            ["工具日志", "是", "80%", "toolPermissionService.js", "缺统一 Timeline UI", "P2"],
            ["安全审批", "是", "85%", "approvalStore.js", "审批卡可用", "P2"],
            ["回滚恢复", "是", "80%", "backupRestoreService.js", "单文件备份", "P2"],
            ["前端 UI 开发", "部分", "45%", "projectSceneTemplates.js", "无 LLM 自动改 CSS/DOM", "P0"],
            ["编程闭环", "部分", "40%", "全链路分散", "缺 LLM Agent 工具循环", "P0"],
          ],
          [14, 10, 8, 22, 28, 8]
        ),

        heading("3. 已经具备的能力", HeadingLevel.HEADING_2),
        para("3.1 项目级隔离", { bold: true }),
        bullet("多项目、独立 projectId、独立 local_path、独立任务列表、namespace 隔离（project:/task:/chat:）"),
        bullet("ChatAgent 禁止开发工具；跨 namespace 读取 403（namespace.js）"),
        bullet("相关文件：projectService.js, namespace.js, store.js, contextMemoryService.js"),
        spacer(),
        para("3.2 代码读取", { bold: true }),
        bullet("IPC：wbProjectFilesTree / wbProjectFileRead → projectCodeService.js"),
        bullet("排除 node_modules/dist/.git 等；路径 assertUnderRoot；512KB 上限；文本扩展名白名单"),
        spacer(),
        para("3.3 受控写入与安全", { bold: true }),
        bullet("wbProjectApplyPatch → controlledDevService → projectWriteService"),
        bullet("userApproved 必填；敏感路径黑名单；写入前自动备份；tool_operations 日志"),
        bullet("相关文件：controlledDevService.js, projectWriteService.js, fileBackupService.js, approvalStore.js"),
        spacer(),
        para("3.4 Diff 审查（用户内容）", { bold: true }),
        bullet("真实 unified diff（buildPatchPreview）；多文件 accept/reject；批量写入 applyAcceptedDiffs"),
        bullet("相关文件：diffReviewPanel.js, codeReviewStore.js, diffPreviewService.js"),
        spacer(),
        para("3.5 Shell / 测试 / Git", { bold: true }),
        bullet("受控 Shell 白名单+黑名单+120s 超时（shellRunnerService.js）"),
        bullet("白名单测试 wbProjectRunTest / wbProjectRunTestFix（testRunnerService.js）"),
        bullet("git status + 审批 commit + 写入前建分支（gitService.js, gitChangePanel.js）"),
        spacer(),
        para("3.6 上下文记忆与压缩", { bold: true }),
        bullet("SQLite context_memories / context_snapshots / compression_events"),
        bullet("wbContextHealth / wbContextCompress / 手动压缩按钮（contextHealth.js）"),
        bullet("相关文件：context-compression/contextCompressionManager.js, contextMemoryService.js"),

        heading("4. 部分具备但不完整的能力", HeadingLevel.HEADING_2),
        bullet("ProjectAgent：有完整 IPC/UI，但 buildPlanOnlyOutput 为规则引擎，非 LLM（agentOrchestrator.js）"),
        bullet("Diff 审阅：UI 完整，方案阶段 Diff 为文件顶部插 PLAN_ONLY 注释（suggestPatchFromDescription）"),
        bullet("测试/构建：npm run build 可走受控 Shell，但 Agent 不会自动跑 build 并解析错误"),
        bullet("graphify：已接入主 AI 对话（skills.js + graphifyService.js），未接入 Workbench Agent"),
        bullet("场景模板：projectSceneTemplates.js 仅 enrich 提示词，不触发 LLM"),
        bullet("任务状态：后端 REVIEWING 与 UI 筛选 WAITING_APPROVAL 不一致"),

        heading("5. 当前缺失的关键能力", HeadingLevel.HEADING_2),
        bullet("P0-1：ProjectAgent 未接入 LLM + Tool Calling 循环"),
        bullet("P0-2：真实代码补丁生成（非插注释占位 Diff）"),
        bullet("P0-3：自动修复闭环（报错→改码→重测，限 N 轮）"),
        bullet("P0-4：graphify/结构扫描接入 Workbench Agent"),
        bullet("P0-5：符号/语义搜索、package.json scripts 自动分析"),
        bullet("P0-6：Workbench 与主 AI 对话区能力打通"),
        bullet("任务重试/归档/失败恢复 UI 缺失"),

        heading("6. 前端开发能力专项评估", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["专项", "结论"],
            ["UI 布局修改", "部分支持 — 人工写入+Diff；Agent 仅模板步骤"],
            ["CSS 修复", "部分支持 — 可读可写可搜；无 AI 自动改 selector"],
            ["DOM 事件修复", "部分支持 — 靠搜索+人工写入"],
            ["Electron 页面修复", "部分支持 — 规则会推 main/preload；需人工"],
            ["本地存储修复", "部分支持 — 可读写相关 JS"],
            ["会话列表修复", "部分支持 — 关键词推 chat 相关文件"],
            ["项目工作区修复", "部分支持 — 本模块最完善，仍人驱动"],
            ["代码 Diff 审查", "支持 — 真实 Diff（用户/接受的内容）"],
            ["构建测试验证", "部分支持 — build 可走 Shell；无 auto-fix"],
          ],
          [28, 72]
        ),

        heading("7. 安全风险评估", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["风险", "等级", "说明"],
            ["文件写入", "中", "有审批+备份+路径校验；风险在用户批准的内容"],
            ["Shell 执行", "低~中", "白名单+黑名单+审批"],
            ["Git 操作", "低", "无 push；commit 需审批"],
            ["上下文串扰", "低", "namespace 403 较完整"],
            ["误删文件", "低", "无 rm 白名单"],
            ["路径越权", "低", "assertUnderRoot"],
            ["回滚不足", "中", "单文件备份；无任务级整库回滚"],
          ],
          [18, 12, 70]
        ),
        para("安全等级判断：B+（桌面本地场景）", { bold: true }),

        heading("8. 当前能力等级判断", HeadingLevel.HEADING_2),
        para("等级：L3（工具链）+ 有效 AI 智能 L2", { bold: true }),
        bullet("L3 已达：受控写入、Diff 审查、审批、备份、namespace 隔离、PLAN 流程骨架"),
        bullet("L4 零件已有但未成智能体：Shell、测试、Git、工具日志齐全，无 LLM 驱动自动循环"),
        bullet("L5 未达：缺自主多轮修复、记忆驱动持续开发、任务级 Git/回滚一体化"),
        tableFromRows(
          [
            ["等级", "本项目"],
            ["L0 只聊天", "已超过"],
            ["L1 建议不读项目", "已超过 — 可读项目"],
            ["L2 读不写", "读+人工写"],
            ["L3 方案+受控写", "基础设施满足；方案非真 AI"],
            ["L4 写+Diff+Shell+测试", "人工串联可达，Agent 未自动"],
            ["L5 完整闭环", "未达到"],
          ],
          [35, 65]
        ),

        heading("9. 与成熟 AI 编程工具的差距", HeadingLevel.HEADING_2),
        para("vs Cursor 类 IDE Agent", { bold: true }),
        bullet("Cursor：LLM 全库语义索引、多文件自动 edit、终端 Agent 循环、@ 文件/符号"),
        bullet("本项目：子串搜索 + 可选 graphify（未进 Workbench）；人工编辑或占位 Diff；白名单 Shell"),
        spacer(),
        para("vs Codex 类工作区", { bold: true }),
        bullet("Codex：统一工作区内 Agent 真改码+审阅+Terminal"),
        bullet("本项目：v4 Grid UI 接近；Agent brains 为规则 PLAN；Timeline 有但执行为模板"),
        spacer(),
        para("vs Claude Code 类 CLI Agent", { bold: true }),
        bullet("Claude Code：自主 tool loop、repo 内读写"),
        bullet("本项目：工具 API 齐全但未给 Agent 自动用；更保守的白名单+审批；压缩模块较完整"),

        heading("10. 下一步优化优先级", HeadingLevel.HEADING_2),
        para("P0 — 不补齐则不算真正 AI 编程助手", { bold: true }),
        bullet("ProjectAgent 接入 LLM（Ollama/MiniMax），实现 read/search/preview/write/run_test 工具循环"),
        bullet("真实补丁生成，替换 suggestPatchFromDescription 占位逻辑"),
        bullet("自动修复闭环：测试失败 → LLM 读 stderr → patch → 审批 → 重测（限 N 轮）"),
        bullet("graphify / 结构扫描接入 Workbench Agent"),
        spacer(),
        para("P1 — 尽快提升可用性", { bold: true }),
        bullet("扩展测试白名单：npm run build, npm run lint"),
        bullet("符号/文件名搜索 API；统一任务状态机；任务重试/归档 UI"),
        bullet("Workbench 与主 AI 对话区能力合并或桥接"),
        spacer(),
        para("P2 — 体验增强", { bold: true }),
        bullet("工具日志统一 Timeline；package.json scripts 一键 build/test"),
        bullet("Git 自动生成 commit message；Diff 逐 hunk 接受"),
        spacer(),
        para("P3 — 长期", { bold: true }),
        bullet("多项目并行 Agent；远程模型路由；与 ship 流程集成 CI 验证"),

        heading("11. Cursor 后续开发建议", HeadingLevel.HEADING_2),
        bullet("ProjectAgentLLM — 在 agentOrchestrator.js 替换 buildPlanOnlyOutput 为 LLM + function calling"),
        bullet("Tool registry 桥接已有 wbProject* IPC"),
        bullet("Real diff pipeline — PLAN 输出 structured edits → codeReviewStore"),
        bullet("Fix loop controller — runTestWithFix 扩展为 Agent 多轮"),
        bullet("Structure bootstrap — 启动任务时读 package.json + graphify god nodes"),
        bullet("Frontend scene executor — UI 模板绑定默认扫描范围（app/, *.css）"),
        bullet("Status sync — 任务筛选与后端状态对齐"),
        bullet("Build verification preset — 一键 npm run build + 解析错误"),

        heading("12. 结论", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["项", "回答"],
            ["是否满足前端 AI 编程助手基本要求", "部分满足 — 安全 Dev Workbench 合格；自主 AI 助手尚未满足"],
            ["当前等级", "L3（工具链）/ 有效 AI 智能 ~L2"],
            ["最大短板", "ProjectAgent 无 LLM；方案与 Diff 为规则占位"],
            ["最优先修复项", "Workbench Agent 接入 LLM + 工具调用闭环 + 真实代码 Diff"],
            [
              "是否可用于真实前端开发",
              "人工驱动：可以（读/写/Diff/Shell/测试/Git/备份均可用）；AI 自主：不可以",
            ],
          ],
          [28, 72]
        ),

        heading("附录：关键文件路径", HeadingLevel.HEADING_2),
        bullet("main/workbench/agentOrchestrator.js — ProjectAgent / ChatAgent 编排"),
        bullet("main/workbench/planOnlyOutput.js — 规则化 PLAN 输出"),
        bullet("main/workbench/projectCodeService.js — 读/搜/分析代码"),
        bullet("main/workbench/controlledDevService.js — 受控写入/Shell/测试/Git"),
        bullet("main/workbench/registerHandlers.js — 全部 wb-* IPC 注册"),
        bullet("main/workbench/toolPermissionService.js — 工具权限与日志"),
        bullet("main/workbench/shellRunnerService.js — Shell 白名单与黑名单"),
        bullet("main/workbench/context-compression/* — 上下文压缩"),
        bullet("main/workbench/contextMemoryService.js — 记忆读写"),
        bullet("main/mcp/graphifyService.js — graphify MCP（主 AI 对话区）"),
        bullet("app/workbench/projectWorkspace.js — 工作区加载与 Agent 触发"),
        bullet("app/workbench/projectCodePanel.js — 代码面板/写入/Shell/备份"),
        bullet("app/workbench/diffReviewPanel.js — Diff 审阅 UI"),
        bullet("app/workbench/approvalStore.js — 审批流"),
        bullet("app/workbench/testResultPanel.js / gitChangePanel.js — 测试与 Git UI"),
        bullet("preload.js — electronAPI.wb* 暴露"),
        bullet("main/ipc/registerExtracted.js — Workbench 注册与默认代码根"),
        bullet("scripts/wb-*-test.js — 受控开发单元测试脚本"),
      ],
    },
  ],
});

async function main() {
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUT_PATH, buffer);
  console.log(`已写入：${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
