#!/usr/bin/env node
/**
 * 本地知识库检索回归评测
 * 用法：npm run kb:eval
 */
const fs = require("fs");
const path = require("path");
const {
  keywordMatchScore,
  metadataMatchScore,
  classifyQuery,
  inferQueryProfile,
  docRefMatchScore,
  extractDocumentReferenceCodes,
  mergeAndFuseHits,
  rrfScore,
  computeFieldBoost,
} = require("../utils/kbRetrieval.js");
const { rebuildFtsIndex, searchFtsIndex } = require("../utils/kbFtsIndex.js");

function parseArgs(argv) {
  const args = { golden: path.join(__dirname, "..", "config", "kb-eval-golden.json") };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--golden" && argv[i + 1]) {
      args.golden = argv[++i];
    }
  }
  return args;
}

function runKeywordFixture() {
  const cases = [
    {
      name: "exact phrase",
      query: "鲸落AI 任务跟进",
      text: "登录后会弹出鲸落AI 任务跟进提示窗口。",
      expectMin: 0.8,
    },
    {
      name: "filename boost",
      query: "需求规格说明书.docx",
      text: "第三章 安装部署说明。",
      meta: { docName: "本地知识库高速检索系统_需求规格说明书.docx" },
      expectMin: 0.45,
    },
    {
      name: "number token",
      query: "版本 1.9.0",
      text: "当前客户端版本为 1.9.0，已支持混合检索。",
      expectMin: 0.5,
    },
  ];
  let pass = 0;
  cases.forEach((c) => {
    const score = keywordMatchScore(c.query, c.text, c.meta || {});
    const ok = score >= c.expectMin;
    console.log(`${ok ? "PASS" : "FAIL"} [keyword] ${c.name}: ${score.toFixed(3)} (>= ${c.expectMin})`);
    if (ok) {
      pass += 1;
    }
  });
  return { pass, total: cases.length };
}

function runDocRefFixture() {
  const query = "[CTEC-01013]中国电信网上营业厅电子渠道订单能力接入协议-v0.57";
  const wrongDoc = {
    docName: "【协议文档】[CTEC-P301010101]中国电信电子渠道开放平台-百度地图能力接口协议-v0.2(1)(1).pdf",
    sourcePath:
      "E:\\工作文件\\协议汇总\\中台规范协议\\涉及防诈的需求\\[CTEC-P301010101]中国电信电子渠道开放平台-百度地图能力接口协议-v0.2(1)(1).pdf",
  };
  const rightDoc = {
    docName: "[CTEC-01013]中国电信网上营业厅电子渠道订单能力接入协议-v0.57.pdf",
    sourcePath: "E:\\协议\\[CTEC-01013]中国电信网上营业厅电子渠道订单能力接入协议-v0.57.pdf",
  };
  let pass = 0;
  const typeOk = classifyQuery(query) === "doc_ref";
  console.log(`${typeOk ? "PASS" : "FAIL"} [doc_ref] classifyQuery -> doc_ref`);
  if (typeOk) pass += 1;

  const codes = extractDocumentReferenceCodes(query);
  const codesOk = codes.includes("ctec-01013");
  console.log(`${codesOk ? "PASS" : "FAIL"} [doc_ref] extract codes: ${codes.join(",")}`);
  if (codesOk) pass += 1;

  const wrongScore = docRefMatchScore(query, '{"distance":{"text":"20.6公里"}}', wrongDoc);
  const wrongOk = wrongScore === 0;
  console.log(`${wrongOk ? "PASS" : "FAIL"} [doc_ref] reject wrong protocol: ${wrongScore}`);
  if (wrongOk) pass += 1;

  const rightScore = docRefMatchScore(query, "订单能力接入说明", rightDoc);
  const rightOk = rightScore >= 0.9;
  console.log(`${rightOk ? "PASS" : "FAIL"} [doc_ref] accept matching protocol: ${rightScore}`);
  if (rightOk) pass += 1;

  const ftsLikeHits = [
    {
      chunkId: "wrong",
      text: '{"distance":{"text":"20.6公里"},"duration":{"text":"3.3小时"}}',
      ftsScore: 1,
      docName: wrongDoc.docName,
      sourcePath: wrongDoc.sourcePath,
      sourceFile: wrongDoc.docName,
    },
  ];
  const fused = mergeAndFuseHits([], [], query, true, 0.6, {
    ftsHits: ftsLikeHits,
    queryType: "doc_ref",
    useRrf: true,
  });
  const fuseOk = fused.length === 0;
  console.log(`${fuseOk ? "PASS" : "FAIL"} [doc_ref] merge filters FTS false positive (${fused.length} hits)`);
  if (fuseOk) pass += 1;

  return { pass, total: 5 };
}

