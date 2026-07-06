const SKILL_PREFS_KEY = "daily_task_tracker_skill_prefs_v1";

function buildFunctionTool(name, description, properties, required = []) {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties: properties || {}, required },
    },
  };
}

const APP_SKILL_CATALOG = [
  { id: "task-ops", name: "任务操作 Skill", priority: "P0", defaultEnabled: true, planned: false, description: "新增、修改、删除、完结、批量状态流转与备注追加。", capabilities: ["task_create", "task_update", "task_delete", "task_complete", "task_bulk_update_status", "task_append_remark"] },
  { id: "task-query", name: "任务检索与聚合 Skill", priority: "P0", defaultEnabled: true, planned: false, description: "多条件检索、跨状态/人员统计、风险 TOP 分析。", capabilities: ["task_query", "task_stats", "task_top_risks"] },
  { id: "reporting", name: "日报/周报 Skill", priority: "P0", defaultEnabled: true, planned: false, description: "按时间窗口生成结构化日报/周报（已完成、进行中、风险、下周计划）。", capabilities: ["report_generate"] },
  { id: "risk-alert", name: "风险预警 Skill", priority: "P0", defaultEnabled: true, planned: false, description: "三级风险预警（黄/橙/红）与统一风险报告。", capabilities: ["risk_scan", "risk_report"] },
  { id: "task-export", name: "任务导出 Skill", priority: "P2", defaultEnabled: true, planned: false, description: "将任务列表导出为 Excel（.xlsx）。", capabilities: ["task_export_excel"] },
  { id: "task-analytics", name: "数据分析 Skill", priority: "P1", defaultEnabled: true, planned: false, description: "看板快照、自定义维度报表与任务模板查询。", capabilities: ["dashboard_snapshot", "custom_report_generate", "task_template_list"] },
  { id: "collab-remind", name: "提醒与催办 Skill", priority: "P1", defaultEnabled: false, planned: true, description: "支持企业微信/飞书/钉钉/邮件等提醒策略。", capabilities: ["remind_push", "remind_rule_save"] },
  { id: "text-polish", name: "沟通文案润色 Skill", priority: "P1", defaultEnabled: true, planned: false, description: "对内/对外两种语气的专业化润色与要点提炼。", capabilities: ["text_polish"] },
  { id: "high-logic-mode", name: "高逻辑模式 Skill", priority: "P1", defaultEnabled: true, planned: false, description: "强化结构化推理：先结论、后依据、再行动项；并结合当前所在地信息辅助判断。", capabilities: ["logic_structured_answer"] },
  { id: "bazi-analysis", name: "八字命理 Skill", priority: "P1", defaultEnabled: true, planned: false, description: "收集出生信息后生成四柱命理分析（仅供传统文化学习与娱乐参考）。", capabilities: ["bazi_analyze"] },
  {
    id: "lunar-calendar",
    name: "农历历法 Skill（lunar-javascript）",
    priority: "P1",
    defaultEnabled: true,
    planned: false,
    description:
      "内置 lunar-javascript（6tail，MIT，https://github.com/6tail/lunar-javascript）：公历与农历互转、黄历全文、四柱干支、节假日等，本地计算无需联网。AI 工具：lunar_calendar_query。",
    capabilities: ["lunar_calendar_query"],
  },
  {
    id: "cnlunar-calendar",
    name: "黄历 Skill（cnlunar · Python）",
    priority: "P1",
    defaultEnabled: true,
    planned: false,
    description:
      "本机 Python 库 cnlunar（https://github.com/OPN48/cnlunar）：以《钦定协纪辨方书》为核心的宜忌、神煞、节气、八字、时辰吉凶等。需已安装 Python3 并执行 pip install cnlunar。AI 工具：cnlunar_calendar_query。",
    capabilities: ["cnlunar_calendar_query"],
  },
  { id: "doc-export", name: "文档导出 Skill", priority: "P1", defaultEnabled: true, planned: false, description: "将函件/合同类正文导出为公文体例 Word 或 PDF（解析 Markdown，中文排版）并保存到桌面。", capabilities: ["export_word_desktop", "export_pdf_desktop"] },
  {
    id: "runtime-env",
    name: "运行环境评估 Skill",
    priority: "P1",
    defaultEnabled: true,
    planned: false,
    description:
      "检测本机 Python 版本，帮助排查本地插件（如 cnlunar、语音扩展）依赖环境问题。",
    capabilities: ["runtime_prerequisites_evaluate"],
  },
  { id: "rag-kb", name: "知识库检索 Skill (RAG)", priority: "P1", defaultEnabled: false, planned: false, description: "检索已入库的本地文档片段（语义检索），用于 SOP/FAQ 等可追溯引用；依赖本机 Ollama 嵌入模型。", capabilities: ["kb_search"] },
  {
    id: "graphify-code-graph",
    name: "graphify 代码库图谱 Skill (Phase B MCP)",
    priority: "P1",
    defaultEnabled: false,
    planned: false,
    description:
      "读取 graphify-out/ 代码库知识图谱（需先在项目根运行 graphify 流水线）。工具：graphify_query_graph、graphify_get_node、graphify_god_nodes 等；若本机已安装 Python graphifyy 则优先走 MCP stdio，否则使用内置 native 适配。",
    capabilities: [
      "graphify_query_graph",
      "graphify_get_node",
      "graphify_god_nodes",
      "graphify_graph_stats",
      "graphify_shortest_path",
    ],
  },
  {
    id: "baai-embed-m3",
    name: "BAAI General Embedding-M3（BGE-M3）",
    priority: "P1",
    defaultEnabled: false,
    planned: false,
    description:
      "调用当前对话模型配置下的 OpenAI 兼容「/v1/embeddings」接口，将文本编码为稠密向量（默认模型 ID：BAAI/bge-m3，即智源通用向量模型 M3 系列）。适用于语义相似度、聚类与 RAG 前置等；硅基流动、OpenRouter、自建网关等需已开通该嵌入模型。本机 Ollama 请改用嵌入模型名（如 bge-m3）并在工具参数 model 中传入。",
    capabilities: ["baai_embedding_m3"],
  },
];

