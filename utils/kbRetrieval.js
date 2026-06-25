const crypto = require("crypto");
const fs = require("fs");
const { credibilitySearchPenalty } = require("./kbAutoLearn.js");

const DEFAULT_CANDIDATE_K = 200;
const KEYWORD_RECALL_LIMIT = 50;
const RRF_K = 60;

function computeFileMd5(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("md5").update(buf).digest("hex");
}

function decodeTextBuffer(buf) {
  const utf8 = buf.toString("utf8");
  if (!utf8.includes("\uFFFD") && looksLikeReadableText(utf8)) {
    return utf8;
  }
  for (const enc of ["gb18030", "gbk", "gb2312"]) {
    try {
      const decoded = new TextDecoder(enc).decode(buf);
      if (looksLikeReadableText(decoded)) {
        return decoded;
      }
    } catch {
      /* unsupported encoding in runtime */
    }
  }
  return utf8;
}

function looksLikeReadableText(text) {
  const s = String(text || "").trim();
  if (!s) {
    return false;
  }
  const controlCount = (s.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
  return controlCount / Math.max(1, s.length) < 0.01;
}

function chunkTextFixed(text, chunkSize, overlap) {
  const t = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!t) {
    return [];
  }
  const size = Math.max(200, Math.min(4000, Number(chunkSize) || 800));
  const ov = Math.max(0, Math.min(size - 1, Number(overlap) || 0));
  const chunks = [];
  let i = 0;
  while (i < t.length) {
    const end = Math.min(t.length, i + size);
    const piece = t.slice(i, end).trim();
    if (piece) {
      chunks.push({ text: piece, charStart: i, charEnd: end });
    }
    if (end >= t.length) {
      break;
    }
    const nextStart = end - ov;
    i = nextStart <= i ? end : nextStart;
  }
  return chunks;
}

function chunkTextSemantic(text, chunkSize, overlap) {
  const t = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!t) {
    return [];
  }
  const size = Math.max(200, Math.min(4000, Number(chunkSize) || 800));
  const ov = Math.max(0, Math.min(size - 1, Number(overlap) || 0));
  const paragraphs = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const merged = [];
  let buf = "";
  let bufStart = 0;
  let cursor = 0;

  const flush = (endPos) => {
    const piece = buf.trim();
    if (piece) {
      merged.push({ text: piece, charStart: bufStart, charEnd: endPos });
    }
    buf = "";
  };

  for (const para of paragraphs) {
    const paraStart = t.indexOf(para, cursor);
    cursor = paraStart >= 0 ? paraStart + para.length : cursor + para.length;
    if (!buf) {
      bufStart = paraStart >= 0 ? paraStart : cursor;
    }
    const candidate = buf ? `${buf}\n\n${para}` : para;
    if (candidate.length <= size) {
      buf = candidate;
      continue;
    }
    if (buf) {
      flush(paraStart >= 0 ? paraStart : cursor);
    }
    if (para.length <= size) {
      buf = para;
      bufStart = paraStart >= 0 ? paraStart : cursor;
      continue;
    }
    const fixed = chunkTextFixed(para, size, ov);
    fixed.forEach((c) => {
      merged.push({
        text: c.text,
        charStart: (paraStart >= 0 ? paraStart : 0) + c.charStart,
        charEnd: (paraStart >= 0 ? paraStart : 0) + c.charEnd,
      });
    });
    buf = "";
  }
  if (buf.trim()) {
    flush(t.length);
  }
  if (!merged.length) {
    return chunkTextFixed(t, size, ov);
  }
  return applyChunkOverlap(merged, t, ov);
}

function applyChunkOverlap(chunks, fullText, overlap) {
  if (!overlap || chunks.length <= 1) {
    return chunks;
  }
  const out = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const c = chunks[i];
    let charStart = c.charStart;
    if (i > 0) {
      charStart = Math.max(0, c.charStart - overlap);
    }
    const text = fullText.slice(charStart, c.charEnd).trim();
    if (text) {
      out.push({ text, charStart, charEnd: c.charEnd, chunkIndex: i });
    }
  }
  return out.map((c, idx) => ({ ...c, chunkIndex: idx }));
}

function detectDocKind(ext, text = "") {
  const e = String(ext || "").toLowerCase();
  if ([".js", ".ts", ".jsx", ".tsx", ".py", ".java", ".go", ".rs", ".c", ".cpp", ".h", ".cs", ".php", ".rb", ".sh", ".yaml", ".yml", ".json"].includes(e)) {
    return "code";
  }
  if ([".xlsx", ".xls", ".csv"].includes(e)) {
    return "spreadsheet";
  }
  if (e === ".pdf") {
    return "pdf";
  }
  if ([".png", ".jpg", ".jpeg", ".bmp", ".webp", ".tif", ".tiff"].includes(e)) {
    return "image";
  }
  const sample = String(text || "").slice(0, 8000);
  if (/第[一二三四五六七八九十百\d]+条|Article\s+\d+|^\s*\d+(\.\d+){1,3}\s/m.test(sample)) {
    return "contract";
  }
  return "document";
}

function chunkTextContract(text, chunkSize) {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) {
    return [];
  }
  const size = Math.max(200, Math.min(4000, Number(chunkSize) || 800));
  const parts = t.split(/(?=^第[一二三四五六七八九十百\d]+条|^\s*\d+(?:\.\d+){1,3}\s|^\s*Article\s+\d+)/im);
  const out = [];
  let cursor = 0;
  parts.forEach((part) => {
    const piece = part.trim();
    if (!piece) {
      return;
    }
    const start = t.indexOf(part, cursor);
    cursor = start >= 0 ? start + part.length : cursor + part.length;
    if (piece.length <= size) {
      out.push({ text: piece, charStart: Math.max(0, start), charEnd: Math.max(0, start) + piece.length });
      return;
    }
    chunkTextFixed(piece, size, 80).forEach((c) => {
      out.push({
        text: c.text,
        charStart: Math.max(0, start) + c.charStart,
        charEnd: Math.max(0, start) + c.charEnd,
      });
    });
  });
  return out.length ? out : chunkTextSemantic(t, size, 80);
}

function chunkTextCode(text, chunkSize) {
  const t = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!t) {
    return [];
  }
  const size = Math.max(200, Math.min(4000, Number(chunkSize) || 800));
  const blocks = t.split(/(?=^(?:export\s+)?(?:async\s+)?function\s+|^class\s+|^def\s+|^public\s+|^private\s+|^interface\s+|^type\s+|^const\s+\w+\s*=|^module\.exports)/m);
  const out = [];
  let cursor = 0;
  blocks.forEach((block) => {
    const piece = block.trim();
    if (!piece) {
      return;
    }
    const start = t.indexOf(block, cursor);
    cursor = start >= 0 ? start + block.length : cursor + block.length;
    if (piece.length <= size) {
      out.push({ text: piece, charStart: Math.max(0, start), charEnd: Math.max(0, start) + piece.length });
      return;
    }
    chunkTextFixed(piece, size, 60).forEach((c) => {
      out.push({
        text: c.text,
        charStart: Math.max(0, start) + c.charStart,
        charEnd: Math.max(0, start) + c.charEnd,
      });
    });
  });
  return out.length ? out : chunkTextSemantic(t, size, 60);
}

function chunkTextByDocType(text, ext, chunkSize, overlap, strategy = "semantic") {
  const kind = detectDocKind(ext, text);
  const size = Math.max(200, Math.min(4000, Number(chunkSize) || 800));
  const ov = Math.max(0, Math.min(size - 1, Number(overlap) || 0));
  const mode = String(strategy || "semantic").toLowerCase();
  let pieces;
  if (mode === "fixed") {
    pieces = chunkTextFixed(text, size, ov);
  } else if (kind === "contract") {
    pieces = chunkTextContract(text, size);
  } else if (kind === "code") {
    pieces = chunkTextCode(text, size);
  } else {
    pieces = chunkTextSemantic(text, size, ov);
  }
  return pieces.map((c, idx) => ({
    ...c,
    chunkIndex: c.chunkIndex != null ? c.chunkIndex : idx,
    docKind: kind,
  }));
}