function runSectionFixture() {
  const query = "3.6 待激活订单接收";
  const wrongMeta = {
    docName: "未支付订单查询接口协议20250213(1).docx",
    sourcePath: "E:\\工作文件\\协议汇总\\网厅协议汇总\\支付订单接口\\未支付订单查询接口协议20250213(1).docx",
  };
  const wrongText = "1.2 Purpose and Principles\n1.3 Scope of Use";
  const tocText = "目录\n3.1 接口A\n3.6 待激活订单接收\n3.7 其他";
  const rightText = "3.6 待激活订单接收\n本接口用于接收待激活状态的订单…";
  let pass = 0;

  const typeOk = classifyQuery(query) === "section";
  console.log(`${typeOk ? "PASS" : "FAIL"} [section] classifyQuery -> section`);
  if (typeOk) pass += 1;

  const { sectionHeadingMatchScore, mergeAndFuseHits } = require("../utils/kbRetrieval.js");
  const wrongOk = sectionHeadingMatchScore(query, wrongText, wrongMeta) === 0;
  console.log(`${wrongOk ? "PASS" : "FAIL"} [section] reject unrelated chunk`);
  if (wrongOk) pass += 1;

  const tocScore = sectionHeadingMatchScore(query, tocText, wrongMeta);
  const tocOk = tocScore > 0 && tocScore < 0.75;
  console.log(`${tocOk ? "PASS" : "FAIL"} [section] toc-only below threshold: ${tocScore}`);
  if (tocOk) pass += 1;

  const rightOk = sectionHeadingMatchScore(query, rightText, { docName: "订单能力接入协议.docx" }) >= 0.9;
  console.log(`${rightOk ? "PASS" : "FAIL"} [section] accept matching section`);
  if (rightOk) pass += 1;

  const fused = mergeAndFuseHits([], [], query, true, 0.6, {
    ftsHits: [{ chunkId: "w", text: wrongText, ftsScore: 1, ...wrongMeta, sourceFile: wrongMeta.docName }],
    queryType: "section",
    useRrf: true,
  });
  const fuseOk = fused.length === 0;
  console.log(`${fuseOk ? "PASS" : "FAIL"} [section] merge filters FTS false positive (${fused.length})`);
  if (fuseOk) pass += 1;

  return { pass, total: 5 };
}

function runMetadataFixture() {
  const score = metadataMatchScore("开户流程.docx", {
    docName: "银行开户流程.docx",
    sourcePath: "D:/docs/银行开户流程.docx",
  });
  const ok = score >= 0.8;
  console.log(`${ok ? "PASS" : "FAIL"} [metadata] filename exact-ish: ${score.toFixed(3)}`);
  return { pass: ok ? 1 : 0, total: 1 };
}

