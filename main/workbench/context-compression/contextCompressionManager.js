const { mergeCompressionConfig } = require("./config.js");
const { classifyBlocks } = require("./contextClassifier.js");
const { buildCompressionPlan } = require("./compressionPlanner.js");
const { buildSnapshot } = require("./snapshotBuilder.js");
const { validateSnapshot } = require("./snapshotValidator.js");
const { tokenBudgetForRuntime } = require("./tokenBudget.js");
const contextStore = require("./contextStore.js");
const { collectRuntimeState } = require("./contextMonitor.js");
const { buildPromptContext } = require("./runtimeInjector.js");
const { assertNoCrossScopeRead } = require("../namespace.js");
const { resolveUserId } = require("../projectService.js");
const { getDb, newId, nowIso } = require("../db.js");

function shouldCompress(runtimeState, configInput) {
  const config = mergeCompressionConfig(configInput);
  const budget = tokenBudgetForRuntime(runtimeState, config);
  const ratio = budget.usedRatio;
  if (ratio >= config.hardLimitRatio) {
    return {
      action: "compress",
      mode: "aggressive",
      reason: "hard_limit",
      ...budget,
    };
  }
  if (ratio >= config.softLimitRatio) {
    return {
      action: "compress",
      mode: "normal",
      reason: "soft_limit",
      ...budget,
    };
  }
  if (ratio >= 0.6 && runtimeState?.lowValueLogRatio >= 0.15) {
    return {
      action: "prune",
      mode: "light",
      reason: "low_value_logs",
      ...budget,
    };
  }
  return { action: "none", mode: null, reason: null, ...budget };
}

function applyCompression(getUserDataPath, userId, payload) {
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  assertNoCrossScopeRead(namespace, namespace);
  const config = mergeCompressionConfig(payload?.config);
  const runtimeState = collectRuntimeState(getUserDataPath, uid, {
    namespace,
    messages: payload?.messages || [],
    config,
  });
  const decision = shouldCompress(runtimeState, config);
  const mode = payload?.mode || decision.mode || "normal";
  const reason = payload?.reason || decision.reason || "manual";
  const blocks = classifyBlocks(runtimeState.messages, { scopeType: runtimeState.scopeType });
  const plan = buildCompressionPlan(blocks, { minRecentTurnsKeep: config.minRecentTurnsKeep });
  const snapshot = buildSnapshot({
    namespace,
    plan,
    runtimeState: { ...runtimeState, mode, reason },
  });
  const validation = validateSnapshot(snapshot, { scopeType: runtimeState.scopeType });
  const tokensBefore =
    runtimeState.messageTokens + runtimeState.memoryTokens + runtimeState.snapshotTokens;

  if (!validation.valid) {
    const db = getDb(getUserDataPath);
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, scope_type, scope_id, action, detail_json, created_at)
       VALUES (?, ?, ?, ?, 'compression.validation_failed', ?, ?)`
    ).run(
      newId("audit"),
      uid,
      runtimeState.scopeType,
      namespace.split(":").pop(),
      JSON.stringify({ errors: validation.errors, namespace }),
      nowIso()
    );
    contextStore.saveCompressionEvent(getUserDataPath, uid, {
      namespace,
      reason,
      mode,
      tokensBefore,
      tokensAfter: tokensBefore,
      blocksKept: plan.stats.kept,
      blocksSummarized: plan.stats.summarized,
      blocksDropped: plan.stats.dropped,
      validation,
    });
    return {
      applied: false,
      validation,
      decision,
      tokensBefore,
      tokensAfter: tokensBefore,
      message: "快照验证失败，保留原上下文",
    };
  }

  snapshot.riskFlags = validation.riskFlags;
  const saved = contextStore.saveSnapshot(getUserDataPath, uid, {
    namespace,
    snapshot,
    validation,
    tokensBefore,
    tokensAfter: plan.estimatedTokensAfter,
    enableVersioning: config.enableSnapshotVersioning,
  });
  contextStore.saveCompressionEvent(getUserDataPath, uid, {
    snapshotId: saved.id,
    namespace,
    reason,
    mode,
    tokensBefore,
    tokensAfter: plan.estimatedTokensAfter,
    blocksKept: plan.stats.kept,
    blocksSummarized: plan.stats.summarized,
    blocksDropped: plan.stats.dropped,
    validation,
  });
  return {
    applied: true,
    validation,
    decision,
    snapshot: saved,
    tokensBefore,
    tokensAfter: plan.estimatedTokensAfter,
    compressionRatio: tokensBefore > 0 ? plan.estimatedTokensAfter / tokensBefore : 1,
  };
}

function getContextHealth(getUserDataPath, userId, payload) {
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  const config = mergeCompressionConfig(payload?.config);
  const runtimeState = collectRuntimeState(getUserDataPath, uid, {
    namespace,
    messages: payload?.messages || [],
    config,
  });
  const decision = shouldCompress(runtimeState, config);
  const latest = runtimeState.latestSnapshot;
  return {
    namespace,
    usedTokens: decision.usedTokens,
    effectiveContextTokens: decision.effectiveContextTokens,
    usedRatio: decision.usedRatio,
    status: decision.status,
    compressionAction: decision.action,
    compressionMode: decision.mode,
    latestSnapshotRevision: latest?.revision || null,
    breakdown: decision.breakdown,
  };
}

function prepareContextForAgent(getUserDataPath, userId, payload) {
  const uid = resolveUserId(userId);
  const namespace = String(payload?.namespace || "").trim();
  const config = mergeCompressionConfig(payload?.config);
  let runtimeState = collectRuntimeState(getUserDataPath, uid, {
    namespace,
    messages: payload?.messages || [],
    config,
  });
  const decision = shouldCompress(runtimeState, config);
  let compressionResult = null;
  if (decision.action === "compress" || decision.action === "prune") {
    compressionResult = applyCompression(getUserDataPath, uid, {
      namespace,
      messages: payload?.messages || [],
      mode: decision.mode,
      reason: decision.reason,
      config,
    });
    if (compressionResult.applied) {
      runtimeState = collectRuntimeState(getUserDataPath, uid, {
        namespace,
        messages: payload?.messages || [],
        config,
      });
    }
  }
  const promptContext = buildPromptContext({
    snapshot: runtimeState.latestSnapshot?.snapshot,
    memories: runtimeState.memories,
    recentMessages: runtimeState.messages,
    minRecentTurnsKeep: config.minRecentTurnsKeep,
  });
  return {
    namespace,
    contextHealth: getContextHealth(getUserDataPath, uid, {
      namespace,
      messages: payload?.messages || [],
      config,
    }),
    compressionResult,
    promptContext,
  };
}

module.exports = {
  shouldCompress,
  applyCompression,
  getContextHealth,
  prepareContextForAgent,
};