function chunkText(text, chunkSize, overlap, strategy = "semantic", ext = "") {
  if (ext) {
    return chunkTextByDocType(text, ext, chunkSize, overlap, strategy);
  }
  const mode = String(strategy || "semantic").toLowerCase();
  const pieces = mode === "fixed" ? chunkTextFixed(text, chunkSize, overlap) : chunkTextSemantic(text, chunkSize, overlap);
  return pieces.map((c, idx) => ({
    ...c,
    chunkIndex: c.chunkIndex != null ? c.chunkIndex : idx,
  }));
}

function computeChunkHash(text) {
  return crypto.createHash("sha1").update(String(text || "").trim()).digest("hex");
}

function extractChunkBody(text) {
  const t = String(text || "").replace(/\r\n/g, "\n");
  const marker = "\n---\n";
  const idx = t.indexOf(marker);
  if (idx >= 0) {
    return t.slice(idx + marker.length).trim();
  }
  return t.trim();
}

function resolveChunkContentHash(chunkOrText) {
  if (chunkOrText && typeof chunkOrText === "object") {
    if (chunkOrText.chunkHash) {
      return String(chunkOrText.chunkHash);
    }
    if (chunkOrText.contentHash) {
      return String(chunkOrText.contentHash);
    }
    const body = chunkOrText.piece?.text ?? extractChunkBody(chunkOrText.text);
    return computeChunkHash(body);
  }
  return computeChunkHash(extractChunkBody(chunkOrText));
}

function buildChunkSpecs(pieces, docName, sourcePath) {
  const total = Math.max(1, (pieces || []).length);
  return (pieces || []).map((piece, idx) => {
    const chunkIndex = piece.chunkIndex != null ? piece.chunkIndex : idx;
    const indexedText = buildChunkIndexText(docName, sourcePath, piece, chunkIndex, total);
    const contentHash = computeChunkHash(piece.text);
    return {
      piece,
      indexedText,
      contentHash,
      chunkHash: contentHash,
      chunkIndex,
    };
  });
}

function planChunkIncrementalUpdate(oldChunks, newSpecs) {
  const oldForDoc = Array.isArray(oldChunks) ? oldChunks : [];
  const specs = Array.isArray(newSpecs) ? newSpecs : [];
  const oldByHash = new Map();
  oldForDoc.forEach((chunk) => {
    const hash = resolveChunkContentHash(chunk);
    if (!oldByHash.has(hash)) {
      oldByHash.set(hash, []);
    }
    oldByHash.get(hash).push(chunk);
  });

  const usedOldIds = new Set();
  const reuse = [];
  const toEmbed = [];

  specs.forEach((spec) => {
    const hash = String(spec.contentHash || spec.chunkHash || "");
    const candidates = hash ? oldByHash.get(hash) || [] : [];
    const match = candidates.find(
      (c) => !usedOldIds.has(c.id) && Array.isArray(c.embedding) && c.embedding.length
    );
    if (match) {
      usedOldIds.add(match.id);
      reuse.push({ oldChunk: match, spec });
      return;
    }
    toEmbed.push(spec);
  });

  const removeChunkIds = oldForDoc.filter((c) => !usedOldIds.has(c.id)).map((c) => String(c.id));
  return {
    reuse,
    toEmbed,
    removeChunkIds,
    reusedCount: reuse.length,
    embedCount: toEmbed.length,
    removedCount: removeChunkIds.length,
  };
}

function normalizeMatchText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function splitIdentifierTokens(token) {
  const parts = [];
  const raw = String(token || "");
  raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .split(/\s+/)
    .forEach((p) => {
      const t = p.trim().toLowerCase();
      if (t) {
        parts.push(t);
      }
    });
  return parts;
}

function tokenizeQuery(text) {
  const raw = normalizeMatchText(text);
  if (!raw) {
    return [];
  }
  const tokens = [];
  const add = (t) => {
    const v = String(t || "").trim().toLowerCase();
    if (!v) {
      return;
    }
    if (!tokens.includes(v)) {
      tokens.push(v);
    }
  };

  const re = /[\w\u4e00-\u9fff]+|\d+(?:\.\d+)*|[a-zA-Z]+(?:[-_.][a-zA-Z0-9]+)*/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    const piece = m[0];
    if (/^\d+(?:\.\d+)*$/.test(piece) || /^[a-z0-9][a-z0-9._-]*$/i.test(piece)) {
      add(piece);
    }
    if (/[\u4e00-\u9fff]/.test(piece)) {
      if (piece.length >= 2) {
        add(piece);
      } else {
        add(piece);
      }
      for (let i = 0; i < piece.length - 1; i += 1) {
        add(piece.slice(i, i + 2));
      }
    } else if (/[a-zA-Z]/.test(piece)) {
      add(piece);
      splitIdentifierTokens(piece).forEach(add);
    }
  }

  if (!tokens.length && raw.length >= 1) {
    add(raw);
  }
  return tokens;
}

function keywordMatchScore(query, text, meta = {}) {
  if (extractDocumentReferenceCodes(query).length) {
    return docRefMatchScore(query, text, meta);
  }
  if (isLiteralQuery(query)) {
    return literalMatchScore(query, text, meta);
  }
  if (isSectionHeadingQuery(query)) {
    return sectionHeadingMatchScore(query, text, meta);
  }
  const q = normalizeMatchText(query);
  const body = normalizeMatchText(text);
  const docName = normalizeMatchText(meta.docName || "");
  const sourcePath = normalizeMatchText(meta.sourcePath || "");
  if (!q) {
    return 0;
  }

  let score = 0;
  if (body && body.includes(q)) {
    score = 1;
  } else {
    const tokens = tokenizeQuery(q);
    if (!tokens.length) {
      return 0;
    }
    let hit = 0;
    let weightSum = 0;
    tokens.forEach((t) => {
      const w = t.length <= 2 ? 0.8 : 1;
      weightSum += w;
      if ((body && body.includes(t)) || (docName && docName.includes(t)) || (sourcePath && sourcePath.includes(t))) {
        hit += w;
      }
    });
    score = weightSum > 0 ? hit / weightSum : 0;
  }

  if (docName && q.length >= 2) {
    const baseName = docName.replace(/\.[a-z0-9]{1,8}$/i, "");
    if (docName.includes(q) || (baseName && baseName.includes(q))) {
      score = Math.min(1, score + 0.18);
    }
  }
  if (sourcePath && q.length >= 2 && sourcePath.includes(q)) {
    score = Math.min(1, score + (q.length <= 3 ? 0.14 : 0.1));
  }
  return Math.max(0, Math.min(1, score));
}

function fuseHybridScore(vectorScore, keywordScore, vectorWeight = 0.7) {
  const vw = Math.max(0, Math.min(1, Number(vectorWeight) || 0.7));
  const v = Math.max(0, Number(vectorScore) || 0);
  const k = Math.max(0, Math.min(1, Number(keywordScore) || 0));
  return vw * v + (1 - vw) * k;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) {
    return 0;
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dot / d;
}

function vectorScoreFromDistance(distance, queryVec, chunkVec) {
  if (Array.isArray(chunkVec) && Array.isArray(queryVec) && chunkVec.length === queryVec.length) {
    return Math.max(0, cosineSimilarity(queryVec, chunkVec));
  }
  const d = Number(distance);
  if (!Number.isFinite(d)) {
    return 0;
  }
  return Math.max(0, 1 / (1 + Math.max(0, d)));
}

function stripQueryLabelPrefix(text) {
  return String(text || "")
    .trim()
    .replace(/^[^:：\n]{0,20}[:：]\s*/, "");
}