function runHybridFixture() {
  const vectorHits = [{ chunkId: "a", text: "向量相关段落", vectorScore: 0.62, docName: "a.md" }];
  const keywordHits = [{ chunkId: "b", text: "包含专有名词 XJ-9000 的段落", keywordScore: 0.95, docName: "b.md" }];
  const metadataHits = [
    {
      chunkId: "c",
      text: "开户流程说明",
      metadataScore: 0.92,
      docName: "开户流程.docx",
      sourcePath: "D:/docs/开户流程.docx",
    },
  ];
  const merged = mergeAndFuseHits(vectorHits, keywordHits, "XJ-9000", true, 0.6, {
    metadataHits,
    queryType: "identifier",
    useRrf: true,
  });
  const keywordOnly = merged.find((x) => x.chunkId === "b");
  const metaHit = merged.find((x) => x.chunkId === "c");
  const okKeyword = keywordOnly && keywordOnly.score >= 0.08;
  const okMeta = metaHit && metaHit.score >= 0.08;
  console.log(`${okKeyword ? "PASS" : "FAIL"} [hybrid-rrf] keyword recall score: ${(keywordOnly?.score || 0).toFixed(3)}`);
  console.log(`${okMeta ? "PASS" : "FAIL"} [hybrid-rrf] metadata recall score: ${(metaHit?.score || 0).toFixed(3)}`);
  return { pass: (okKeyword ? 1 : 0) + (okMeta ? 1 : 0), total: 2 };
}

function runRrfFixture() {
  const score = rrfScore([1, 3, null, 5]);
  const ok = score > 0.04;
  console.log(`${ok ? "PASS" : "FAIL"} [rrf] fused rank score: ${score.toFixed(4)}`);
  return { pass: ok ? 1 : 0, total: 1 };
}

function runFtsFixture() {
  const chunks = [
    { id: "c1", docId: "d1", docName: "开户流程.docx", text: "[文档] 开户流程\n绑定 eDDA 操作说明" },
    { id: "c2", docId: "d2", docName: "api.md", text: "kbHybridSearch 函数用于混合检索" },
  ];
  const docs = [
    { id: "d1", name: "开户流程.docx", sourcePath: "D:/docs/开户流程.docx" },
    { id: "d2", name: "api.md", sourcePath: "D:/src/api.md" },
  ];
  const index = rebuildFtsIndex(chunks, docs);
  const hits = searchFtsIndex(index, "kbHybridSearch", 5);
  const ok = hits.length && hits[0].chunkId === "c2";
  console.log(`${ok ? "PASS" : "FAIL"} [fts] code symbol search top=${hits[0]?.chunkId || "none"}`);
  return { pass: ok ? 1 : 0, total: 1 };
}

function runGoldenFile(goldenPath) {
  if (!goldenPath || !fs.existsSync(goldenPath)) {
    console.log("SKIP [golden] 未提供或找不到 golden 文件，跳过。");
    return { pass: 0, total: 0 };
  }
  const rows = JSON.parse(fs.readFileSync(goldenPath, "utf8"));
  let pass = 0;
  rows.forEach((row) => {
    const type = classifyQuery(row.query || "");
    const profile = inferQueryProfile(row.query || "");
    const expect = row.expectProfile || row.queryType || "";
    const ok =
      profile &&
      profile.label &&
      (expect === "semantic" ? profile.label === "semantic" : type === expect || profile.label === expect || profile.queryType === expect);
    console.log(`${ok ? "PASS" : "FAIL"} [golden] ${row.id || "?"} ${type}/${profile.label} (expect ${expect})`);
    if (ok) {
      pass += 1;
    }
  });
  return { pass, total: rows.length };
}

