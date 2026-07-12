/**
 * BL-015 / AGT-001~007: Model Gateway — purpose routing, fallback, structured actions, no-progress.
 */
const { resolveModelProfile } = require("../ai/modelProfileResolver.js");
const { readAISession, getActiveProfileCredentials } = require("../aiSessionStore.js");
const { llmChatWithTools } = require("./llmClient.js");

const PURPOSE = {
  PLANNER: "planner",
  CODER: "coder",
  REVIEWER: "reviewer",
  DIAGNOSER: "diagnoser",
  SUMMARIZER: "summarizer",
};

function purposeForMode(mode) {
  const m = String(mode || "").toUpperCase();
  if (m === "PLAN_ONLY") return PURPOSE.PLANNER;
  if (m === "PATCH_PROPOSE") return PURPOSE.CODER;
  if (m === "VERIFY_FIX") return PURPOSE.DIAGNOSER;
  if (m === "REVIEW") return PURPOSE.REVIEWER;
  if (m === "SUMMARIZE") return PURPOSE.SUMMARIZER;
  return PURPOSE.CODER;
}

function envKeyForPurpose(purpose) {
  return `WB_AGENT_MODEL_${String(purpose || "").toUpperCase()}`;
}

function listProfilesLite() {
  try {
    const sess = readAISession();
    return (sess.profiles || []).map((p) => ({
      id: p.id,
      label: p.label,
      model: p.model,
      baseUrl: p.baseUrl,
    }));
  } catch {
    return [];
  }
}

function safeActiveCredentials() {
  try {
    return getActiveProfileCredentials();
  } catch {
    return {
      apiKey: "",
      baseUrl: "http://127.0.0.1:11434/v1",
      model: "stub-model",
      label: "stub",
      profileId: "stub",
    };
  }
}

function credentialsForProfileId(profileId) {
  if (!profileId) return safeActiveCredentials();
  try {
    const sess = readAISession();
    const p = (sess.profiles || []).find((x) => x.id === profileId || x.model === profileId);
    if (!p) return safeActiveCredentials();
    const {
      normalizeApiKey,
      decryptKeyB64,
      normalizeOpenAiChatBaseUrl,
      normalizeModelNameForMiniMax,
      DEFAULT_AI_BASE,
      DEFAULT_AI_MODEL,
    } = require("../aiSessionStore.js");
    const bu = normalizeOpenAiChatBaseUrl(p.baseUrl || DEFAULT_AI_BASE);
    return {
      apiKey: normalizeApiKey(decryptKeyB64(p.encryptedKeyB64)),
      baseUrl: bu,
      model: normalizeModelNameForMiniMax(p.model || DEFAULT_AI_MODEL, bu),
      label: (p.label && String(p.label).trim()) || p.model || "模型",
      profileId: p.id,
    };
  } catch {
    return safeActiveCredentials();
  }
}

/**
 * Resolve primary + fallback chain for a purpose/mode.
 * Env: WB_AGENT_MODEL_PLANNER / CODER / REVIEWER / DIAGNOSER (profileId or model name)
 *      WB_AGENT_MODEL_FALLBACK (comma-separated)
 */
function resolveAgentModel({ mode, purpose } = {}) {
  const resolvedPurpose = purpose || purposeForMode(mode);
  const envPrimary = String(process.env[envKeyForPurpose(resolvedPurpose)] || "").trim();
  const envFallback = String(process.env.WB_AGENT_MODEL_FALLBACK || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const primaryCred = envPrimary
    ? credentialsForProfileId(envPrimary)
    : safeActiveCredentials();

  const fallbackIds = envFallback.filter((id) => id !== primaryCred.profileId && id !== primaryCred.model);
  // Also try another profile from session if only one env fallback empty
  if (!fallbackIds.length) {
    const others = listProfilesLite().filter((p) => p.id !== primaryCred.profileId).slice(0, 2);
    for (const o of others) fallbackIds.push(o.id);
  }

  const chain = [
    { purpose: resolvedPurpose, credentials: primaryCred, role: "primary" },
    ...fallbackIds.map((id) => ({
      purpose: resolvedPurpose,
      credentials: credentialsForProfileId(id),
      role: "fallback",
    })),
  ];

  // Soft-validate primary (skip hard throw in headless/stub)
  try {
    resolveModelProfile({ credentials: primaryCred });
  } catch {
    /* stub / offline ok for routing explain */
  }

  return {
    purpose: resolvedPurpose,
    mode: mode || null,
    primary: chain[0],
    fallbackChain: chain.slice(1),
    chain,
    explain: `purpose=${resolvedPurpose}; primary=${primaryCred.label || primaryCred.model}; fallbacks=${chain
      .slice(1)
      .map((c) => c.credentials.label || c.credentials.model)
      .join("|") || "none"}`,
  };
}

function isRetryableLlmError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  const code = err?.code || err?.status || err?.statusCode;
  if (code === 429 || code === 502 || code === 503 || code === 504) return true;
  if (err?.name === "AbortError") return false;
  if (/timeout|econnreset|econnrefused|socket|429|rate limit|temporarily/i.test(msg)) return true;
  if (/deterministic|invalid.*api.?key|401|unauthorized|model.*not.*found/i.test(msg)) return false;
  return false;
}

