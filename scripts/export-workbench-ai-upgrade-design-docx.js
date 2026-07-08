/**
 * 导出「Workbench AI 编程能力升级设计方案」Word 文档
 * 运行：node scripts/export-workbench-ai-upgrade-design-docx.js
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

const OUT_PATH = path.join(__dirname, "..", "Workbench-AI编程能力升级设计方案.docx");
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
  title: "Workbench AI 编程能力升级设计方案",
  description: "ProjectAgentLLM + Tool Calling + 真实 Diff + 结构分析 + 修复闭环",
  sections: [
    {
      properties: {},
      children: [
        heading("Workbench AI 编程能力升级设计方案"),
        para(`生成日期：${GENERATED_AT} · 状态：设计稿（尚未编码）`, { italics: true }),
        para(
          "背景：项目已具备受控读写、Diff、Shell、测试、Git、记忆、压缩和审批能力，但 ProjectAgent 仍为规则模板，未接入 LLM。本轮目标：不重构 UI、不推翻 Layout v4，补齐 AI 编程核心能力。"
        ),

        heading("1. 设计原则", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["原则", "说明"],
            ["主进程 Agent", "LLM 与工具循环在 main/workbench/，渲染层只展示与审批"],
            ["复用现有能力", "controlledDevService、diffPreviewService 等不推倒重写"],
            ["LLM 不直写磁盘", "apply_patch_after_approval 仅 staging；写入走 approvalStore"],
            ["复用对话模型配置", "getActiveProfileCredentials() 与主 AI 对话同一 Profile"],
            ["UI 最小改动", "继续 renderPlanCard、codeReviewStore、diffReviewPanel"],
            ["可回退", "保留 planOnlyOutput.js 作 LLM 不可用 fallback"],
          ],
          [28, 72]
        ),

        heading("2. 总体架构", HeadingLevel.HEADING_2),
        para("调用链：", { bold: true }),
        bullet("用户输入 projectWorkspace.js → IPC wb-project-agent-run"),
        bullet("agentOrchestrator.js → 更新任务状态"),
        bullet("projectAgentLLM.js（Agent 主循环）"),
        bullet("  ├ llmClient.js（OpenAI/Ollama + tools）"),
        bullet("  ├ toolRegistry.js（12 工具注册）"),
        bullet("  ├ projectStructureService.js（结构扫描 + graphify）"),
        bullet("  └ patchProposalService.js（structured edits → unified diff）"),
        bullet("渲染层：renderPlanCard → codeReviewStore → diffReviewPanel → approvalStore → applyAcceptedDiffs"),
        bullet("fixLoopController.js：写入后自动验证 → 失败再 Agent FIXING（最多 3 轮）"),

        heading("3. 新增/改造模块", HeadingLevel.HEADING_2),

        para("3.1 llmClient.js（新增）", { bold: true }),
        bullet("从 aiSessionStore.getActiveProfileCredentials() 读取 baseUrl/model/apiKey"),
        bullet("支持 OpenAI 兼容 /chat/completions 与 Ollama /api/chat + tools"),
        bullet("chatWithTools({ messages, tools }) → { message, toolCalls, raw, usage }"),
        bullet("不经过 ipc ai-chat，避免 webContents 绑定；credential 逻辑与 main.js 一致"),
        spacer(),

        para("3.2 toolRegistry.js（新增）", { bold: true }),
        bullet("12 工具：list_files, read_file, search_code, analyze_package, propose_patch, preview_diff,"),
        bullet("  apply_patch_after_approval, run_command, run_test, git_status, create_backup, write_task_memory"),
        bullet("每项含：name, description, input schema, permission level, handler, timeout, risk level, log"),
        bullet("ctx：projectId, taskId, agentRunId, mode, stagedPatches, codeRoot"),
        bullet("每次 dispatch 调用 recordToolOperation 写入 Timeline"),
        spacer(),

        para("3.3 projectAgentLLM.js（新增）", { bold: true }),
        tableFromRows(
          [
            ["模式", "目标", "允许工具", "产出"],
            ["PLAN_ONLY", "理解需求+读码+方案+propose_patch", "READ+PROPOSE+memory", "plan + proposedPatches"],
            ["REVIEW_PATCH", "修订补丁", "READ+PROPOSE+preview_diff", "更新 proposedPatches"],
            ["EXECUTE_APPROVED", "验证/修复轮", "run_test/run_command/read/propose", "验证结果+新补丁"],
          ],
          [18, 28, 28, 26]
        ),
        bullet("Agent 循环：MAX_TOOL_ROUNDS=12；禁止模块内 writeProjectFile"),
        bullet("输出兼容 renderPlanCard：plan, diffPreviews, toolTrace, codeAnalysis, memoryToRecord"),
        spacer(),

        para("3.4 agentOrchestrator.js（改造）", { bold: true }),
        bullet("移除「仅 PLAN_ONLY」限制；runProjectAgent 委托 projectAgentLLM"),
        bullet("LLM 失败时可 fallback buildPlanOnlyOutput"),
        bullet("新增 runProjectAgentFix 供 fixLoop 调用"),
        spacer(),

        para("3.5 patchProposalService.js（新增）— 替换占位 Diff", { bold: true }),
        bullet("LLM propose_patch 返回 structured edits：replace / insert_after / full_content"),
        bullet("读原文 → 应用 edits → buildPatchPreview → 真实 unified diff"),
        bullet("禁止 Agent 路径使用 suggestPatchFromDescription（顶部插 PLAN_ONLY 注释）"),
        bullet("结果写入 ctx.stagedPatches → codeReviewStore.setFromDiffPreviews"),
        spacer(),

        para("3.6 projectStructureService.js（新增）", { bold: true }),
        bullet("任务开始自动读：package.json, index.html, app.js, main.js, preload.js, app/workbench/, main/workbench/"),
        bullet("输出 structureSummary（≤4KB Markdown）作为 LLM system 上下文"),
        bullet("接入 graphifyService（主进程内 callTool，非仅主 AI 对话区）"),
        bullet("扫描阶段任务状态 → SCANNING"),
        spacer(),

        para("3.7 fixLoopController.js（新增）", { bold: true }),
        bullet("触发：applyAcceptedDiffs 写入成功后 IPC wb-project-fix-loop-start"),
        bullet("流程：TESTING → 跑 test/build/lint（package.json 存在才跑）→ 失败 parseBuildError"),
        bullet("FIXING → projectAgentLLM(REVIEW_PATCH) → 新 Diff → 用户审批 → 写入 → 最多 3 轮"),
        bullet("所有写入仍须用户审批，禁止静默写入"),
        spacer(),

        para("3.8 packageScriptService.js（新增）", { bold: true }),
        bullet("自动识别 npm run build / lint / test / typecheck"),
        bullet("脚本不存在返回「当前项目未配置该脚本」，不报错"),
        bullet("集成 testRunnerService、projectCodePanel 测试下拉、fixLoop 选命令"),
        spacer(),

        para("3.9 taskStatus.js（新增）", { bold: true }),
        bullet("统一枚举：CREATED, ANALYZING, SCANNING, PLANNING, WAITING_APPROVAL, PATCH_READY,"),
        bullet("  APPLYING, TESTING, FIXING, REVIEWING, COMPLETED, FAILED, CANCELED, ARCHIVED"),
        bullet("旧状态映射：DRAFT→CREATED, REVIEWING→WAITING_APPROVAL, DEVELOPING→APPLYING, DONE→COMPLETED 等"),
        bullet("修复 UI WAITING_APPROVAL 与后端 REVIEWING 不一致；app/workbench/taskStatus.js 渲染层副本"),

        heading("4. 12 工具与现有实现映射", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["Agent 工具", "底层实现", "审批"],
            ["list_files", "projectCodeService.listTreeEntries", "否"],
            ["read_file", "readProjectFile", "否"],
            ["search_code", "searchProjectCode", "否"],
            ["analyze_package", "packageScriptService.analyze", "否"],
            ["propose_patch", "patchProposalService.propose（仅 staging）", "否"],
            ["preview_diff", "buildPatchPreview", "否"],
            ["apply_patch_after_approval", "返回 staged 列表，不 write", "UI 层"],
            ["run_command", "controlledDevService.runControlledShell", "是"],
            ["run_test", "runTestWithFixSuggestions", "白名单内/ build 需批"],
            ["git_status", "getGitStatusForProject", "否"],
            ["create_backup", "listFileBackups / 备份策略", "还原需批"],
            ["write_task_memory", "writeMemory", "否"],
          ],
          [22, 48, 15]
        ),

        heading("5. 渲染层最小改动", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["文件", "改动"],
            ["projectWorkspace.js", "传 mode；状态标签/筛选；toolTrace Timeline；fixLoop 触发"],
            ["projectCodePanel.js", "写入成功后 fixLoop；测试命令读 package scripts"],
            ["taskStatus.js（app）", "状态常量与主进程同步"],
            ["approvalStore.js", "新增 actionType: auto_verify"],
            ["preload.js", "暴露 wbProjectFixLoopStart（若新 IPC）"],
            ["不改", "projectWorkspaceLayout.js、Grid CSS、diffReviewPanel 结构"],
          ],
          [32, 68]
        ),

        heading("6. IPC 变更", HeadingLevel.HEADING_2),
        bullet("wb-project-agent-run：增加 mode, fixContext?, approvedPatchIds?"),
        bullet("wb-project-test-commands：返回 package.json 解析 + 缺失提示"),
        bullet("wb-project-fix-loop-start（新增）：{ projectId, taskId, userApprovedVerify? }"),
        bullet("wb-project-structure-get（可选）：调试用手动刷新结构摘要"),

        heading("7. 实施阶段", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["阶段", "内容", "验收"],
            ["P0-A", "llmClient + toolRegistry 只读工具", "Agent 能 search/read/list"],
            ["P0-B", "patchProposalService + projectAgentLLM PLAN_ONLY", "真实 diff 进 codeReviewStore"],
            ["P0-C", "projectStructureService + graphify", "bootstrap 上下文进 plan"],
            ["P1-A", "taskStatus 前后端统一", "筛选与 pill 一致"],
            ["P1-B", "packageScriptService + 测试白名单", "build/test/lint 识别"],
            ["P1-C", "fixLoopController + 渲染 hook", "写入后验证 + 3 轮修复"],
            ["P2", "REVIEW_PATCH / EXECUTE_APPROVED 完善", "全模式可用"],
          ],
          [12, 42, 46]
        ),

        heading("8. 验收标准（10 项）", HeadingLevel.HEADING_2),
        bullet("1. Agent 主动搜索和读取相关文件"),
        bullet("2. 生成基于真实代码的 PLAN_ONLY 方案"),
        bullet("3. 生成真实代码 Diff（非占位注释）"),
        bullet("4. DiffReviewPanel 审查 accept/reject"),
        bullet("5. 用户接受后才写入"),
        bullet("6. 写入前自动备份"),
        bullet("7. 写入后可 npm run build 或测试"),
        bullet("8. 构建失败时读取错误并生成二次修复补丁"),
        bullet("9. 工具调用写入 Timeline"),
        bullet("10. 不破坏 Layout v4、审批、备份、Shell 白名单、namespace 隔离"),

        heading("9. 风险与对策", HeadingLevel.HEADING_2),
        tableFromRows(
          [
            ["风险", "对策"],
            ["Ollama 不支持 tools", "fallback 单轮 JSON plan 或 legacy planOnlyOutput"],
            ["LLM 幻觉路径", "propose 前强制 read_file；assertUnderRoot"],
            ["大文件 patch 失败", "search/replace edits；tool error 让 LLM 缩小范围"],
            ["fixLoop 频繁审批", "每轮各弹一次；后续可加「本任务允许自动验证」"],
            ["graphify 不可用", "跳过，仅 structureSummary"],
            ["与 main.js LLM 重复", "后续抽 chatCompletionsClient 共用"],
          ],
          [28, 72]
        ),

        heading("10. 文件清单", HeadingLevel.HEADING_2),
        para("新增（主进程）", { bold: true }),
        bullet("main/workbench/llmClient.js"),
        bullet("main/workbench/toolRegistry.js"),
        bullet("main/workbench/projectAgentLLM.js"),
        bullet("main/workbench/patchProposalService.js"),
        bullet("main/workbench/projectStructureService.js"),
        bullet("main/workbench/packageScriptService.js"),
        bullet("main/workbench/fixLoopController.js"),
        bullet("main/workbench/parseBuildError.js"),
        bullet("main/workbench/taskStatus.js"),
        spacer(),
        para("改造（主进程）", { bold: true }),
        bullet("main/workbench/agentOrchestrator.js"),
        bullet("main/workbench/registerHandlers.js"),
        bullet("main/workbench/toolPermissionService.js"),
        bullet("main/workbench/diffPreviewService.js"),
        bullet("main/workbench/testRunnerService.js"),
        bullet("main/workbench/shellRunnerService.js"),
        spacer(),
        para("改造（渲染层 — 最小）", { bold: true }),
        bullet("app/workbench/taskStatus.js"),
        bullet("app/workbench/projectWorkspace.js"),
        bullet("app/workbench/projectCodePanel.js"),
        bullet("app/workbench/testResultPanel.js"),
        bullet("preload.js"),
        spacer(),
        para("保留 / 不改", { bold: true }),
        bullet("main/workbench/planOnlyOutput.js（fallback）"),
        bullet("app/workbench/diffReviewPanel.js、projectWorkspaceLayout.js（结构不改）"),
        spacer(),
        para("建议新增测试", { bold: true }),
        bullet("scripts/wb-agent-llm-test.js"),
        bullet("scripts/wb-patch-proposal-test.js"),
        bullet("scripts/wb-fix-loop-test.js"),

        heading("11. 结论", HeadingLevel.HEADING_2),
        para(
          "本方案在现有 Workbench 安全壳内插入 LLM Agent 大脑：核心新增 projectAgentLLM + toolRegistry + llmClient；核心替换占位 Diff 为 patchProposalService；核心闭环 fixLoopController + packageScriptService；核心一致 taskStatus.js。确认设计后按 P0-A → P0-C → P1 顺序编码，默认不动 Layout v4 与审批 UI 结构。",
          { bold: true }
        ),
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