function runIncrementalFixture() {
  const { buildChunkSpecs, planChunkIncrementalUpdate } = require("../utils/kbRetrieval.js");
  const oldChunks = [
    {
      id: "c1",
      docId: "d1",
      text: "[文档] a.txt\n[路径] /a.txt\n[分块] 1/2\n---\n段落一内容",
      chunkHash: require("../utils/kbRetrieval.js").computeChunkHash("段落一内容"),
      chunkIndex: 0,
      embedding: [0.1, 0.2],
    },
    {
      id: "c2",
      docId: "d1",
      text: "[文档] a.txt\n[路径] /a.txt\n[分块] 2/2\n---\n段落二旧内容",
      chunkHash: require("../utils/kbRetrieval.js").computeChunkHash("段落二旧内容"),
      chunkIndex: 1,
      embedding: [0.3, 0.4],
    },
  ];
  const specs = buildChunkSpecs(
    [
      { text: "段落一内容", chunkIndex: 0, charStart: 0, charEnd: 5 },
      { text: "段落二新内容", chunkIndex: 1, charStart: 6, charEnd: 12 },
    ],
    "a.txt",
    "/a.txt"
  );
  const plan = planChunkIncrementalUpdate(oldChunks, specs);
  const ok =
    plan.reusedCount === 1 &&
    plan.embedCount === 1 &&
    plan.removedCount === 1 &&
    plan.reuse[0].oldChunk.id === "c1" &&
    plan.removeChunkIds.includes("c2");
  console.log(
    `${ok ? "PASS" : "FAIL"} [incremental] reuse=${plan.reusedCount} embed=${plan.embedCount} remove=${plan.removedCount}`
  );
  return { pass: ok ? 1 : 0, total: 1 };
}

function runSqliteFixture() {
  const os = require("os");
  const fs = require("fs");
  const path = require("path");
  const {
    saveStoreToSqlite,
    loadStoreFromSqlite,
    migrateJsonStoreIfNeeded,
    getStoreCounts,
  } = require("../utils/kbSqliteStore.js");

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-sqlite-eval-"));
  const defaultStore = () => ({
    version: 2,
    settings: { searchTopK: 10, embedModel: "bge-m3" },
    documents: [{ id: "d1", name: "demo.txt", sourcePath: "/demo.txt", chunkCount: 1, createdAt: "2026-01-01" }],
    chunks: [
      {
        id: "c1",
        docId: "d1",
        docName: "demo.txt",
        text: "hello sqlite metadata",
        chunkIndex: 0,
        embedding: [0.1, 0.2],
        chunkHash: "abc",
      },
    ],
    graph: { version: 1, nodes: [], edges: [], summary: { nodeCount: 0, edgeCount: 0 } },
  });

  const store = defaultStore();
  saveStoreToSqlite(tmpDir, store);
  const loaded = loadStoreFromSqlite(tmpDir, defaultStore);
  const counts = getStoreCounts(tmpDir);
  const ok =
    loaded.documents.length === 1 &&
    loaded.chunks.length === 1 &&
    loaded.chunks[0].text.includes("sqlite") &&
    counts.documents === 1 &&
    counts.chunks === 1;
  console.log(`${ok ? "PASS" : "FAIL"} [sqlite] roundtrip docs=${loaded.documents.length} chunks=${loaded.chunks.length}`);

  const jsonPath = path.join(tmpDir, "store.json");
  fs.writeFileSync(jsonPath, JSON.stringify(defaultStore()), "utf8");
  const migrateDir = path.join(tmpDir, "migrate-lib");
  fs.mkdirSync(migrateDir, { recursive: true });
  fs.writeFileSync(path.join(migrateDir, "store.json"), JSON.stringify(defaultStore()), "utf8");
  const migrated = migrateJsonStoreIfNeeded(migrateDir, defaultStore);
  const migratedOk = migrated.migrated === true;
  console.log(`${migratedOk ? "PASS" : "FAIL"} [sqlite-migrate] ${migrated.migrated ? "migrated" : migrated.reason}`);

  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  return { pass: (ok ? 1 : 0) + (migratedOk ? 1 : 0), total: 2 };
}