/**
 * Chat with tools using purpose routing + fallback (AGT-002/006).
 */
async function gatewayChatWithTools(options = {}) {
  const route = resolveAgentModel({ mode: options.mode, purpose: options.purpose });
  const attempts = [];
  let lastErr = null;
  for (const entry of route.chain) {
    try {
      const result = await llmChatWithTools({
        ...options,
        credentials: options.credentials || entry.credentials,
      });
      attempts.push({
        profileId: entry.credentials.profileId,
        model: entry.credentials.model,
        role: entry.role,
        ok: true,
      });
      return {
        ...result,
        gateway: {
          purpose: route.purpose,
          explain: route.explain,
          used: {
            profileId: entry.credentials.profileId,
            model: entry.credentials.model,
            label: entry.credentials.label,
            role: entry.role,
          },
          attempts,
        },
      };
    } catch (err) {
      lastErr = err;
      attempts.push({
        profileId: entry.credentials.profileId,
        model: entry.credentials.model,
        role: entry.role,
        ok: false,
        error: String(err.message || err).slice(0, 200),
        retryable: isRetryableLlmError(err),
      });
      if (!isRetryableLlmError(err)) break;
    }
  }
  const wrapped = lastErr || new Error("Model Gateway: all models failed");
  wrapped.code = wrapped.code || "MODEL_GATEWAY_FAILED";
  wrapped.gatewayAttempts = attempts;
  throw wrapped;
}

/**
 * AGT-003: parse structured JSON action; one repair pass for truncated JSON.
 */
function parseStructuredAction(raw, { schemaHint = "action" } = {}) {
  const text = String(raw || "").trim();
  const tryParse = (s) => {
    try {
      return { ok: true, value: JSON.parse(s) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  };

  // fenced json
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let candidate = fence ? fence[1].trim() : text;
  if (!candidate.startsWith("{") && !candidate.startsWith("[")) {
    const brace = candidate.match(/\{[\s\S]*\}/);
    if (brace) candidate = brace[0];
  }

  let parsed = tryParse(candidate);
  if (!parsed.ok) {
    // one repair: trim trailing commas / incomplete
    const repaired = candidate
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[\s\S]*?(\{[\s\S]*)/, "$1");
    parsed = tryParse(repaired);
    if (parsed.ok) {
      return {
        ok: true,
        repaired: true,
        schemaHint,
        action: parsed.value,
      };
    }
    return {
      ok: false,
      repaired: false,
      schemaHint,
      error: parsed.error,
      blocked: true,
      message: "结构化 Action 解析失败，禁止执行自由文本中的命令",
    };
  }

  const action = parsed.value;
  const type = String(action?.type || action?.kind || schemaHint || "action").toLowerCase();
  return {
    ok: true,
    repaired: false,
    schemaHint,
    action,
    type,
  };
}

/**
 * AGT-007: detect no-progress loops from toolTrace.
 */
function detectNoProgressLoop(toolTrace = [], { window = 6, threshold = 3 } = {}) {
  const recent = (toolTrace || []).slice(-window);
  if (recent.length < threshold) {
    return { looping: false, reason: null, evidence: [] };
  }
  const keys = recent.map((t) => {
    const args = JSON.stringify(t.args || t.arguments || {});
    return `${t.tool || t.name}|${args}`;
  });
  const counts = new Map();
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1);
  const dupes = [...counts.entries()].filter(([, n]) => n >= threshold);
  if (dupes.length) {
    return {
      looping: true,
      reason: "repeated_tool_args",
      evidence: dupes.map(([k, n]) => ({ key: k.slice(0, 200), count: n })),
    };
  }
  // same error fingerprints
  const errs = recent
    .filter((t) => t.result?.ok === false)
    .map((t) => String(t.result?.error || t.result?.code || "").slice(0, 80));
  if (errs.length >= threshold && new Set(errs).size === 1 && errs[0]) {
    return {
      looping: true,
      reason: "repeated_error",
      evidence: [{ error: errs[0], count: errs.length }],
    };
  }
  return { looping: false, reason: null, evidence: [] };
}

module.exports = {
  PURPOSE,
  purposeForMode,
  resolveAgentModel,
  gatewayChatWithTools,
  parseStructuredAction,
  detectNoProgressLoop,
  isRetryableLlmError,
  listProfilesLite,
};