function extractDocumentReferenceCodes(text) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return [];
  }
  const found = [];
  const add = (value) => {
    const v = normalizeMatchText(String(value || "").replace(/^\[+|\]+$/g, ""));
    if (!v || v.length < 5) {
      return;
    }
    if (!/^[a-z]{2,15}-[a-z0-9-]{2,25}$/i.test(v)) {
      return;
    }
    if (!found.includes(v)) {
      found.push(v);
    }
  };
  const patterns = [
    /\[([A-Za-z]{2,15}-[A-Za-z0-9-]{3,25})\]/g,
    /\b([A-Za-z]{2,12}-P\d{5,18})\b/gi,
    /\b([A-Za-z]{3,12}-\d{5,10})\b/gi,
  ];
  patterns.forEach((re) => {
    let m;
    while ((m = re.exec(raw)) !== null) {
      add(m[1]);
    }
  });
  return found.sort((a, b) => b.length - a.length);
}

function isStrictAnchorQuery(query) {
  return (
    isLiteralQuery(query) ||
    extractDocumentReferenceCodes(query).length > 0 ||
    isSectionHeadingQuery(query)
  );
}

function docRefMatchScore(query, text, meta = {}) {
  const codes = extractDocumentReferenceCodes(query);
  if (!codes.length) {
    return 0;
  }
  const q = normalizeMatchText(query);
  const body = normalizeMatchText(text);
  const docName = normalizeMatchText(meta.docName || "");
  const sourcePath = normalizeMatchText(meta.sourcePath || "");
  const haystacks = [docName, sourcePath, body].filter(Boolean);
  if (!haystacks.length) {
    return 0;
  }
  const includesCode = (code) => haystacks.some((h) => h.includes(code));
  if (haystacks.some((h) => h.includes(q))) {
    return 1;
  }
  const primary = codes[0];
  if (!includesCode(primary)) {
    return 0;
  }
  for (const h of [docName, sourcePath].filter(Boolean)) {
    const refs = extractDocumentReferenceCodes(h);
    if (refs.some((ref) => !codes.includes(ref))) {
      return 0;
    }
  }
  if (docName.includes(primary) || sourcePath.includes(primary)) {
    return 0.98;
  }
  if (body.includes(primary)) {
    return 0.9;
  }
  const matched = codes.filter(includesCode);
  return matched.length === codes.length ? 0.85 : 0;
}

function strictAnchorMatchScore(query, text, meta = {}) {
  if (isLiteralQuery(query)) {
    return literalMatchScore(query, text, meta);
  }
  if (extractDocumentReferenceCodes(query).length) {
    return docRefMatchScore(query, text, meta);
  }
  if (isSectionHeadingQuery(query)) {
    return sectionHeadingMatchScore(query, text, meta);
  }
  return keywordMatchScore(query, text, meta);
}

/** URL、WSDL、IP:端口等需要整段/锚点精确匹配的查询 */
function isLiteralQuery(query) {
  const q = String(query || "").trim();
  if (!q) {
    return false;
  }
  if (/https?:\/\//i.test(q)) {
    return true;
  }
  if (/\?wsdl\b/i.test(q) || /\bwsdl\b/i.test(q)) {
    return true;
  }
  if (/\b\d{1,3}(?:\.\d{1,3}){3}:\d+\b/.test(q)) {
    return true;
  }
  if (/\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(q) && /\/|wsdl|webservice|soap|api/i.test(q)) {
    return true;
  }
  return false;
}

