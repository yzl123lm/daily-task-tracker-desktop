/**
 * 导出「AI 编程错误沉淀与上下文压缩排查报告」Word 文档
 * 运行：node scripts/export-error-compression-audit-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "AI编程错误沉淀与上下文压缩排查报告.docx");
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

const doc = new Document({
  creator: "鲸落AI",
  title: "AI 编程错误沉淀与上下文压缩排查报告",
  sections: [
    {
      properties: {},
      children: [
        heading("AI 编程错误沉淀与上下文压缩排查报告"),
        para(
          `生成日期：${GENERATED_AT} · 客户端版本 v${APP_VERSION} · 基于真实代码静态排查（未修改业务代码）`,
          { italics: true }
        ),

        heading("1. 排查结论摘要", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["结论项", "答案"],
            ["是否会自动记录编程错误", "部分会 — 写入 SQLite（tool_operations / context_memories / agent_run_sessions），非 Markdown"],
            ["是否会自动写入 Markdown", "否 — 未发现 Workbench 自动写 .md 错误文档的实现"],
            ["是否会生成经验规则", "部分 — fixSuggestionService 静态启发式建议；无结构化「经验规则」库"],
            ["是否会后续自动引用经验", "部分 — context_memories 子串检索 + 压缩快照注入 prompt；无 lessons 召回"],
            ["是否具备自我学习能力", "L2~L3 — 有任务级记忆与快照，无 fingerprint/去重/主动规避"],
            ["是否具备上下文自动压缩", "是 — context-compression 模块完整"],
            ["自动压缩是否覆盖编程任务", "是 — runProjectAgent 每次调用 prepareContextForAgent(task namespace)"],
            ["当前风险等级", "中 — 长任务可压缩但错误经验易丢失细节；无 Markdown 知识库"],
            [
              "优先补齐项",
              "P0：Markdown lessons 自动沉淀 + 注入 contextPack；P1：错误 fingerprint 去重 + snapshot restore UI",
            ],
          ],
          [32, 68]
        ),

        heading("2. 错误记录能力排查", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["检查项", "支持", "实现文件", "触发时机", "存储位置", "问题"],
            [
              "Shell 错误",
              "是",
              "controlledDevService.js, shellRunnerService.js",
              "runControlledShell 失败",
              "tool_operations + memory shell_failure",
              "仅启发式建议文本，非完整 stderr",
            ],
            [
              "测试错误",
              "是",
              "controlledDevService.js, testRunnerService.js",
              "runTestWithFixSuggestions 失败",
              "tool_operations + memory test_failure",
              "suggestions 拼接为一条 memory，无结构化字段",
            ],
            [
              "构建错误",
              "部分",
              "verificationService.js, parseBuildError.js",
              "runVerification 失败",
              "tool_operations + VERIFY_FIX Agent 输入",
              "parsed issues 未单独持久化为 memory",
            ],
            [
              "Diff 应用错误",
              "部分",
              "controlledDevService.js, patchProposalService.js",
              "applyControlledPatch 抛错",
              "tool_operations + console",
              "未写 error lesson memory",
            ],
            [
              "文件写入错误",
              "部分",
              "projectWriteService.js",
              "路径/大小/敏感路径拒绝",
              "IPC 异常 + tool_operations",
              "无专用 error 归档",
            ],
            [
              "Git 错误",
              "部分",
              "gitService.js",
              "非 repo / commit 失败",
              "IPC 返回 + tool_operations",
              "无 git_error memory 类型",
            ],
            [
              "Agent 执行错误",
              "是",
              "agentOrchestrator.js, agentRunStore.js",
              "runProjectAgentLLM 异常",
              "agent_run_sessions.error_message + agent_runs",
              "LLM 失败 fallback 规则方案，错误本身不入 lessons",
            ],
            [
              "IPC 错误",
              "部分",
              "registerHandlers.js",
              "IPC handler throw",
              "渲染层 catch / console",
              "未统一写入 workbench 错误库",
            ],
            [
              "UI 运行错误",
              "否",
              "—",
              "—",
              "浏览器 DevTools console",
              "无自动上报到 workbench DB",
            ],
          ],
          [14, 8, 18, 14, 16, 30]
        ),

        heading("3. Markdown 错误文档能力", HeadingLevel.HEADING_2),
        bullet("是否存在 Markdown 自动写入：否"),
        bullet(
          "全库检索结果：main/workbench/ 无 writeFile(*.md)、lessons/、error_lessons、.jl-ai/ 目录写入逻辑"
        ),
        bullet("Markdown 路径：无（建议路径见第 10 节，当前未实现）"),
        bullet("写入函数：无"),
        bullet(
          "当前替代存储：SQLite context_memories（memory_type: test_failure / shell_failure / change_log 等）；tool_operations.result_text；agent_runs.output_text(JSON)"
        ),
        bullet("是否项目隔离：是 — namespace task:{projectId}:{taskId} / project:{projectId}"),
        bullet("是否任务隔离：是 — task namespace + project_id/task_id on tool_operations"),
        bullet(
          "是否可被后续 Agent 读取：部分 — searchMemories 子串匹配；contextPackBuilder 注入 promptContext.sections；非 Markdown 文件读取"
        ),
        bullet(
          "缺口：无 Markdown 归档；无错误标题/标签/根因/验证结果结构化字段；无 lessons learned 文档"
        ),
        para("Markdown 文档建议字段（当前均未自动写入）：", { bold: true }),
        bullet(
          "项目 ID/名称、任务 ID/标题、时间、来源、命令、错误类型、堆栈、相关文件、根因、修复方案、Diff 摘要、验证结果、经验规则、标签"
        ),

        heading("4. 自我学习能力评估", HeadingLevel.HEADING_2),
        para("当前等级：L2 ~ L3（偏 L2）", { bold: true }),
        tableFromRows(
          [
            ["等级", "定义", "本项目"],
            ["L0", "只打印不保存", "已超过"],
            ["L1", "保存日志不总结", "tool_operations 达到 L1+"],
            ["L2", "保存错误和修复但不自动引用", "test_failure memory + fixSuggestions UI 达到"],
            ["L3", "项目记忆可检索引用", "部分达到 — searchMemories + snapshot 注入"],
            ["L4", "自动生成经验规则注入 Agent", "未达到 — 无 rules 生成器"],
            ["L5", "同类错误识别与主动规避", "未达到 — 无 fingerprint/相似检索"],
          ],
          [8, 28, 64]
        ),
        para("依据：", { bold: true }),
        bullet("controlledDevService.js L140-150：测试失败时 writeMemory(memoryType=test_failure, content=fix.suggestions 文本拼接)"),
        bullet("controlledDevService.js L262-266：Shell 失败 writeMemory(memoryType=shell_failure)"),
        bullet("agentOrchestrator.js recordTaskMemories：仅 output.memoryToRecord（planOnlyOutput 写 development_plan/requirement，非错误）"),
        bullet("projectAgentLLM.js：无 writeMemory / memoryToRecord 输出"),
        bullet("contextMemoryService.searchMemories：子串 filter，无 embedding、无 error category 匹配"),
        bullet("fixSuggestionService.js：正则匹配 AssertionError/SyntaxError 等生成静态中文建议，非 LLM 根因分析"),

        heading("5. 同类错误避免能力", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "是否存在", "说明"],
            ["错误指纹 fingerprint", "否", "无 hash/category 字段"],
            ["错误标签 tags", "否", "memory_type 仅粗粒度枚举"],
            ["相似错误检索", "否", "无 error_lessons 表或向量检索"],
            ["经验规则 rules", "否", "fixSuggestion 为硬编码模板"],
            ["注入后续 prompt", "部分", "runtimeInjector 注入 snapshot.currentErrors + memories"],
            ["主动规避", "否", "无 preventKnownErrors / applyErrorLessons"],
            ["去重", "部分", "parseBuildError issues 用 file:line key 去重；memory 无去重"],
          ],
          [22, 12, 66]
        ),
        para(
          "结论：当未来再次遇到类似 flex 挤压、Diff 多处匹配、build 报错等问题时，系统不会主动提醒历史经验；仅可能在 memory 子串碰巧匹配时被检索到。",
          { bold: true }
        ),

        heading("6. 上下文压缩能力排查", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["检查项", "支持", "实现文件", "触发条件", "存储位置", "问题"],
            [
              "上下文健康度检测",
              "是",
              "contextCompressionManager.js, tokenBudget.js",
              "usedRatio 计算",
              "wbContextHealth IPC",
              "UI 徽章 projectWorkspace",
            ],
            [
              "自动压缩",
              "是",
              "prepareContextForAgent",
              "soft≥0.72 / hard≥0.85 / prune≥0.6",
              "context_snapshots + compression_events",
              "单次 Agent 仅 1 条 user message，主要靠 memory 累积触发",
            ],
            [
              "手动压缩",
              "是",
              "applyCompression, contextHealth.js",
              "用户点「手动压缩」",
              "同上",
              "结果 dump 到 #wbAgentOutput JSON",
            ],
            [
              "压缩快照",
              "是",
              "snapshotBuilder.js, contextStore.js",
              "压缩成功且 validate 通过",
              "context_snapshots.snapshot_json",
              "含 currentErrors/decisions/constraints",
            ],
            [
              "压缩事件记录",
              "是",
              "contextStore.saveCompressionEvent",
              "每次 compress",
              "compression_events 表",
              "含 tokens_before/after, blocks_*",
            ],
            [
              "项目/任务/会话隔离",
              "是",
              "namespace.js",
              "task:/project:/chat:",
              "各 namespace 独立快照",
              "assertNoCrossScopeRead",
            ],
            [
              "工具日志纳入压缩",
              "部分",
              "contextMonitor.collectPhase4Extras",
              "task namespace 最近 40 条 tool_operations",
              "写入 snapshot testsAndCommands/currentErrors",
              "非全量压缩 tool_ops 表",
            ],
            [
              "错误记录压缩",
              "部分",
              "contextClassifier type=error",
              "消息含 failed/失败/异常",
              "snapshot.currentErrors",
              "Agent 单轮 message 少，errors 多来自 tool_ops",
            ],
            [
              "压缩后恢复",
              "部分",
              "contextStore.restoreSnapshot",
              "wbContextSnapshotRestore IPC",
              "is_latest 标记",
              "渲染层无 restore UI",
            ],
            [
              "压缩后继续任务",
              "是",
              "runtimeInjector.buildPromptContext",
              "压缩后重建 promptContext",
              "注入 ProjectAgent system prompt",
              "关键约束 extractConstraints 保留",
            ],
          ],
          [14, 8, 18, 16, 16, 28]
        ),

        heading("7. 自动压缩触发机制", HeadingLevel.HEADING_2),
        para("阈值配置（main/workbench/context-compression/config.js DEFAULT_COMPRESSION_CONFIG）：", { bold: true }),
        bullet("modelContextWindow: 128000；systemPromptTokens: 2000；toolSchemaTokens: 1500；reservedOutputTokens: 4096；safetyMarginTokens: 1024"),
        bullet("effectiveContextTokens ≈ 128000 - 上述固定开销 ≈ 119404（tokenBudget.js 计算）"),
        bullet("softLimitRatio: 0.72 → action=compress, mode=normal"),
        bullet("hardLimitRatio: 0.85 → action=compress, mode=aggressive"),
        bullet("usedRatio ≥ 0.6 且 lowValueLogRatio ≥ 0.15 → action=prune, mode=light"),
        bullet("targetRatioAfterCompression: 0.45；minRecentTurnsKeep: 8"),
        bullet("healthStatus：normal(<0.6) / warning(<0.72) / compress_recommended(<0.85) / forced(≥0.85)"),
        spacer(),
        para("触发函数链：", { bold: true }),
        bullet("runProjectAgent → compressionManager.prepareContextForAgent(namespace=task:{projectId}:{taskId})"),
        bullet("shouldCompress(runtimeState) → applyCompression → saveSnapshot + saveCompressionEvent"),
        bullet("runChatAgent 同样调用 prepareContextForAgent(chat:{chatId})"),
        spacer(),
        para("其他机制：", { bold: true }),
        bullet("默认开启：无全局开关字段，prepareContextForAgent 内自动判断"),
        bullet("最小触发间隔：未发现 debounce；validation 失败时 audit_logs compression.validation_failed"),
        bullet("UI 提示：projectWorkspace #wbProjectContextHealth 徽章 + #wbSnapshotHistory 列表"),
        bullet("失败重试：validation 失败保留原上下文，不保存 invalid snapshot 为 latest"),
        bullet("对当前任务影响：压缩后继续 Agent，promptContext 含快照摘要而非全量历史"),

        heading("8. 数据库 / 文件存储结构", HeadingLevel.HEADING_2),
        para("SQLite 表（main/workbench/db.js SCHEMA v5）：", { bold: true }),
        bullet(
          "context_memories：id, user_id, namespace, scope_type, scope_id, memory_type, content, source, importance, created_at, updated_at"
        ),
        bullet(
          "context_snapshots：id, namespace, revision, snapshot_json, validation_status, risk_level, is_latest, tokens_before, tokens_after, created_at"
        ),
        bullet(
          "compression_events：snapshot_id, namespace, reason, mode, tokens_before/after, blocks_kept/summarized/dropped, validation_result_json"
        ),
        bullet(
          "tool_operations：agent_run_id, project_id, task_id, tool_name, args_json, result_text(≤16KB), risk_level, approved_by_user"
        ),
        bullet("agent_run_sessions：output_json, tool_trace_json, error_message, mode, status"),
        bullet("agent_runs：output_text(JSON), error_message（legacy audit）"),
        bullet("audit_logs：action 含 compression.validation_failed 等"),
        bullet("不存在：project_errors、error_lessons 表；不存在 projects/*/.jl-ai/lessons/*.md"),
        spacer(),
        para("snapshot_json 实际结构（snapshotBuilder.js）：", { bold: true }),
        bullet("meta(revision, mode, reason), scope(namespace, projectId, taskId, chatId)"),
        bullet("currentObjective, userConstraints, relevantFiles, decisions, changesMade"),
        bullet("testsAndCommands, currentErrors, nextActions, compressedHistory, riskFlags"),
        bullet("无独立字段：knownErrors/appliedFixes/rejectedChanges/tokenBefore（tokens 在表列）"),
        spacer(),
        para("渲染层 localStorage：", { bold: true }),
        bullet("testResultStore.js WB_TEST_RESULTS_STORAGE_KEY — 测试历史，与主进程 tool_ops 分离"),
        bullet("wb_chat_context_snapshots_v1 — 聊天快照 HTML，非 workbench compression"),

        heading("9. 当前缺口", HeadingLevel.HEADING_2),
        para("P0 — 影响 AI 编程可靠性与「自我学习」承诺", { bold: true }),
        bullet("无 Markdown 错误知识库自动写入（lessons/errors.md）"),
        bullet("错误未结构化沉淀（缺根因/验证结果/经验规则/标签）"),
        bullet("LLM Agent 成功路径不写 error/fix memory（仅 planOnly fallback 写 plan memory）"),
        bullet("verify 失败 parseBuildError 结果未持久化为可检索 lesson"),
        bullet("无同类错误 fingerprint / 去重 / 主动规避"),
        spacer(),
        para("P1 — 建议尽快增强", { bold: true }),
        bullet("fixSuggestion 升级为结构化 error record + writeMemory(error_lesson) + 可选 append Markdown"),
        bullet("contextPackBuilder 主动 searchMemories(query=error types) 注入 Agent"),
        bullet("压缩快照 restore UI（preload 已有 wbContextSnapshotRestore）"),
        bullet("verificationService 失败时自动 writeMemory(build_failure) 含 parsed.issues JSON"),
        spacer(),
        para("P2 — 体验优化", { bold: true }),
        bullet("tool_operations 与 testResultStore 统一展示"),
        bullet("compression_events 时间线 UI；Agent cancel 时写入 error memory"),
        bullet("项目级 lessons/index.md 人工审阅入口"),

        heading("10. 建议方案（未实现，供后续开发）", HeadingLevel.HEADING_2),
        para("模块：main/workbench/errorLessonService.js（新建）", { bold: true }),
        bullet("路径：{userData}/workbench/lessons/{projectId}/errors.md 或 tasks/{taskId}/error-lessons.md"),
        bullet("触发：controlledDevService 测试/Shell/verify 失败；applyControlledPatch 失败；fixLoop VERIFY_FIX 完成"),
        bullet("流程：parseBuildError/fixSuggestion → 结构化 record → writeMemory + appendMarkdown → contextPack 读取"),
        bullet("数据结构：{ fingerprint, category, tags[], rootCause, fixSteps[], verified, rule }"),
        bullet("与 contextMemoryService：memory_type=error_lesson, importance=5, namespace=task:*"),
        bullet("与 context-compression：snapshot.currentErrors 引用 lesson id；压缩保留 userConstraints + error rules"),
        bullet("与 ProjectAgent：buildContextPack 增加 searchMemories(type=error_lesson) + 注入「历史经验」section"),
        bullet("与 fixLoopController：verify 通过后 updateLesson(verified=true)"),
        bullet("安全：仅 userData 目录；不含密钥；Markdown 与 DB 双写可配置"),

        heading("11. 验收标准", HeadingLevel.HEADING_2),
        bullet("1. 运行 npm run build 故意失败 → tool_operations 有记录"),
        bullet("2. 当前：无 Markdown 生成（预期失败直到 P0 实现）"),
        bullet("3. 当前：test_failure memory 写入 context_memories（可通过 wbMemorySearch 验证）"),
        bullet("4. 新任务 Agent run → prepareContextForAgent 注入 memories/snapshot（查 promptContext）"),
        bullet("5. 长任务多次 Agent → usedRatio 超 0.72 → compression_events 新增记录"),
        bullet("6. 压缩后 Agent 仍可 runProjectAgent 成功返回"),
        bullet("7. snapshot.currentErrors 含最近测试失败摘要（contextMonitor）"),
        bullet("8. 切换 project namespace 不串扰（namespace 403 单测 scripts/wb-namespace-test.js）"),

        heading("12. 结论", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["能力", "是否具备", "说明"],
            [
              "编程错误自动记录到 Markdown",
              "否",
              "有 SQLite/工具日志/部分 memory，无 .md 自动写入",
            ],
            [
              "自我学习并规避同类错误",
              "部分（L2~L3）",
              "有 test_failure 等 memory + 压缩快照错误摘要；无 rules/fingerprint/主动规避",
            ],
            [
              "编程上下文自动压缩",
              "是",
              "context-compression 完整；ProjectAgent 每次 prepareContextForAgent",
            ],
            [
              "长任务继续开发能力",
              "基本具备",
              "快照+memory 累积触发压缩；约束/decisions/errors 保留在 snapshot；restore UI 缺失",
            ],
          ],
          [28, 14, 58]
        ),

        heading("附录：错误经验进入 Agent 上下文 — 流程对照", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["步骤", "状态"],
            ["错误发生", "✓ tool_operations / IPC 异常"],
            ["解析错误 parseBuildError", "✓ verificationService；未持久化 lesson"],
            ["生成错误摘要 fixSuggestion", "✓ 启发式；仅 UI + memory 文本"],
            ["生成经验规则", "✗ 无"],
            ["写入 Markdown", "✗ 无"],
            ["写入 context memory", "△ test_failure/shell_failure/change_log"],
            ["Context Pack 读取 memory", "△ promptContext.sections 注入"],
            ["注入 Agent system prompt", "✓ projectAgentLLM buildSystemPrompt + contextPack"],
            ["方案生成避开同类问题", "✗ 无显式 avoidPastMistakes"],
          ],
          [35, 65]
        ),

        heading("附录：关键文件索引", HeadingLevel.HEADING_2),
        bullet("main/workbench/context-compression/* — 压缩全链路"),
        bullet("main/workbench/contextMemoryService.js — 记忆读写"),
        bullet("main/workbench/controlledDevService.js — 测试/Shell 失败 writeMemory"),
        bullet("main/workbench/fixSuggestionService.js — 启发式修复建议"),
        bullet("main/workbench/parseBuildError.js — 构建错误 file:line 解析"),
        bullet("main/workbench/agentOrchestrator.js — prepareContextForAgent 接入点"),
        bullet("main/workbench/contextPackBuilder.js — Agent 上下文组装"),
        bullet("app/workbench/contextHealth.js — 健康度/手动压缩 UI"),
        bullet("app/workbench/projectWorkspace.js — 压缩按钮与快照历史"),
        bullet("app/workbench/testResultPanel.js — 测试输出（localStorage 历史）"),
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