function runAutoLearnFixture() {
  const {
    meetsAutoLearnThreshold,
    shouldQueueAutoLearn,
    credibilitySearchPenalty,
    buildAutoLearnMeta,
    CREDIBILITY,
  } = require("../utils/kbAutoLearn.js");

  let pass = 0;
  const thresholdOk = meetsAutoLearnThreshold("什么是鲸落AI？", "A".repeat(90), {
    autoLearnMinQuestionChars: 6,
    autoLearnMinAnswerChars: 80,
  }).ok;
  console.log(`${thresholdOk ? "PASS" : "FAIL"} [auto-learn] threshold meets min chars`);
  if (thresholdOk) pass += 1;

  const thresholdShort = !meetsAutoLearnThreshold("短", "也短", {}).ok;
  console.log(`${thresholdShort ? "PASS" : "FAIL"} [auto-learn] threshold rejects short`);
  if (thresholdShort) pass += 1;

  const queueOn = shouldQueueAutoLearn({ autoLearnRequireConfirm: true });
  const queueOff = !shouldQueueAutoLearn({ autoLearnRequireConfirm: false });
  const queueOk = queueOn && queueOff;
  console.log(`${queueOk ? "PASS" : "FAIL"} [auto-learn] review queue toggle`);
  if (queueOk) pass += 1;

  const meta = buildAutoLearnMeta({
    question: "测试问题",
    answer: "测试回答",
    sourceType: "chat",
    credibility: "confirmed",
  });
  const metaOk = meta.credibility === CREDIBILITY.CONFIRMED && meta.sourceType === "chat";
  console.log(`${metaOk ? "PASS" : "FAIL"} [auto-learn] buildAutoLearnMeta`);
  if (metaOk) pass += 1;

  const unconfirmedBoost = computeFieldBoost("测试", {
    credibility: "unconfirmed",
    sourcePath: "ai://auto-learn/chat",
    text: "测试内容",
    docName: "自动学习",
  });
  const verifiedBoost = computeFieldBoost("测试", {
    credibility: "verified",
    sourcePath: "ai://auto-learn/chat",
    text: "测试内容",
    docName: "自动学习",
  });
  const penaltyOk = verifiedBoost > unconfirmedBoost;
  console.log(
    `${penaltyOk ? "PASS" : "FAIL"} [auto-learn] credibility penalty unconfirmed=${unconfirmedBoost.toFixed(3)} verified=${verifiedBoost.toFixed(3)}`
  );
  if (penaltyOk) pass += 1;

  const penaltyValuesOk =
    credibilitySearchPenalty("unconfirmed") < credibilitySearchPenalty("confirmed") &&
    credibilitySearchPenalty("confirmed") < credibilitySearchPenalty("verified");
  console.log(`${penaltyValuesOk ? "PASS" : "FAIL"} [auto-learn] credibilitySearchPenalty ordering`);
  if (penaltyValuesOk) pass += 1;

  return { pass, total: 6 };
}

