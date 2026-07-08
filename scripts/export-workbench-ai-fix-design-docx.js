/**
 * 导出「Workbench AI 编程能力修复设计 v1.23.20+」Word 文档
 * 运行：node scripts/export-workbench-ai-fix-design-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "Workbench AI编程能力修复设计.docx");
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
  title: "Workbench AI 编程能力修复设计",
  description: `基于 AI 编程能力排查报告 v${APP_VERSION} — 增量修复设计（不推翻 Layout / Agent 架构）`,
  sections: [
    {
      properties: {},
      children: [
        heading("Workbench AI 编程能力修复设计"),
        para(
          `生成日期：${GENERATED_AT} · 基准版本 v${APP_VERSION} · 依据《AI 编程能力排查报告 v1.23.20》`,
          { italics: true }
        ),
        para(
          "设计原则：在现有 L4 工具链雏形上增量修复；保留 stage_patch → DiffReviewPanel → approvalStore → controlledDevService 链路；LLM 禁止直接写盘；每轮补丁仍须用户 Diff 审阅后写入；不重做 Layout v4。"
        ),

        heading("0. 修复范围总览", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["优先级", "模块", "问题摘要", "方案要点"],
            ["P0", "fixLoop 连续闭环", "VERIFY_FIX 一轮后 waitingApproval 中断", "任务级 fix_loop_state 状态机 + 写入后继续 verify"],
            ["P0", "APPLY_APPROVED", "仅改任务状态，未 apply ACCEPTED patches", "orchestrator 调用 applyAcceptedPatches 批量写入"],
            ["P1", "compress_context", "allowlist 有声明无 handler", "方案 A：接入 contextCompressionManager"],
            ["P1", "Agent UI 控件", "取消/自动验证/快照恢复/需修改 缺失", "在现有 Agent 区补 DOM + 事件绑定"],
            ["P1", "graphify 注入", "未进 Workbench Agent contextPack", "graphifyContextService 摘要注入"],
            ["P2", "symbolIndexService", "每次重建索引", "根目录缓存 + mtime 失效 + fuzzy/扩展 pattern"],
          ],
          [12, 18, 32, 38]
        ),

        heading("1. 涉及文件清单", HeadingLevel.HEADING_2),
        para("1.1 主进程（新增 / 修改）", { bold: true }),
        bullet("main/workbench/fixLoopController.js — 重构为状态机：verify / agentFix / resumeAfterApply"),
        bullet("main/workbench/fixLoopStateService.js — 【新增】fix_loop_state 读写、Timeline 事件"),
        bullet("main/workbench/agentOrchestrator.js — APPLY_APPROVED 真实 apply；fixLoop 挂接"),
        bullet("main/workbench/controlledDevService.js — 【新增】applyAcceptedPatches 批量写入"),
        bullet("main/workbench/toolRegistry.js — compress_context handler + TOOL_DEFS"),
        bullet("main/workbench/contextPackBuilder.js — graphify 段 + promptContext.text 注入"),
        bullet("main/workbench/graphifyContextService.js — 【新增】GRAPH_REPORT / god nodes 摘要"),
        bullet("main/workbench/symbolIndexService.js — 缓存、fuzzy、CSS class pattern"),
        bullet("main/workbench/projectService.js — task.fixLoopState 字段映射"),
        bullet("main/workbench/registerHandlers.js — wb-project-fix-loop-* IPC（可选精简）"),
        bullet("main/workbench/db.js — tasks 表 fix_loop_json 列（schema v6）"),
        spacer(),
        para("1.2 渲染层（修改）", { bold: true }),
        bullet("app/workbench/projectWorkspaceLayout.js — #wbAgentCancelBtn、#wbAutoVerifyAfterWrite DOM"),
        bullet("app/workbench/projectWorkspace.js — 取消 Agent、fixLoop 续跑、Timeline 增强"),
        bullet("app/workbench/projectCodePanel.js — applyAcceptedDiffs 改走 APPLY_APPROVED + fixLoop resume"),
        bullet("app/workbench/diffReviewPanel.js — 「需修改」按钮 + revision 意见输入"),
        bullet("app/workbench/codeReviewStore.js — requestRevisionWithFeedback、PATCH_REVISION 同步"),
        bullet("app/workbench/contextHealth.js — 快照列表增加「恢复」按钮"),
        bullet("preload.js — 如需新增 IPC 暴露（尽量复用现有 wbProjectAgentRun / wbContextSnapshotRestore）"),

        heading("2. 当前问题定位", HeadingLevel.HEADING_2),

        heading("2.1 fixLoop 连续闭环", HeadingLevel.HEADING_3),
        bullet("fixLoopController.js 第 71–78 行：runProjectAgentLLM(VERIFY_FIX) 后立即 return { waitingApproval: true }，while 循环未在用户接受补丁后继续。"),
        bullet("applyAcceptedDiffs（projectCodePanel.js 978–1007）虽有 autoVerify，但 verify 失败时重新 wbProjectAgentRun(VERIFY_FIX) 会从头 runFixLoop（先 verify 再 fix），且未持久化 round 计数。"),
        bullet("无跨 IPC 调用的 fix_loop 状态，用户接受补丁与 verify 续跑之间缺少 orchestrator 衔接。"),

        heading("2.2 APPLY_APPROVED", HeadingLevel.HEADING_3),
        bullet("agentOrchestrator.js 126–140 行：mode===APPLY_APPROVED 仅 updateTask → TESTING，未调用 controlledDevService.applyControlledPatch。"),
        bullet("applyAcceptedDiffs 当前逐文件 wbProjectApplyPatch（渲染层循环），绕过了 APPLY_APPROVED 模式；patch 状态 APPLIED 依赖单次 apply 的 stagedPatchId，与 Agent 模式语义不一致。"),

        heading("2.3 compress_context", HeadingLevel.HEADING_3),
        bullet("toolPermissionService.js PROJECT_AGENT_TOOLS 含 compress_context，但 toolRegistry.js TOOL_DEFS / HANDLERS 无定义 → dispatchTool 返回 TOOL_NOT_IMPLEMENTED。"),

        heading("2.4 Agent UI 缺口", HeadingLevel.HEADING_3),
        bullet("projectCodePanel.js 引用 #wbAutoVerifyAfterWrite，projectWorkspaceLayout.js 无该 checkbox。"),
        bullet("preload.js 有 wbProjectAgentCancel，projectWorkspace.js 无取消按钮与 agentRunId 跟踪。"),
        bullet("contextHealth.js renderSnapshotHistory 只展示 rev/tokens，无 restore 按钮（IPC wbContextSnapshotRestore 已存在）。"),
        bullet("codeReviewStore.requestRevision 仅设 reviewStatus=revision；diffReviewPanel 无 UI；未触发 Agent 重新 PATCH。"),

        heading("2.5 graphify / contextPack", HeadingLevel.HEADING_3),
        bullet("contextPackBuilder.js 仅 structure + symbols + snippets + promptContext.sections 元数据；未读 graphify-out。"),
        bullet("main/mcp/nativeGraphifyAdapter.js 已有 god_nodes、query_graph；Workbench Agent 未调用。"),
        bullet("（关联缺口）promptContext.text（压缩快照+记忆正文）未注入 buildSystemPrompt，仅 sections JSON。"),

        heading("2.6 symbolIndexService", HeadingLevel.HEADING_3),
        bullet("findSymbols 每次 buildIndex 全量 walk + 正则扫描；无缓存。"),
        bullet("PATTERNS 含 function/ipc/dom/storage，缺 CSS class、缺 fuzzy 文件名、IPC 仅 ipcMain.handle。"),

        heading("3. 修复方案", HeadingLevel.HEADING_2),

        heading("3.1 fixLoop 连续闭环（P0）", HeadingLevel.HEADING_3),
        para("核心思路：将 fixLoop 拆为可暂停/可恢复的状态机，状态持久化在 task.fix_loop_json，写入补丁由用户审批触发 resume。", { bold: true }),
        bullet("新增 fixLoopStateService：getFixLoopState / setFixLoopState / appendTimelineEvent / clearFixLoopState"),
        bullet("fixLoopController 导出三个入口："),
        bullet("  · runFixLoopVerifyOnly — 仅执行 runVerification，更新 round 显示"),
        bullet("  · runFixLoopAgentFix — verify 失败后调用 runProjectAgentLLM(VERIFY_FIX)，phase→WAITING_APPLY"),
        bullet("  · resumeFixLoopAfterApply — 用户写入成功后调用，phase→VERIFYING，继续 verify；失败且 round<MAX 再 AgentFix"),
        bullet("MAX_FIX_ROUNDS=3 语义：每轮 = verify 失败 → Agent 出 patch → 用户接受写入 → 再 verify；共最多 3 次「修复尝试」"),
        bullet("Timeline：每步 appendTimelineEvent 写 context_memories(memoryType=fix_loop_event) + audit_logs(action=fix_loop.*)"),
        bullet("渲染层 applyAcceptedDiffs 写入成功后：若 fixLoopState.active → IPC resume（非重新 VERIFY_FIX 整包）"),

        heading("3.2 APPLY_APPROVED（P0）", HeadingLevel.HEADING_3),
        bullet("controlledDevService.applyAcceptedPatches(getUserDataPath, uid, { projectId, taskId, userApproved, createGitBranch, patchIds? })"),
        bullet("  · listStagedPatches status=ACCEPTED（或 payload.patchIds 过滤）"),
        bullet("  · 逐 patch 调用 applyControlledPatch（已有 backup / 路径校验 / stagedPatchId→APPLIED）"),
        bullet("  · 任一失败：updateTask FAILED + recordToolOperation + 中止后续文件"),
        bullet("agentOrchestrator APPLY_APPROVED：require userApproved in payload；调用 applyAcceptedPatches；成功后若 fixLoopState.active 调用 resumeFixLoopAfterApply"),
        bullet("applyAcceptedDiffs 改为：Diff 审阅 approval 通过后 wbProjectAgentRun({ mode:'APPLY_APPROVED', userApproved:true, patchIds })，不再渲染层逐文件 wbProjectApplyPatch"),

        heading("3.3 compress_context — 方案 A（P1）", HeadingLevel.HEADING_3),
        bullet("toolRegistry TOOL_DEFS 新增 compress_context（permission READ，PLAN_ONLY/PATCH_PROPOSE/VERIFY_FIX 均可）"),
        bullet("HANDLER 调用 contextCompressionManager.applyCompression 或 getContextHealth+applyCompression"),
        bullet("参数：projectId, taskId（ctx 已有）, reason(manual|auto), mode(normal|aggressive)"),
        bullet("namespace 由 buildTaskNamespace(projectId, taskId) 推导；messages 传 []（与 UI manualCompress 一致）"),
        bullet("返回：applied, tokensBefore, tokensAfter, snapshotId, revision"),
        bullet("不新增 DB 表；复用 compression_events + context_snapshots"),

        heading("3.4 Agent UI 控件（P1）", HeadingLevel.HEADING_3),
        bullet("#wbAgentCancelBtn：Agent 运行中显示（runProjectAgent 返回 agentRunId 后启用），调用 wbProjectAgentCancel"),
        bullet("#wbAutoVerifyAfterWrite：checkbox 置于 wb-pws-composer__actions；localStorage 持久化 wb_auto_verify_v1"),
        bullet("快照恢复：contextHealth.renderSnapshotHistory 每项增加「恢复」按钮 → wbContextSnapshotRestore({ snapshotId, namespace }) → toast + refresh health"),
        bullet("DiffReviewPanel「需修改」：每文件 actions 增加按钮 → prompt 输入修改意见 → codeReviewStore.requestRevisionWithFeedback → wbProjectPatchStatus(REVISION_REQUESTED 或保持 ACCEPTED 不变、UI revision) → wbProjectAgentRun({ mode:'PATCH_PROPOSE', message: 修订意见 + 文件上下文 })"),

        heading("3.5 graphify 注入 contextPack（P1）", HeadingLevel.HEADING_3),
        bullet("graphifyContextService.buildGraphifySummary({ appRoot, message, tokenBudget })"),
        bullet("  · 读 graphify-out/GRAPH_REPORT.md：Summary、Community Hubs 前 N 行"),
        bullet("  · nativeGraphifyAdapter.callTool('graphify_god_nodes', { limit: 12 })"),
        bullet("  · nativeGraphifyAdapter.callTool('graphify_query_graph', { question: message, budget: 2000 }) 若 message 非空"),
        bullet("  · 失败 graceful：返回 { available:false }，不阻断 Agent"),
        bullet("contextPackBuilder 新增 section type=graphify；同时修复 memory section 使用 promptContext.text 而非仅 sections 元数据"),

        heading("3.6 symbolIndexService 轻量优化（P2）", HeadingLevel.HEADING_3),
        bullet("模块级 cache：Map<cacheKey, { mtimeSum, index, builtAt }>；cacheKey=rootDir resolved path"),
        bullet("buildIndex 前 stat 根目录下已索引文件 mtime 总和；变化则重建"),
        bullet("invalidateCache(rootDir) — applyControlledPatch 写入后由 controlledDevService 调用（可选 debounce）"),
        bullet("findSymbols 增加 fuzzy 文件名：path 与 query 的 levenshtein/substring score"),
        bullet("PATTERNS 扩展：className/id= CSS；preload ipcRenderer.invoke / ipcMain.handle；已有 dom/storage 保留"),

        heading("4. 状态流转图", HeadingLevel.HEADING_2),
        para("4.1 fixLoop 状态机", { bold: true }),
        para(
          "IDLE → (用户勾选自动验证 / 手动 verify) → VERIFYING\n" +
            "VERIFYING → ok → COMPLETED（clear fix_loop_state）\n" +
            "VERIFYING → fail → round++ → AGENT_FIXING → WAITING_APPLY（Diff 审阅）\n" +
            "WAITING_APPLY → 用户拒绝/需修改 → WAITING_APPLY 或 REVISION\n" +
            "WAITING_APPLY → 用户接受 → APPLYING（APPLY_APPROVED）→ WRITTEN → VERIFYING\n" +
            "VERIFYING → fail 且 round>=MAX → FAILED\n" +
            "任意 → 用户取消 Agent → CANCELED（fix_loop 可选保留或 clear）"
        ),
        spacer(),
        para("4.2 APPLY_APPROVED 与 Diff 审阅", { bold: true }),
        para(
          "DiffReviewPanel 接受 → approvalStore(write_batch) → wbProjectAgentRun(APPLY_APPROVED)\n" +
            "→ applyAcceptedPatches → patch.status=APPLIED → fixLoop resume → verify"
        ),
        spacer(),
        para("4.3 PATCH 修订流", { bold: true }),
        para(
          "DiffReviewPanel「需修改」+ 意见 → reviewStatus=revision → PATCH_PROPOSE Agent\n" +
            "→ 新 stage_patch（旧 patch REJECTED 或保留历史）→ DiffReviewPanel 刷新"
        ),

        heading("5. IPC 变更", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["IPC", "变更类型", "说明"],
            ["wb-project-agent-run", "扩展 payload", "APPLY_APPROVED 增加 userApproved, patchIds；VERIFY_FIX 增加 fixLoopResume"],
            ["wb-project-fix-loop-resume", "新增（可选）", "写入成功后 resumeFixLoopAfterApply；或合并进 agent-run"],
            ["wb-project-agent-cancel", "无变更", "已有；UI 接入"],
            ["wb-context-snapshot-restore", "无变更", "已有；UI 接入"],
            ["wb-project-patch-status", "扩展", "可选 status REVISION_REQUESTED"],
            ["preload wbProjectAgentRun / Cancel / SnapshotRestore", "无/schema 变更", "渲染层调用"],
          ],
          [28, 18, 54]
        ),
        para("优先合并策略：fixLoop resume 作为 wbProjectAgentRun mode=FIX_LOOP_RESUME 或 APPLY_APPROVED 内部自动触发，减少新 IPC 数量。"),

        heading("6. 数据表 / 字段变更", HeadingLevel.HEADING_2),
        para("6.1 schema v6（main/workbench/db.js）", { bold: true }),
        bullet("ALTER tasks ADD COLUMN fix_loop_json TEXT DEFAULT NULL"),
        bullet("fix_loop_json 结构："),
        bullet("  { active, round, maxRounds, scriptName, phase, lastVerifySummary, startedAt, updatedAt }"),
        spacer(),
        para("6.2 无新表", { bold: true }),
        bullet("Timeline 复用 context_memories(memoryType=fix_loop_event) + agent_run_sessions + audit_logs"),
        bullet("compress_context 复用 context_snapshots / compression_events"),
        bullet("staged_patches 可选新增 status REVISION_REQUESTED（或仅用 UI revision + 新 STAGED patch）"),
        spacer(),
        para("6.3 patch 状态扩展（可选）", { bold: true }),
        bullet("PATCH_STATUS.REVISION_REQUESTED — VALID_TRANSITIONS STAGED→REVISION_REQUESTED→STAGED"),

        heading("7. 测试用例", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["编号", "场景", "步骤", "期望"],
            ["T1", "fixLoop 3 轮", "故意 build 失败 → 接受 patch×3", "第 4 次 verify 前 task FAILED；Timeline 有 verify/fix/apply 记录"],
            ["T2", "fixLoop 成功", "第 2 轮 patch 修复 build", "task COMPLETED；fix_loop_json cleared"],
            ["T3", "APPLY_APPROVED", "2 接受 1 拒绝", "仅 2 文件写入+备份；拒绝 patch 仍 ACCEPTED/REJECTED 不 APPLIED"],
            ["T4", "静默写入防护", "跳过 approvalStore", "APPLY_APPROVED 无 userApproved → 403"],
            ["T5", "compress_context", "Agent 调用工具", "返回 snapshot revision；compression_events 有记录"],
            ["T6", "取消 Agent", "12 轮工具中点击取消", "status CANCELED；按钮恢复"],
            ["T7", "快照恢复", "手动压缩后点恢复", "is_latest 切换；audit snapshot.restore"],
            ["T8", "需修改", "Diff 点需修改+意见", "新 patch staged；旧 revision 标记"],
            ["T9", "graphify", "graphify-out 存在时 PLAN_ONLY", "system prompt 含 graphify section"],
            ["T10", "symbol 缓存", "连续 2 次 find_symbols", "第二次不走全量 walk（可 mock mtime）"],
          ],
          [8, 14, 38, 40]
        ),
        para("自动化脚本（新增）：", { bold: true }),
        bullet("scripts/wb-fix-loop-test.js — mock verification 失败/成功 + state 迁移"),
        bullet("scripts/wb-apply-approved-test.js — ACCEPTED patches batch apply"),
        bullet("scripts/wb-compress-context-tool-test.js — dispatchTool compress_context"),
        bullet("扩展 scripts/wb-plan-output-test.js — contextPack 含 graphify 段"),

        heading("8. 回滚方案", HeadingLevel.HEADING_2),
        bullet("功能开关（环境变量，默认开启）："),
        bullet("  · WB_FIX_LOOP_V2=0 — fixLoop 回退旧单次 waitingApproval 行为"),
        bullet("  · WB_APPLY_APPROVED_BATCH=0 — applyAcceptedDiffs 回退逐文件 wbProjectApplyPatch"),
        bullet("  · WB_GRAPHIFY_CONTEXT=0 — contextPack 跳过 graphify 段"),
        bullet("DB：fix_loop_json 列可空，旧客户端忽略；schema migration 仅 ADD COLUMN，不删列"),
        bullet("UI：新增 DOM 用 hidden/disabled，回滚时隐藏按钮不影响 Layout 结构"),
        bullet("Git：按 P0→P1 分 commit，便于 cherry-pick revert"),
        bullet("交付：修复完成后 bump version + npm run ship:latest-client（按 client-ship 规则）"),

        heading("9. 实施顺序（确认后编码）", HeadingLevel.HEADING_2),
        bullet("Phase 1（P0）：db v6 + fixLoopStateService + controlledDevService.applyAcceptedPatches + orchestrator APPLY_APPROVED + fixLoop resume"),
        bullet("Phase 2（P0 渲染）：applyAcceptedDiffs 改 IPC + autoVerify checkbox + Timeline 事件展示"),
        bullet("Phase 3（P1）：compress_context + Agent cancel + snapshot restore UI + revision 流程"),
        bullet("Phase 4（P1/P2）：graphifyContextService + contextPackBuilder + symbolIndexService 缓存"),

        heading("10. 验收对照（与用户要求）", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["用户验收项", "设计覆盖"],
            ["build 失败 → patch → 接受 → 自动 verify", "resumeFixLoopAfterApply + autoVerify checkbox"],
            ["失败继续 VERIFY_FIX，最多 3 轮", "fix_loop_json.round + MAX_FIX_ROUNDS"],
            ["每轮须 DiffReviewPanel 接受", "不变；APPLY_APPROVED 仅处理 ACCEPTED"],
            ["禁止静默写入", "approvalStore + userApproved 双 gate"],
            ["APPLY_APPROVED 真实写入", "applyAcceptedPatches"],
            ["compress_context 可用", "方案 A handler"],
            ["取消 / 自动验证 / 快照恢复 / 需修改", "§3.4 UI 方案"],
            ["Agent 引用 graphify 结构", "§3.5 graphify section"],
          ],
          [45, 55]
        ),

        spacer(),
        para(
          "请确认本设计后进入编码阶段。确认项：① fixLoop 状态存 task.fix_loop_json 是否可接受；② APPLY_APPROVED 是否统一取代渲染层逐文件 apply；③ PATCH 修订是否新建 patch 而非原地改 staged_patches。",
          { italics: true }
        ),
      ],
    },
  ],
});

Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(OUT_PATH, buffer);
  console.log(`已写入：${OUT_PATH}`);
});
