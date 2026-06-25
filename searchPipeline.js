const DEFAULT_STOP_WORDS = new Set([
  "的",
  "了",
  "和",
  "与",
  "及",
  "或",
  "是",
  "在",
  "对",
  "把",
  "将",
  "请",
  "帮",
  "一下",
  "如何",
  "怎么",
  "为什么",
  "什么",
  "是否",
  "以及",
  "一个",
  "一些",
  "我们",
  "你们",
  "他们",
  "the",
  "a",
  "an",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "and",
  "or",
  "is",
  "are",
]);

const INTENT_SOURCE_MAP = {
  COMMON: [
    "TOUTIAO",
    "DOUYIN_BAIKE",
    "BAIDU",
    "BING",
    "SOGOU",
    "WIKIPEDIA",
    "DUCKDUCKGO",
    "ZHIHU",
    "XIAOHONGSHU",
    "BILIBILI",
    "OLLAMA_LIBRARY",
  ],
  TECH: [
    "TOUTIAO",
    "BING",
    "BAIDU",
    "SOGOU",
    "GITHUB_TRENDING",
    "STACKOVERFLOW",
    "WIKIPEDIA",
    "CSDN",
    "HUGGINGFACE",
    "MODELSCOPE",
    "OLLAMA_LIBRARY",
    "PAPERSWITHCODE",
    "ARXIV",
  ],
  NEWS: ["TOUTIAO", "DOUYIN_BAIKE", "XINHUA", "PEOPLE_NEWS", "BAIDU", "BING_NEWS", "GOOGLE_NEWS"],
  PROFESSIONAL: [
    "GOV_POLICY",
    "XINHUA",
    "PEOPLE_NEWS",
    "ENTERPRISE_ANNOUNCEMENT",
    "BING",
    "WIKIPEDIA",
    "BAIDU_BAIKE",
    "ARXIV",
    "PAPERSWITHCODE",
  ],
  LIFE: ["TOUTIAO", "BAIDU", "BING", "SOGOU", "WEATHER_API", "FX_API"],
};

const SOURCE_NAME_MAP = {
  BAIDU: "百度搜索",
  BING: "必应网页",
  BING_NEWS: "必应新闻",
  GOOGLE_NEWS: "Google News",
  WIKIPEDIA: "维基百科",
  DUCKDUCKGO: "DuckDuckGo",
  SOGOU: "搜狗搜索",
  TOUTIAO: "头条搜索",
  BAIDU_BAIKE: "百度百科",
  GOV_POLICY: "中国政府网",
  XINHUA: "新华社",
  ENTERPRISE_ANNOUNCEMENT: "企业公告",
  DOUYIN_BAIKE: "抖音 / 抖音百科",
  GITHUB_TRENDING: "GitHub Trending",
  STACKOVERFLOW: "Stack Overflow",
  CSDN: "CSDN",
  PEOPLE_NEWS: "人民网",
  ZHIHU: "知乎",
  XIAOHONGSHU: "小红书",
  BILIBILI: "B 站",
  HUGGINGFACE: "Hugging Face",
  MODELSCOPE: "ModelScope",
  OLLAMA_LIBRARY: "Ollama Library",
  ARXIV: "arXiv",
  PAPERSWITHCODE: "Papers with Code",
  WEATHER_API: "天气实时 API",
  FX_API: "汇率实时 API",
};

