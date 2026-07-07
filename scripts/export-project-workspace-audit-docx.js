/**
 * 导出「项目工作区页面骨架排查报告」Word 文档
 * 运行：node scripts/export-project-workspace-audit-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "项目工作区页面骨架排查报告.docx");
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

function codeLine(text) {
  return new Paragraph({
    spacing: { after: 60 },
    children: [new TextRun({ text, font: "Consolas", size: 20 })],
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
  title: "项目工作区页面骨架排查报告",
  description: "Codex 风格改造目标对照 — 项目工作区页面骨架、多栏布局、组件挂载关系排查",
  sections: [
    {
      properties: {},
      children: [
        heading("项目工作区页面骨架排查报告"),
        para(`生成日期：${GENERATED_AT}`, { italics: true }),
        para(
          "说明：本项目为 Electron + 原生 HTML/CSS/JS，不存在 ProjectWorkspace.tsx、router.tsx 等 React 文件。等价实现位于 app/workbench/*.js、index.html、workbench-dev.css、app/workbench/project-workspace-codex.css 等。"
        ),

        heading("1. 当前页面入口", HeadingLevel.HEADING_2),
        bullet("路由文件：app.js（activateRoute / hash 路由），无 router.tsx"),
        bullet("路由路径：选中项目时 activateRoute(\"ai\", …)，hash 一般为 #ai"),
        bullet("实际挂载组件：动态 DOM #wbProjectWorkspace（由 projectWorkspaceLayout.js 注入）"),
        bullet(
          "组件调用链：projectArea.js → selectProject() → __wbShowProjectWorkspace()（projectWorkspace.js）→ ensureProjectWorkspaceLayout()（projectWorkspaceLayout.js）→ 挂载到 #panel-ai"
        ),
        bullet("是否符合目标：部分符合 — 已走新版 Layout v3，但仍嵌在 AI 面板内，不是独立全屏工作台路由"),
        bullet("问题说明：无独立「项目开发」路由；LeftRail / 项目列表与 #wbProjectWorkspace 分属不同 DOM subtree，未合成目标 5 栏 Grid"),
        para("调用链（精简）：", { bold: true }),
        codeLine("用户点击 jlProjectList 项目卡片"),
        codeLine("  → projectArea.js :: selectProject(projectId)"),
        codeLine("  → store.selectProject → mode = \"project\""),
        codeLine("  → projectWorkspace.js :: loadProjectWorkspace(projectId)"),
        codeLine("  → projectWorkspaceLayout.js :: ensureProjectWorkspaceLayout()  // layoutVersion = \"3\""),
        codeLine("  → document.body.classList.add(\"jl-project-workspace-active\")"),
        codeLine("  → projectArea.js :: activateRoute(\"ai\")  // 仍走 AI 路由，隐藏 aiPanelMain"),
        bullet("是否仍挂载旧页面：无 ProjectDevelopmentPanel；旧版样式类仍在 workbench-dev.css，运行时 HTML 由 v3 Layout 生成"),
        bullet("是否已挂载 ProjectWorkspaceLayout：是（projectWorkspaceLayout.js，v3）"),
        para("结论：入口已切换到 v3 Layout，但路由语义仍为 AI 面板内嵌项目视图。", { bold: true }),

        heading("2. 根容器结构", HeadingLevel.HEADING_2),
        para("当前根容器层级：", { bold: true }),
        codeLine(".jl-app-shell (100vh, overflow hidden)"),
        codeLine("  └ .jl-workbench-split（左侧导航 ~22%, max 320px）"),
        codeLine("  └ .jl-main-workspace"),
        codeLine("       └ #panel-ai.jl-project-workspace-active"),
        codeLine("            └ #wbProjectWorkspace.wb-project-workspace--codex"),
        codeLine("                 └ .wb-pws-layout"),
        para("关键 CSS 冲突（导致「居中卡片」）：", { bold: true }),
        bullet("project-workspace-codex.css：margin: 0 auto; max-width: min(1400px, calc(100% - 16px))"),
        bullet("ui-nebula-theme.css：body.jl-project-workspace-active #panel-ai #wbProjectWorkspace → max-width: min(960px); margin: 0 auto; border-radius; box-shadow"),
        bullet("workbench-dev.css 旧规则：.wb-project-workspace { padding; background: #fff; overflow: auto }"),
        tableFromRows(
          [
            ["检查项", "结论"],
            ["是否全屏 100vw × 100vh", "否 — jl-app-shell 为 100vh；#wbProjectWorkspace 被 max-width + margin: 0 auto 限制"],
            ["是否存在 max-width / mx-auto", "是（960px / 1400px 双重限制）"],
            ["是否存在居中卡片", "是（圆角 + 阴影 + 限宽居中）"],
            ["overflow-hidden 于工作区根", "codex 类有，但被卡片视觉与 agent 列 overflow: auto 削弱"],
          ],
          [28, 72]
        ),
        spacer(),
        para("结论：根容器未达 Codex 全屏占满目标；主题 CSS 与 codex CSS 互相冲突，实际更像「AI 面板里的居中大白卡」。", { bold: true }),

        heading("3. 桌面多栏布局", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["项", "现状"],
            ["是否使用 Grid", "否（主骨架为 Flex）"],
            ["是否使用 Flex", "是（.wb-pws-layout / .wb-pws-main）"],
            ["当前 columns", "App 级：[jl-workbench-nav ~200–320px] | [panel-ai 剩余]；工作区内：[agent-col ~36%] | [code-col 剩余]"],
            ["当前 rows", "[status-bar] [main flex-1] [terminal-drawer]（非 Grid rows）"],
            ["目标 grid-template-columns", "64px 320px 360px minmax(0,1fr) — 未实现"],
          ],
          [32, 68]
        ),
        spacer(),
        tableFromRows(
          [
            ["目标区域", "当前实现", "是否符合"],
            ["LeftRail（64–72px）", "jl-side-rail 64px 在 AI 窗口 hidden；实际为 jl-workbench-nav", "否"],
            ["ProjectTaskSidebar", "项目在 jlProjectList；任务在 wb-pws-agent-col 内", "否"],
            ["AgentTaskPanel", "wb-pws-agent-col 内任务/Timeline/Composer/Plan 纵向堆叠", "部分"],
            ["CodeReviewPanel", "wbPwsCodeMount → wbCodePanel + wbDiffReviewPanel", "部分"],
            ["TerminalDrawer", "#wbPwsTerminalDrawer 底部 footer，可折叠", "基本符合"],
          ],
          [22, 48, 15]
        ),
        spacer(),
        para("Layout 实际结构：status-bar + 两栏 main（agent-col | code-col）+ terminal-drawer footer。", { bold: true }),
        para("结论：已有 Codex 方向的两栏 + 底部终端，但不是目标 5 栏 Grid；LeftRail / 项目侧栏 / Agent 区未按 Codex 分列。", { bold: true }),

        heading("4. 空任务状态", HeadingLevel.HEADING_2),
        bullet("是否存在提前 return 旧空页：否（无 EmptyProject / EmptyState 组件）"),
        bullet("实现方式：renderTasks() 在列表内渲染「暂无任务…」文案，Layout 仍保留"),
        bullet("loadProjectWorkspace 无任务时仍 bindTerminalDrawer / refreshCodePanel"),
        bullet("是否跳过新版布局：否"),
        para("结论：空任务不会退回旧整页空态；符合「保留多栏骨架 + 区内 empty」要求。", { bold: true }),

        heading("5. 滚动条结构", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["层级", "滚动行为", "是否符合"],
            ["html/body / .jl-app-shell", "overflow: hidden", "是"],
            ["#wbProjectWorkspace（主题 CSS）", "限宽居中卡片", "—"],
            [".wb-pws-agent-col", "overflow: auto（整列滚动）", "否"],
            [".wb-pws-code-col / .wb-code-panel", "内部多段 max-height + overflow: auto", "部分"],
            [".wb-pws-terminal-drawer__body", "max-height: 220px; overflow: auto", "是"],
            ["@media max-width 1024px .wb-pws-main", "overflow: auto（主区域整体滚动）", "否"],
          ],
          [30, 45, 15]
        ),
        spacer(),
        para("为何像「中间大白卡里滚动」：", { bold: true }),
        bullet("max-width: 960px + margin: 0 auto + 圆角阴影 → 视觉居中卡片"),
        bullet("wb-pws-agent-col { overflow: auto } → 任务/Timeline/输入共用一个滚动条"),
        bullet("projectCodePanel.js 仍在代码列内纵向堆叠测试/Shell/Git 面板"),
        para("结论：不符合「主页面不滚动、各面板独立滚动」。", { bold: true }),

        heading("6. 响应式断点", HeadingLevel.HEADING_2),
        bullet("当前断点：主要为 max-width: 1024px；workbench-dev.css 另有 900px"),
        bullet("多栏启用：>1024px 左右两栏；≤1024px 单列堆叠"),
        bullet("无 2xl 才显示完整布局的逻辑"),
        bullet("1280 / 1440 / 1536 下仍受 max-width: 960px 居中限制，浪费横向空间"),
        bullet("目标 ≥1280 完整 5 栏 Grid：未实现"),
        para("结论：断点过于粗糙，宽屏下反而像窄卡片模式。", { bold: true }),

        heading("7. 与目标 UI 样例图的差异", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["目标区域", "当前实现", "是否符合", "问题原因", "建议调整"],
            [
              "全屏 100vw×100vh",
              "App 100vh；工作区 max-width 960/1400 居中",
              "否",
              "双重 max-width / margin: auto",
              "去掉工作区 max-width，width:100% 填满 canvas",
            ],
            [
              "5 栏 Grid",
              "2 栏 Flex + 外置导航",
              "否",
              "未实现 grid-template-columns",
              "64px 320px 360px 1fr 纳入同一 Grid",
            ],
            ["LeftRail 64px", "jl-side-rail 在 AI 窗口 hidden", "否", "AI 模式只用宽 nav", "启用 side-rail 或 Grid 第 1 列"],
            [
              "ProjectTaskSidebar",
              "项目在 nav；任务在 agent-col",
              "否",
              "侧栏与 Agent 混列",
              "独立 wb-pws-project-col",
            ],
            [
              "AgentTaskPanel",
              "agent-col 多 panel 纵向堆",
              "部分",
              "整列滚动",
              "各子 panel 独立 overflow-y: auto",
            ],
            [
              "CodeReviewPanel",
              "wbCodePanel + wbDiffReviewPanel",
              "部分",
              "测试/Shell 流式堆叠",
              "Code 列内文件树 | Diff | 测试状态",
            ],
            [
              "TerminalDrawer",
              "#wbPwsTerminalDrawer + resizer",
              "基本符合",
              "默认 collapsed",
              "对齐 Grid 第三行",
            ],
            [
              "浅蓝白背景",
              "#f3f8ff + 白卡片",
              "部分",
              "大量白卡片阴影",
              "降卡片化，用分隔线",
            ],
            [
              "主页面不滚动",
              "agent-col / mobile main 会滚",
              "否",
              "overflow: auto 在列级",
              "min-height:0 + 内部滚动",
            ],
            ["空任务保留骨架", "inline empty", "是", "—", "Code 区补 empty 占位"],
          ],
          [14, 18, 10, 28, 30]
        ),

        heading("8. 最关键的阻塞点（Top 5）", HeadingLevel.HEADING_2),
        bullet("ui-nebula-theme.css 将 #wbProjectWorkspace 限制为 max-width: 960px 且居中 — 直接造成居中大白卡"),
        bullet("主骨架仅为 2 栏 Flex，非目标 5 栏 CSS Grid"),
        bullet("wb-pws-agent-col { overflow: auto } — 任务/Timeline/输入共用一个滚动容器"),
        bullet("左侧导航与工作区割裂 — 项目/会话在 jl-workbench-nav，Agent/代码在 #wbProjectWorkspace"),
        bullet("样式层美化多于骨架 — workbench-dev.css 旧规则仍影响结构与滚动"),

        heading("9. 骨架 vs 美化判断", HeadingLevel.HEADING_2),
        para("结论：B — 部分骨架升级 + 大量视觉美化，尚未完成 Codex 级骨架重构。", { bold: true }),
        para("已有：projectWorkspaceLayout.js v3、两栏、TerminalDrawer、Diff 审阅挂载。", { bold: true }),
        para("缺失：5 栏 Grid、全屏根容器、Agent 分 panel 独立滚动、LeftRail 与工作区 Grid 一体化。", { bold: true }),

        heading("10. 下一步建议（仅建议，未改代码）", HeadingLevel.HEADING_2),
        bullet("先解决 CSS 冲突：jl-project-workspace-active 下取消 max-width / margin:auto / 大圆角阴影"),
        bullet("在 .wb-pws-layout 引入目标 Grid：columns 64px 320px 360px 1fr；rows 48px 1fr 220px"),
        bullet("拆分 Agent 列：任务迁第 2 列；第 3 列仅 Timeline + Plan + Composer；各块独立滚动"),
        bullet("与 App 壳整合 LeftRail：AI 窗口恢复 64px jl-side-rail，与 Grid 第 1 列对齐"),
        bullet("代码列瘦身：测试/Shell 以 TerminalDrawer 为主；code 列保留文件树 + Diff + 测试状态"),
        bullet("断点分层：≥1280 五栏；1024–1279 折叠 Code；<1024 抽屉；禁止 .wb-pws-main overflow:auto"),
        bullet("清理 legacy CSS：废弃 workbench-dev.css 中 .wb-project-workspace__* 与 overflow:auto 旧规则"),

        heading("附录：关键文件路径", HeadingLevel.HEADING_2),
        bullet("app/workbench/projectWorkspaceLayout.js — Layout v3 HTML 注入"),
        bullet("app/workbench/projectWorkspace.js — 加载/渲染/空任务"),
        bullet("app/workbench/projectArea.js — 项目选择与入口"),
        bullet("app/workbench/projectCodePanel.js — 代码/Diff/测试面板"),
        bullet("app/workbench/diffReviewPanel.js — Diff 审阅"),
        bullet("app/workbench/projectWorkspaceResizer.js — 栏宽/终端高度拖拽"),
        bullet("app/workbench/project-workspace-codex.css — Codex 视觉与两栏 Flex"),
        bullet("app/workbench/project-workspace-p2.css — 拖拽与 CSS 变量"),
        bullet("workbench-dev.css — 旧版 .wb-project-workspace 规则（legacy）"),
        bullet("ui-nebula-theme.css — #wbProjectWorkspace max-width:960px 居中（高优先级冲突）"),
        bullet("index.html — #panel-ai、jl-workbench-nav、脚本加载顺序"),
        bullet("app.js — activateRoute、jl-project-workspace-active 相关逻辑"),
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