function runTopicKeywordFixture() {
  const {
    classifyQuery,
    metadataMatchScore,
    scanMetadataHits,
    mergeAndFuseHits,
    diversifySearchHits,
    computeFieldBoost,
  } = require("../utils/kbRetrieval.js");

  let pass = 0;
  const typeOk = classifyQuery("计费") === "topic_keyword";
  console.log(`${typeOk ? "PASS" : "FAIL"} [topic] classifyQuery 计费 -> topic_keyword`);
  if (typeOk) pass += 1;

  const titleOk = classifyQuery("20220114计费OpenAPI接口规范集合V1.1-202109") === "filename";
  console.log(`${titleOk ? "PASS" : "FAIL"} [topic] classifyQuery long title -> filename`);
  if (titleOk) pass += 1;

  const pathScore = metadataMatchScore("计费", {
    docName: "【协议文档】20220114计费OpenAPI接口规范集合V1.1-202109.docx",
    sourcePath: "E:\\工作文件\\协议汇总\\CRM接口协议汇总\\计费直充接口能力\\20220114计费OpenAPI接口规范集合V1.1-202109.docx",
  });
  const pathOk = pathScore >= 0.78;
  console.log(`${pathOk ? "PASS" : "FAIL"} [topic] metadata path match 计费: ${pathScore.toFixed(3)}`);
  if (pathOk) pass += 1;

  const chunks = [
    { id: "c1", docId: "d1", docName: "计费上云接口调整协议.doc", text: '{"chargeShouldPay":20900}' },
    { id: "c2", docId: "d1", docName: "计费上云接口调整协议.doc", text: '{"chargeDiscount":0}' },
    { id: "c3", docId: "d2", docName: "20220114计费OpenAPI接口规范集合V1.1-202109.docx", text: "OpenAPI 规范说明" },
    { id: "c4", docId: "d3", docName: "计费直充接口说明.docx", text: "计费直充能力接入" },
  ];
  const docs = [
    { id: "d1", name: "计费上云接口调整协议.doc", sourcePath: "E:\\协议\\计费协议\\计费上云接口调整协议.doc" },
    {
      id: "d2",
      name: "20220114计费OpenAPI接口规范集合V1.1-202109.docx",
      sourcePath: "E:\\协议\\计费直充\\20220114计费OpenAPI接口规范集合V1.1-202109.docx",
    },
    { id: "d3", name: "计费直充接口说明.docx", sourcePath: "E:\\协议\\计费直充\\计费直充接口说明.docx" },
  ];
  const getMeta = (c) => {
    const doc = docs.find((d) => d.id === c.docId) || {};
    return { docName: c.docName, sourcePath: doc.sourcePath || "" };
  };
  const metaHits = scanMetadataHits(chunks, "计费", { limit: 10, getMeta, minMetadataScore: 0.68, dedupeByDoc: true });
  const metaDocs = new Set(metaHits.map((h) => h.docId));
  const metaOk = metaHits.length >= 2 && metaDocs.size === metaHits.length;
  console.log(`${metaOk ? "PASS" : "FAIL"} [topic] metadata dedupe docs=${metaDocs.size} hits=${metaHits.length}`);
  if (metaOk) pass += 1;

  const vectorHits = [
    { chunkId: "c1", docId: "d1", docName: "计费上云接口调整协议.doc", text: chunks[0].text, vectorScore: 0.72 },
    { chunkId: "c2", docId: "d1", docName: "计费上云接口调整协议.doc", text: chunks[1].text, vectorScore: 0.71 },
  ];
  const fused = mergeAndFuseHits(vectorHits, [], "计费", true, 0.22, {
    metadataHits: metaHits,
    queryType: "topic_keyword",
    useRrf: true,
    metadataWeight: 0.42,
  });
  const diversified = diversifySearchHits(fused, 3, { maxPerDoc: 1 });
  const diverseDocs = new Set(diversified.map((h) => h.docId));
  const diverseOk = diversified.length >= 2 && diverseDocs.size === diversified.length;
  console.log(`${diverseOk ? "PASS" : "FAIL"} [topic] diversify top3 unique docs=${diverseDocs.size}`);
  if (diverseOk) pass += 1;

  const fieldBoost = computeFieldBoost("计费", {
    docName: "20220114计费OpenAPI接口规范集合V1.1-202109.docx",
    sourcePath: "E:\\协议\\计费直充\\20220114计费OpenAPI接口规范集合V1.1-202109.docx",
    text: "OpenAPI",
  }, "topic_keyword");
  const boostOk = fieldBoost >= 0.4;
  console.log(`${boostOk ? "PASS" : "FAIL"} [topic] field boost: ${fieldBoost.toFixed(3)}`);
  if (boostOk) pass += 1;

  return { pass, total: 6 };
}

function main() {
  const args = parseArgs(process.argv);
  const parts = [
    runKeywordFixture(),
    runDocRefFixture(),
    runSectionFixture(),
    runMetadataFixture(),
    runHybridFixture(),
    runRrfFixture(),
    runFtsFixture(),
    runIncrementalFixture(),
    runSqliteFixture(),
    runAutoLearnFixture(),
    runTopicKeywordFixture(),
    runGoldenFile(path.resolve(args.golden)),
  ];
  const pass = parts.reduce((n, x) => n + x.pass, 0);
  const total = parts.reduce((n, x) => n + x.total, 0);
  console.log(`\nSummary: ${pass}/${total} passed`);
  process.exit(pass === total ? 0 : 1);
}

main();