const DEFAULT_SOURCE_RULES = {
  BAIDU: { enabled: true, weight: 0.86 },
  BING: { enabled: true, weight: 0.9 },
  BING_NEWS: { enabled: true, weight: 0.93 },
  GOOGLE_NEWS: { enabled: true, weight: 0.9 },
  WIKIPEDIA: { enabled: true, weight: 0.88 },
  DUCKDUCKGO: { enabled: true, weight: 0.84 },
  SOGOU: { enabled: true, weight: 0.84 },
  TOUTIAO: { enabled: true, weight: 1.15 },
  DOUYIN_BAIKE: { enabled: true, weight: 1.1 },
  BAIDU_BAIKE: { enabled: true, weight: 0.9 },
  GOV_POLICY: { enabled: true, weight: 0.96 },
  XINHUA: { enabled: true, weight: 1.05 },
  ENTERPRISE_ANNOUNCEMENT: { enabled: true, weight: 0.98 },
  GITHUB_TRENDING: { enabled: true, weight: 0.92 },
  STACKOVERFLOW: { enabled: true, weight: 0.9 },
  CSDN: { enabled: true, weight: 0.9 },
  PEOPLE_NEWS: { enabled: true, weight: 0.95 },
  ZHIHU: { enabled: true, weight: 0.86 },
  XIAOHONGSHU: { enabled: true, weight: 0.82 },
  BILIBILI: { enabled: true, weight: 0.84 },
  HUGGINGFACE: { enabled: true, weight: 0.93 },
  MODELSCOPE: { enabled: true, weight: 0.92 },
  OLLAMA_LIBRARY: { enabled: true, weight: 0.91 },
  ARXIV: { enabled: true, weight: 0.95 },
  PAPERSWITHCODE: { enabled: true, weight: 0.93 },
  WEATHER_API: { enabled: true, weight: 0.92 },
  FX_API: { enabled: true, weight: 0.92 },
};

const DEFAULT_PIPELINE_OPTIONS = {
  sourceAttribution: true,
  preferFreshness: true,
  conflictDetection: true,
};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function nowIso() {
  return new Date().toISOString();
}

