const WB_SCENE_TEMPLATE_KEY = "wb_pws_scene_template_v1";

const DEFAULT_COMPOSER_PLACEHOLDER =
  "描述你希望 AI 完成的开发任务，例如：修复项目卡片文字被按钮挤压的问题";

const SCENE_TEMPLATES = [
  {
    id: "bug_fix",
    name: "Bug 修复",
    icon: "🐛",
    mode: "PLAN_ONLY",
    modeLabel: "PLAN_ONLY · Bug 修复",
    titlePrefix: "Bug 修复：",
    description: "定位缺陷根因，输出修复方案与验证步骤。",
    placeholder: "描述现象、复现步骤、期望行为…",
    prompt:
      "【Bug 修复】请先搜索错误日志、报错关键词、相关文件与复现路径，定位根因后输出修复方案与验证步骤。不要直接改文件。",
    currentStep: "场景：Bug 修复",
    testCommands: ["node scripts/wb-controlled-dev-test.js"],
    permissions: { write: false, shell: false, git: false },
  },
  {
    id: "ui_optimize",
    name: "UI 优化",
    icon: "🎨",
    mode: "PLAN_ONLY",
    modeLabel: "PLAN_ONLY · UI 优化",
    titlePrefix: "UI 优化：",
    description: "梳理界面结构与样式改动，生成可审查 Diff。",
    placeholder: "描述要优化的页面/组件、当前问题、期望效果…",
    prompt:
      "【UI 优化】请搜索 HTML/CSS/布局相关文件，重点检查 flex/grid/overflow/z-index/responsive，输出改造步骤与可审查 Diff 计划，不直接写入。",
    currentStep: "场景：UI 优化",
    testCommands: [],
    permissions: { write: false, shell: false, git: false },
  },
  {
    id: "code_review",
    name: "代码审查",
    icon: "🔍",
    mode: "PLAN_ONLY",
    modeLabel: "PLAN_ONLY · 代码审查",
    titlePrefix: "代码审查：",
    description: "只读分析，输出风险、建议与可选修改点。",
    placeholder: "指定文件/模块或粘贴关注点…",
    prompt:
      "【代码审查】对指定范围做只读审查，输出风险清单（严重度分级）、改进建议与可选修改点，默认不写入文件。",
    currentStep: "场景：代码审查",
    testCommands: ["node scripts/wb-code-read-test.js"],
    permissions: { write: false, shell: false, git: false },
  },
  {
    id: "unit_test",
    name: "单元测试",
    icon: "🧪",
    mode: "CONTROLLED",
    modeLabel: "受控写入 · 单元测试",
    titlePrefix: "单元测试：",
    description: "分析测试框架，生成测试文件或测试用例。",
    placeholder: "说明要覆盖的模块、现有测试缺口…",
    prompt:
      "【单元测试】请先分析 package.json scripts 与现有测试框架，输出测试计划与拟新增/修改的测试文件，确认后可生成测试 Diff 并运行测试。",
    currentStep: "场景：单元测试",
    testCommands: [
      "node scripts/wb-namespace-test.js",
      "node scripts/wb-plan-output-test.js",
      "node scripts/wb-controlled-dev-test.js",
    ],
    permissions: { write: true, shell: true, git: false },
  },
  {
    id: "refactor",
    name: "重构",
    icon: "♻️",
    mode: "PLAN_ONLY",
    modeLabel: "PLAN_ONLY · 重构",
    titlePrefix: "重构：",
    description: "保持行为不变，分析影响范围并输出重构计划。",
    placeholder: "说明重构目标、约束（兼容性/性能）…",
    prompt:
      "【重构】在保持对外行为不变前提下，分析影响范围，输出分步重构计划、Diff 预览与回滚策略，不要直接写入。",
    currentStep: "场景：重构",
    testCommands: ["node scripts/wb-compression-test.js"],
    permissions: { write: false, shell: false, git: false },
  },
];

let activeTemplateId = "";

function loadActiveTemplateId() {
  try {
    return localStorage.getItem(WB_SCENE_TEMPLATE_KEY) || "";
  } catch {
    return "";
  }
}

function saveActiveTemplateId(id) {
  try {
    if (id) {
      localStorage.setItem(WB_SCENE_TEMPLATE_KEY, id);
    } else {
      localStorage.removeItem(WB_SCENE_TEMPLATE_KEY);
    }
  } catch {
    /* ignore */
  }
}

function getTemplate(id) {
  return SCENE_TEMPLATES.find((t) => t.id === id) || null;
}

function getActiveTemplate() {
  return getTemplate(activeTemplateId);
}