const AI_SKILL_TOOLS = [
  buildFunctionTool("task_list_snapshot", "读取当前任务列表摘要：内部 id、登记事物ID taskId、状态、内容预览等，用于确认要操作哪一条。", {}),
  buildFunctionTool(
    "task_create",
    "新增一条任务到任务列表。登记事物ID（taskId）必须全局唯一。",
    {
      taskId: { type: "string", description: "登记事物ID，如 TASK-20260401-001" },
      issueType: { type: "string", description: "跟进问题类型" },
      content: { type: "string", description: "跟进事物内容" },
      reporter: { type: "string", description: "问题反馈人" },
      handler: { type: "string", description: "问题跟进处理人员" },
      status: { type: "string", enum: ["待处理", "处理中", "已阻塞", "已挂起", "已完结", "已取消"], description: "状态，默认待处理" },
      priority: { type: "string", enum: ["高", "中", "低"], description: "优先级，默认中" },
      deadline: { type: "string", description: "截止日期 YYYY-MM-DD，可选" },
      remark: { type: "string", description: "可选首条备注" },
    },
    ["issueType", "content", "reporter", "handler"]
  ),
  buildFunctionTool(
    "task_update",
    "修改已有任务。须通过 id（UUID）或 taskId（登记事物ID）定位。已完结任务不可再改状态。",
    {
      id: { type: "string", description: "任务内部 UUID" },
      taskId: { type: "string", description: "登记事物ID" },
      issueType: { type: "string" },
      content: { type: "string" },
      reporter: { type: "string" },
      handler: { type: "string" },
      status: { type: "string", enum: ["待处理", "处理中", "已阻塞", "已挂起", "已完结", "已取消"] },
      priority: { type: "string", enum: ["高", "中", "低"] },
      deadline: { type: "string", description: "YYYY-MM-DD" },
    }
  ),
  buildFunctionTool(
    "task_delete",
    "删除一条任务。须通过 id 或 taskId 定位。",
    { id: { type: "string" }, taskId: { type: "string" } }
  ),
  buildFunctionTool(
    "task_complete",
    "将任务标记为已完结。须通过 id 或 taskId 定位。",
    { id: { type: "string" }, taskId: { type: "string" } }
  ),
  buildFunctionTool(
    "task_bulk_update_status",
    "批量变更任务状态。支持按 id 列表或 taskId 列表操作。",
    {
      ids: { type: "array", items: { type: "string" }, description: "任务内部 UUID 列表" },
      taskIds: { type: "array", items: { type: "string" }, description: "登记事物ID 列表" },
      toStatus: { type: "string", enum: ["待处理", "处理中", "已阻塞", "已挂起", "已完结", "已取消"], description: "目标状态" },
      reason: { type: "string", description: "批量变更原因，可选" },
    },
    ["toStatus"]
  ),
  buildFunctionTool(
    "task_append_remark",
    "给任务追加备注。须通过 id 或 taskId 定位。",
    {
      id: { type: "string" },
      taskId: { type: "string" },
      content: { type: "string", description: "备注内容" },
    },
    ["content"]
  ),
  buildFunctionTool(
    "task_query",
    "按条件筛选任务并返回简要结果。",
    {
      status: { type: "string", enum: ["待处理", "处理中", "已阻塞", "已挂起", "已完结", "已取消"] },
      priority: { type: "string", enum: ["高", "中", "低"] },
      reporter: { type: "string" },
      handler: { type: "string" },
      keyword: { type: "string", description: "在内容/类型/备注中模糊匹配" },
      limit: { type: "number", description: "最大返回条数，默认20，上限100" },
    }
  ),
  buildFunctionTool("task_stats", "返回当前任务统计（总量、按状态、按处理人、按反馈人、风险摘要）。", {}),
  buildFunctionTool(
    "task_top_risks",
    "返回风险评分最高的任务列表。",
    { topN: { type: "number", description: "返回数量，默认5，上限20" } }
  ),
  buildFunctionTool(
    "report_generate",
    "生成日报/周报结构化内容。",
    {
      period: { type: "string", enum: ["daily", "weekly"], description: "日报或周报" },
      statusFocus: { type: "array", items: { type: "string", enum: ["待处理", "处理中", "已完结"] } },
      handler: { type: "string", description: "可选，仅某处理人" },
      reporter: { type: "string", description: "可选，仅某反馈人" },
    },
    ["period"]
  ),
  buildFunctionTool(
    "risk_scan",
    "扫描风险任务（兼容旧名；推荐改用 risk_report）。",
    {
      staleHours: { type: "number", description: "超时未更新阈值小时数，默认48" },
      longProcessingDays: { type: "number", description: "长期处理中阈值天数，默认7" },
      topN: { type: "number", description: "返回 TOP 条数，默认10" },
    }
  ),
  buildFunctionTool(
    "risk_report",
    "统一风险报告：分级预警（黄/橙/红）、综合评分、TOP 风险列表与分级统计。",
    {
      staleHours: { type: "number", description: "黄色预警阈值小时数，默认48" },
      longProcessingDays: { type: "number", description: "长期处理中阈值天数，默认7" },
      topN: { type: "number", description: "TOP 条数，默认10，上限50" },
    }
  ),
  buildFunctionTool(
    "task_export_excel",
    "将任务列表导出为 Excel（.xlsx）到桌面或用户选择路径。",
    {
      fileName: { type: "string", description: "文件名（不含扩展名），可选" },
      target: { type: "string", enum: ["desktop", "dialog"], description: "desktop=桌面，默认 desktop" },
    }
  ),
  buildFunctionTool(
    "dashboard_snapshot",
    "返回任务看板聚合数据：状态分布、处理人负载、近14日登记趋势。",
    {}
  ),
  buildFunctionTool(
    "custom_report_generate",
    "按维度与指标生成自定义汇总报表（可配合筛选）。",
    {
      title: { type: "string", description: "报表标题" },
      dimensions: {
        type: "array",
        items: { type: "string", enum: ["status", "handler", "priority", "reporter", "issueType"] },
        description: "分组维度，默认 status",
      },
      metrics: {
        type: "array",
        items: { type: "string", enum: ["count", "overdue", "high_risk", "avg_age_days"] },
        description: "统计指标，默认 count",
      },
      filters: {
        type: "object",
        properties: {
          status: { type: "string" },
          priority: { type: "string" },
          handler: { type: "string" },
          reporter: { type: "string" },
          issueType: { type: "string" },
          keyword: { type: "string" },
        },
      },
      limit: { type: "number", description: "最大分组行数，默认50" },
      format: { type: "string", enum: ["json", "markdown"], description: "markdown 时附带 markdown 字段" },
    }
  ),
  buildFunctionTool("task_template_list", "列出可用任务登记模板（含内置与自定义）。", {}),
  buildFunctionTool(
    "text_polish",
    "将文本润色为专业表达。",
    {
      text: { type: "string" },
      tone: { type: "string", enum: ["对内", "对外", "简洁", "正式"] },
      output: { type: "string", enum: ["全文", "要点"] },
    },
    ["text"]
  ),
  buildFunctionTool(
    "logic_structured_answer",
    "返回高逻辑回答模板：先结论、后依据、再行动项，并检查边界条件与不确定性。",
    {
      user_query: { type: "string", description: "用户问题原文（可选）" },
    },
    []
  ),
  buildFunctionTool(
    "bazi_analyze",
    "根据姓名、出生日期时辰、历法类型、性别和出生地生成八字命理分析提示与结构化结果（仅供传统文化学习与娱乐参考）。",
    {
      name: { type: "string", description: "姓名（可选）" },
      calendar: { type: "string", enum: ["solar", "lunar"], description: "日期类型：solar=阳历，lunar=农历" },
      birth_date: { type: "string", description: "出生日期，建议 YYYY-MM-DD" },
      birth_time: { type: "string", description: "出生时间，如 23:30 或 子时" },
      gender: { type: "string", enum: ["male", "female", "other"], description: "性别" },
      birth_place: { type: "string", description: "出生地（城市/地区）" },
      focus: { type: "string", description: "关注方向，如 事业/感情/财运/健康" },
    },
    ["calendar", "birth_date", "birth_time"]
  ),
  buildFunctionTool(
    "lunar_calendar_query",
    "使用客户端内置 lunar-javascript（6tail，本地无网）查询历法。op=solar_to_lunar：必填阳历 year、month、day，可选 hour/minute/second（默认 0），返回农历 fullString、四柱 eightChar、节假日等；op=lunar_to_solar：必填 lunar_year、lunar_month、lunar_day，可选时分秒，返回阳历与四柱。文档：https://github.com/6tail/lunar-javascript API：https://6tail.cn/calendar/api.html",
    {
      op: {
        type: "string",
        enum: ["solar_to_lunar", "lunar_to_solar"],
        description: "默认 solar_to_lunar（阳历转农历黄历）",
      },
      year: { type: "number", description: "solar_to_lunar：阳历年" },
      month: { type: "number", description: "solar_to_lunar：阳历月 1-12" },
      day: { type: "number", description: "solar_to_lunar：阳历日" },
      hour: { type: "number", description: "可选，0-23，默认 0（影响时辰干支）" },
      minute: { type: "number", description: "可选，默认 0" },
      second: { type: "number", description: "可选，默认 0" },
      lunar_year: { type: "number", description: "lunar_to_solar：农历年" },
      lunar_month: { type: "number", description: "lunar_to_solar：农历月 1-12（闰月规则以库为准）" },
      lunar_day: { type: "number", description: "lunar_to_solar：农历日" },
    },
    []
  ),
  buildFunctionTool(
    "cnlunar_calendar_query",
    "调用本机 Python 库 cnlunar（OPN48/cnlunar，须已 pip install cnlunar）查询指定阳历时刻的黄历数据：宜忌、神煞、节气、八字四柱、时辰宜忌、彭祖百忌、星宿等。与 lunar_calendar_query（纯 JS）互补；需传统协纪类宜忌时优先用本工具。参数：year/month/day；可选 hour、minute、second（默认 0）；godType 取 8char（八字月柱，默认）或 cnlunar（农历月）。",
    {
      year: { type: "number", description: "阳历年" },
      month: { type: "number", description: "阳历月 1-12" },
      day: { type: "number", description: "阳历日" },
      hour: { type: "number", description: "可选，0-23，默认 0" },
      minute: { type: "number", description: "可选，默认 0" },
      second: { type: "number", description: "可选，默认 0" },
      godType: {
        type: "string",
        enum: ["8char", "cnlunar"],
        description: "8char=按八字月柱择神（默认）；cnlunar=按农历月",
      },
    },
    ["year", "month", "day"]
  ),
  buildFunctionTool(
    "export_word_desktop",
    "将给定内容导出为 Word（.docx，公文/函件体例：宋体、标题居中、首行缩进、表格框线）并保存到桌面。content 用 Markdown：# / ## / ### 标题（### 后可紧接汉字）、**加粗**、- 或 1. 列表、| 表格；不要用 ```代码块包裹全文（若已包裹客户端会尝试剥除）。对话里仅一条助手长文时，点「导出 Word」也会按公文排版而非原始 Markdown。filePath 须原样告知用户。",
    {
      content: {
        type: "string",
        description:
          "正文（推荐 Markdown）：# 发文单位 ## 文种标题 ### 条款 **关键词**；表格行 | 列1 | 列2 |；勿把 Markdown 符号当纯文本堆进一段。",
      },
      file_name: { type: "string", description: "可选文件名（不含扩展名）；若正文无 # 标题，将居中显示为文档标题" },
    },
    ["content"]
  ),
  buildFunctionTool(
    "export_pdf_desktop",
    "将给定内容导出为 PDF（A4、公文体例：系统微软雅黑/宋体、标题居中、正文首行缩进、表格框线、**加粗**）并保存到桌面。Markdown 约定与 export_word_desktop 相同。依赖 Windows 自带中文字体。filePath 须原样告知用户。",
    {
      content: {
        type: "string",
        description: "正文（Markdown）：# ## ### 标题、**加粗**、列表、| 表格 |；勿用 ``` 包裹全文（可自动剥除）。",
      },
      file_name: { type: "string", description: "可选文件名（不含扩展名）" },
    },
    ["content"]
  ),
  buildFunctionTool(
    "runtime_prerequisites_evaluate",
    "评估本机运行环境：Python 是否可用、版本是否偏高（3.13+ 可能导致部分 pip 包无预编译 wheel）。",
    {
      auto_remediate: {
        type: "boolean",
        description: "为 true 时，尝试执行应用内可自动修复项后再返回评估结果（当前可能为空）",
      },
    },
    []
  ),
  buildFunctionTool(
    "kb_search",
    "在本地知识库中做语义检索，返回最相关的文档片段与相似度。查询接口章节（如 3.16.2 响应字段）时，query 应含精确章节号，并设 top_k 为 12–15；长章节（响应字段表+JSON）会自动拉取同节全部分块。",
    {
      query: { type: "string", description: "检索问题或关键词；接口文档建议含精确章节号，如「3.16.2 响应字段」" },
      top_k: { type: "number", description: "返回条数，默认 12，最大 15；响应字段/报文类建议 12–15" },
    },
    ["query"]
  ),
  buildFunctionTool(
    "graphify_query_graph",
    "在 graphify 代码库知识图谱（graphify-out/graph.json）中检索架构/模块/依赖相关问题。与业务知识库 kb_search 不同，仅用于理解本仓库代码结构。",
    {
      question: { type: "string", description: "自然语言问题，如「AI 聊天 IPC 在哪」" },
      budget: { type: "number", description: "返回字符上限，默认 4000" },
    },
    ["question"]
  ),
  buildFunctionTool(
    "graphify_get_node",
    "按节点 id 获取 graphify 图谱节点详情与邻居。",
    { node_id: { type: "string", description: "graphify 节点 id" } },
    ["node_id"]
  ),
  buildFunctionTool(
    "graphify_god_nodes",
    "返回 graphify 图谱枢纽节点（高度连接），用于快速理解架构核心。",
    { limit: { type: "number", description: "返回条数，默认 15" } }
  ),
  buildFunctionTool(
    "graphify_graph_stats",
    "返回 graphify-out 图谱统计与 GRAPH_REPORT 摘要预览。",
    {}
  ),
  buildFunctionTool(
    "graphify_shortest_path",
    "求 graphify 图谱中两概念/节点之间的最短关联路径。",
    {
      source: { type: "string", description: "起点 id 或 label 关键词" },
      target: { type: "string", description: "终点 id 或 label 关键词" },
    },
    ["source", "target"]
  ),
  buildFunctionTool(
    "baai_embedding_m3",
      "对一段或多段文本做向量嵌入（OpenAI 兼容 /v1/embeddings）。默认使用 BAAI/bge-m3（General Embedding-M3）；网关不支持时可传 model 覆盖。返回维度与向量头部摘要，完整向量过长时不在结果中展开。",
    {
      texts: {
        type: "array",
        items: { type: "string" },
        description: "待编码文本列表，至少 1 条；与单字段 text 二选一",
      },
      text: { type: "string", description: "单段文本；与 texts 二选一" },
      model: {
        type: "string",
        description: "嵌入模型 ID，默认 BAAI/bge-m3；Ollama 本机可填 bge-m3、nomic-embed-text 等",
      },
    },
    []
  ),
];