function toListUnique(values, maxLen) {
  const out = [];
  const seen = new Set();
  (values || []).forEach((v) => {
    const s = String(v || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  if (Number.isFinite(maxLen) && maxLen > 0) {
    return out.slice(0, maxLen);
  }
  return out;
}

function extractCoreKeywords(originalQuery) {
  const raw = String(originalQuery || "").trim();
  const words = raw
    .replace(/[，。！？、,.!?;；:："'`“”‘’()（）\[\]{}<>《》]/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const merged = [];
  for (const w of words) {
    if (w.length >= 2 && !DEFAULT_STOP_WORDS.has(w.toLowerCase())) {
      merged.push(w);
    }
  }
  const zhPhrases = raw.match(/[\u4e00-\u9fa5]{2,12}/g) || [];
  merged.push(...zhPhrases);
  return toListUnique(merged, 8);
}

function inferQueryIntent(originalQuery) {
  const q = String(originalQuery || "").toLowerCase();
  if (/(今天|今日|刚刚|最新|热点|突发|快讯|news|breaking)/.test(q)) {
    return { queryIntent: "NEWS", intentDesc: "实时资讯/时效类查询" };
  }
  if (/(api|sdk|代码|报错|异常|部署|算法|python|node|java|数据库|调试|开发|技术)/.test(q)) {
    return { queryIntent: "TECH", intentDesc: "技术实现/工程问题查询" };
  }
  if (/(政策|法规|公告|标准|白皮书|研究报告|行业|专业|学术)/.test(q)) {
    return { queryIntent: "PROFESSIONAL", intentDesc: "专业资料/政策规范查询" };
  }
  if (/(生活|出行|天气|医疗|教育|办理|服务|申请)/.test(q)) {
    return { queryIntent: "LIFE", intentDesc: "生活服务类查询" };
  }
  return { queryIntent: "COMMON", intentDesc: "常识问答类查询" };
}

function expandQueries(originalQuery, coreKeywords, queryIntent, needExpand) {
  const base = String(originalQuery || "").trim();
  if (!needExpand) {
    return toListUnique([base], 1);
  }
  const key = coreKeywords.slice(0, 4).join(" ");
  const templatesByIntent = {
    TECH: [
      `${base} 最佳实践`,
      `${key} 原理与实现`,
      `${base} 常见问题 解决方案`,
      `${key} 官方文档 指南`,
    ],
    NEWS: [
      `${base} 最新进展`,
      `${base} 官方通报`,
      `${key} 权威媒体 报道`,
      `${base} 时间线`,
    ],
    PROFESSIONAL: [
      `${base} 政策 标准 官方`,
      `${base} 行业报告`,
      `${key} 规范解读`,
      `${base} 权威资料`,
    ],
    LIFE: [
      `${base} 办理流程`,
      `${base} 官方说明`,
      `${base} 注意事项`,
      `${key} 常见问题`,
    ],
    COMMON: [
      `${base} 解释`,
      `${base} 原因`,
      `${key} 对比`,
      `${base} 结论`,
    ],
  };
  return toListUnique([base, ...(templatesByIntent[queryIntent] || [])], 5);
}

function sourceName(sourceType) {
  return SOURCE_NAME_MAP[sourceType] || sourceType;
}

function scoreSourceLevelByHost(host, sourceType) {
  const h = String(host || "").toLowerCase();
  if (/gov\.cn|www\.gov\.cn/.test(h) || sourceType === "GOV_POLICY") return 5;
  if (/people\.com\.cn|xinhuanet\.com/.test(h) || sourceType === "PEOPLE_NEWS" || sourceType === "XINHUA") return 5;
  if (!h) return sourceType === "WIKIPEDIA" ? 4 : 3;
  if (/\.(gov|edu)\./.test(h) || /\.gov$|\.edu$/.test(h) || /gov\.cn|edu\.cn/.test(h)) return 5;
  if (/wikipedia\.org|baike\.baidu\.com/.test(h)) return 4;
  if (/news|xinhuanet|people\.com|cctv|thepaper|bbc|reuters|apnews/.test(h)) return 4;
  if (/arxiv\.org|paperswithcode\.com/.test(h) || sourceType === "ARXIV" || sourceType === "PAPERSWITHCODE") return 5;
  if (/huggingface\.co|modelscope\.cn|ollama\.com/.test(h)) return 4;
  if (/github|stackoverflow|developer|docs\.|csdn\.net/.test(h)) return 4;
  if (sourceType === "WEATHER_API" || sourceType === "FX_API") return 5;
  return 3;
}

function cleanRawText(text) {
  return String(text || "")
    .replace(/广告|推广|赞助|点击查看|立即下载|扫描二维码/gi, " ")
    .replace(/打开APP|下载APP|更多精彩内容尽在.*?客户端/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBulletLine(line) {
  const s = String(line || "").trim();
  if (!s.startsWith("-")) return null;
  const body = s.replace(/^-+\s*/, "").trim();
  const match = body.match(/^(.*?)[（(](https?:\/\/[^)）\s]+)[)）]\s*$/i);
  if (match) {
    return { title: match[1].trim(), url: match[2].trim(), content: match[1].trim() };
  }
  return { title: body, url: "", content: body };
}

function parseSourceBlockToRawResults(sourceType, block, retrieveQuery) {
  const lines = String(block || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    const one = parseBulletLine(line);
    if (one) {
      out.push({
        title: cleanRawText(one.title),
        url: one.url,
        content: cleanRawText(one.content).slice(0, 500),
        publishTime: null,
        sourceHost: one.url ? safeHostFromUrl(one.url) : "",
        retrieveQuery,
      });
    }
  }
  if (!out.length) {
    const compact = cleanRawText(lines.join(" ").slice(0, 420));
    if (compact) {
      out.push({
        title: `${sourceName(sourceType)} 摘要`,
        url: "",
        content: compact,
        publishTime: null,
        sourceHost: "",
        retrieveQuery,
      });
    }
  }
  return out;
}

function safeHostFromUrl(u) {
  try {
    return new URL(String(u || "")).host || "";
  } catch {
    return "";
  }
}

function mergeSourceRules(rules) {
  const merged = { ...DEFAULT_SOURCE_RULES };
  if (!rules || typeof rules !== "object") return merged;
  Object.keys(merged).forEach((key) => {
    if (!rules[key] || typeof rules[key] !== "object") return;
    merged[key] = {
      enabled: rules[key].enabled !== false,
      weight: clamp(Number(rules[key].weight) || merged[key].weight, 0.1, 1.5),
    };
  });
  return merged;
}

async function retrieveMultiSource(payload, adapters, options = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const queries = toListUnique(p.queries || [], 5);
  const sourceRules = mergeSourceRules(options.sourceRules || {});
  const intent = String(p.queryIntent || "COMMON").toUpperCase();
  const fallbackSources = INTENT_SOURCE_MAP[intent] || INTENT_SOURCE_MAP.COMMON;
  const requestedSources = Array.isArray(p.sourceTypes) && p.sourceTypes.length ? p.sourceTypes : fallbackSources;
  const sourceTypes = requestedSources.filter((x) => sourceRules[x]?.enabled !== false);
  const pageSize = clamp(Number(p.pageSize) || 10, 1, 20);
  const sourceStateMap = options.sourceStateMap || new Map();

  const bySource = new Map(sourceTypes.map((s) => [s, []]));
  const tasks = [];
  for (const sourceType of sourceTypes) {
    for (const q of queries.slice(0, 3)) {
      tasks.push(
        (async () => {
          const begin = Date.now();
          try {
            const adapter = adapters[sourceType];
            if (typeof adapter !== "function") {
              throw new Error(`未配置数据源适配器: ${sourceType}`);
            }
            const block = await adapter(q);
            const list = parseSourceBlockToRawResults(sourceType, block, q).slice(0, pageSize);
            bySource.get(sourceType).push(...list);
            sourceStateMap.set(sourceType, {
              sourceType,
              sourceName: sourceName(sourceType),
              online: list.length > 0,
              latencyMs: Date.now() - begin,
              lastError: "",
              updatedAt: nowIso(),
            });
          } catch (err) {
            sourceStateMap.set(sourceType, {
              sourceType,
              sourceName: sourceName(sourceType),
              online: false,
              latencyMs: Date.now() - begin,
              lastError: String(err?.message || err || "unknown"),
              updatedAt: nowIso(),
            });
          }
        })()
      );
    }
  }
  await Promise.all(tasks);

  const sourceResults = sourceTypes.map((sourceType) => {
    const rawList = bySource.get(sourceType) || [];
    const resultList = toListUnique(
      rawList.map((x) => JSON.stringify(x)),
      pageSize
    ).map((x) => JSON.parse(x));
    const state = sourceStateMap.get(sourceType);
    return {
      sourceType,
      sourceName: sourceName(sourceType),
      success: resultList.length > 0,
      errorMsg: resultList.length ? null : state?.lastError || "未获取到可解析内容",
      resultList,
    };
  });

  return {
    retrieveTime: 0,
    sourceCount: sourceResults.filter((x) => x.success).length,
    sourceResults,
  };
}

function computeKeywordCoverage(text, coreKeywords) {
  const t = String(text || "").toLowerCase();
  const keys = (coreKeywords || []).map((x) => String(x || "").toLowerCase()).filter(Boolean);
  if (!keys.length) return 0.4;
  let hit = 0;
  keys.forEach((k) => {
    if (t.includes(k)) hit += 1;
  });
  return clamp(hit / keys.length, 0, 1);
}

function buildDedupKey(item) {
  const u = String(item.url || "").trim().toLowerCase().replace(/[#?].*$/, "");
  const t = String(item.title || "").trim().toLowerCase().replace(/\s+/g, "");
  return u || t;
}

function computeContentScore(item, sourceRuleWeight, coreKeywords) {
  const sourceLevel = Number(item.sourceLevel || 3);
  const coverage = computeKeywordCoverage(`${item.title || ""} ${item.content || ""}`, coreKeywords);
  const lenScore = clamp(String(item.content || "").length / 320, 0, 1);
  const freshness = computeFreshnessScore(item.publishTime);
  const base = sourceRuleWeight * 24 + sourceLevel * 12 + coverage * 30 + lenScore * 12 + freshness * 22;
  return clamp(Math.round(base), 0, 100);
}

function computeFreshnessScore(publishTime) {
  if (!publishTime) return 0.35;
  const ts = Date.parse(String(publishTime));
  if (!Number.isFinite(ts)) return 0.35;
  const days = (Date.now() - ts) / (24 * 3600 * 1000);
  if (days <= 1) return 1;
  if (days <= 3) return 0.88;
  if (days <= 7) return 0.72;
  if (days <= 30) return 0.52;
  return 0.3;
}

function collectConflictTips(items) {
  const map = new Map();
  items.forEach((x) => {
    const key = String(x.title || "").slice(0, 40).toLowerCase();
    if (!key) return;
    const arr = map.get(key) || [];
    arr.push(x);
    map.set(key, arr);
  });
  const tips = [];
  map.forEach((arr) => {
    if (arr.length < 2) return;
    const scoreGap = Math.abs(Number(arr[0].score || 0) - Number(arr[1].score || 0));
    if (scoreGap >= 18) {
      tips.push(`“${arr[0].title}”存在多源差异，已优先采信评分更高来源。`);
      arr.forEach((x) => {
        x.isConflict = true;
        x.conflictDesc = "同主题多源信息存在差异，已按来源权重与完整度择优。";
      });
    }
  });
  return tips;
}

function processContent(payload, options = {}) {
  const p = payload && typeof payload === "object" ? payload : {};
  const sourceResults = Array.isArray(p.sourceResults) ? p.sourceResults : [];
  const coreKeywords = Array.isArray(p.coreKeywords) ? p.coreKeywords : [];
  const topN = clamp(Number(p.topN) || 5, 1, 10);
  const sourceRules = mergeSourceRules(options.sourceRules || {});
  const preferFreshness = options.preferFreshness !== false;
  const conflictDetection = options.conflictDetection !== false;
  const all = [];

  sourceResults.forEach((sr) => {
    const sourceType = String(sr?.sourceType || "").trim();
    const list = Array.isArray(sr?.resultList) ? sr.resultList : [];
    const sourceWeight = sourceRules[sourceType]?.weight || 0.8;
    list.forEach((raw) => {
      const title = cleanRawText(raw?.title || "");
      const content = cleanRawText(raw?.content || "");
      if (!title && !content) return;
      const sourceHost = String(raw?.sourceHost || safeHostFromUrl(raw?.url || "")).trim();
      const sourceLevel = scoreSourceLevelByHost(sourceHost, sourceType);
      const normalized = {
        title: title || `${sourceName(sourceType)} 内容`,
        url: String(raw?.url || "").trim(),
        content: content.slice(0, 800),
        publishTime: raw?.publishTime || null,
        sourceType,
        sourceHost,
        sourceLevel,
        sourceWeight,
        retrieveQuery: String(raw?.retrieveQuery || "").trim(),
      };
      all.push(normalized);
    });
  });

  const dedupMap = new Map();
  all.forEach((item) => {
    const key = buildDedupKey(item);
    const old = dedupMap.get(key);
    if (!old) {
      dedupMap.set(key, item);
      return;
    }
    if ((item.sourceLevel || 0) > (old.sourceLevel || 0)) {
      dedupMap.set(key, item);
      return;
    }
    if ((item.content || "").length > (old.content || "").length) {
      dedupMap.set(key, item);
    }
  });
  const deduped = [...dedupMap.values()];
  deduped.forEach((item) => {
    item.score = computeContentScore(item, item.sourceWeight, coreKeywords);
    item.isConflict = false;
    item.conflictDesc = null;
  });
  if (preferFreshness) {
    deduped.sort((a, b) => {
      const af = computeFreshnessScore(a.publishTime);
      const bf = computeFreshnessScore(b.publishTime);
      if (Math.abs(af - bf) > 0.18) return bf - af;
      return Number(b.score || 0) - Number(a.score || 0);
    });
  } else {
    deduped.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  }
  const highQualityContents = deduped.slice(0, topN);
  const conflictTips = conflictDetection ? collectConflictTips(highQualityContents) : [];

  return {
    processTime: 0,
    rawCount: all.length,
    filteredCount: highQualityContents.length,
    highQualityContents,
    conflictTips,
  };
}

function buildWebSearchSummaryBlock(result, queryIntent, options = {}) {
  const mergedOpts = { ...DEFAULT_PIPELINE_OPTIONS, ...(options || {}) };
  const items = Array.isArray(result?.highQualityContents) ? result.highQualityContents : [];
  if (!items.length) {
    return "【联网检索】本次未获取到可解析的公开网页摘要。请基于已有知识先给出参考答案，并明确标注时效风险。";
  }
  const conflictTipText = Array.isArray(result?.conflictTips) && result.conflictTips.length
    ? `\n冲突甄别：${result.conflictTips.slice(0, 2).join("；")}`
    : "";
  const lines = items.slice(0, 8).map((x, idx) => {
    const src = mergedOpts.sourceAttribution
      ? `${sourceName(x.sourceType)} / 可信度${x.sourceLevel} / 评分${x.score}`
      : `评分${x.score}`;
    const link = x.url ? `（${x.url}）` : "";
    const snippet = cleanRawText(x.content).slice(0, 220);
    return `${idx + 1}. ${x.title}${link}\n   - ${src}\n   - 摘要：${snippet}`;
  });
  return `【联网检索摘要（多源融合：${queryIntent}）】\n${lines.join("\n")}${conflictTipText}`;
}

function buildFallbackGeneratedAnswer(originalQuery, highQualityContents, showSource) {
  const items = Array.isArray(highQualityContents) ? highQualityContents : [];
  if (!items.length) {
    return {
      finalAnswer: `未检索到足够可信的外部信息。建议你更换关键词后重试：${originalQuery}`,
      sourceList: showSource ? [] : null,
      conflictTips: null,
    };
  }
  const points = items.slice(0, 4).map((x) => `- ${x.title}：${cleanRawText(x.content).slice(0, 100)}`);
  return {
    finalAnswer: `基于多源检索，关于“${originalQuery}”的结论如下：\n${points.join("\n")}`,
    sourceList: showSource
      ? items.slice(0, 6).map((x) => ({
          sourceName: sourceName(x.sourceType),
          url: x.url || "",
          sourceLevel: x.sourceLevel || 3,
        }))
      : null,
    conflictTips: null,
  };
}

async function probeSearchSourceStatus(adapters, options = {}) {
  const sourceRules = mergeSourceRules(options.sourceRules || {});
  const sourceStateMap = options.sourceStateMap || new Map();
  const probeQuery = String(options.probeQuery || "人工智能").trim() || "人工智能";
  const concurrency = Math.max(1, Math.min(8, Number(options.concurrency) || 5));
  const sourceTypes = Object.keys(sourceRules);
  const queue = [...sourceTypes];

  const runOne = async (sourceType) => {
    const rule = sourceRules[sourceType];
    const begin = Date.now();
    if (rule?.enabled === false) {
      sourceStateMap.set(sourceType, {
        sourceType,
        sourceName: sourceName(sourceType),
        online: false,
        latencyMs: 0,
        lastError: "已禁用",
        updatedAt: nowIso(),
      });
      return;
    }
    try {
      const adapter = adapters[sourceType];
      if (typeof adapter !== "function") {
        throw new Error(`未配置数据源适配器: ${sourceType}`);
      }
      const block = await adapter(probeQuery);
      const list = parseSourceBlockToRawResults(sourceType, block, probeQuery).slice(0, 1);
      sourceStateMap.set(sourceType, {
        sourceType,
        sourceName: sourceName(sourceType),
        online: list.length > 0,
        latencyMs: Date.now() - begin,
        lastError: list.length > 0 ? "" : "未获取到可解析内容",
        updatedAt: nowIso(),
      });
    } catch (err) {
      sourceStateMap.set(sourceType, {
        sourceType,
        sourceName: sourceName(sourceType),
        online: false,
        latencyMs: Date.now() - begin,
        lastError: String(err?.message || err || "unknown"),
        updatedAt: nowIso(),
      });
    }
  };

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const sourceType = queue.shift();
      if (sourceType) await runOne(sourceType);
    }
  });
  await Promise.all(workers);
}

module.exports = {
  DEFAULT_SOURCE_RULES,
  DEFAULT_PIPELINE_OPTIONS,
  SOURCE_NAME_MAP,
  mergeSourceRules,
  sourceName,
  extractCoreKeywords,
  inferQueryIntent,
  expandQueries,
  retrieveMultiSource,
  probeSearchSourceStatus,
  processContent,
  buildWebSearchSummaryBlock,
  buildFallbackGeneratedAnswer,
};