function applyTemplate(id, { fillComposer = false, fillNewTask = false } = {}) {
  const tpl = getTemplate(id);
  activeTemplateId = tpl ? tpl.id : "";
  saveActiveTemplateId(activeTemplateId);

  const modePill = document.getElementById("wbPwsModePill");
  if (modePill) {
    modePill.textContent = tpl ? tpl.modeLabel : "PLAN_ONLY / 受控写入";
  }

  const composerSelect = document.getElementById("wbPwsSceneTemplate");
  if (composerSelect && composerSelect.value !== activeTemplateId) {
    composerSelect.value = activeTemplateId;
  }
  if (window.__wbGoalPlanMode?.getWorkstream?.() === "general") {
    window.__wbGoalPlanMode?.syncAgentModeSelectValue?.("general", activeTemplateId);
  }
  const modalSelect = document.getElementById("wbNewTaskTemplate");
  if (modalSelect && modalSelect.value !== activeTemplateId) {
    modalSelect.value = activeTemplateId;
  }

  const input = document.getElementById("wbAgentInput");
  if (input) {
    input.placeholder = tpl?.placeholder || DEFAULT_COMPOSER_PLACEHOLDER;
  }

  if (tpl && fillNewTask) {
    const titleInput = document.getElementById("wbTaskTitleInput");
    const descInput = document.getElementById("wbTaskDescInput");
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = tpl.titlePrefix;
      titleInput.focus();
      titleInput.setSelectionRange(titleInput.value.length, titleInput.value.length);
    }
    if (descInput && !descInput.value.trim()) {
      descInput.value = tpl.description;
    }
  }

  window.dispatchEvent(
    new CustomEvent("wb:scene-template-change", { detail: { template: tpl } })
  );

  if (tpl?.testCommands?.length) {
    window.setTimeout(() => {
      const sel = document.getElementById("wbTestCommand");
      const cmd = tpl.testCommands[0];
      if (sel && cmd) {
        const has = Array.from(sel.options).some((o) => o.value === cmd);
        if (has) {
          sel.value = cmd;
        }
      }
    }, 0);
  }

  return tpl;
}

function populateTemplateSelects() {
  const options = SCENE_TEMPLATES.map(
    (t) => `<option value="${t.id}">${t.icon} ${t.name}</option>`
  ).join("");
  const html = `<option value="">Agent</option>${options}`;
  const composerSelect = document.getElementById("wbPwsSceneTemplate");
  if (composerSelect) {
    composerSelect.innerHTML = html;
    composerSelect.value = activeTemplateId;
  }
  const modalSelect = document.getElementById("wbNewTaskTemplate");
  if (modalSelect) {
    modalSelect.innerHTML = html;
    modalSelect.value = activeTemplateId;
  }
  populateAgentModeSelect();
}

function populateAgentModeSelect() {
  const el = document.getElementById("wbComposerAgentMode");
  if (!el) return;
  const sceneOptions = SCENE_TEMPLATES.map(
    (t) => `<option value="agent:${t.id}">${t.icon} ${t.name}</option>`
  ).join("");
  el.innerHTML = `
    <option value="agent">Agent</option>
    ${sceneOptions}
    <option value="plan">计划</option>
    <option value="project">项目推进</option>
  `;
  const ws = window.__wbGoalPlanMode?.getWorkstream?.() || "general";
  const tplId = activeTemplateId || "";
  window.__wbGoalPlanMode?.syncAgentModeSelectValue?.(ws, tplId);
}

function bindSceneTemplates() {
  activeTemplateId = loadActiveTemplateId();
  populateTemplateSelects();
  applyTemplate(activeTemplateId, { fillComposer: false });

  document.getElementById("wbPwsSceneTemplate")?.addEventListener("change", (ev) => {
    applyTemplate(ev.target.value, { fillComposer: false });
  });
  document.getElementById("wbNewTaskTemplate")?.addEventListener("change", (ev) => {
    applyTemplate(ev.target.value, { fillComposer: false, fillNewTask: true });
  });
  document.getElementById("wbPwsLayoutResetBtn")?.addEventListener("click", () => {
    window.__wbResetPwsLayout?.();
  });
}

function enrichAgentMessage(message) {
  const tpl = getActiveTemplate();
  const text = String(message || "").trim();
  if (!text) {
    return "";
  }
  if (!tpl) {
    return text;
  }
  const tag = tpl.prompt.split("】")[0] + "】";
  if (text.includes(tag)) {
    return text;
  }
  return `${tpl.prompt}\n\n${text}`;
}

function getTaskCreateExtras() {
  const tpl = getActiveTemplate();
  if (!tpl) {
    return { currentStep: "AI 指令 · Agent" };
  }
  return { currentStep: tpl.currentStep };
}

window.__wbSceneTemplates = {
  SCENE_TEMPLATES,
  getTemplate,
  getActiveTemplate,
  applyTemplate,
  enrichAgentMessage,
  getTaskCreateExtras,
  populateTemplateSelects,
  populateAgentModeSelect,
};

window.__wbBindSceneTemplates = bindSceneTemplates;
