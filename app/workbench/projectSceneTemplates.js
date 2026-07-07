const WB_SCENE_TEMPLATE_KEY = "wb_pws_scene_template_v1";

const SCENE_TEMPLATES = [
  {
    id: "bug_fix",
    name: "Bug 修复",
    icon: "🐛",
    mode: "PLAN_ONLY",
    modeLabel: "PLAN_ONLY · Bug 修复",
    titlePrefix: "Bug 修复：",
    description: "定位缺陷根因，输出最小修复方案与回归测试建议。",
    placeholder: "描述现象、复现步骤、期望行为…",
    prompt:
      "【Bug 修复】请先定位根因，输出 PLAN_ONLY 修复方案（影响文件、风险、测试点），不要直接改文件。",
    currentStep: "场景：Bug 修复 · PLAN_ONLY",
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
    description: "梳理界面结构与样式改动，保持浅蓝 Codex 风格。",
    placeholder: "描述要优化的页面/组件、当前问题、期望效果…",
    prompt:
      "【UI 优化】对照浅蓝专业风格（#F3F8FF 背景、白卡片），输出 PLAN_ONLY 改造步骤与影响文件，不直接写入。",
    currentStep: "场景：UI 优化 · PLAN_ONLY",
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
    description: "审查代码质量、风险与改进建议，只读不写。",
    placeholder: "指定文件/模块或粘贴关注点…",
    prompt:
      "【代码审查】对指定范围做只读审查，输出问题清单（严重度分级）与改进建议，不修改文件。",
    currentStep: "场景：代码审查 · PLAN_ONLY",
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
    description: "补充/修复测试脚本，确认后受控写入并运行白名单测试。",
    placeholder: "说明要覆盖的模块、现有测试缺口…",
    prompt:
      "【单元测试】先输出测试计划与拟修改文件（PLAN_ONLY），用户确认后可受控写入并运行白名单测试命令。",
    currentStep: "场景：单元测试 · 受控写入",
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
    description: "行为不变的前提下整理结构，分步输出重构计划。",
    placeholder: "说明重构目标、约束（兼容性/性能）…",
    prompt:
      "【重构】在保持对外行为不变前提下，输出分步重构计划、影响面与回滚策略（PLAN_ONLY）。",
    currentStep: "场景：重构 · PLAN_ONLY",
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

function applyTemplate(id, { fillComposer = true, fillNewTask = false } = {}) {
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
  const modalSelect = document.getElementById("wbNewTaskTemplate");
  if (modalSelect && modalSelect.value !== activeTemplateId) {
    modalSelect.value = activeTemplateId;
  }

  if (tpl && fillComposer) {
    const input = document.getElementById("wbAgentInput");
    if (input) {
      input.placeholder = tpl.placeholder;
      if (!input.value.trim()) {
        input.value = tpl.prompt;
      }
    }
  }

  const hint = document.getElementById("wbPwsTemplateHint");
  if (hint) {
    if (tpl) {
      hint.hidden = false;
      hint.textContent = `${tpl.icon} ${tpl.name}：${tpl.description}（模式：${tpl.mode}）`;
    } else {
      hint.hidden = true;
      hint.textContent = "";
    }
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
  const html = `<option value="">选择场景模板…</option>${options}`;
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
}

function bindSceneTemplates() {
  activeTemplateId = loadActiveTemplateId();
  populateTemplateSelects();
  if (activeTemplateId) {
    applyTemplate(activeTemplateId, { fillComposer: false });
  }

  document.getElementById("wbPwsSceneTemplate")?.addEventListener("change", (ev) => {
    applyTemplate(ev.target.value, { fillComposer: true });
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
  if (!tpl || !text) {
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
    return {};
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
};

window.__wbBindSceneTemplates = bindSceneTemplates;
