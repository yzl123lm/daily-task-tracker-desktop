const { stripModelThinking } = require("../../utils/wbModelOutputSanitizer.js");

const UI_KEYWORDS = [
  { re: /弹窗|modal|对话框/i, files: ["app/workbench/projectArea.js", "workbench-dev.css"] },
  { re: /任务|task/i, files: ["app/workbench/projectWorkspace.js", "main/workbench/projectService.js"] },
  { re: /会话|chat|对话/i, files: ["app/workbench/chatArea.js", "app/workbench/chatBridge.js"] },
  { re: /ipc|接口|preload/i, files: ["main/workbench/registerHandlers.js", "preload.js"] },
  { re: /压缩|snapshot|上下文/i, files: ["main/workbench/context-compression/contextCompressionManager.js"] },
  { re: /样式|css|ui/i, files: ["workbench-dev.css", "ui-nebula-theme.css"] },
  { re: /测试|test/i, files: ["scripts/wb-namespace-test.js", "scripts/wb-compression-test.js"] },
];

function uniqueFiles(list) {
  return [...new Set(list.filter(Boolean))];
}

function inferAffectedFiles(message, project) {
  const text = String(message || "");
  const files = [];
  if (/贪吃蛇|snake|小游戏|game/i.test(text)) {
    files.push("index.html", "style.css", "game.js");
  } else {
    files.push("index.html", "app/workbench/index.js");
  }
  for (const rule of UI_KEYWORDS) {
    if (rule.re.test(text)) {
      files.push(...rule.files);
    }
  }
  if (Array.isArray(project?.techStack) && project.techStack.some((s) => /electron/i.test(s))) {
    files.push("main.js", "preload.js");
  }
  return uniqueFiles(files).slice(0, 8);
}

function inferGoalPlanSteps(message, task) {
  const text = String(message || "").trim();
  const steps = [];
  if (/贪吃蛇|snake|小游戏|game/i.test(text)) {
    steps.push("创建可玩入口：index.html + style.css 基础布局与画布");
    steps.push("实现蛇的移动、方向控制与食物生成（game.js）");
    steps.push("实现碰撞检测、得分、游戏结束与重新开始");
    steps.push("联调三文件并给出浏览器打开验收说明");
    return uniqueFiles(steps).slice(0, 8);
  }
  if (/todo|待办/i.test(text)) {
    steps.push("搭建静态页面结构与样式");
    steps.push("实现待办增删改与本地存储");
    steps.push("补充空态与基础校验");
    return uniqueFiles(steps).slice(0, 8);
  }
  // generic detailed goal plan
  steps.push(`澄清并固化需求范围：${(task?.title || text).slice(0, 60)}`);
  steps.push("搭建/确认项目入口文件与目录结构");
  steps.push("实现核心功能主流程");
  steps.push("补齐边界情况与基础交互反馈");
  steps.push("本地验证并整理交付说明");
  return uniqueFiles(steps).slice(0, 8);
}

function inferPlanSteps(message, task, { goalPlan = false } = {}) {
  if (goalPlan) {
    return inferGoalPlanSteps(message, task);
  }
  const text = String(message || "").trim();
  const steps = [];
  if (/贪吃蛇|snake|小游戏/i.test(text)) {
    steps.push("创建 index.html、style.css、game.js 实现贪吃蛇小游戏");
    steps.push("实现方向控制、碰撞检测、得分与重新开始");
    steps.push("在浏览器或 Electron 窗口中打开 index.html 验证");
  }
  if (task?.description) {
    steps.push(`确认任务背景：${task.description.slice(0, 80)}`);
  }
  if (/ui|界面|组件|卡片|列表|弹窗/i.test(text)) {
    steps.push("梳理现有工作台 DOM 结构与样式约定");
    steps.push("新增或扩展前端组件并接入 store/IPC");
  }
  if (/api|ipc|接口|后端|service/i.test(text)) {
    steps.push("扩展主进程 service 与 registerHandlers IPC");
    steps.push("在 preload 暴露渲染层 API");
  }
  if (/测试|test/i.test(text)) {
    steps.push("补充 namespace/压缩/计划输出单元测试");
  }
  steps.push("对照 PRD 验收点做手工验证");
  steps.push("等待用户确认方案后再进入受控开发阶段");
  return uniqueFiles(steps).slice(0, 8);
}