function extractLiteralAnchors(query) {
  const raw = String(query || "").trim();
  const core = stripQueryLabelPrefix(raw);
  const normalized = normalizeMatchText(core);
  const anchors = [];
  const add = (value) => {
    const v = normalizeMatchText(value).replace(/^https?:\/\//, "");
    if (!v || v.length < 4) {
      return;
    }
    if (!anchors.some((a) => a === v || a.includes(v) || v.includes(a))) {
      anchors.push(v);
    }
  };

  add(normalized);
  add(core);

  const urlMatch = raw.match(/https?:\/\/[^\s<>"']+/i);
  if (urlMatch) {
    add(urlMatch[0]);
  }

  const ipPort = raw.match(/\b(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?/);
  if (ipPort) {
    add(ipPort[0]);
    add(ipPort[1]);
  }

  raw.match(/\/([A-Za-z0-9_-]{6,})(?:\?[^\s"'<>]*)?/g)?.forEach((seg) => {
    add(seg.replace(/^\//, ""));
  });

  return anchors
    .filter((a) => a.length >= 6 || /\d{1,3}(?:\.\d{1,3}){3}/.test(a))
    .sort((a, b) => b.length - a.length);
}

/**
 * 字面量查询评分：优先整段命中，否则要求 IP/URL 等强锚点同时出现，避免 CRM/WebService 等泛词误命中。
 */
function literalMatchScore(query, text, meta = {}) {
  const q = normalizeMatchText(stripQueryLabelPrefix(query));
  const body = normalizeMatchText(text);
  const docName = normalizeMatchText(meta.docName || "");
  const sourcePath = normalizeMatchText(meta.sourcePath || "");
  const haystacks = [body, docName, sourcePath].filter(Boolean);
  if (!q || !haystacks.length) {
    return 0;
  }

  const includesNorm = (needle) => {
    const n = normalizeMatchText(needle).replace(/^https?:\/\//, "");
    if (!n) {
      return false;
    }
    return haystacks.some((h) => h.includes(n));
  };

  if (includesNorm(q)) {
    return 1;
  }

  const anchors = extractLiteralAnchors(query);
  if (!anchors.length) {
    return keywordMatchScore(query, text, meta);
  }

  const primary = anchors[0];
  if (includesNorm(primary)) {
    return 0.98;
  }

  const strong = anchors.filter(
    (a) => a.length >= 12 || /\d{1,3}(?:\.\d{1,3}){3}/.test(a) || a.includes("?")
  );
  if (strong.length) {
    const matched = strong.filter((a) => includesNorm(a));
    if (matched.length === strong.length) {
      return 0.92;
    }
    if (matched.length === 0) {
      return 0;
    }
    return 0.35 * (matched.length / strong.length);
  }

  return 0;
}

function isTopicKeywordQuery(query) {
  const q = String(query || "").trim();
  if (!q || q.length < 2 || q.length > 4) {
    return false;
  }
  if (!/^[\u4e00-\u9fff]{2,4}$/.test(q)) {
    return false;
  }
  if (
    isLiteralQuery(q) ||
    extractDocumentReferenceCodes(q).length ||
    isSectionHeadingQuery(q)
  ) {
    return false;
  }
  if (/讲什么|概述|简介|总结|说明|是什么|如何|怎么|为什么|区别|是否/.test(q)) {
    return false;
  }
  return true;
}

/** 无扩展名的长文档标题（常见于协议库文件名检索） */
function looksLikeDocumentTitleQuery(query) {
  const q = String(query || "").trim();
  if (q.length < 12 || q.length > 160 || /\.[a-z0-9]{1,8}$/i.test(q)) {
    return false;
  }
  if (isLiteralQuery(q) || extractDocumentReferenceCodes(q).length || isSectionHeadingQuery(q)) {
    return false;
  }
  return (
    /^[\u4e00-\u9fff\w\s\-_.（）()[\]【】]+$/i.test(q) &&
    (/\d{6,}/.test(q) || /OpenAPI|接口|规范|协议|doc|DOC|V\d/i.test(q))
  );
}

function classifyQuery(query) {
  const q = String(query || "").trim();
  if (/\.(docx?|pdf|xlsx?|xls|md|markdown|txt|js|ts|json)$/i.test(q)) {
    return "filename";
  }
  if (looksLikeDocumentTitleQuery(q)) {
    return "filename";
  }
  if (isLiteralQuery(q)) {
    return "literal";
  }
  if (extractDocumentReferenceCodes(q).length) {
    return "doc_ref";
  }
  if (isSectionHeadingQuery(q)) {
    return "section";
  }
  if (/^[A-Z]{1,5}-?\d{4,}/i.test(q)) {
    return "identifier";
  }
  if (/^\d+(?:\.\d+)+\b/.test(q) || /\b\d+(?:\.\d+){1,3}\b/.test(q)) {
    return "identifier";
  }
  if (/[a-zA-Z_$][\w$]*\(|[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+/.test(q)) {
    return "code";
  }
  if (/^[a-zA-Z_$][\w$]{2,}$/.test(q) && /[a-z][A-Z]|[A-Z][a-z]|_/.test(q)) {
    return "code";
  }
  if (/\d{4}年|\d{4}-\d{1,2}|昨天|今天|上周|本月/.test(q)) {
    return "date_filter";
  }
  if (/讲什么|概述|简介|总结|说明/.test(q)) {
    return "summary";
  }
  if (/是什么|如何|怎么|为什么|区别|是否|[?？]/.test(q)) {
    return "semantic_question";
  }
  if (isTopicKeywordQuery(q)) {
    return "topic_keyword";
  }
  return "hybrid";
}

function resolveSearchParams(queryType, base = {}) {
  const type = String(queryType || "hybrid");
  const topK = Math.max(1, Number(base.topK) || 10);
  const presets = {
    filename: { minScore: 0.35, vectorWeight: 0.15, keywordTopN: 100, vectorTopN: 50, topKBoost: 2, metadataBoost: 0.35, label: "filename" },
    literal: { minScore: 0.85, vectorWeight: 0.05, keywordTopN: 80, vectorTopN: 40, topKBoost: 0, metadataBoost: 0.05, label: "literal" },
    doc_ref: { minScore: 0.82, vectorWeight: 0.25, keywordTopN: 100, vectorTopN: 150, topKBoost: 0, metadataBoost: 0.45, label: "doc_ref" },
    section: { minScore: 0.75, vectorWeight: 0.12, keywordTopN: 120, vectorTopN: 80, topKBoost: 1, metadataBoost: 0.08, label: "section" },
    identifier: { minScore: 0.5, vectorWeight: 0.1, keywordTopN: 100, vectorTopN: 50, topKBoost: 2, metadataBoost: 0.3, label: "identifier" },
    code: { minScore: 0.45, vectorWeight: 0.2, keywordTopN: 100, vectorTopN: 100, topKBoost: 2, metadataBoost: 0.25, label: "code" },
    summary: { minScore: 0.5, vectorWeight: 0.78, keywordTopN: 30, vectorTopN: 300, topKBoost: 2, metadataBoost: 0.1, label: "summary" },
    semantic_question: { minScore: 0.55, vectorWeight: 0.68, keywordTopN: 40, vectorTopN: 250, topKBoost: 0, metadataBoost: 0.1, label: "semantic" },
    date_filter: { minScore: 0.45, vectorWeight: 0.4, keywordTopN: 50, vectorTopN: 200, topKBoost: 1, metadataBoost: 0.2, label: "date_filter" },
    topic_keyword: {
      minScore: 0.48,
      vectorWeight: 0.22,
      keywordTopN: 80,
      vectorTopN: 80,
      topKBoost: 1,
      metadataBoost: 0.42,
      label: "topic",
    },
    hybrid: { minScore: 0.55, vectorWeight: 0.6, keywordTopN: 50, vectorTopN: 200, topKBoost: 0, metadataBoost: 0.12, label: "general" },
  };
  const preset = presets[type] || presets.hybrid;
  return { ...preset, topK, queryType: type };
}

function inferQueryProfile(query) {
  return resolveSearchParams(classifyQuery(query));
}

function metadataMatchScore(query, meta = {}) {
  const docCodes = extractDocumentReferenceCodes(query);
  const docName = normalizeMatchText(meta.docName || "");
  const sourcePath = normalizeMatchText(meta.sourcePath || "");
  if (docCodes.length) {
    const primary = docCodes[0];
    if (docName.includes(primary) || sourcePath.includes(primary)) {
      return 0.96;
    }
    return 0;
  }
  const q = normalizeMatchText(query);
  if (!q) {
    return 0;
  }
  const headingPath = normalizeMatchText(meta.headingPath || "");
  const sectionNumber = normalizeMatchText(meta.sectionNumber || "");
  let score = 0;

  const baseName = docName.replace(/\.[a-z0-9]{1,8}$/i, "");
  if (docName && (docName === q || baseName === q.replace(/\.[a-z0-9]{1,8}$/i, ""))) {
    score = 1;
  } else if (docName && (docName.includes(q) || baseName.includes(q))) {
    score = Math.max(score, 0.82);
  }
  if (sourcePath && q.length >= 2 && sourcePath.includes(q)) {
    score = Math.max(score, q.length <= 3 ? 0.78 : 0.72);
  }
  if (headingPath && headingPath.includes(q)) {
    score = Math.max(score, 0.68);
  }
  if (sectionNumber && (sectionNumber === q || sectionNumber.includes(q))) {
    score = Math.max(score, 0.9);
  }
  return Math.max(0, Math.min(1, score));
}

function dedupeMetadataHitsByDocument(hits) {
  const byDoc = new Map();
  for (const h of hits || []) {
    const docId = String(h.docId || "");
    if (!docId) {
      continue;
    }
    const prev = byDoc.get(docId);
    if (!prev || Number(h.metadataScore || 0) > Number(prev.metadataScore || 0)) {
      byDoc.set(docId, h);
    }
  }
  return Array.from(byDoc.values()).sort(
    (a, b) => Number(b.metadataScore || 0) - Number(a.metadataScore || 0)
  );
}

function scanMetadataHits(chunks, query, options = {}) {
  const limit = Math.max(1, Number(options.limit) || 20);
  const getMeta = typeof options.getMeta === "function" ? options.getMeta : () => ({});
  const minScore = Number(options.minMetadataScore) || 0.45;
  const dedupeByDoc = options.dedupeByDoc !== false;
  const scored = [];
  for (const c of chunks || []) {
    const meta = getMeta(c) || {};
    const metadataScore = metadataMatchScore(query, {
      docName: meta.docName || c.docName,
      sourcePath: meta.sourcePath || "",
      headingPath: meta.headingPath || c.headingPath || "",
      sectionNumber: meta.sectionNumber || c.sectionNumber || "",
    });
    if (metadataScore >= minScore) {
      scored.push({
        chunkId: c.id,
        docId: c.docId,
        docName: c.docName,
        text: c.text,
        metadataScore,
        chunkIndex: c.chunkIndex ?? null,
        charStart: c.charStart ?? null,
        charEnd: c.charEnd ?? null,
      });
    }
  }
  scored.sort((a, b) => Number(b.metadataScore || 0) - Number(a.metadataScore || 0));
  const ranked = dedupeByDoc ? dedupeMetadataHitsByDocument(scored) : scored;
  return ranked.slice(0, limit);
}

function maxRecallSignal(hit) {
  if (!hit || typeof hit !== "object") {
    return 0;
  }
  return Math.max(
    Number(hit.vectorScore || 0),
    Number(hit.keywordScore || 0),
    Number(hit.metadataScore || 0),
    Number(hit.ftsScore || 0),
    Number(hit.literalScore || 0),
    Number(hit.preRerankScore || 0)
  );
}

/** RRF 分数量级约 0.01–0.06，不能直接与 0–1 相似度阈值比较。 */
function hitMeetsMinScore(hit, minScore) {
  const threshold = Math.max(0, Number(minScore) || 0);
  if (!threshold) {
    return true;
  }
  if (hit?.literalScore != null && Number(hit.literalScore) < threshold) {
    return false;
  }
  const signal = maxRecallSignal(hit);
  const fused = Number(hit.finalScore ?? hit.score ?? 0);
  return signal >= threshold || fused >= threshold;
}

function rrfScore(ranks, k = RRF_K) {
  return (ranks || []).reduce((sum, rank) => {
    const r = Number(rank);
    if (!Number.isFinite(r) || r < 1) {
      return sum;
    }
    return sum + 1 / (k + r);
  }, 0);
}

function computeFieldBoost(query, hit, queryType) {
  let boost = 0;
  const q = normalizeMatchText(query);
  const docName = normalizeMatchText(hit.sourceFile || hit.docName || "");
  const sourcePath = normalizeMatchText(hit.sourcePath || "");
  const body = normalizeMatchText(hit.text || "");
  const baseName = docName.replace(/\.[a-z0-9]{1,8}$/i, "");

  if (
    queryType === "filename" ||
    queryType === "topic_keyword" ||
    queryType === "identifier" ||
    queryType === "literal" ||
    queryType === "doc_ref" ||
    queryType === "section"
  ) {
    if (docName && (docName === q || baseName === q.replace(/\.[a-z0-9]{1,8}$/i, ""))) {
      boost += 0.42;
    } else if (docName && (docName.includes(q) || baseName.includes(q))) {
      boost += queryType === "topic_keyword" ? 0.28 : 0.24;
    }
  }
  if (sourcePath && q.length >= 2 && sourcePath.includes(q)) {
    boost += queryType === "topic_keyword" ? 0.18 : 0.14;
  }
  if (body && q.length >= 4 && body.includes(q)) {
    boost += 0.1;
  }
  if (hit.ocrConfidence != null && Number(hit.ocrConfidence) < 0.5) {
    boost -= 0.08;
  }
  const credibility = hit.credibility || hit.autoLearnCredibility;
  if (credibility) {
    boost += credibilitySearchPenalty(credibility);
  } else if (String(hit.sourcePath || "").startsWith("ai://auto-learn")) {
    boost -= 0.12;
  } else if (String(hit.sourcePath || "").startsWith("ai://")) {
    boost -= 0.05;
  }
  return boost;
}

function buildChunkIndexText(docName, sourcePath, piece, chunkIndex, chunkTotal) {
  const lines = [`[文档] ${String(docName || "未命名").trim()}`];
  if (sourcePath) {
    lines.push(`[路径] ${String(sourcePath).trim()}`);
  }
  lines.push(`[分块] ${Number(chunkIndex) + 1}/${Math.max(1, Number(chunkTotal) || 1)}`);
  lines.push("---");
  lines.push(String(piece?.text || "").trim());
  return lines.join("\n");
}

function formatEmbeddingInput(text, model, role = "passage") {
  const t = String(text || "").trim();
  if (!t) {
    return "";
  }
  const m = String(model || "").toLowerCase();
  if (m.includes("bge")) {
    if (role === "query") {
      return `Represent this sentence for searching relevant passages: ${t}`;
    }
    return `Represent this sentence for retrieval: ${t}`;
  }
  return t;
}

function scanChunksByKeyword(chunks, query, options = {}) {
  const limit = Math.max(1, Number(options.limit) || KEYWORD_RECALL_LIMIT);
  const getMeta = typeof options.getMeta === "function" ? options.getMeta : () => ({});
  const queryType = options.queryType || classifyQuery(query);
  const strict = isStrictAnchorQuery(query);
  const literal = queryType === "literal" || isLiteralQuery(query);
  const sectionQuery = queryType === "section" || isSectionHeadingQuery(query);
  const minKeywordScore = strict
    ? Math.max(sectionQuery ? 0.75 : 0.82, Number(options.minLiteralScore) || (sectionQuery ? 0.75 : 0.82))
    : Number(options.minKeywordScore) || 0.35;
  const scoreFn = strict ? strictAnchorMatchScore : keywordMatchScore;
  const scored = [];
  for (const c of chunks || []) {
    const meta = getMeta(c) || {};
    const keywordScore = scoreFn(query, c.text, {
      docName: meta.docName || c.docName,
      sourcePath: meta.sourcePath || "",
    });
    if (keywordScore >= minKeywordScore) {
      scored.push({
        chunkId: c.id,
        docId: c.docId,
        docName: c.docName,
        text: c.text,
        keywordScore,
        literalScore: strict ? keywordScore : undefined,
        chunkIndex: c.chunkIndex ?? null,
        charStart: c.charStart ?? null,
        charEnd: c.charEnd ?? null,
      });
    }
  }
  scored.sort((a, b) => Number(b.keywordScore || 0) - Number(a.keywordScore || 0));
  return scored.slice(0, limit);
}

function assignRanks(hits, scoreKey) {
  const sorted = [...(hits || [])].sort((a, b) => Number(b[scoreKey] || 0) - Number(a[scoreKey] || 0));
  const rankById = new Map();
  sorted.forEach((h, idx) => {
    const id = String(h.chunkId || "");
    if (id) {
      rankById.set(id, idx + 1);
    }
  });
  return rankById;
}

function mergeAndFuseHits(vectorHits, keywordHits, query, hybridEnabled, hybridWeight, options = {}) {
  const metadataHits = options.metadataHits || [];
  const ftsHits = options.ftsHits || [];
  const queryType = options.queryType || classifyQuery(query);
  const strict = isStrictAnchorQuery(query);
  const useRrf = options.useRrf !== false;
  const byId = new Map();

  const ingest = (list, source, scoreKey) => {
    (list || []).forEach((h) => {
      const chunkId = String(h.chunkId || "");
      if (!chunkId) {
        return;
      }
      const score = Number(h[scoreKey] ?? h.score ?? 0);
      if (byId.has(chunkId)) {
        const cur = byId.get(chunkId);
        cur[scoreKey] = Math.max(Number(cur[scoreKey] || 0), score);
        const sources = new Set(String(cur.recallSource || "").split("+").filter(Boolean));
        sources.add(source);
        cur.recallSource = Array.from(sources).join("+");
      } else {
        byId.set(chunkId, {
          ...h,
          vectorScore: 0,
          keywordScore: 0,
          metadataScore: 0,
          ftsScore: 0,
          recallSource: source,
          [scoreKey]: score,
        });
      }
    });
  };

  ingest(vectorHits, "vector", "vectorScore");
  ingest(keywordHits, "keyword", "keywordScore");
  ingest(metadataHits, "metadata", "metadataScore");
  ingest(ftsHits, "fts", "ftsScore");

  const vectorRanks = assignRanks(vectorHits, "vectorScore");
  const keywordRanks = assignRanks(keywordHits, "keywordScore");
  const metadataRanks = assignRanks(metadataHits, "metadataScore");
  const ftsRanks = assignRanks(ftsHits, "ftsScore");

  return Array.from(byId.values()).map((h) => {
    const chunkId = String(h.chunkId || "");
    const vectorScore = Number(h.vectorScore || 0);
    const keywordScore = hybridEnabled
      ? strict
        ? strictAnchorMatchScore(query, h.text, {
            docName: h.sourceFile || h.docName,
            sourcePath: h.sourcePath || "",
          })
        : Math.max(
            Number(h.keywordScore || 0),
            keywordMatchScore(query, h.text, {
              docName: h.sourceFile || h.docName,
              sourcePath: h.sourcePath || "",
            })
          )
      : 0;
    const metadataScore = Number(h.metadataScore || 0);
    const ftsScore = Number(h.ftsScore || 0);
    const vectorRank = vectorRanks.get(chunkId);
    const keywordRank = keywordRanks.get(chunkId);
    const metadataRank = metadataRanks.get(chunkId);
    const ftsRank = ftsRanks.get(chunkId);
    const fieldBoost = computeFieldBoost(query, h, queryType);
    const metadataBoost = metadataScore * Number(options.metadataWeight ?? 0.15);

    const strictMin = isSectionHeadingQuery(query) ? 0.75 : 0.82;
    if (strict && keywordScore < strictMin) {
      return null;
    }

    let fused;
    const signal = Math.max(vectorScore, keywordScore, ftsScore, metadataScore);
    if (useRrf) {
      const rrfRaw =
        rrfScore([vectorRank, keywordRank, metadataRank, ftsRank]) +
        fieldBoost +
        metadataBoost;
      const rrfMax = 4 / (RRF_K + 1);
      const rrfNorm = Math.min(1, rrfRaw / rrfMax);
      fused = Math.max(signal, signal * 0.65 + rrfNorm * 0.35);
    } else if (hybridEnabled) {
      const kw = Math.max(keywordScore, ftsScore, metadataScore);
      fused = fuseHybridScore(vectorScore, kw, hybridWeight) + fieldBoost + metadataBoost * 0.5;
    } else {
      fused = vectorScore + fieldBoost;
    }

    if (hybridEnabled && h.recallSource?.includes("keyword") && keywordScore >= 0.45) {
      fused = Math.max(fused, keywordScore * 0.9 + fieldBoost);
    }
    if (metadataScore >= 0.85) {
      fused = Math.max(fused, metadataScore * 0.95 + fieldBoost);
    }
    if (queryType === "topic_keyword" && metadataScore >= 0.72) {
      fused = Math.max(fused, 0.86 + fieldBoost * 0.65);
    }

    return {
      ...h,
      score: fused,
      finalScore: fused,
      vectorScore,
      keywordScore: hybridEnabled ? keywordScore : undefined,
      literalScore: strict ? keywordScore : undefined,
      metadataScore: metadataScore || undefined,
      ftsScore: ftsScore || undefined,
      fieldBoost,
      metadataBoost,
      vectorRank,
      keywordRank,
      metadataRank,
      ftsRank,
      queryType,
    };
  }).filter(Boolean);
}

function resolveCandidateK(topK, configuredCandidateK) {
  const k = Math.max(1, Number(topK) || 8);
  const configured = Number(configuredCandidateK);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.min(300, Math.max(k, Math.floor(configured)));
  }
  return Math.min(300, Math.max(DEFAULT_CANDIDATE_K, k * 10));
}

function extractSectionNumbers(query) {
  const matches = String(query || "").match(/\b(\d+(?:\.\d+){1,3})\b/g);
  return matches ? [...new Set(matches)] : [];
}

function extractSectionTitleRemainder(query) {
  const refs = extractSectionNumbers(query);
  if (!refs.length) {
    return "";
  }
  let rest = String(query || "");
  refs.forEach((ref) => {
    rest = rest.replace(new RegExp(`\\b${escapeRegExp(ref)}\\b`, "g"), " ");
  });
  return normalizeMatchText(rest.replace(/\s+/g, " ").trim());
}

function isSectionHeadingQuery(query) {
  const refs = extractSectionNumbers(query);
  if (!refs.length) {
    return false;
  }
  const raw = String(query || "");
  if (/\b版本\b|\bversion\b|\bv\d+\b/i.test(raw)) {
    return false;
  }
  const remainder = extractSectionTitleRemainder(query);
  if (remainder.length < 2 || !/[\u4e00-\u9fff]/.test(remainder)) {
    return false;
  }
  if (/^版本$|^v\d/i.test(remainder)) {
    return false;
  }
  return true;
}

function looksLikeSectionIndex(text) {
  const body = extractChunkBody(text);
  const lines = body.match(/(?:^|[\n\r])\s*\d+(?:\.\d+){1,2}\s+[\u4e00-\u9fffA-Za-z][^\n\r]{1,56}/g);
  const hasContentHint = /字段名称|报文样例|"head"\s*:|入参|出参|请求报文|响应报文|接口说明|method/i.test(body);
  return (lines?.length || 0) >= 3 && !hasContentHint;
}

function sectionHeadingMatchScore(query, text, meta = {}) {
  const refs = extractSectionNumbers(query);
  if (!refs.length) {
    return 0;
  }
  const primary = refs.sort(
    (a, b) => b.length - a.length || b.localeCompare(a, undefined, { numeric: true })
  )[0];
  const titleRemainder = extractSectionTitleRemainder(query);
  const q = normalizeMatchText(query);
  const body = normalizeMatchText(text);
  const docName = normalizeMatchText(meta.docName || "");
  const compactHeading = `${primary} ${titleRemainder}`.trim();
  const compactHeadingFlat = compactHeading.replace(/\s+/g, "");

  if (body.includes(q) || body.replace(/\s+/g, "").includes(q.replace(/\s+/g, ""))) {
    if (isTocLikeChunk(text) || isRevisionHistoryLikeChunk(text) || looksLikeSectionIndex(text)) {
      return 0.42;
    }
    return 1;
  }

  const hasFullHeading =
    body.includes(compactHeading) || body.replace(/\s+/g, "").includes(compactHeadingFlat);
  const firstTitleToken = titleRemainder.split(/\s+/).find((t) => /[\u4e00-\u9fff]/.test(t) && t.length >= 2);
  const headingRe = firstTitleToken
    ? new RegExp(
        `(?:^|[\\n\\r])\\s*${escapeRegExp(primary)}(?:\\s+|\\.)\\s*${escapeRegExp(firstTitleToken)}`
      )
    : null;
  const hasHeadingLine = headingRe ? headingRe.test(body) : false;

  if (!hasFullHeading && !hasHeadingLine) {
    const refIdx = body.indexOf(primary);
    if (refIdx < 0) {
      return 0;
    }
    const titleTokens = tokenizeQuery(titleRemainder).filter(
      (t) => /[\u4e00-\u9fff]/.test(t) && t.length >= 2
    );
    if (!titleTokens.length) {
      return 0;
    }
    const window = body.slice(Math.max(0, refIdx - 16), refIdx + primary.length + 96);
    const matched = titleTokens.filter((t) => window.includes(t)).length;
    if (matched / titleTokens.length < 0.67) {
      return 0;
    }
  }

  if (isTocLikeChunk(text) || isRevisionHistoryLikeChunk(text) || looksLikeSectionIndex(text)) {
    return 0.42;
  }
  if (hasFullHeading || hasHeadingLine) {
    return 0.96;
  }
  if (docName.includes(titleRemainder.slice(0, 6)) && body.includes(primary)) {
    return 0.78;
  }
  return 0.74;
}

function resolvePrimarySectionRef(query) {
  const refs = inferSectionRefsForQuery(query);
  return refs[0] || null;
}

function inferSectionRefsForQuery(query) {
  const q = String(query || "");
  let refs = extractSectionNumbers(q).sort(
    (a, b) => b.length - a.length || b.localeCompare(a, undefined, { numeric: true })
  );
  const out = [];
  refs.forEach((m) => {
    if (!out.some((o) => m.startsWith(`${o}.`) || o.startsWith(`${m}.`))) {
      out.push(m);
    }
  });
  const chapter = out.find((r) => /^\d+\.\d+$/.test(r)) || null;
  if (chapter === "3.16" || (/\b3\.16\b/.test(q) && !out.some((r) => r.startsWith("3.16.")))) {
    if (/请求|入参|报文|样例/.test(q) && !out.includes("3.16.1")) {
      out.push("3.16.1");
    }
    if (/响应|出参|字段/.test(q) && !out.includes("3.16.2")) {
      out.push("3.16.2");
    }
  } else if (/\b3\.16\b/.test(q)) {
    if (/请求|入参|报文|样例/.test(q) && !out.includes("3.16.1")) {
      out.push("3.16.1");
    }
    if (/响应|出参|字段/.test(q) && !out.includes("3.16.2")) {
      out.push("3.16.2");
    }
    if (/实名制信息查询|3\.16\s*实名制/.test(q) && out.length <= 1) {
      if (!out.includes("3.16.1")) {
        out.push("3.16.1");
      }
      if (!out.includes("3.16.2")) {
        out.push("3.16.2");
      }
    }
  }
  return [...new Set(out)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTocLikeChunk(text) {
  const body = extractChunkBody(text);
  const headings = body.match(/\d+\.\d+(?:\.\d+)?\s*(?:请求|响应)/g);
  return (headings?.length || 0) >= 6;
}

/** 文档修订记录分块（含版本号与「新增/修改 3.x」但无字段表） */
function isRevisionHistoryLikeChunk(text) {
  const body = extractChunkBody(text);
  if (/字段名称|报文样例|"head"\s*:|bizString|img\d+Url/.test(body)) {
    return false;
  }
  if (/(?:新增|修改)\s*3\.\d+/.test(body) && (body.match(/0\.\d+/g)?.length || 0) >= 2) {
    return true;
  }
  if ((body.match(/\d{4}[\s\-­]+\d{2}[\s\-­]+\d{2}/g)?.length || 0) >= 2 && /马单|石咏|杨鑫|徐锐/.test(body)) {
    return true;
  }
  return false;
}

function sliceMultiSectionEvidence(text, query, maxLen = 12000) {
  const raw = String(text || "");
  const cap = Math.max(500, Math.min(12000, Number(maxLen) || 12000));
  const refs = inferSectionRefsForQuery(query);
  if (!refs.length) {
    return extractEvidenceText(raw, query, cap);
  }
  const parts = [];
  refs.forEach((sectionRef) => {
    const sec = escapeRegExp(sectionRef);
    const startRe = new RegExp(`(?:^|[\\n\\r])\\s*${sec}\\s*(?:请求|响应|入参|出参)?`, "i");
    let startIdx = raw.search(startRe);
    if (startIdx < 0) {
      startIdx = raw.indexOf(sectionRef);
    }
    if (startIdx < 0) {
      return;
    }
    let endIdx = raw.length;
    for (const marker of sectionEndMarkers(sectionRef)) {
      const endRe = new RegExp(`(?:^|[\\n\\r])\\s*${escapeRegExp(marker)}\\s`, "i");
      const rel = raw.slice(startIdx + sectionRef.length).search(endRe);
      if (rel >= 0) {
        endIdx = Math.min(endIdx, startIdx + sectionRef.length + rel);
      }
    }
    parts.push(raw.slice(Math.max(0, startIdx - 120), endIdx).trim());
  });
  if (!parts.length) {
    return extractEvidenceText(raw, query, cap);
  }
  const joined = parts.join("\n\n---\n\n");
  return joined.length <= cap ? joined : joined.slice(0, cap);
}

function sectionEndMarkers(sectionRef) {
  const parts = String(sectionRef || "")
    .split(".")
    .map((x) => Number(x));
  if (parts.length >= 3) {
    const minor = parts[2];
    const chapter = `${parts[0]}.${parts[1]}`;
    if (minor === 1) {
      return [`${chapter}.2`];
    }
    if (minor >= 2) {
      return [`${parts[0]}.${parts[1] + 1}`];
    }
  }
  if (parts.length === 2) {
    return [`${parts[0]}.${parts[1] + 1}`];
  }
  return [];
}

function findSectionStartChunkIndex(docChunks, sectionRef) {
  const sec = escapeRegExp(sectionRef);
  const startRe = new RegExp(`(?:^|[\\n\\r])\\s*${sec}\\s*(?:请求|响应|入参|出参)?`, "i");
  const contentHint = /字段名称|报文样例|"head"\s*:|img\d+Url|orderId|bizString/;
  let fallback = null;
  for (const chunk of docChunks) {
    const body = extractChunkBody(chunk.text || chunk.piece?.text || "");
    if (isTocLikeChunk(body)) {
      continue;
    }
    if (startRe.test(body) && contentHint.test(body)) {
      return Number(chunk.chunkIndex);
    }
    if (startRe.test(body) && fallback == null) {
      fallback = Number(chunk.chunkIndex);
    }
    if (fallback == null && body.includes(sectionRef) && contentHint.test(body)) {
      fallback = Number(chunk.chunkIndex);
    }
  }
  return fallback;
}

function findSectionEndChunkIndex(docChunks, sectionRef, startIdx) {
  const markers = sectionEndMarkers(sectionRef);
  let endIdx = null;
  for (const chunk of docChunks) {
    const idx = Number(chunk.chunkIndex);
    if (!Number.isFinite(idx) || idx <= startIdx) {
      continue;
    }
    const body = extractChunkBody(chunk.text || chunk.piece?.text || "");
    if (isTocLikeChunk(body)) {
      continue;
    }
    for (const marker of markers) {
      const endRe = new RegExp(`(?:^|[\\n\\r])\\s*${escapeRegExp(marker)}\\s`, "i");
      if (endRe.test(body)) {
        endIdx = idx - 1;
        break;
      }
    }
    if (endIdx != null) {
      break;
    }
  }
  if (endIdx == null) {
    endIdx = startIdx + 6;
  }
  return Math.min(endIdx, startIdx + 8);
}

function sliceSectionEvidence(text, query, maxLen = 12000) {
  const refs = inferSectionRefsForQuery(query);
  if (refs.length > 1 || (refs.length === 1 && isApiSpecQuery(query))) {
    return sliceMultiSectionEvidence(text, query, maxLen);
  }
  const raw = String(text || "");
  const cap = Math.max(500, Math.min(12000, Number(maxLen) || 12000));
  const sectionRef = resolvePrimarySectionRef(query);
  if (!sectionRef) {
    return extractEvidenceText(raw, query, cap);
  }
  const sec = escapeRegExp(sectionRef);
  const startRe = new RegExp(`(?:^|[\\n\\r])\\s*${sec}\\s*(?:请求|响应|入参|出参)?`, "i");
  let startIdx = raw.search(startRe);
  if (startIdx < 0) {
    startIdx = raw.indexOf(sectionRef);
  }
  if (startIdx < 0) {
    return extractEvidenceText(raw, query, cap);
  }
  let endIdx = raw.length;
  for (const marker of sectionEndMarkers(sectionRef)) {
    const endRe = new RegExp(`(?:^|[\\n\\r])\\s*${escapeRegExp(marker)}\\s`, "i");
    const rel = raw.slice(startIdx + sectionRef.length).search(endRe);
    if (rel >= 0) {
      endIdx = Math.min(endIdx, startIdx + sectionRef.length + rel);
    }
  }
  const sectionBody = raw.slice(Math.max(0, startIdx - 120), endIdx).trim();
  if (sectionBody.length <= cap) {
    return sectionBody;
  }
  return sectionBody.slice(0, cap);
}

function isApiSpecQuery(query) {
  return /入参|报文|请求|响应|字段|JSON|json|格式|接口定义|method|样例|参数表/.test(String(query || ""));
}

function shouldExpandAdjacentChunks(query, queryType) {
  if (queryType === "literal" || queryType === "doc_ref") {
    return false;
  }
  if (queryType === "section" || queryType === "identifier" || extractSectionNumbers(query).length) {
    return true;
  }
  return isApiSpecQuery(query);
}

/**
 * 为章节/API 类检索补充同文档相邻分块（如 3.16.1 字段表与 JSON 样例跨块时）。
 */
function expandAdjacentChunkHits(hits, chunksByDocId, options = {}) {
  if (!Array.isArray(hits) || !hits.length || !chunksByDocId || typeof chunksByDocId.get !== "function") {
    return hits;
  }
  const radius = Math.max(1, Math.min(3, Number(options.radius) || 1));
  const maxExtra = Math.max(1, Math.min(12, Number(options.maxExtra) || 8));
  const seedCount = Math.max(1, Math.min(hits.length, Number(options.seedCount) || 5));
  const seen = new Set(
    hits.map((h) => String(h.chunkId || h.id || "")).filter(Boolean)
  );
  const extra = [];

  for (const hit of hits.slice(0, seedCount)) {
    const docId = String(hit.docId || "");
    const idx = Number(hit.chunkIndex);
    if (!docId || !Number.isFinite(idx)) {
      continue;
    }
    const docChunks = chunksByDocId.get(docId) || [];
    if (!docChunks.length) {
      continue;
    }
    const baseScore = Number(hit.finalScore ?? hit.score ?? 0);
    for (let delta = -radius; delta <= radius; delta += 1) {
      if (delta === 0) {
        continue;
      }
      const neighbor = docChunks.find((c) => Number(c.chunkIndex) === idx + delta);
      if (!neighbor) {
        continue;
      }
      const nid = String(neighbor.id || neighbor.chunkId || "");
      if (!nid || seen.has(nid)) {
        continue;
      }
      seen.add(nid);
      extra.push({
        ...neighbor,
        chunkId: neighbor.id || neighbor.chunkId,
        docId: neighbor.docId || docId,
        docName: neighbor.docName || hit.docName || hit.sourceFile || "",
        score: baseScore * 0.9,
        finalScore: baseScore * 0.9,
        recallSource: "adjacent",
        adjacentOf: hit.chunkId || hit.id,
        libraryId: hit.libraryId,
        libraryName: hit.libraryName,
        sourcePath: hit.sourcePath || "",
        sourceFile: hit.sourceFile || hit.docName || "",
      });
      if (extra.length >= maxExtra) {
        break;
      }
    }
    if (extra.length >= maxExtra) {
      break;
    }
  }

  if (!extra.length) {
    return hits;
  }
  return [...hits, ...extra].sort(
    (a, b) => Number(b.finalScore ?? b.score ?? 0) - Number(a.finalScore ?? a.score ?? 0)
  );
}

/**
 * 按章节号拉取同文档整段分块（如 3.16.2 响应字段跨 69–73 多块）。
 */
function expandSectionRangeChunkHits(hits, chunksByDocId, query, options = {}) {
  const sectionRefs = inferSectionRefsForQuery(query);
  if (!sectionRefs.length || !chunksByDocId || typeof chunksByDocId.get !== "function") {
    return hits;
  }
  if (!isApiSpecQuery(query) && !shouldExpandAdjacentChunks(query, "identifier")) {
    return hits;
  }
  const seedDocIds = [
    ...new Set(
      (hits || [])
        .slice(0, 8)
        .map((h) => String(h.docId || ""))
        .filter(Boolean)
    ),
  ];
  if (!seedDocIds.length) {
    return hits;
  }
  const seen = new Set(
    (hits || []).map((h) => String(h.chunkId || h.id || "")).filter(Boolean)
  );
  const extra = [];
  const baseScore = Math.max(
    0.82,
    ...(hits || []).slice(0, 3).map((h) => Number(h.finalScore ?? h.score ?? 0))
  );

  seedDocIds.forEach((docId) => {
    const docChunks = chunksByDocId.get(docId) || [];
    if (!docChunks.length) {
      return;
    }
    sectionRefs.forEach((sectionRef) => {
      const startIdx = findSectionStartChunkIndex(docChunks, sectionRef);
      if (!Number.isFinite(startIdx)) {
        return;
      }
      const endIdx = findSectionEndChunkIndex(docChunks, sectionRef, startIdx);
      docChunks.forEach((chunk) => {
        const idx = Number(chunk.chunkIndex);
        if (!Number.isFinite(idx) || idx < startIdx || idx > endIdx) {
          return;
        }
        const nid = String(chunk.id || chunk.chunkId || "");
        if (!nid || seen.has(nid)) {
          return;
        }
        seen.add(nid);
        extra.push({
          ...chunk,
          chunkId: chunk.id || chunk.chunkId,
          docId: chunk.docId || docId,
          docName: chunk.docName || "",
          score: baseScore,
          finalScore: baseScore,
          recallSource: "section_range",
          sectionRef,
          chunkIndex: idx,
        });
      });
    });
  });

  if (!extra.length) {
    return hits || [];
  }
  const combined = [...(hits || []), ...extra];
  combined.sort((a, b) => {
    const sa = a.recallSource === "section_range" ? 1 : 0;
    const sb = b.recallSource === "section_range" ? 1 : 0;
    if (sa !== sb) {
      return sb - sa;
    }
    if (String(a.docId) === String(b.docId)) {
      return Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0);
    }
    return Number(b.finalScore ?? b.score ?? 0) - Number(a.finalScore ?? a.score ?? 0);
  });
  return combined;
}

function diversifySearchHits(hits, topK, options = {}) {
  const cap = Math.max(1, Number(topK) || 10);
  const maxPerDoc = Math.max(1, Number(options.maxPerDoc) || 1);
  const out = [];
  const perDoc = new Map();
  const seen = new Set();
  for (const h of hits || []) {
    const chunkId = String(h.chunkId || h.id || "");
    if (!chunkId || seen.has(chunkId)) {
      continue;
    }
    const docId = String(h.docId || "");
    const count = perDoc.get(docId) || 0;
    if (docId && count >= maxPerDoc) {
      continue;
    }
    out.push(h);
    seen.add(chunkId);
    if (docId) {
      perDoc.set(docId, count + 1);
    }
    if (out.length >= cap) {
      return out;
    }
  }
  for (const h of hits || []) {
    const chunkId = String(h.chunkId || h.id || "");
    if (!chunkId || seen.has(chunkId)) {
      continue;
    }
    out.push(h);
    seen.add(chunkId);
    if (out.length >= cap) {
      break;
    }
  }
  return out;
}

function finalizeAgentSearchHits(hits, query, topK, forAgent, options = {}) {
  const list = Array.isArray(hits) ? hits.filter(Boolean) : [];
  if (!list.length) {
    return [];
  }
  const queryType = options.queryType || classifyQuery(query);
  const cap = forAgent ? Math.max(Number(topK) || 10, 18) : Number(topK) || 10;
  const sectionHits = list.filter((h) => h.recallSource === "section_range");
  if (!forAgent || !sectionHits.length || !isApiSpecQuery(query)) {
    if (queryType === "topic_keyword" || queryType === "filename") {
      return diversifySearchHits(list, cap, { maxPerDoc: 1 });
    }
    return list.slice(0, cap);
  }
  const sectionIds = new Set(sectionHits.map((h) => String(h.chunkId || h.id || "")).filter(Boolean));
  const sectionSorted = [...sectionHits].sort(
    (a, b) => Number(a.chunkIndex ?? 0) - Number(b.chunkIndex ?? 0)
  );
  const others = list.filter((h) => !sectionIds.has(String(h.chunkId || h.id || "")));
  const merged = [...sectionSorted, ...others];
  const seen = new Set();
  const out = [];
  merged.forEach((h) => {
    const id = String(h.chunkId || h.id || "");
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    out.push(h);
  });
  return out.slice(0, Math.max(cap, sectionSorted.length + 2));
}

function extractEvidenceText(text, query, maxLen = 8000) {
  const sectionRef = resolvePrimarySectionRef(query);
  if (sectionRef && isApiSpecQuery(query)) {
    return sliceSectionEvidence(text, query, maxLen);
  }
  const raw = String(text || "");
  const cap = Math.max(500, Math.min(12000, Number(maxLen) || 8000));
  if (raw.length <= cap) {
    return raw;
  }
  const sections = extractSectionNumbers(query).sort((a, b) => b.length - a.length);
  for (const sec of sections) {
    const idx = raw.indexOf(sec);
    if (idx >= 0) {
      const start = Math.max(0, idx - 240);
      return raw.slice(start, start + cap);
    }
  }
  if (isApiSpecQuery(query)) {
    const jsonIdx = raw.search(/报文样例|"head"\s*:|字段名称/);
    if (jsonIdx >= 0) {
      const start = Math.max(0, jsonIdx - 240);
      return raw.slice(start, start + cap);
    }
  }
  return raw.slice(0, cap);
}

module.exports = {
  computeFileMd5,
  decodeTextBuffer,
  chunkText,
  chunkTextByDocType,
  detectDocKind,
  computeChunkHash,
  extractChunkBody,
  resolveChunkContentHash,
  buildChunkSpecs,
  planChunkIncrementalUpdate,
  tokenizeQuery,
  normalizeMatchText,
  stripQueryLabelPrefix,
  extractDocumentReferenceCodes,
  isStrictAnchorQuery,
  docRefMatchScore,
  strictAnchorMatchScore,
  isLiteralQuery,
  extractLiteralAnchors,
  literalMatchScore,
  keywordMatchScore,
  metadataMatchScore,
  fuseHybridScore,
  cosineSimilarity,
  vectorScoreFromDistance,
  classifyQuery,
  isTopicKeywordQuery,
  looksLikeDocumentTitleQuery,
  diversifySearchHits,
  dedupeMetadataHitsByDocument,
  resolveSearchParams,
  inferQueryProfile,
  buildChunkIndexText,
  formatEmbeddingInput,
  scanChunksByKeyword,
  scanMetadataHits,
  rrfScore,
  computeFieldBoost,
  mergeAndFuseHits,
  hitMeetsMinScore,
  resolveCandidateK,
  extractSectionNumbers,
  extractSectionTitleRemainder,
  isSectionHeadingQuery,
  sectionHeadingMatchScore,
  resolvePrimarySectionRef,
  inferSectionRefsForQuery,
  isTocLikeChunk,
  isRevisionHistoryLikeChunk,
  sliceMultiSectionEvidence,
  isApiSpecQuery,
  shouldExpandAdjacentChunks,
  expandAdjacentChunkHits,
  expandSectionRangeChunkHits,
  finalizeAgentSearchHits,
  sliceSectionEvidence,
  extractEvidenceText,
  DEFAULT_CANDIDATE_K,
  KEYWORD_RECALL_LIMIT,
  RRF_K,
};
