const fs = require("fs");
const path = require("path");
const { tokenizeQuery, normalizeMatchText } = require("./kbRetrieval.js");

const INDEX_VERSION = 1;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

function ftsIndexPath(libraryDirPath) {
  return path.join(String(libraryDirPath || ""), "fts-index.json");
}

function emptyIndex() {
  return {
    version: INDEX_VERSION,
    docCount: 0,
    totalDl: 0,
    postings: {},
    chunks: {},
    updatedAt: "",
  };
}

function loadFtsIndex(libraryDirPath) {
  const fp = ftsIndexPath(libraryDirPath);
  if (!fs.existsSync(fp)) {
    return emptyIndex();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8"));
    if (!raw || raw.version !== INDEX_VERSION) {
      return emptyIndex();
    }
    return {
      ...emptyIndex(),
      ...raw,
      postings: raw.postings || {},
      chunks: raw.chunks || {},
    };
  } catch {
    return emptyIndex();
  }
}

function saveFtsIndex(libraryDirPath, index) {
  const fp = ftsIndexPath(libraryDirPath);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  index.updatedAt = new Date().toISOString();
  fs.writeFileSync(fp, JSON.stringify(index), "utf8");
}

function indexTokens(text) {
  const normalized = normalizeMatchText(text);
  const tokens = tokenizeQuery(normalized);
  const freq = {};
  tokens.forEach((t) => {
    freq[t] = (freq[t] || 0) + 1;
  });
  return { tokens: Object.keys(freq), freq, dl: tokens.length || normalized.length || 1 };
}

function removeChunkFromIndex(index, chunkId) {
  const meta = index.chunks[chunkId];
  if (!meta) {
    return;
  }
  Object.keys(meta.freq || {}).forEach((token) => {
    const posting = index.postings[token];
    if (!posting) {
      return;
    }
    delete posting[chunkId];
    if (!Object.keys(posting).length) {
      delete index.postings[token];
    }
  });
  index.totalDl -= Number(meta.dl || 0);
  index.docCount = Math.max(0, index.docCount - 1);
  delete index.chunks[chunkId];
}

function upsertChunkInIndex(index, chunk, docMeta = {}) {
  const chunkId = String(chunk.id || "");
  if (!chunkId) {
    return;
  }
  removeChunkFromIndex(index, chunkId);
  const body = `${docMeta.name || chunk.docName || ""} ${docMeta.sourcePath || ""} ${chunk.text || ""}`;
  const { tokens, freq, dl } = indexTokens(body);
  index.chunks[chunkId] = {
    docId: String(chunk.docId || ""),
    docName: String(chunk.docName || docMeta.name || ""),
    sourcePath: String(docMeta.sourcePath || ""),
    dl,
    freq,
  };
  tokens.forEach((token) => {
    if (!index.postings[token]) {
      index.postings[token] = {};
    }
    index.postings[token][chunkId] = freq[token];
  });
  index.docCount += 1;
  index.totalDl += dl;
}

function rebuildFtsIndex(chunks, documents = []) {
  const index = emptyIndex();
  const docById = new Map((documents || []).map((d) => [String(d.id), d]));
  (chunks || []).forEach((chunk) => {
    const docMeta = docById.get(String(chunk.docId || "")) || {};
    upsertChunkInIndex(index, chunk, docMeta);
  });
  return index;
}

function removeDocFromFtsIndex(index, docId) {
  const target = String(docId || "");
  Object.keys(index.chunks).forEach((chunkId) => {
    if (String(index.chunks[chunkId]?.docId || "") === target) {
      removeChunkFromIndex(index, chunkId);
    }
  });
  return index;
}

function bm25Score(index, queryTokens, chunkId) {
  const meta = index.chunks[chunkId];
  if (!meta) {
    return 0;
  }
  const dl = Number(meta.dl || 1);
  const avgDl = index.docCount > 0 ? index.totalDl / index.docCount : dl;
  let score = 0;
  queryTokens.forEach((token) => {
    const posting = index.postings[token];
    if (!posting) {
      return;
    }
    const df = Object.keys(posting).length;
    const tf = Number(posting[chunkId] || 0);
    if (!tf) {
      return;
    }
    const idf = Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
    const denom = tf + BM25_K1 * (1 - BM25_B + (BM25_B * dl) / Math.max(1, avgDl));
    score += idf * ((tf * (BM25_K1 + 1)) / denom);
  });
  return score;
}

function searchFtsIndex(index, query, limit = 50) {
  const q = String(query || "").trim();
  if (!q || !index || !index.docCount) {
    return [];
  }
  const queryTokens = tokenizeQuery(q);
  if (!queryTokens.length) {
    return [];
  }
  const candidateIds = new Set();
  queryTokens.forEach((token) => {
    const posting = index.postings[token];
    if (posting) {
      Object.keys(posting).forEach((chunkId) => candidateIds.add(chunkId));
    }
  });
  const scored = [];
  candidateIds.forEach((chunkId) => {
    const raw = bm25Score(index, queryTokens, chunkId);
    if (raw <= 0) {
      return;
    }
    const meta = index.chunks[chunkId] || {};
    let ftsScore = raw;
    const qn = normalizeMatchText(q);
    const docName = normalizeMatchText(meta.docName || "");
    if (docName && (docName.includes(qn) || docName.replace(/\.[a-z0-9]{1,8}$/i, "").includes(qn))) {
      ftsScore += 2.5;
    }
    scored.push({
      chunkId,
      docId: meta.docId,
      docName: meta.docName,
      sourcePath: meta.sourcePath,
      ftsScore,
      rawBm25: raw,
    });
  });
  scored.sort((a, b) => Number(b.ftsScore || 0) - Number(a.ftsScore || 0));
  const maxScore = scored[0]?.ftsScore || 1;
  return scored.slice(0, Math.max(1, limit)).map((row) => ({
    ...row,
    ftsScore: Math.max(0, Math.min(1, Number(row.ftsScore || 0) / Math.max(1, maxScore))),
  }));
}

module.exports = {
  ftsIndexPath,
  loadFtsIndex,
  saveFtsIndex,
  rebuildFtsIndex,
  upsertChunkInIndex,
  removeChunkFromIndex,
  removeDocFromFtsIndex,
  searchFtsIndex,
};