function inferRisks(message, project) {
  const risks = [];
  const text = String(message || "");
  if (/迁移|兼容|localStorage/i.test(text)) {
    risks.push("需验证旧数据迁移与双写边界。");
  }
  if (/ai\.js|会话|chat/i.test(text)) {
    risks.push("需确认与现有 AI 对话区的集成不破坏工具调用。");
  }
  risks.push("当前项目若未初始化 Git，无法创建分支保护，写入前会创建文件备份。");
  if (!project?.techStack?.length) {
    risks.push("技术栈未填写，影响文件路径推断精度。");
  }
  return risks.slice(0, 5);
}

function inferTestPlan(message) {
  const text = String(message || "");
  const plan = ["项目/会话互斥切换测试", "namespace 403 拒绝测试"];
  if (/ui|组件|弹窗/i.test(text)) {
    plan.push("组件渲染与表单校验测试");
  }
  if (/ipc|api/i.test(text)) {
    plan.push("IPC 往返与错误处理测试");
  }
  if (/压缩|snapshot/i.test(text)) {
    plan.push("压缩触发与快照验证测试");
  }
  plan.push("PLAN_ONLY 输出结构字段完整性测试");
  return uniqueFiles(plan);
}

function buildDiffPreviews(_codeAnalysis, _message) {
  // PLAN_ONLY 不再生成注释式假补丁；真实 Diff 由 PATCH_PROPOSE / stage_patch 产出
  return [];
}

function buildPlanOnlyOutput({ message, project, task, projectId, taskId, promptContext, codeAnalysis, goalPlan = false }) {
  const req = String(message || "").trim();
  const lines = req.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const headline = lines[0] || task?.title || "未指定需求";
  const taskNs = `task:${projectId}:${taskId}`;
  const summary = goalPlan
    ? "已生成目标计划（分步实施），尚未修改文件。"
    : "已生成开发方案，尚未修改文件。";
  const plan = inferPlanSteps(req, task, { goalPlan });
  const inferredFiles = inferAffectedFiles(req, project);
  const codeFiles = Array.isArray(codeAnalysis?.relevantFiles) ? codeAnalysis.relevantFiles : [];
  const affectedFiles = uniqueFiles([...codeFiles, ...inferredFiles]).slice(0, 12);
  const diffPreviews = buildDiffPreviews(codeAnalysis, req);
  const memoryToRecord = [
    {
      namespace: taskNs,
      type: "development_plan",
      content: `${headline} — ${goalPlan ? "目标计划" : "开发计划"}已生成，共 ${plan.length} 步。`,
    },
    {
      namespace: taskNs,
      type: "requirement",
      content: headline,
    },
    {
      namespace: `project:${projectId}`,
      type: "task_link",
      content: `任务「${task?.title || taskId}」进入 PLANNING：${headline.slice(0, 100)}`,
    },
  ];
  return {
    summary,
    requirementUnderstanding: stripModelThinking(headline),
    plan,
    affectedFiles,
    risks: inferRisks(req, project),
    testPlan: inferTestPlan(req),
    needUserConfirm: true,
    mode: "PLAN_ONLY",
    execMode: goalPlan ? "goal_plan" : "general",
    memoryToRecord,
    codeAnalysis: codeAnalysis
      ? {
          codeRoot: codeAnalysis.codeRoot,
          relevantFiles: codeAnalysis.relevantFiles || [],
          snippets: (codeAnalysis.codeSnippets || []).map((s) => ({
            path: s.path,
            line: s.line,
            preview: String(s.snippet || "").slice(0, 400),
          })),
          searchHitCount: (codeAnalysis.searchHits || []).length,
        }
      : null,
    diffPreviews,
    executionReady: false,
    note: goalPlan
      ? "目标计划模式：请确认计划后按步骤生成 Diff，每步完成后确认是否继续。"
      : "规则回退方案：仅供参考规划，未生成可执行 Diff；请配置模型后重新生成。",
    meta: {
      projectId,
      taskId,
      projectName: project?.name || "",
      taskTitle: task?.title || "",
      generatedAt: new Date().toISOString(),
      codeRoot: codeAnalysis?.codeRoot || project?.localPath || null,
      ruleFallback: true,
      goalPlan: Boolean(goalPlan),
    },
    contextPreview: promptContext?.text ? promptContext.text.slice(0, 600) : "",
  };
}

module.exports = {
  buildPlanOnlyOutput,
};
