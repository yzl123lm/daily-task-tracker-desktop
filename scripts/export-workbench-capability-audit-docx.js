/**
 * 导出「Workbench AI 编程 / 上下文压缩 / Agent 事件化排查报告」Word 文档
 * 运行：node scripts/export-workbench-capability-audit-docx.js
 *
 * 说明：内容基于 2026-07-09 对真实代码的只读排查结论；本脚本仅生成文档，不修改业务代码。
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

const OUT_PATH = path.join(
  __dirname,
  "..",
  "Workbench_AI编程_上下文压缩_Agent事件化排查报告.docx"
);
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

function spacer() {
  return new Paragraph({ spacing: { after: 80 } });
}

function tableFromRows(rows, widths) {
  const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
  const borders = { top: border, bottom: border, left: border, right: border };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (cells, ri) =>
        new TableRow({
          children: cells.map((text, ci) =>
            new TableCell({
              borders,
              width:
                widths && widths[ci]
                  ? { size: widths[ci], type: WidthType.PERCENTAGE }
                  : undefined,
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: String(text),
                      bold: ri === 0,
                      size: ri === 0 ? 20 : 18,
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

const doc = new Document({
  creator: "鲸落AI",
  title: "Workbench AI 编程能力、上下文压缩、Agent 事件化排查报告",
  description:
    "基于真实代码的只读排查报告 — Electron Workbench v" + APP_VERSION,
  sections: [
    {
      properties: {},
      children: [
        heading("Workbench AI 编程能力、上下文压缩、Agent 事件化排查报告"),
        para(
          `生成日期：${GENERATED_AT} · 客户端版本 v${APP_VERSION} · 只读静态排查（未修改业务代码）`,
          { italics: true }
        ),
        para(
          "排查范围：app/workbench/、main/workbench/、preload.js、index.html、workbench 相关 CSS、SQLite schema（db.js）、scripts/wb-*.js。凡标注「已实现」均附文件/函数/IPC/表依据；设计稿或过时文档不计入落地。"
        ),

        heading("1. 总结结论", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["评估项", "结论"],
            [
              "AI 编程能力等级",
              "L4（偏 L4+）：可读搜代码、stage Diff、用户审阅、受控写入、验证/修复；非全自动无人值守 L5",
            ],
            [
              "上下文压缩能力等级",
              "C4：自动压缩 + 快照/事件 + ContextPack 注入；健康徽章 UI 不可见；避错 prompt 未显式注入",
            ],
            [
              "Agent 执行状态事件化等级",
              "E4：阶段+工具事件推送+持久化+轮询兜底；单次 LLM 请求内不可中断",
            ],
            [
              "是否已达 Codex 式执行体验",
              "接近但未齐：有实时 Timeline/按钮联动；Diff 算法简化、fixLoop 每轮需人工、Shell 不在 LLM 工具集、取消不完整",
            ],
            [
              "是否能用于真实前端开发",
              "可以（有人值守）：适合「方案→Diff→确认写入→验证」；不适合无人值守长跑",
            ],
            [
              "是否适合无人值守自动开发",
              "否：写入/Shell/验证均需审批；fixLoop 每轮卡在 Diff 审阅",
            ],
            [
              "最大短板",
              "① fixLoop 非全自动多轮 ② Diff 简化+注释 fallback ③ 取消无法打断进行中的 LLM ④ prevention_prompt 未进 system prompt",
            ],
            [
              "最优先升级项",
              "① Diff 质量与 PATCH 真实性 ② cancel/AbortSignal ③ 显式注入避错经验 + 恢复可见 context health UI",
            ],
          ],
          [32, 68]
        ),
        spacer(),

        heading("1.1 历史问题专项回答", HeadingLevel.HEADING_3),
        tableFromRows(
          [
            ["问题", "结论", "依据"],
            [
              "APPLY_APPROVED 是否真写入",
              "是，真写入",
              "agentOrchestrator.js → applyAcceptedPatches → writeProjectFile；scripts/wb-apply-approved-test.js",
            ],
            [
              "compress_context 是否有 handler",
              "有，已实现",
              "toolRegistry.js HANDLERS.compress_context；非 TOOL_NOT_IMPLEMENTED",
            ],
            [
              "fixLoop 是否能连续多轮",
              "能，最多 3 轮，每轮人工卡点",
              "fixLoopStateService.js MAX_FIX_ROUNDS=3；WAITING_APPLY 后需用户接受",
            ],
            [
              "Agent cancel 是否真可取消",
              "部分",
              "工具轮次间 isRunCanceled；单次 LLM 无 Abort；APPLY 无 agentRunId",
            ],
            [
              "Timeline 是否实时更新",
              "基本是",
              "wb-project-agent-event push + 1s poll（projectWorkspace.js）",
            ],
            [
              "graphify 是否进 Workbench Agent",
              "是（进 ContextPack，非工具）",
              "contextPackBuilder.buildContextPackAsync + graphifyContextService",
            ],
            [
              "symbolIndex 是否缓存",
              "是",
              "symbolIndexService.js indexCache；写入后 invalidateCache",
            ],
            [
              "<think> 是否已过滤",
              "是",
              "utils/wbModelOutputSanitizer.js + app/workbench/modelOutputSanitizer.js",
            ],
            [
              "自动验证是否真触发",
              "条件触发",
              "projectCodePanel.js #wbAutoVerifyAfterWrite + localStorage；写入后仍要审批验证；orchestrator 不读 autoVerify",
            ],
          ],
          [28, 22, 50]
        ),
        spacer(),

        heading("2. AI 编程能力总览", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["模块", "是否实现", "完成度", "相关文件", "当前问题", "优先级"],
            [
              "LLM Agent",
              "已实现",
              "高",
              "projectAgentLLM.js, llmClient.js",
              "单次 LLM 无 AbortSignal",
              "P1",
            ],
            [
              "Tool Calling",
              "已实现",
              "高",
              "projectAgentLLM.js MAX_TOOL_ROUNDS=12, toolRegistry.js",
              "APPLY 模式工具集为空（设计如此）",
              "—",
            ],
            ["代码读取", "已实现", "高", "read_file → projectCodeService", "—", "—"],
            ["代码搜索", "已实现", "高", "search_code", "—", "—"],
            [
              "symbolIndex",
              "已实现",
              "高",
              "symbolIndexService.js",
              "WB_SYMBOL_INDEX_CACHE=0 可关",
              "—",
            ],
            [
              "graphify",
              "已实现",
              "中高",
              "graphifyContextService.js → contextPackBuilder",
              "3s timeout；非 LLM 工具",
              "P2",
            ],
            ["ContextPack", "已实现", "高", "contextPackBuilder.js", "避错注入不全", "P1"],
            [
              "PLAN_ONLY",
              "已实现",
              "高",
              "agentOrchestrator + LLM / planOnlyOutput fallback",
              "LLM 关时规则方案偏弱",
              "—",
            ],
            [
              "PATCH_PROPOSE",
              "已实现",
              "高",
              "LLM stage_patch",
              "依赖模型质量",
              "P1",
            ],
            [
              "staged patch",
              "已实现",
              "高",
              "patchStagingService.js, staged_patches",
              "—",
              "—",
            ],
            [
              "DiffReviewPanel",
              "已实现",
              "高",
              "diffReviewPanel.js, codeReviewStore.js",
              "—",
              "—",
            ],
            [
              "APPLY_APPROVED",
              "已实现",
              "高",
              "controlledDevService.applyAcceptedPatches",
              "已真写入",
              "—",
            ],
            [
              "controlled write",
              "已实现",
              "高",
              "controlledDevService.js, projectWriteService.js",
              "LLM 禁止直接写",
              "—",
            ],
            [
              "自动验证",
              "部分实现",
              "中",
              "projectCodePanel.js + #wbAutoVerifyAfterWrite",
              "主进程不读 autoVerify；需二次审批",
              "P0",
            ],
            [
              "VERIFY_FIX",
              "已实现",
              "中高",
              "fixLoopController.js + LLM VERIFY_FIX",
              "每轮需用户接受 Diff",
              "P0",
            ],
            [
              "fixLoop",
              "部分实现",
              "中",
              "fixLoopStateService.js MAX_FIX_ROUNDS=3",
              "无独立 FIX_LOOP_RESUME mode；E2E 不足",
              "P0",
            ],
            [
              "Git",
              "部分实现",
              "中",
              "git_status 工具；commit 需审批",
              "LLM 不能直接 commit",
              "P2",
            ],
            [
              "Shell",
              "部分实现",
              "中",
              "shellRunnerService + IPC",
              "不在 TOOL_DEFS；LLM 不可直接跑 shell",
              "P1",
            ],
            [
              "备份回滚",
              "已实现",
              "高",
              "fileBackupService.js, backupRestoreService.js",
              "—",
              "—",
            ],
            [
              "审批安全",
              "已实现",
              "高",
              "approvalStore.js, userApproved+approvalId",
              "—",
              "—",
            ],
          ],
          [14, 10, 8, 24, 30, 8]
        ),
        spacer(),

        heading("2.1 LLM Agent 与模式", HeadingLevel.HEADING_3),
        bullet(
          "调用链：UI startAgentExecution/proposeCodePatches/applyAcceptedDiffs → preload.wbProjectAgentRun → IPC wb-project-agent-run → agentOrchestrator.runProjectAgent → prepareContextForAgent → startAgentRun → runProjectAgentLLM 或 buildPlanOnlyOutput → dispatchTool → emitAgentEvent"
        ),
        bullet(
          "可用模式：PLAN_ONLY / PATCH_PROPOSE / APPLY_APPROVED / VERIFY_FIX。无独立 FIX_LOOP_RESUME、REVIEW_PATCH（修订走 PATCH_PROPOSE + REVISION_REQUESTED）"
        ),
        bullet(
          "WB_AGENT_LLM：默认开启（≠0）；关闭或失败时回退 planOnlyOutput；UI 可提示 fallbackReason"
        ),
        bullet(
          "互斥/超时/agentRunId：agentRunStore startAgentRun（AGENT_RUN_MUTEX、默认 10 分钟超时、ars_*）；APPLY_APPROVED 不创建 run，agentRunId 为 null"
        ),
        bullet("最大工具轮数：MAX_TOOL_ROUNDS=12（projectAgentLLM.js）"),

        heading("2.2 工具权限矩阵", HeadingLevel.HEADING_3),
        tableFromRows(
          [
            [
              "工具名",
              "是否实现",
              "权限",
              "允许模式",
              "写日志",
              "需审批",
              "风险/备注",
            ],
            [
              "list_files / read_file / search_code / find_symbols / analyze_package / git_status",
              "是",
              "READ",
              "PLAN/PATCH/VERIFY",
              "tool_operations",
              "否",
              "低",
            ],
            [
              "write_task_memory / compress_context",
              "是",
              "MEMORY_WRITE",
              "PLAN/PATCH/VERIFY",
              "是",
              "否",
              "compress_context 已实现 handler；可 WB_AGENT_COMPRESS_CONTEXT=0 隐藏",
            ],
            [
              "preview_diff / stage_patch",
              "是",
              "PROPOSE",
              "PATCH/VERIFY",
              "是",
              "否（写入另审）",
              "中",
            ],
            [
              "write_project_file",
              "LLM 禁止",
              "WRITE",
              "仅批准后 controlledDev",
              "audit",
              "是",
              "高；符合设计",
            ],
            [
              "run_shell_command / git_commit",
              "非 LLM 工具",
              "DANGEROUS",
              "IPC",
              "是",
              "是",
              "高；LLM_FORBIDDEN_TOOLS",
            ],
            [
              "graphify",
              "非工具",
              "—",
              "ContextPack 注入",
              "—",
              "—",
              "进 prompt，非 TOOL_DEFS",
            ],
          ],
          [22, 12, 12, 14, 12, 10, 18]
        ),
        para(
          "LLM_FORBIDDEN_TOOLS：write_project_file, restore_file_backup, git_commit, git_checkout_branch, run_shell_command（toolPermissionService.js）。未知工具/无 handler → TOOL_NOT_IMPLEMENTED。无 per-tool timeout（仅 run 级 10min）。"
        ),

        heading("2.3 补丁与 Diff", HeadingLevel.HEADING_3),
        tableFromRows(
          [
            ["能力", "是否支持", "实现文件", "数据存储", "问题"],
            [
              "patchProposal / patchStaging",
              "是",
              "patchProposalService.js, patchStagingService.js",
              "staged_patches",
              "—",
            ],
            [
              "stage_patch 真实 staged",
              "是",
              "HANDLERS.stage_patch",
              "SQLite",
              "不写盘",
            ],
            [
              "preview_diff 真实内容",
              "是",
              "diffPreviewService.js",
              "—",
              "—",
            ],
            [
              "suggestPatchFromDescription",
              "仍存在",
              "diffPreviewService.js",
              "—",
              "顶部插注释 fallback；IPC/planOnly 仍用",
            ],
            [
              "buildUnifiedDiff",
              "简化",
              "按行对比非 LCS",
              "—",
              "Diff 质量风险",
            ],
            [
              "Diff 接受/拒绝/批量/需修改",
              "是",
              "diffReviewPanel.js",
              "staged + reviewStore",
              "—",
            ],
            [
              "patch 状态",
              "是",
              "STAGED/ACCEPTED/REJECTED/APPLIED/REVISION_REQUESTED/SUPERSEDED/FAILED",
              "SQLite",
              "—",
            ],
          ],
          [20, 12, 28, 18, 22]
        ),

        heading("3. AI 编程闭环检查", HeadingLevel.HEADING_2),
        bullet("用户输入需求 → 自动创建任务【已实现】projectWorkspace"),
        bullet("检查项目路径【已实现】orchestrator CHECKING_PATH + emitAgentEvent"),
        bullet("PLAN_ONLY【已实现】runProjectAgentLLM 或 buildPlanOnlyOutput"),
        bullet("搜索/读取文件【已实现】search_code / read_file / list_files / find_symbols"),
        bullet("生成方案【已实现】LLM plan；UI plan_ready"),
        bullet("PATCH_PROPOSE【已实现】proposeCodePatches"),
        bullet("生成 staged patch【已实现】stage_patch → staged_patches"),
        bullet("Diff 审阅【已实现】接受/拒绝/全部/需修改/批量写入"),
        bullet("用户接受 → APPLY_APPROVED【已实现】真写入磁盘"),
        bullet(
          "自动验证【部分实现】渲染层 checkbox；需二次审批；主进程不统一调度"
        ),
        bullet(
          "失败 VERIFY_FIX → 修复补丁 → 再审阅 → 再验证【已实现，每轮人工卡点，最多 3 轮】"
        ),
        bullet("完成 COMPLETED / 超轮 FAILED / 取消 CANCELED【已实现】"),
        spacer(),
        para("fixLoop 状态机边："),
        bullet("IDLE → VERIFYING【已实现】"),
        bullet("VERIFYING → AGENT_FIXING【已实现】"),
        bullet("AGENT_FIXING → WAITING_APPLY【已实现】"),
        bullet("WAITING_APPLY → APPLYING【已实现，用户接受后】"),
        bullet("APPLYING → VERIFYING【已实现，resumeFixLoopAfterApply】"),
        bullet("VERIFYING → COMPLETED / * → FAILED / * → CANCELED【已实现】"),

        heading("4. 上下文压缩能力总览", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力项", "是否实现", "文件", "触发条件", "存储位置", "问题"],
            [
              "context health",
              "部分",
              "contextMonitor + contextHealth.js",
              "getContextHealth",
              "计算态",
              "徽章 DOM 在 sr-only，用户看不见",
            ],
            [
              "token budget",
              "是",
              "tokenBudget.js, config.js",
              "soft 0.72 / hard 0.85",
              "配置常量",
              "—",
            ],
            [
              "自动压缩",
              "是",
              "prepareContextForAgent",
              "每次 Agent run 前",
              "snapshots + events",
              "无全局关断开关",
            ],
            [
              "手动压缩",
              "是",
              "wbContextCompress / 更多菜单",
              "用户点击",
              "同上",
              "顶栏按钮已藏，入口在 ⋯",
            ],
            [
              "compress_context 工具",
              "是",
              "toolRegistry HANDLER",
              "Agent 调用",
              "同上",
              "handler 传 messages:[]",
            ],
            [
              "context snapshots",
              "是",
              "contextStore",
              "压缩时",
              "context_snapshots",
              "—",
            ],
            [
              "compression events",
              "是",
              "contextStore",
              "每次压缩",
              "compression_events",
              "—",
            ],
            [
              "snapshot restore",
              "是",
              "restoreSnapshot + UI",
              "用户恢复",
              "audit_logs",
              "—",
            ],
            [
              "project/task namespace",
              "是",
              "namespace.js",
              "buildTaskNamespace",
              "分 namespace",
              "—",
            ],
            [
              "Agent ContextPack 注入",
              "是",
              "runtimeInjector → contextPackBuilder",
              "promptContext.text",
              "system prompt section",
              "—",
            ],
            [
              "工具/Diff/验证压缩",
              "部分",
              "contextMonitor collectPhase4Extras",
              "tool_operations",
              "snapshot 字段",
              "摘要级；依赖 ops 质量",
            ],
          ],
          [16, 10, 20, 16, 16, 22]
        ),
        spacer(),
        para(
          "compress_context 结论：已实现（非 TOOL_NOT_IMPLEMENTED）。压缩不只聊天文本——含 tool_operations 衍生的文件/变更/测试/错误摘要。是否进入 Agent 决策：是（promptContext → compressed_context）。"
        ),
        heading("4.1 ContextPack 来源", HeadingLevel.HEADING_3),
        tableFromRows(
          [
            ["上下文来源", "是否进入 ContextPack", "注入方式", "问题"],
            [
              "压缩快照+记忆+最近对话",
              "是",
              "promptContext.text",
              "—",
            ],
            ["project structure", "是", "structure section", "—"],
            ["symbolIndex", "是", "symbols", "有缓存"],
            [
              "historicalErrorLessons",
              "是",
              "ruleText/signature",
              "prevention_prompt 未用；无 avoidPastMistakes 显式段",
            ],
            ["code snippets", "是", "snippets", "—"],
            [
              "graphify",
              "是",
              "graphify section (async)",
              "可关；超时 3s",
            ],
          ],
          [24, 16, 28, 32]
        ),

        heading("5. Agent 执行状态事件化总览", HeadingLevel.HEADING_2),
        para(
          "真实事件结构（agentEventEmitter.js）：eventId, projectId, taskId, agentRunId, phase, status, title, summary, detail, toolName, toolInputSummary, toolOutputSummary, startedAt, endedAt, durationMs, progress, error, visible, debugOnly, stepKey, at"
        ),
        para(
          "phase：CHECKING_PATH, ANALYZING, SCANNING, SEARCHING, READING, PLANNING, PATCHING, WAITING_REVIEW, APPLYING, VERIFYING, FIXING, COMPLETED, FAILED, CANCELED。部分 UI 阶段（plan_ready/diff_ready 等）由 composerPhase 映射，非独立事件名。"
        ),
        tableFromRows(
          [
            ["能力项", "是否实现", "文件/通道", "问题"],
            ["agentRunId / mutex / timeout", "是", "agentRunStore", "APPLY 返回 null"],
            ["cancel", "部分", "cancelAgentRun + UI 停止", "LLM 中不可打断"],
            ["event emit + IPC push", "是", "wb-project-agent-event", "—"],
            ["preload 订阅", "是", "onWbProjectAgentEvent", "—"],
            ["Timeline render", "是", "renderComposerTimeline / #wbAgentRuns", "旧名已弃用"],
            ["button mapping", "是", "resolveComposerActionConfig", "—"],
            ["<think> 过滤", "是", "wbModelOutputSanitizer", "—"],
            ["persisted events", "是", "agent_run_sessions.tool_trace_json", "与 agent_runs 双轨"],
            ["polling fallback", "是", "1s wbProjectAgentEventsList", "—"],
          ],
          [22, 12, 36, 30]
        ),
        spacer(),
        para("按钮联动：running→停止任务；plan_ready→生成代码变更；diff_ready→查看 Diff；written→运行验证；done→完成任务；failed→重新生成方案；idle→开始执行。"),
        para(
          "Timeline UI 等级：E4。模块发事件：orchestrator/LLM 完整；patch/verify/fixLoop 经阶段间接；compression/graphify/symbolIndex/shell/git 基本不发 Timeline 事件。"
        ),

        heading("6. 当前数据库 / 存储结构", HeadingLevel.HEADING_2),
        para("SCHEMA_VERSION = 7（main/workbench/db.js）"),
        tableFromRows(
          [
            ["表/字段", "用途", "是否已用"],
            ["project_tasks.fix_loop_json", "fixLoop 状态机", "是"],
            ["agent_run_sessions", "互斥/取消/tool_trace Timeline", "是"],
            ["agent_runs", "历史 run 列表（双轨）", "是（列表）"],
            ["tool_operations", "工具审计 + 压缩采集", "是"],
            ["staged_patches", "补丁生命周期", "是"],
            ["context_memories", "任务记忆 / error_lesson", "是"],
            ["context_snapshots", "压缩快照 is_latest/revision", "是"],
            ["compression_events", "压缩事件", "是"],
            ["audit_logs", "写入/恢复/校验失败等", "是"],
            ["file_write_backups", "写入前备份", "是"],
            [
              "error_lessons / error_lesson_events",
              "错误经验（含 prevention_prompt）",
              "写入是，prompt 注入不全",
            ],
            ["raw_context_fragments", "预留", "轻度"],
            ["localStorage wb_auto_verify_v1", "自动验证开关", "是"],
          ],
          [34, 40, 26]
        ),

        heading("7. IPC 与事件通道", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["IPC", "方向", "是否已用", "问题"],
            [
              "wb-project-agent-run",
              "invoke",
              "是",
              "autoVerify 未在主进程消费",
            ],
            [
              "wb-project-agent-cancel",
              "invoke",
              "是",
              "无法打断进行中 LLM",
            ],
            [
              "wb-project-agent-runs-list",
              "invoke",
              "是",
              "读 agent_runs 非 sessions",
            ],
            [
              "wb-project-agent-events-list",
              "invoke",
              "是",
              "轮询兜底",
            ],
            [
              "wb-project-agent-event",
              "push",
              "是",
              "preload onWbProjectAgentEvent",
            ],
            [
              "wb-project-apply-patch / patches-* / diff-preview",
              "invoke",
              "是",
              "diff-preview 可走注释 fallback；主路径应走 APPLY_APPROVED",
            ],
            [
              "wb-project-verify-start / verify-scripts / run-test*",
              "invoke",
              "是",
              "—",
            ],
            [
              "wb-context-health/compress/snapshots-*/restore",
              "invoke",
              "是",
              "health UI 不可见",
            ],
            [
              "wbProjectFixLoopResume（独立）",
              "—",
              "未单独暴露",
              "resume 经 APPLY / VERIFY_FIX+fixContext.resume",
            ],
          ],
          [34, 12, 12, 42]
        ),

        heading("8. UI 验证", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["UI", "存在", "可用", "备注"],
            ["AI 指令窗口 / 开始执行", "是", "是", "layout v16；随 phase 变文案"],
            ["停止任务", "是", "部分", "running 主按钮；legacy cancel 隐藏"],
            ["自动验证开关", "是", "是", "localStorage"],
            ["生成代码变更 / 查看 Diff / 需修改", "是", "是", "按钮联动"],
            ["Diff 审阅区", "是", "是", "接受/拒绝/批量/写入"],
            ["Agent Timeline / 工具记录 / 执行日志", "是", "是", "#wbAgentRuns + 终端抽屉"],
            ["上下文健康徽章", "DOM 有", "不可见", "sr-only"],
            ["快照恢复", "是", "是", "压缩快照历史 details"],
            ["错误详情", "部分", "部分", "Timeline + toast + 日志"],
          ],
          [30, 12, 12, 46]
        ),
        para(
          "UI 有入口但底层弱/未全通：Shell 预设（非 Agent 自主工具）、Git commit（非 LLM 工具）、健康徽章（展示被藏）、suggestPatchFromDescription（可能产出注释式假补丁）。"
        ),

        heading("9. 实测用例建议", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["#", "用例", "期望结果"],
            [
              "1",
              "空项目：开发贪吃蛇",
              "PLAN_ONLY 出方案；Timeline 有扫描/规划；可再 PATCH_PROPOSE",
            ],
            [
              "2",
              "有项目：修 CSS",
              "读/搜相关文件；stage 真实 Diff；审阅后写入磁盘可见",
            ],
            [
              "3",
              "故意 build 失败",
              "VERIFY_FIX/fixLoop 出修复 patch；接受后再 verify；≤3 轮",
            ],
            [
              "4",
              "堆长上下文触发压缩",
              "Agent 前自动压缩；snapshots/events 增加；ContextPack 含 compressed_context",
            ],
            [
              "5",
              "Agent 调 compress_context",
              "返回 applied/snapshotId；非 NOT_IMPLEMENTED",
            ],
            [
              "6",
              "执行中点停止",
              "工具轮次间取消；若卡在 LLM 请求可能仍跑完当前轮",
            ],
            [
              "7",
              "Diff 需修改",
              "REVISION_REQUESTED；可再 PATCH_PROPOSE",
            ],
            [
              "8",
              "接受 Diff + 开自动验证",
              "写入后弹出验证审批；通过则 done",
            ],
            [
              "9",
              "验证失败再修",
              "新 staged patch → 再审阅 → resume verify",
            ],
            [
              "10",
              "恢复快照",
              "restore 成功；health/记忆刷新；有 audit",
            ],
          ],
          [6, 28, 66]
        ),

        heading("10. 能力等级评估", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["维度", "等级", "说明"],
            [
              "AI 编程",
              "L4",
              "Diff + 受控写入 + 验证/修复；未到 L5 自主多轮无人值守",
            ],
            [
              "上下文压缩",
              "C4",
              "自动压缩+快照恢复+进 ContextPack；未到 C5（避错决策闭环）",
            ],
            [
              "Agent 事件化",
              "E4",
              "实时阶段+工具事件+持久化+轮询；未到 E5（完整可中断/可审计体验）",
            ],
          ],
          [20, 12, 68]
        ),
        spacer(),
        para(
          "等级标尺 — AI：L0 只聊天 / L1 代码建议 / L2 可读代码 / L3 受控写入 / L4 Diff+Shell+测试 / L5 自主多轮闭环。压缩：C0 无 / C1 手动摘要 / C2 手动压缩 / C3 自动压缩 / C4 项目任务级快照恢复 / C5 Agent 自动利用压缩记忆优化决策。事件：E0 无 / E1 running 文案 / E2 静态 Timeline / E3 实时阶段 / E4 工具调用事件化 / E5 可恢复可取消可调试可审计。"
        ),

        heading("11. 缺口与优先级", HeadingLevel.HEADING_2),
        heading("P0（影响真实可用）", HeadingLevel.HEADING_3),
        bullet(
          "自动验证链路不统一 — 影响：勾选后仍要二次审批；主进程忽略 autoVerify。文件：projectCodePanel.js, agentOrchestrator.js。建议：orchestrator 统一可选 autoVerify，或 UI 标明需确认验证。验收：写入→验证一气呵成或明确一次审批覆盖。"
        ),
        bullet(
          "Diff 质量 / 注释 fallback — 影响：可能出现假补丁或难读 Diff。文件：diffPreviewService.js, planOnlyOutput.js, registerHandlers.js。建议：限制 suggestPatchFromDescription；引入更好 diff。验收：真实前端改动 Diff 可读可应用。"
        ),
        bullet(
          "fixLoop 人工卡点 + E2E 不足 — 影响：修复闭环慢。文件：fixLoopController.js, wb-fix-loop-test.js。建议：补 E2E；可选同轮自动再验（仍保留写入审批）。验收：故意失败→修→再验 2～3 轮稳定。"
        ),
        heading("P1", HeadingLevel.HEADING_3),
        bullet("Cancel + AbortSignal — projectAgentLLM.js / llmClient.js"),
        bullet(
          "prevention_prompt / 显式避错注入 — contextPackBuilder.js / lessonRetriever.js"
        ),
        bullet("恢复 context health 可见徽章 — projectWorkspaceLayout.js"),
        bullet("LLM 可选受控 Shell（强审批）— 对齐 Codex 终端能力"),
        heading("P2", HeadingLevel.HEADING_3),
        bullet("graphify 工具化 / 失败可见"),
        bullet("agent_runs vs agent_run_sessions 统一"),
        bullet("TOOL_PHASE_MAP 对齐 find_symbols（现有 get_symbols 映射偏差）"),
        heading("P3", HeadingLevel.HEADING_3),
        bullet("全自动无人值守策略、更强 diff 算法、压缩质量评测仪表盘"),

        heading("12. 结论", HeadingLevel.HEADING_2),
        bullet(
          "1. 是否已具备完整 AI 编程闭环？基本具备（有人值守）：读搜→方案→staged Diff→审阅→真写入→验证/修复。非无人值守全自动。"
        ),
        bullet(
          "2. 是否已具备自动上下文压缩？是。每次 runProjectAgent 前 prepareContextForAgent；soft/hard 阈值触发。"
        ),
        bullet(
          "3. 压缩是否进入 Agent 决策上下文？是。经 promptContext → ContextPack compressed_context（另含 structure/symbols/lessons/graphify）。"
        ),
        bullet(
          "4. Agent 执行状态是否已事件化？是（E4）。统一事件结构 + SQLite 持久化 + IPC 推送 + 1s 轮询 + Timeline/按钮联动。"
        ),
        bullet(
          "5. 是否已达类似 Codex 的执行体验？未完全达到：有实时进度与受控写入，但 Diff/取消/Shell 自主性/健康可见性仍有差距。"
        ),
        bullet(
          "6. 最应升级的 3 项：① Diff 真实性与质量 ② 自动验证与 fixLoop 体验统一 ③ Cancel 可中断 + 错误经验显式注入 + 健康 UI 可见"
        ),
        bullet(
          "7. 是否可进入下一阶段能力升级？可以。底座（工具权限、受控写入、压缩、事件、fixLoop V2）已落地；下一阶段应做「体验对齐 Codex + 质量加固」，而不是从零重建。"
        ),

        heading("附录：关键证据索引", HeadingLevel.HEADING_2),
        bullet("main/workbench/agentOrchestrator.js — mode 分流、APPLY 真写入、prepareContextForAgent"),
        bullet("main/workbench/projectAgentLLM.js — LLM tool loop、WB_AGENT_LLM、MAX_TOOL_ROUNDS=12"),
        bullet("main/workbench/toolRegistry.js — 工具表、compress_context handler"),
        bullet("main/workbench/controlledDevService.js — applyAcceptedPatches / writeProjectFile"),
        bullet("main/workbench/fixLoopStateService.js — MAX_FIX_ROUNDS=3、phase 枚举"),
        bullet("main/workbench/agentEventEmitter.js — 事件结构与推送"),
        bullet("main/workbench/context-compression/* — 自动压缩管线"),
        bullet("main/workbench/contextPackBuilder.js — ContextPack 组装"),
        bullet("main/workbench/db.js — SCHEMA 7 表结构"),
        bullet("app/workbench/projectWorkspace.js — Timeline/按钮/轮询"),
        bullet("app/workbench/projectCodePanel.js — APPLY_APPROVED + 自动验证"),
        bullet("app/workbench/diffReviewPanel.js — Diff 审阅"),
        bullet("preload.js — IPC 暴露"),
        bullet("utils/wbModelOutputSanitizer.js — <think> 过滤"),
        bullet(
          "scripts/wb-apply-approved-test.js / wb-compress-context-tool-test.js / wb-fix-loop-test.js"
        ),
        spacer(),
        para(
          "本报告由 scripts/export-workbench-capability-audit-docx.js 生成，内容对应 2026-07-09 只读排查结论。",
          { italics: true }
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc)
  .then((buffer) => {
    fs.writeFileSync(OUT_PATH, buffer);
    console.log("Wrote:", OUT_PATH);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
