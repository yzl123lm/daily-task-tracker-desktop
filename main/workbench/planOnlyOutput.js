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
  const files = ["index.html", "app/workbench/index.js"];
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

function inferPlanSteps(message, task) {
  const text = String(message || "").trim();
  const steps = [];
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
  if (!project?.techStack?.length) {
    risks.push("技术栈未填写，影响文件路径推断精度。");
  }
  if (/迁移|兼容|localStorage/i.test(text)) {
    risks.push("需验证旧数据迁移与双写边界。");
  }
  if (/ai\.js|会话|chat/i.test(text)) {
    risks.push("需确认与现有 AI 对话区的集成不破坏工具调用。");
  }
  if (!risks.length) {
    risks.push("方案基于规则推断，实施前请人工确认影响范围。");
  }
  return risks;
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

function buildPlanOnlyOutput({ message, project, task, projectId, taskId, promptContext }) {
  const req = String(message || "").trim();
  const lines = req.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const headline = lines[0] || task?.title || "未指定需求";
  const taskNs = `task:${projectId}:${taskId}`;
  const summary = "已生成开发方案，尚未修改文件。";
  const plan = inferPlanSteps(req, task);
  const affectedFiles = inferAffectedFiles(req, project);
  const memoryToRecord = [
    {
      namespace: taskNs,
      type: "development_plan",
      content: `${headline} — 开发计划已生成，共 ${plan.length} 步。`,
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
    requirementUnderstanding: headline,
    plan,
    affectedFiles,
    risks: inferRisks(req, project),
    testPlan: inferTestPlan(req),
    needUserConfirm: true,
    mode: "PLAN_ONLY",
    memoryToRecord,
    meta: {
      projectId,
      taskId,
      projectName: project?.name || "",
      taskTitle: task?.title || "",
      generatedAt: new Date().toISOString(),
    },
    contextPreview: promptContext?.text ? promptContext.text.slice(0, 600) : "",
  };
}

module.exports = {
  buildPlanOnlyOutput,
};