const TOOL_TO_SKILL = {};
APP_SKILL_CATALOG.forEach((s) => {
  (s.capabilities || []).forEach((c) => {
    TOOL_TO_SKILL[c] = s.id;
  });
});
TOOL_TO_SKILL.task_list_snapshot = "task-ops";

function readSkillPrefs() {
  try {
    const raw = localStorage.getItem(SKILL_PREFS_KEY);
    if (!raw) {
      return {};
    }
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeSkillPrefs(prefs) {
  try {
    localStorage.setItem(SKILL_PREFS_KEY, JSON.stringify(prefs || {}));
  } catch {
    /* ignore */
  }
}

function isSkillEnabled(skillId) {
  const s = APP_SKILL_CATALOG.find((x) => x.id === skillId);
  if (!s || s.planned) {
    return false;
  }
  const prefs = readSkillPrefs();
  if (Object.prototype.hasOwnProperty.call(prefs, skillId)) {
    return prefs[skillId] === true;
  }
  return !!s.defaultEnabled;
}

window.setSkillEnabled = function setSkillEnabled(skillId, enabled) {
  const s = APP_SKILL_CATALOG.find((x) => x.id === skillId);
  if (!s || s.planned) {
    return { ok: false, error: "技能不存在或尚未上线" };
  }
  const prefs = readSkillPrefs();
  prefs[skillId] = !!enabled;
  writeSkillPrefs(prefs);
  return { ok: true };
};

window.resetSkillPrefs = function resetSkillPrefs() {
  writeSkillPrefs({});
  return { ok: true };
};

window.getAISkillTools = function getAISkillTools() {
  return AI_SKILL_TOOLS.filter((t) => {
    const name = t?.function?.name;
    const sid = TOOL_TO_SKILL[name];
    return !sid || isSkillEnabled(sid);
  });
};

window.getSkillCatalog = function getSkillCatalog() {
  return APP_SKILL_CATALOG.map((s) => ({
    ...s,
    status: s.planned ? "planned" : isSkillEnabled(s.id) ? "enabled" : "disabled",
  }));
};
