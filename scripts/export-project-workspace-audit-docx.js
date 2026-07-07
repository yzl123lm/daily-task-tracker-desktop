/**
 * 导出「项目工作区页面骨架排查报告」Word 文档（第二次排查）
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
const AUDIT_PASS = "第二次排查（Layout v4 整改后）";

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
  title: "项目工作区页面骨架排查报告（第二次）",
  description: "Codex 风格改造目标对照 — Layout v4 整改后复审",
  sections: [
    {
      properties: {},
      children: [
        heading("项目工作区页面骨架排查报告"),
        para(`${AUDIT_PASS} · 生成日期：${GENERATED_AT}`, { italics: true }),
        para(
          "说明：本项目为 Electron + 原生 HTML/CSS/JS，不存在 ProjectWorkspace.tsx、router.tsx 等 React 文件。等价实现位于 app/workbench/*.js、index.html、app/workbench/project-workspace-*.css 等。本次为 Layout v3 → v4 整改后的复审。"
        ),

        heading("0. 与第一次排查对比摘要", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["维度", "第一次（v3）", "第二次（v4）", "变化"],
            ["布局版本", "projectWorkspaceLayout.js v3", "v4", "已升级"],
            ["主骨架", "2 栏 Flex（agent | code）", "3 栏 CSS Grid + topbar + terminal", "显著改善"],
            ["项目/任务侧栏", "任务堆在 agent 列", "独立 wb-pws-project-col", "已修复"],
            ["根容器限宽", "max-width 960/1400 居中卡片", "max-width: none，全宽全高", "已修复"],
            ["Agent 滚动", "整列 overflow: auto", "header + scroll + 固定 composer", "已修复"],
            ["代码区", "面板纵向堆叠", "Tab 切换（code/diff/test/git）", "已改善"],
            ["LeftRail 64px", "未纳入工作区 Grid", "仍未纳入", "未变"],
            ["目标 5 栏 Grid", "未实现", "3 栏 + 外置 nav", "部分达成"],
            ["综合评级", "B", "B+", "↑"],
          ],
          [18, 22, 28, 12]
        ),

        heading("1. 当前页面入口", HeadingLevel.HEADING_2),
        bullet("路由文件：app.js（activateRoute / hash 路由），无 router.tsx"),
        bullet("路由路径：选中项目时 activateRoute(\"ai\", …)，hash 一般为 #ai"),
        bullet("实际挂载组件：动态 DOM #wbProjectWorkspace（由 projectWorkspaceLayout.js v4 注入）"),
        bullet(
          "组件调用链：projectArea.js → selectProject() → __wbShowProjectWorkspace()（projectWorkspace.js :: loadProjectWorkspace）→ ensureProjectWorkspaceLayout()（projectWorkspaceLayout.js v4）→ 挂载到 #panel-ai"
        ),
        bullet("是否符合目标：部分符合 — 已走 v4 Grid 骨架，但仍嵌在 AI 面板内，不是独立全屏工作台路由"),
        bullet("问题说明：无独立「项目开发」路由；jl-workbench-nav（~200–320px）与 #wbProjectWorkspace 仍为两个 DOM subtree，未合成目标 5 栏统一 Grid"),
        para("调用链（精简）：", { bold: true }),
        codeLine("用户点击 jlProjectList 项目卡片"),
        codeLine("  → projectArea.js :: selectProject(projectId)"),
        codeLine("  → store.selectProject → mode = \"project\""),
        codeLine("  → projectWorkspace.js :: loadProjectWorkspace(projectId)"),
        codeLine("  → projectWorkspaceLayout.js :: ensureProjectWorkspaceLayout()  // layoutVersion = \"4\""),
        codeLine("  → syncProjectViewChrome(true) → html/body.jl-project-workspace-active"),
        codeLine("  → projectArea.js :: activateRoute(\"ai\")  // 隐藏 aiPanelMain，显示 #wbProjectWorkspace"),
        bullet("是否仍挂载旧页面：否 — v4 不匹配时 remove 旧 root 并重建；workbench-dev.css 旧规则已限定 :not(.wb-project-workspace--codex)"),
        bullet("是否已挂载 ProjectWorkspaceLayout：是（v4，含 project-col / agent-col / code-col / terminal-drawer）"),
        para("结论：入口链路未变，Layout 已切换到 v4 Grid 骨架。", { bold: true }),

        heading("2. 根容器结构", HeadingLevel.HEADING_2),
        para("当前根容器层级：", { bold: true }),
        codeLine(".jl-app-shell (100vh, overflow hidden)"),
        codeLine("  └ .jl-workbench-split（左侧 jl-workbench-nav ~22%, max 320px）"),
        codeLine("  └ .jl-main-workspace"),
        codeLine("       └ #panel-ai（jl-project-workspace-active 时 100% × 100%）"),
        codeLine("            └ #wbProjectWorkspace.wb-project-workspace--codex"),
        codeLine("                 └ .wb-pws-layout（CSS Grid）"),
        para("CSS 层（整改后）：", { bold: true }),
        bullet("project-workspace-skeleton.css（index.html 最后加载）：!important 取消 max-width / margin / 圆角 / 阴影，width/height 100%"),
        bullet("ui-nebula-theme.css L4765+：已改为 max-width: none; margin: 0（与 skeleton 一致）"),
        bullet("project-workspace-codex.css：.wb-project-workspace--codex { max-width: none }"),
        bullet("workbench-dev.css：.wb-project-workspace:not(.wb-project-workspace--codex) 限定 legacy，codex 版不受影响"),
        tableFromRows(
          [
            ["检查项", "第一次", "第二次（v4）"],
            ["是否全屏 100vw × 100vh", "否 — 960px 居中卡片", "工作区内是 — #wbProjectWorkspace 填满 #panel-ai；App 级仍有左侧 nav"],
            ["max-width / mx-auto", "是（960/1400）", "工作区根已取消；App shell 仍 split 布局"],
            ["居中卡片视觉", "是", "否 — border-radius: 0; box-shadow: none"],
            ["overflow-hidden 于工作区根", "部分", "是 — html/body/panel-ai/wb-pws-layout 均 overflow: hidden"],
          ],
          [28, 28, 44]
        ),
        spacer(),
        para("结论：P0「居中大白卡」问题已修复；App 级左侧导航仍占用横向空间，非 Codex 目标的全 viewport 单 Grid。", { bold: true }),

        heading("3. 桌面多栏布局", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["项", "第一次（v3）", "第二次（v4）"],
            ["是否使用 Grid", "否（Flex）", "是 — .wb-pws-layout display: grid"],
            ["grid-template-columns", "—", "300px 360px minmax(0,1fr)（CSS 变量可拖拽调整）"],
            ["grid-template-rows", "—", "48px minmax(0,1fr) 220px（终端折叠时 42px）"],
            ["grid-template-areas", "—", "topbar | project agent code | terminal（跨三列）"],
            ["App 级 columns", "nav | panel-ai", "未变 — nav 仍在 Grid 外"],
            ["目标 5 栏", "64px 320px 360px 1fr", "仍为 3 栏 + 外置 nav，缺 64px LeftRail 列"],
          ],
          [22, 28, 50]
        ),
        spacer(),
        tableFromRows(
          [
            ["目标区域", "v4 实现", "是否符合"],
            ["LeftRail（64–72px）", "jl-side-rail 在 AI 窗口 hidden；实际 jl-workbench-nav ~200–320px 在 Grid 外", "否"],
            ["ProjectTaskSidebar", "wb-pws-project-col：项目卡片 + 筛选 + wbTaskList + 返回会话", "基本符合"],
            ["AgentTaskPanel", "wb-pws-agent-col：固定 header + wb-pws-agent-scroll + 固定 composer", "基本符合"],
            ["CodeReviewPanel", "wbPwsCodeMount → Tab（code/diff/test/git）+ 各 panel 互斥显示", "基本符合"],
            ["TerminalDrawer", "#wbPwsTerminalDrawer Grid area terminal；log/shell/test/tools 四 Tab", "符合"],
          ],
          [22, 48, 15]
        ),
        spacer(),
        para("Layout v4 区域映射：", { bold: true }),
        codeLine("grid-template-areas:"),
        codeLine('  "topbar topbar topbar"'),
        codeLine('  "project agent code"'),
        codeLine('  "terminal terminal terminal"'),
        para("结论：工作区内已从 2 栏 Flex 升级为 3 栏 Grid + 顶栏 + 底栏终端；与 Codex 目标的 5 栏（含 LeftRail）仍差 2 列整合。", { bold: true }),

        heading("4. 组件挂载关系", HeadingLevel.HEADING_2),
        para("静态骨架（projectWorkspaceLayout.js v4 注入）：", { bold: true }),
        bullet("#wbPwsProjectCol ← renderProjectColCard()、renderTasks()、bindTaskFilters()"),
        bullet("#wbTaskList / #wbPwsTaskFilters / #wbPwsBackToChat"),
        bullet("#wbPwsAgentCol ← renderTaskDetail()、#wbAgentRuns、#wbPlanCard、#wbTaskMemories"),
        bullet("#wbPwsApprovalMount ← 审批流挂载点"),
        bullet("#wbPwsCodeMount ← 动态 panel 挂载（见下）"),
        bullet("#wbPwsTerminalDrawer ← bindTerminalDrawer()；syncTerminalDrawerFromPanels() 同步 Shell/测试/工具输出"),
        para("动态挂载（loadProjectWorkspace 末尾）：", { bold: true }),
        bullet("__wbBindCodePanel → projectCodePanel.js → #wbCodePanel 插入 wbPwsCodeMount"),
        bullet("diffReviewPanel.js → #wbDiffReviewPanel"),
        bullet("testResultPanel.js → #wbTestResultPanel"),
        bullet("gitChangePanel.js → #wbGitChangePanel"),
        bullet("codeWorkspaceTabs.js → #wbPwsCodeTabs 插入 mount 首位，互斥切换四 panel"),
        bullet("__wbBindWorkspaceResizers → projectWorkspaceResizer.js（project/agent 栏宽、终端高度、diff 高度）"),
        bullet("__wbApplyPwsLayoutPrefs → localStorage wb_pws_layout_prefs_v2"),
        para("结论：挂载关系清晰，代码区由 Tab 编排多 panel，不再在 agent 列堆任务。", { bold: true }),

        heading("5. 空任务状态", HeadingLevel.HEADING_2),
        bullet("是否存在提前 return 旧空页：否"),
        bullet("renderTasks()：列表内「暂无任务，点击新建任务开始」；筛选空时「当前筛选下暂无任务」"),
        bullet("#wbPwsAgentEmpty：Agent 区 header 显示「暂无任务，请在左侧创建或选择任务」"),
        bullet("loadProjectWorkspace：无任务时仍 showProjectWorkspaceView、bindTerminalDrawer、refreshCodePanel"),
        bullet("renderTaskDetail(null)：隐藏 #wbTaskDetail"),
        para("结论：空任务保留完整 Grid 骨架 + 区内 empty，符合目标。", { bold: true }),

        heading("6. 滚动条结构", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["层级", "v4 滚动行为", "是否符合"],
            ["html/body.jl-project-workspace-active", "overflow: hidden", "是"],
            ["#wbProjectWorkspace / .wb-pws-layout", "overflow: hidden", "是"],
            [".wb-pws-project-list-wrap", "overflow-y: auto（任务列表独立滚动）", "是"],
            [".wb-pws-agent-col", "overflow: hidden", "是"],
            [".wb-pws-agent-scroll", "overflow-y: auto（Timeline/记忆/快照）", "是"],
            [".wb-pws-agent-composer", "flex-shrink: 0 固定底部", "是"],
            [".wb-pws-code-body / 各 code panel", "min-height:0 + 内部 overflow", "基本符合"],
            [".wb-pws-terminal-drawer__body", "overflow: auto（skeleton 覆盖 codex max-height:220px）", "是"],
            ["@media ≤1023px", "隐藏 project/code 列，仅 agent + terminal", "符合移动降级"],
          ],
          [30, 45, 15]
        ),
        spacer(),
        para("残留风险：project-workspace-codex.css 中 .wb-pws-task-list { max-height:140px } 已被 skeleton.css 中 .wb-pws-project-col .wb-pws-task-list { max-height:none } 覆盖。", { bold: true }),
        para("结论：主页面不滚动、各面板独立滚动 — 已基本达成（较 v3 显著改善）。", { bold: true }),

        heading("7. 响应式断点", HeadingLevel.HEADING_2),
        bullet("≥1280px：完整 3 栏 Grid（project 300 / agent 360 / code 1fr）"),
        bullet("1024–1279px：略缩栏宽（280 / 340），终端行 210px"),
        bullet("≤1023px：单列 agent + terminal；隐藏 project-col、code-col、resize handles"),
        bullet("projectWorkspaceResizer.js：拖拽调整 --wb-pws-project-width / agent / terminal / diff"),
        bullet("与目标差异：目标 ≥1280 显示完整 5 栏；当前 ≥1280 为 3 栏 + 外置 nav"),
        para("结论：断点分层已细化，宽屏不再被 960px 卡片限制。", { bold: true }),

        heading("8. 与目标 UI 样例图的差异", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["目标区域", "v4 实现", "是否符合", "剩余问题", "建议"],
            [
              "全屏 100vw×100vh",
              "#wbProjectWorkspace 100%；App 仍有 nav split",
              "部分",
              "nav 在 Grid 外",
              "项目模式收窄 nav 或 Grid 纳入第 1 列",
            ],
            [
              "5 栏 Grid",
              "3 栏 Grid + 外置 nav",
              "部分",
              "缺 64px + 320px 与 nav 合并",
              "统一 shell Grid",
            ],
            ["LeftRail 64px", "jl-workbench-nav 宽侧栏", "否", "AI 模式 side-rail hidden", "启用 64px rail 或 Grid col-1"],
            ["ProjectTaskSidebar", "wb-pws-project-col", "是", "—", "—"],
            ["AgentTaskPanel", "header + scroll + composer", "是", "—", "—"],
            ["CodeReviewPanel", "Tab + 四 panel", "是", "—", "—"],
            ["TerminalDrawer", "Grid row 3", "是", "默认 collapsed", "可选默认展开"],
            ["浅蓝白背景", "gradient #eef6ff → #eaf4ff", "是", "部分 panel 仍有卡片边框", "可进一步降卡片化"],
            ["主页面不滚动", "layout overflow hidden", "是", "—", "—"],
            ["空任务保留骨架", "inline empty", "是", "—", "—"],
          ],
          [14, 18, 10, 28, 30]
        ),

        heading("9. 最关键的阻塞点（Top 5，整改后）", HeadingLevel.HEADING_2),
        bullet("App 壳 jl-workbench-nav 与工作区 Grid 未一体化 — 无法实现 Codex 64px + 320px + 360px + 1fr 单 Grid"),
        bullet("路由语义仍为 activateRoute(\"ai\") — 无独立 project-dev 路由，LeftRail / 会话切换逻辑与 AI 面板耦合"),
        bullet("jl-side-rail（64px）在 AI 窗口仍 hidden — 与目标 LeftRail 不一致"),
        bullet("样式文件较多层叠（codex / skeleton / panels / p2 / approval / nebula）— 维护成本高，偶发规则冲突需 DevTools 验证"),
        bullet("≤1023px 隐藏 code 列 — 小屏无法代码审阅，需抽屉/overlay 补位（当前未实现）"),

        heading("10. 骨架 vs 美化判断", HeadingLevel.HEADING_2),
        para("结论：B+ — 骨架级重构已完成大部分（Grid、全宽、分栏滚动、项目侧栏、代码 Tab），剩余为 App 壳整合与 LeftRail。", { bold: true }),
        para("已完成：Layout v4、project-workspace-skeleton.css P0、3 栏 Grid、TerminalDrawer、Resizer v2、codeWorkspaceTabs。", { bold: true }),
        para("未完成：5 栏统一 Grid、LeftRail 64px 纳入、独立项目开发路由、小屏 code 抽屉。", { bold: true }),

        heading("11. 下一步建议", HeadingLevel.HEADING_2),
        bullet("App 壳：jl-project-workspace-active 时折叠 jl-workbench-nav 为 64px icon rail，或将其作为 Grid 第 1 列"),
        bullet("扩展 .wb-pws-layout 为 4–5 列：64px | project | agent | code（terminal 仍跨列）"),
        bullet("路由：考虑 hash #project/:id 或 mode=project 独立 panel，减少对 #ai 的依赖"),
        bullet("小屏：code-col 以右侧 drawer 或 bottom sheet 呈现，避免完全隐藏"),
        bullet("样式 Consolidation：将 skeleton 与 codex 合并，减少 !important 层叠"),
        bullet("DevTools 验收清单：1920×1080 / 1440 / 1280 / 1024 / 768 五档截图对比 Codex 样例"),

        heading("附录：关键文件路径", HeadingLevel.HEADING_2),
        bullet("app/workbench/projectWorkspaceLayout.js — Layout v4 HTML 注入（layoutVersion = \"4\"）"),
        bullet("app/workbench/projectWorkspace.js — 加载/渲染/syncProjectViewChrome/空任务"),
        bullet("app/workbench/projectArea.js — 项目选择与入口"),
        bullet("app/workbench/projectCodePanel.js — 代码面板"),
        bullet("app/workbench/diffReviewPanel.js — Diff 审阅"),
        bullet("app/workbench/testResultPanel.js — 测试结果 panel"),
        bullet("app/workbench/gitChangePanel.js — Git 变更 panel"),
        bullet("app/workbench/codeWorkspaceTabs.js — 代码区 Tab 切换"),
        bullet("app/workbench/projectWorkspaceResizer.js — 栏宽/终端高度（prefs v2）"),
        bullet("app/workbench/project-workspace-skeleton.css — Grid 骨架 + 全屏 P0 修复"),
        bullet("app/workbench/project-workspace-codex.css — Codex 视觉（部分 legacy overflow）"),
        bullet("app/workbench/project-workspace-panels.css — 测试/Git panel 样式"),
        bullet("app/workbench/project-workspace-p2.css — 拖拽与 CSS 变量"),
        bullet("ui-nebula-theme.css L4765+ — jl-project-workspace-active 面板全宽"),
        bullet("index.html L14–18 — 样式加载顺序（skeleton 最后）"),
        bullet("workbench-dev.css — legacy :not(.wb-project-workspace--codex) 限定"),
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
