/**
 * Detect blocking gaps in natural-language requirements (REQ-002/003 MVP).
 * Returns 1–5 high-value questions; non-blocking gaps become assumptions.
 */

const BLOCKING_CHECKS = [
  {
    id: "auth",
    re: /登录|账号|用户|权限|认证|auth|login|sso/i,
    missingUnless: /jwt|oauth|session|本地账号|无登录|匿名|guest/i,
    question: "账号与登录方式如何实现？（例如：本地账号、OAuth、无登录）",
    assumption: "默认采用本地简单账号或无登录（MVP），后续可替换认证方案。",
  },
  {
    id: "storage",
    re: /保存|持久|数据库|存储|记录|history|db|sqlite|postgres|mysql/i,
    missingUnless: /sqlite|postgres|mysql|localStorage|文件存储|内存|无需持久/i,
    question: "数据如何持久化？（SQLite / Postgres / localStorage / 仅内存）",
    assumption: "默认使用本地文件或 SQLite 持久化，不引入远程数据库。",
  },
  {
    id: "deploy",
    re: /docker|部署|上线|生产|服务器|云|k8s|容器/i,
    missingUnless: /docker-compose|dockerfile|仅本地|桌面|electron|静态页/i,
    question: "部署形态是什么？（Docker / 纯静态 / Electron 桌面 / 仅本地开发）",
    assumption: "默认仅保证本地可运行；Docker/生产部署不在本轮 MVP。",
  },
  {
    id: "stack",
    re: /系统|平台|应用|网站|后台|前端|全栈|saas/i,
    missingUnless: /react|vue|html|css|js|node|express|electron|python|java|go/i,
    question: "技术栈偏好是什么？（例如：纯 HTML/CSS/JS、React、Electron）",
    assumption: "默认使用与当前项目一致的技术栈；若为空目录则用纯 HTML/CSS/JS。",
  },
  {
    id: "scope",
    re: /团队|多人|协作|组织|租户|企业/i,
    missingUnless: /单人|个人|mvp|最小|先做/i,
    question: "首版是否必须支持多人协作/组织级权限，还是先做单人 MVP？",
    assumption: "默认先交付单人可用的 MVP，多人协作与组织权限后续迭代。",
  },
];

function taskSpecEnabled() {
  return String(process.env.WB_AGENT_TASK_SPEC || "1") !== "0";
}

function analyzeRequirement(message, { project } = {}) {
  const text = String(message || "").trim();
  const questions = [];
  const assumptions = [];
  const conflicts = [];

  if (/离线|无网络|本地.?only/i.test(text) && /saas|外部.?api|调用.?云|openai|远程.?服务/i.test(text)) {
    conflicts.push({
      id: "offline_vs_saas",
      summary: "需求同时要求离线运行与调用外部 SaaS/云服务",
      question: "请选择：严格离线，还是允许受控外网调用？",
    });
  }

  for (const check of BLOCKING_CHECKS) {
    if (!check.re.test(text)) continue;
    if (check.missingUnless.test(text)) continue;
    if (check.id === "stack" && Array.isArray(project?.techStack) && project.techStack.length) {
      assumptions.push({
        id: `assume_${check.id}`,
        text: `沿用项目已登记技术栈：${project.techStack.join(", ")}`,
        source: "project.techStack",
        risk: "low",
        status: "proposed",
      });
      continue;
    }
    questions.push({
      id: check.id,
      text: check.question,
      blocking: true,
      source: "clarificationPolicy",
    });
    assumptions.push({
      id: `assume_${check.id}`,
      text: check.assumption,
      source: "clarificationPolicy",
      risk: "medium",
      status: "proposed",
    });
  }

  // Greenfield vague product asks without concrete feature list
  if (
    text.length >= 20 &&
    /开发|做一个|帮我|实现|系统|应用/i.test(text) &&
    !/(贪吃蛇|snake|todo|计算器|静态页|小游戏)/i.test(text) &&
    questions.length === 0 &&
    !/mvp|先做|最小/i.test(text)
  ) {
    questions.push({
      id: "mvp_boundary",
      text: "首版必须包含哪些核心功能？哪些可以明确不做？",
      blocking: true,
      source: "clarificationPolicy",
    });
  }

  const uniqueQuestions = [];
  const seen = new Set();
  for (const q of [...conflicts.map((c) => ({
    id: c.id,
    text: c.question,
    blocking: true,
    source: "conflict",
  })), ...questions]) {
    if (seen.has(q.id)) continue;
    seen.add(q.id);
    uniqueQuestions.push(q);
    if (uniqueQuestions.length >= 5) break;
  }

  const blockingOpen = uniqueQuestions.filter((q) => q.blocking);
  return {
    questions: uniqueQuestions,
    assumptions: assumptions.slice(0, 8),
    conflicts,
    needsClarification: blockingOpen.length > 0 || conflicts.length > 0,
  };
}

module.exports = {
  taskSpecEnabled,
  analyzeRequirement,
  BLOCKING_CHECKS,
};
