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
const APP_VERSION = require("../package.json").version;

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
  description: "Electron Workbench AI 编程能力全面排查 — 基于真实代码 v" + APP_VERSION,
  sections: [
    {
      properties: {},
      children: [
        heading("AI 编程能力排查报告"),
        para(
          `生成日期：${GENERATED_AT} · 客户端版本 v${APP_VERSION} · 基于项目真实代码静态排查（未修改业务代码）`,
          { italics: true }
        ),
        para(
          "说明：本项目为 Electron + 原生 HTML/CSS/JS 桌面客户端。AI 编程能力分两层：① 主 AI 对话区（ai.js / 通用 Chat）；② Workbench 项目开发工作区（app/workbench/ + main/workbench/），本报告重点评估后者是否满足「前端开发编程助手」。"
        ),

        heading("1. 项目基本信息", HeadingLevel.HEADING_2),
        bullet("项目类型：Electron 桌面客户端「鲸落AI」（daily-task-tracker-desktop）"),
        bullet("技术栈：Electron 41 + 原生 HTML/CSS/JS；主进程 Node.js；SQLite（node:sqlite）；IPC 经 preload.js"),
        bullet(
          "AI 编程入口：左侧「项目区域」选项目 → projectArea.selectProject → projectWorkspace.js；Agent 按钮调用 wbProjectAgentRun；辅助入口 projectCodePanel.js（读/搜/写/Diff/Shell/测试/Git/备份）"
        ),
        bullet(
          "代码目录：projects.local_path（wbProjectChooseRoot 选择）；未配置时 fallback 应用根目录（registerExtracted.js / resolveProjectRoot）"
        ),
        bullet("当前能力等级：L4（工具链 + 受控闭环）/ 有效 AI 自主层 L3~L4（需 LLM 可用且 WB_AGENT_LLM≠0）"),

        heading("2. 能力总览表", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力模块", "已实现", "完成度", "相关文件", "主要问题", "优先级"],
            ["项目隔离", "是", "88%", "namespace.js, projectService.js", "permissionMode 仅存库未 enforcement", "P2"],
            ["任务管理", "部分", "75%", "projectService.js, projectWorkspace.js", "无归档/重试 UI；APPLY_APPROVED 仅改状态", "P1"],
            ["代码读取", "是", "82%", "projectCodeService.js", "512KB/文本扩展名/树600项/深度5", "P2"],
            ["代码搜索", "部分", "68%", "projectCodeService.js, symbolIndexService.js", "子串搜索+正则符号；无语义/AST", "P1"],
            ["项目结构分析", "部分", "65%", "projectStructureService.js, contextPackBuilder.js", "graphify 未进 Workbench Agent", "P1"],
            ["PLAN_ONLY", "部分", "72%", "projectAgentLLM.js, planOnlyOutput.js", "LLM 可用时真工具循环；否则规则 fallback", "P1"],
            ["受控写入", "是", "90%", "controlledDevService.js, patchStagingService.js", "须 userApproved + 审批卡", "P2"],
            ["Diff 审查", "部分", "78%", "diffReviewPanel.js, diffPreviewService.js", "Diff 算法简化；plan 占位注释 fallback", "P1"],
            ["Shell 执行", "是", "82%", "shellRunnerService.js, commandPolicyService.js", "白名单+黑名单+120s+审批", "P2"],
            ["测试构建", "部分", "70%", "verificationService.js, packageScriptService.js", "verify 需 package.json script；fix 单轮后等审批", "P1"],
            ["错误修复", "部分", "55%", "fixLoopController.js, parseBuildError.js", "最多3轮设计但首轮 fix 后暂停等用户", "P1"],
            ["Git 操作", "部分", "68%", "gitService.js, gitChangePanel.js", "status+审批 commit；无 push/reset", "P2"],
            ["上下文记忆", "是", "85%", "contextMemoryService.js", "SQLite namespace；子串搜索非向量", "P2"],
            ["上下文压缩", "是", "86%", "context-compression/*", "自动+手动；compress_context 工具未实现", "P2"],
            ["工具日志", "是", "80%", "toolPermissionService.js, agentRunStore.js", "DB 记录；Timeline UI 基础", "P2"],
            ["安全审批", "是", "88%", "approvalStore.js, toolPermissionService.js", "写入/Shell/测试/Git 需审批", "P2"],
            ["回滚恢复", "是", "78%", "fileBackupService.js, backupRestoreService.js", "单文件备份；无任务级整库回滚", "P2"],
            ["前端 UI 开发", "部分", "60%", "projectSceneTemplates.js, symbolIndexService.js", "可读可写可搜；Agent 改 UI 依赖 LLM 质量", "P1"],
            ["编程闭环", "部分", "62%", "全链路分散", "人工串联完整；全自动多轮未闭环", "P0"],
          ],
          [12, 8, 7, 22, 28, 8]
        ),

        heading("3. 已经具备的能力", HeadingLevel.HEADING_2),
        para("3.1 项目级隔离（namespace）", { bold: true }),
        bullet("多项目 CRUD（projectService.js）；每项目独立 projectId、local_path、任务列表"),
        bullet("namespace：project:{id} / task:{projectId}:{taskId} / chat:{id}；跨 scope 读拒绝（namespace.js assertNoCrossScopeRead）"),
        bullet("ChatAgent 禁止 dev 工具名；ProjectAgent 与 Chat 会话上下文分离（chatBridge.js 静态引导至项目区）"),
        bullet("SQLite 按 user_id 隔离；路径 assertUnderRoot 防穿越"),
        spacer(),
        para("3.2 任务级开发", { bold: true }),
        bullet("任务 CRUD：wb-project-tasks-list/create/update；状态机 TASK_STATUS（taskStatus.js）"),
        bullet("Agent 模式：PLAN_ONLY / PATCH_PROPOSE / VERIFY_FIX / APPLY_APPROVED（agentOrchestrator.js）"),
        bullet("单任务 Agent 互斥（agentRunStore AGENT_RUN_MUTEX）；10 分钟超时取消"),
        bullet("Timeline：wbProjectAgentRunsList + #wbAgentRuns；tool_trace_json 记录工具调用"),
        spacer(),
        para("3.3 代码读取与搜索", { bold: true }),
        bullet("IPC：wbProjectFilesTree / wbProjectFileRead / wbProjectCodeSearch → projectCodeService.js"),
        bullet("排除 node_modules、.git、dist、graphify-out 等；512KB 上限；.js/.html/.css/.json/.ts 等文本扩展名"),
        bullet("Agent 工具：list_files、read_file、search_code、find_symbols、analyze_package（toolRegistry.js）"),
        bullet("symbolIndexService：函数/DOM id/IPC handler/localStorage key 正则索引（每次调用重建）"),
        spacer(),
        para("3.4 LLM Agent（ProjectAgent）", { bold: true }),
        bullet("projectAgentLLM.js：最多 12 轮 tool-calling（llmChatWithTools）；默认 WB_AGENT_LLM=1"),
        bullet("contextPackBuilder 注入 package.json/结构摘要；失败时 fallback planOnlyOutput.js 规则方案"),
        bullet("PATCH_PROPOSE：stage_patch + preview_diff；补丁 SQLite 暂存（patchStagingService.js）"),
        spacer(),
        para("3.5 受控写入与 Diff", { bold: true }),
        bullet("用户内容：buildPatchPreview 真实前后对比；diffReviewPanel 接受/拒绝/批量写入"),
        bullet("wbProjectApplyPatch → controlledDevService（userApproved 必填）；写入前 fileBackupService 自动备份"),
        bullet("敏感路径黑名单：.env、.git/、credentials 等（projectWriteService.assertWritablePath）"),
        bullet("LLM 禁止直接 write_project_file（LLM_FORBIDDEN_TOOLS）— 必须 stage → 用户接受 → IPC 写入"),
        spacer(),
        para("3.6 Shell / 测试 / 验证", { bold: true }),
        bullet("受控 Shell：shellRunnerService 白名单 npm/git 读 + 黑名单 rm/管道/&& 等；120s 超时；16KB 输出截断"),
        bullet("verificationService：从 package.json 解析 build/test/lint 脚本（packageScriptService.js）"),
        bullet("parseBuildError.js 解析构建 stderr；fixLoopController 验证失败触发 VERIFY_FIX Agent"),
        bullet("UI：testResultPanel + projectCodePanel 运行测试/verify；approvalStore 审批"),
        spacer(),
        para("3.7 Git / 备份 / 日志", { bold: true }),
        bullet("git status（工具+IPC）；审批后 git commit（git add -A）；可选任务分支 wb/{taskId}/{ts}"),
        bullet("wbProjectBackupsList / wbProjectBackupRestore 单文件回滚"),
        bullet("tool_operations 表 + agent_run_sessions.tool_trace_json + audit_logs"),
        spacer(),
        para("3.8 上下文记忆与压缩", { bold: true }),
        bullet("context_memories：按 namespace 读写（wbMemorySearch/Write）；Agent 自动沉淀 plan/requirement"),
        bullet("context-compression：token 预算、软/硬阈值自动压缩、快照版本、wbContextHealth/Compress"),
        bullet("UI：contextHealth.js 健康徽章 + 手动压缩 + 快照历史列表"),

        heading("4. 部分具备但不完整的能力", HeadingLevel.HEADING_2),
        bullet("PLAN_ONLY fallback：LLM 不可用或 WB_AGENT_LLM=0 时，planOnlyOutput.js 关键词推断文件与步骤，Diff 为顶部插注释"),
        bullet("fixLoopController：设计 MAX_FIX_ROUNDS=3，但 VERIFY_FIX 执行一轮 stage_patch 后返回 waitingApproval，不自动连续重试"),
        bullet("APPLY_APPROVED 模式：仅更新任务状态为 TESTING，不自动 apply 已接受补丁"),
        bullet("compress_context：在 PROJECT_AGENT_TOOLS 列表中但 toolRegistry 无 handler（TOOL_NOT_IMPLEMENTED）"),
        bullet("buildUnifiedDiff：逐行对齐简化算法，非 production unified diff"),
        bullet("UI 缺口：#wbAutoVerifyAfterWrite 代码引用但 DOM 无 checkbox；无 Agent 取消按钮（wbProjectAgentCancel 未接 UI）；快照 restore 无 UI"),
        bullet("ChatAgent（runChatAgent）：模板回复，检测到开发意图时引导去项目区，非真正编程 Agent"),
        bullet("测试历史：testResultStore 用 localStorage，与主进程 tool_operations 可能不一致"),
        bullet("场景模板 projectSceneTemplates.js：仅 enrich 提示词/placeholder，不约束工具权限"),

        heading("5. 当前缺失的关键能力", HeadingLevel.HEADING_2),
        bullet("P0-1：全自动编程闭环 — 验证失败后不能无人工审阅地连续多轮 fix 直至通过"),
        bullet("P0-2：graphify / 语义索引未接入 Workbench Agent（主 AI 对话区有 graphifyService，项目 Agent 未用）"),
        bullet("P0-3：无真正 AST/语义搜索（Vue/React 组件级理解有限）；CSS selector 智能定位弱"),
        bullet("P0-4：Diff 逐 hunk 接受、revision「需修改」流程 UI 缺失"),
        bullet("P0-5：任务级整库快照回滚；permissionMode(ASSISTED_DEV) 未在运行时 enforcement"),
        bullet("P0-6：Agent 无流式输出/进度/cancel UI；长任务体验不足"),
        bullet("P0-7：typecheck 专用流程未独立暴露（可走 npm run build/lint 若 scripts 存在）"),

        heading("6. 前端开发能力专项评估", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["专项任务", "结论", "依据"],
            ["UI 布局修改", "部分支持", "可读 HTML/CSS；LLM+stage_patch 可改；fallback 仅规则步骤"],
            ["CSS 修复", "部分支持", "search_code 可搜 class；symbolIndex 含 DOM id；无专用 CSS 分析器"],
            ["DOM 事件修复", "部分支持", "read/search + 人工或 Agent patch；无事件流调试"],
            ["Electron 页面修复", "部分支持", "可读写 index.html/app.js/preload/main.js；planOnly 关键词推 main/preload"],
            ["本地存储修复", "部分支持", "symbolIndex 含 localStorage key；可搜可改相关 JS"],
            ["会话列表修复", "部分支持", "chatArea.js 在项目外；Agent 可搜 chatBridge 相关文件"],
            ["项目工作区修复", "部分支持", "本模块最完善；近期 SyntaxError 已修（全局 const 冲突）"],
            ["代码 Diff 审查", "支持", "用户/Agent staged 内容有真实 preview；plan fallback 为占位注释"],
            ["构建测试验证", "部分支持", "verificationService 跑 npm scripts；fix 需用户接受补丁后继续"],
          ],
          [22, 14, 64]
        ),

        heading("7. 安全风险评估", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["风险项", "等级", "说明"],
            ["文件写入", "中低", "userApproved + 审批卡 + assertUnderRoot + 敏感路径黑名单 + 写入前备份"],
            ["Shell 执行", "中低", "白名单/黑名单 + 无管道/重定向 + 120s 超时 + 审批"],
            ["Git 操作", "低", "无 push/pull/reset；commit 需审批；消息长度限制"],
            ["上下文串扰", "低", "namespace 403；Chat 禁 dev 工具；setSelectedChatId 静默模式防模块覆盖"],
            ["误删文件", "低", "Shell 禁 rm；写入为 patch 非 delete 目录"],
            ["路径越权", "低", "normalizeRelPath 拒 ..；assertUnderRoot"],
            ["回滚不足", "中", "单文件 backup；无任务/项目级一键回滚"],
            ["LLM 越权写入", "低", "LLM_FORBIDDEN_TOOLS 禁 write/shell/commit；仅 stage_patch"],
          ],
          [18, 10, 72]
        ),
        para("综合安全等级：B+ ~ A-（桌面本地单用户场景，偏保守白名单设计）", { bold: true }),

        heading("8. 当前能力等级判断", HeadingLevel.HEADING_2),
        para("等级：L4（基础设施） / 有效 AI 自主 L3~L4", { bold: true }),
        tableFromRows(
          [
            ["等级", "定义", "本项目"],
            ["L0", "只聊天", "已超过"],
            ["L1", "建议但不读项目", "已超过"],
            ["L2", "能读项目不能写", "已超过 — Agent READ 工具 + UI 文件树"],
            ["L3", "方案 + 受控写入", "已达到 — stage_patch + 审批 + apply"],
            ["L4", "写 + Diff + Shell + 测试", "已达到 — 全链路存在；fix 循环需人工审阅"],
            ["L5", "完整自主闭环 + Git + 记忆", "未达到 — 缺全自动多轮 fix、graphify、任务级回滚"],
          ],
          [8, 28, 64]
        ),
        bullet("依据：main/workbench 已实现 toolRegistry + projectAgentLLM（12 轮）+ patchStaging + verification + fixLoop + namespace 隔离 + audit"),
        bullet("未达 L5：fixLoop 暂停等审批；graphify 未进 Agent；无 push；permissionMode 未 enforcement"),

        heading("9. 与成熟 AI 编程工具的差距", HeadingLevel.HEADING_2),
        para("vs Cursor 类 IDE Agent", { bold: true }),
        bullet("Cursor：全库 embedding 索引、@file/@symbol、多文件并行 edit、终端 Agent 自主循环、inline diff"),
        bullet("本项目：子串+正则符号搜索；stage_patch 单文件序列；Shell 严格白名单；12 轮 tool loop 但写需人工 accept"),
        bullet("差距：语义理解、IDE 级跳转、无中断全自动迭代"),
        spacer(),
        para("vs Codex 类云端工作区", { bold: true }),
        bullet("Codex：统一沙箱 + 自动 apply + CI 验证一体化"),
        bullet("本项目：UI 接近（Grid 工作区 v7 layout）；brains 依赖本地/云端 LLM 配置；验证需本机 npm + 用户审批"),
        bullet("差距：沙箱隔离、云端并行任务、更强 patch 合并"),
        spacer(),
        para("vs Claude Code 类 CLI Agent", { bold: true }),
        bullet("Claude Code：repo 内自主 read/write/bash 循环，少审批"),
        bullet("本项目：工具 API 更细粒度但 LLM 写盘被 ban；审批+备份+namespace 更保守；压缩模块更完整"),
        bullet("差距：自主性 vs 安全性的权衡 — 本项目偏安全"),

        heading("10. 下一步优化优先级", HeadingLevel.HEADING_2),
        para("P0 — 不补齐则难以称为「成熟前端 AI 编程助手」", { bold: true }),
        bullet("fixLoop 真正多轮：用户接受补丁 → 自动 verify → 失败再 VERIFY_FIX，直至 MAX_FIX_ROUNDS 或成功"),
        bullet("graphify / projectStructure 接入 Agent contextPack（只读 god nodes + 社区结构）"),
        bullet("补齐 UI：Agent cancel、auto-verify checkbox、snapshot restore、revision 需修改"),
        bullet("APPLY_APPROVED 模式真正 apply 已 ACCEPTED patches"),
        bullet("compress_context 工具实现或从 allowlist 移除"),
        spacer(),
        para("P1 — 尽快提升日常可用性", { bold: true }),
        bullet("permissionMode runtime enforcement；任务状态 UI 与后端完全对齐"),
        bullet("改进 buildUnifiedDiff；逐 hunk accept；fix suggestion → 一键触发 VERIFY_FIX"),
        bullet("扩展 verification scripts 发现；typecheck/lint 一键入口"),
        bullet("symbolIndex 缓存避免每次 rebuild；文件名/fuzzy 搜索"),
        spacer(),
        para("P2 — 体验增强", { bold: true }),
        bullet("Agent 流式输出 + tool trace 实时 Timeline；审批历史面板"),
        bullet("Git 自动生成 commit message；测试历史与 tool_ops 统一"),
        bullet("场景模板绑定默认扫描目录（app/、styles/）"),
        spacer(),
        para("P3 — 长期", { bold: true }),
        bullet("向量/语义检索；多项目并行 Agent；远程模型路由；与 ship:client CI 集成"),

        heading("11. Cursor 后续开发建议", HeadingLevel.HEADING_2),
        bullet("1. fixLoopController — 接受补丁后自动进入下一轮 verify，而非 waitingApproval 中断"),
        bullet("2. contextPackBuilder — 注入 graphify-out/GRAPH_REPORT.md 摘要"),
        bullet("3. projectWorkspace.js — 接 wbProjectAgentCancel；渲染 #wbAutoVerifyAfterWrite"),
        bullet("4. diffReviewPanel — 「需修改」按钮 + requestRevision 流程"),
        bullet("5. toolRegistry — 实现 compress_context 或删除声明"),
        bullet("6. agentOrchestrator APPLY_APPROVED — 调用 controlledDevService 批量 apply ACCEPTED"),
        bullet("7. symbolIndexService — 增量索引缓存"),
        bullet("8. 前端专项 — scene template「UI 修复」默认 search *.css index.html app/workbench"),

        heading("12. 结论", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["项", "回答"],
            [
              "是否满足前端 AI 编程助手基本要求",
              "部分满足 — 作为「受控 Dev Workbench + LLM Agent」已达标；作为「开箱即用全自动前端 Agent」尚未完全达标",
            ],
            ["当前等级", "L4 工具链 / 有效 AI 自主 L3~L4（LLM 开启时）"],
            ["最大短板", "fix 闭环需人工审阅打断；graphify/语义能力未进 Agent；部分 UI 未接 IPC"],
            ["最优先修复项", "fixLoop 连续闭环 + graphify 注入 + Agent cancel/auto-verify UI"],
            [
              "是否可用于真实前端开发",
              "可以 — 人工驱动下读/写/Diff/Shell/测试/Git/备份/记忆/压缩均已可用；AI 自主需配置 LLM 并接受审批流，适合 Assisted 模式而非 Unattended",
            ],
          ],
          [26, 74]
        ),

        heading("附录 A：20 项排查维度速查", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["#", "维度", "结论"],
            ["1", "理解开发需求", "部分 — LLM+contextPack；fallback 规则"],
            ["2", "读取项目代码", "是 — read_file/list_files"],
            ["3", "搜索项目文件", "是 — search_code + find_symbols"],
            ["4", "分析代码结构", "部分 — analyze_package + symbolIndex；无 AST"],
            ["5", "生成开发方案", "部分 — PLAN_ONLY LLM 12 轮；fallback 规则"],
            ["6", "修改代码", "部分 — stage_patch + 用户 apply"],
            ["7", "展示 Diff", "是 — diffReviewPanel + buildPatchPreview"],
            ["8", "受控写入", "是 — userApproved + 审批 + 备份"],
            ["9", "运行命令", "是 — 白名单 Shell + 审批"],
            ["10", "测试构建验证", "部分 — verificationService；fix 单轮"],
            ["11", "错误诊断自动修复", "部分 — parseBuildError + VERIFY_FIX；非全自动"],
            ["12", "Git 变更查看", "是 — git status + gitChangePanel"],
            ["13", "上下文记忆", "是 — contextMemoryService namespace"],
            ["14", "上下文压缩", "是 — contextCompressionManager"],
            ["15", "项目级隔离", "是 — namespace + local_path"],
            ["16", "任务级隔离", "是 — task namespace + mutex"],
            ["17", "前端 UI 开发流程", "部分 — 工具齐全；Agent 质量依赖 LLM"],
            ["18", "安全审批回滚", "是 — approvalStore + backupRestore"],
            ["19", "日志追踪", "是 — tool_ops + agent tool_trace"],
            ["20", "可交付编程闭环", "部分 — 人工串联完整；全自动未闭环"],
          ],
          [5, 22, 73]
        ),

        heading("附录 B：关键文件路径", HeadingLevel.HEADING_2),
        bullet("main/workbench/agentOrchestrator.js — Agent 编排与模式路由"),
        bullet("main/workbench/projectAgentLLM.js — LLM 12 轮 tool calling"),
        bullet("main/workbench/toolRegistry.js — 工具定义与 mode×permission 矩阵"),
        bullet("main/workbench/projectCodeService.js — 读/搜/树"),
        bullet("main/workbench/symbolIndexService.js / projectStructureService.js / contextPackBuilder.js"),
        bullet("main/workbench/patchProposalService.js / patchStagingService.js / controlledDevService.js"),
        bullet("main/workbench/verificationService.js / fixLoopController.js / parseBuildError.js"),
        bullet("main/workbench/shellRunnerService.js / commandPolicyService.js / gitService.js"),
        bullet("main/workbench/contextMemoryService.js / context-compression/*"),
        bullet("main/workbench/toolPermissionService.js / agentRunStore.js / registerHandlers.js"),
        bullet("app/workbench/projectWorkspace.js / projectCodePanel.js / diffReviewPanel.js"),
        bullet("app/workbench/approvalStore.js / codeReviewStore.js / contextHealth.js"),
        bullet("app/workbench/testResultPanel.js / gitChangePanel.js / chatBridge.js"),
        bullet("preload.js — electronAPI.wb* · package.json v" + APP_VERSION),
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
