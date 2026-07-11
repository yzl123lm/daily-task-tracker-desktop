const projectCodeService = require("./projectCodeService.js");
const { gitStatus } = require("./gitService.js");
const { writeMemory } = require("./contextMemoryService.js");
const { buildTaskNamespace } = require("./namespace.js");
const { resolveUserId } = require("./projectService.js");
const { buildPatchPreview } = require("./diffPreviewService.js");
const { createStagedPatch } = require("./patchStagingService.js");
const patchProposalService = require("./patchProposalService.js");
const projectStructureService = require("./projectStructureService.js");
const symbolIndexService = require("./symbolIndexService.js");

const PERMISSION = {
  READ: "READ",
  PROPOSE: "PROPOSE",
  VERIFY: "VERIFY",
  WRITE: "WRITE",
  MEMORY_WRITE: "MEMORY_WRITE",
  DANGEROUS: "DANGEROUS",
};

const MEMORY_WRITE_MODES = new Set([PERMISSION.READ, PERMISSION.PROPOSE, PERMISSION.MEMORY_WRITE]);

const MODE_ALLOWED = {
  PLAN_ONLY: new Set([PERMISSION.READ, PERMISSION.MEMORY_WRITE]),
  PATCH_PROPOSE: new Set([PERMISSION.READ, PERMISSION.PROPOSE, PERMISSION.MEMORY_WRITE, PERMISSION.VERIFY]),
  APPLY_APPROVED: new Set([]),
  VERIFY_FIX: new Set([PERMISSION.READ, PERMISSION.PROPOSE, PERMISSION.MEMORY_WRITE, PERMISSION.VERIFY]),
};

const TOOL_ALIASES = {
  list_project_files: "list_files",
  read_project_file: "read_file",
  search_project_code: "search_code",
};

const TOOL_DEFS = {
  list_files: {
    permission: PERMISSION.READ,
    description: "List project files and directories",
    parameters: {
      type: "object",
      properties: { prefix: { type: "string" } },
    },
  },
  read_file: {
    permission: PERMISSION.READ,
    description: "Read a text file from the project",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  search_code: {
    permission: PERMISSION.READ,
    description: "Search project source code",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  find_symbols: {
    permission: PERMISSION.READ,
    description: "Find function/DOM/IPC symbols in project",
    parameters: {
      type: "object",
      properties: { query: { type: "string" }, kind: { type: "string" } },
      required: ["query"],
    },
  },
  analyze_package: {
    permission: PERMISSION.READ,
    description: "Analyze package.json scripts and entry points",
    parameters: { type: "object", properties: {} },
  },
  write_task_memory: {
    permission: PERMISSION.READ,
    description: "Write a note to task memory (not disk)",
    parameters: {
      type: "object",
      properties: {
        content: { type: "string" },
        memoryType: { type: "string" },
      },
      required: ["content"],
    },
  },
  git_status: {
    permission: PERMISSION.READ,
    description: "Read git status for project",
    parameters: { type: "object", properties: {} },
  },
  preview_diff: {
    permission: PERMISSION.PROPOSE,
    description: "Preview a unified diff without staging",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        proposedContent: { type: "string" },
      },
      required: ["path", "proposedContent"],
    },
  },
  stage_patch: {
    permission: PERMISSION.PROPOSE,
    description:
      "Stage a patch proposal (does not write disk). Prefer edits: create_file|replace|replace_range|insert_before|insert_after|delete|full_content. replace/delete require unique match.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        edits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              op: {
                type: "string",
                enum: [
                  "create_file",
                  "replace",
                  "replace_range",
                  "insert_before",
                  "insert_after",
                  "delete",
                  "full_content",
                  "append_file",
                ],
              },
              find: { type: "string" },
              replace: { type: "string" },
              content: { type: "string" },
              anchor: { type: "string" },
              startLine: { type: "number" },
              endLine: { type: "number" },
            },
          },
        },
        summary: { type: "string" },
        proposedContent: { type: "string" },
      },
      required: ["path"],
    },
  },
  mock_echo: {
    permission: PERMISSION.READ,
    description: "Mock tool for tests",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
    },
  },
  compress_context: {
    permission: PERMISSION.MEMORY_WRITE,
    description: "Compress task context into snapshot (writes memory, not code)",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string", enum: ["manual", "auto", "threshold"] },
        mode: { type: "string", enum: ["normal", "aggressive", "light"] },
      },
    },
  },
  list_verification_profiles: {
    permission: PERMISSION.VERIFY,
    description: "List allowed verification profiles (build/test/lint/typecheck). Use profileId only.",
    parameters: { type: "object", properties: {} },
  },
  run_verification: {
    permission: PERMISSION.VERIFY,
    description:
      "Run a whitelisted verification profile by profileId (not arbitrary shell). Requires auto-verify grant.",
    parameters: {
      type: "object",
      properties: {
        profileId: { type: "string", description: "build | test | lint | typecheck" },
      },
      required: ["profileId"],
    },
  },
};

function normalizeToolName(name) {
  const n = String(name || "").trim();
  return TOOL_ALIASES[n] || n;
}

function getToolDef(name) {
  return TOOL_DEFS[normalizeToolName(name)] || null;
}

function compressContextToolEnabled() {
  return String(process.env.WB_AGENT_COMPRESS_CONTEXT || "1") !== "0";
}

function llmVerifyToolEnabled() {
  return String(process.env.WB_AGENT_LLM_VERIFY || "1") !== "0";
}

function listToolSchemas(mode = "PLAN_ONLY") {
  const allowed = MODE_ALLOWED[String(mode).toUpperCase()] || MODE_ALLOWED.PLAN_ONLY;
  return Object.entries(TOOL_DEFS)
    .filter(([name, def]) => {
      if (name === "compress_context" && !compressContextToolEnabled()) {
        return false;
      }
      if (
        (name === "run_verification" || name === "list_verification_profiles") &&
        !llmVerifyToolEnabled()
      ) {
        return false;
      }
      return allowed.has(def.permission);
    })
    .map(([name, def]) => ({
      type: "function",
      function: {
        name,
        description: def.description,
        parameters: def.parameters,
      },
    }));
}

function assertToolAllowed(toolName, mode) {
  const name = normalizeToolName(toolName);
  const def = getToolDef(name);
  if (!def) {
    const err = new Error(`未知工具: ${toolName}`);
    err.code = "TOOL_UNKNOWN";
    throw err;
  }
  const allowed = MODE_ALLOWED[String(mode).toUpperCase()] || MODE_ALLOWED.PLAN_ONLY;
  if (!allowed.has(def.permission)) {
    const err = new Error(`模式 ${mode} 不允许工具 ${name} (${def.permission})`);
    err.code = "TOOL_FORBIDDEN";
    throw err;
  }
  if (def.permission === PERMISSION.WRITE || def.permission === PERMISSION.DANGEROUS) {
    const err = new Error(`LLM 禁止直接调用 ${name}`);
    err.code = "TOOL_FORBIDDEN";
    throw err;
  }
  if (name === "compress_context" && !compressContextToolEnabled()) {
    const err = new Error("compress_context 已禁用");
    err.code = "TOOL_FORBIDDEN";
    throw err;
  }
  if (
    (name === "run_verification" || name === "list_verification_profiles") &&
    !llmVerifyToolEnabled()
  ) {
    const err = new Error("LLM VERIFY 工具已禁用");
    err.code = "TOOL_FORBIDDEN";
    throw err;
  }
  return def;
}

async function dispatchTool(ctx, toolName, args = {}) {
  const name = normalizeToolName(toolName);
  const def = assertToolAllowed(name, ctx.mode);
  const handler = HANDLERS[name];
  if (!handler) {
    const err = new Error(`工具未实现: ${name}`);
    err.code = "TOOL_NOT_IMPLEMENTED";
    throw err;
  }
  let result;
  try {
    result = await handler(ctx, args);
  } catch (e) {
    result = { ok: false, error: e.message, code: e.code || "TOOL_ERROR" };
  }
  const { recordToolOperation } = require("./toolPermissionService.js");
  recordToolOperation(ctx.getUserDataPath, ctx.userId, {
    agentRunId: ctx.agentRunId,
    projectId: ctx.projectId,
    taskId: ctx.taskId,
    toolName: name,
    args,
    resultText: typeof result === "string" ? result : JSON.stringify(result).slice(0, 16000),
    riskLevel:
      def.permission === PERMISSION.PROPOSE
        ? "MEDIUM"
        : def.permission === PERMISSION.VERIFY
          ? "MEDIUM"
          : def.permission === PERMISSION.MEMORY_WRITE
            ? "LOW"
            : "LOW",
  });
  return result;
}

const HANDLERS = {
  mock_echo(_ctx, args) {
    return { ok: true, echo: String(args.text || "") };
  },
  list_files(ctx, args) {
    const entries = projectCodeService.listTreeEntries(ctx.root);
    const prefix = String(args.prefix || "").replace(/\\/g, "/");
    const filtered = prefix
      ? entries.filter((e) => e.path.startsWith(prefix))
      : entries;
    return { ok: true, entries: filtered.slice(0, 200) };
  },
  read_file(ctx, args) {
    const rawPath = String(args.path || "").replace(/\\/g, "/").trim();
    const lower = rawPath.toLowerCase();
    // 禁止探测系统临时路径 / 虚构错误日志；引导空项目直接 stage_patch
    if (
      !rawPath ||
      lower === "tmp/last_error.txt" ||
      lower.endsWith("/tmp/last_error.txt") ||
      /^\/?tmp\//i.test(rawPath) ||
      /(^|\/)last_error\.txt$/i.test(rawPath)
    ) {
      return {
        ok: false,
        code: "PATH_NOT_USEFUL",
        error:
          `不要读取「${rawPath || "(空路径)"}」。该路径不是项目源码。` +
          "若项目为空或不存在目标文件，请直接用 stage_patch（changeType=add）创建新文件；工具错误信息已在返回结果中，无需另读日志。",
        hint: "use_stage_patch",
      };
    }
    try {
      const file = projectCodeService.readProjectFile(ctx.root, args.path);
      return { ok: true, ...file };
    } catch (e) {
      const msg = String(e?.message || e || "");
      const missing =
        e?.code === "ENOENT" ||
        /ENOENT|no such file|不是文件|无效相对路径|路径超出/i.test(msg);
      if (missing) {
        return {
          ok: false,
          code: "FILE_NOT_FOUND",
          path: rawPath,
          error:
            `文件不存在：${rawPath}。` +
            "若要新建该文件，请用 stage_patch（changeType=add）直接提议完整内容，不要反复 read_file。",
          hint: "use_stage_patch",
        };
      }
      return { ok: false, code: e?.code || "TOOL_ERROR", error: msg };
    }
  },
  search_code(ctx, args) {
    const hits = projectCodeService.searchProjectCode(ctx.root, args.query);
    return { ok: true, hits };
  },
  find_symbols(ctx, args) {
    const symbols = symbolIndexService.findSymbols(ctx.root, args.query, { kind: args.kind });
    return { ok: true, symbols };
  },
  analyze_package(ctx) {
    const info = projectStructureService.analyzeProjectStructure(ctx.root);
    return { ok: true, ...info };
  },
  write_task_memory(ctx, args) {
    const uid = resolveUserId(ctx.userId);
    const ns = buildTaskNamespace(ctx.projectId, ctx.taskId);
    writeMemory(ctx.getUserDataPath, uid, {
      namespace: ns,
      scopeType: "task",
      scopeId: ctx.taskId,
      memoryType: String(args.memoryType || "note"),
      content: String(args.content || ""),
      source: "ProjectAgent",
      importance: 4,
    });
    return { ok: true, namespace: ns };
  },
  git_status(ctx) {
    const status = gitStatus(ctx.root);
    return { ok: true, status };
  },
  preview_diff(ctx, args) {
    const original = projectCodeService.readProjectFile(ctx.root, args.path).content;
    const preview = buildPatchPreview({
      filePath: args.path,
      originalContent: original,
      proposedContent: args.proposedContent,
      summary: args.summary || "预览",
    });
    return { ok: true, preview };
  },
  stage_patch(ctx, args) {
    const proposal = patchProposalService.buildProposalFromArgs(ctx.root, args);
    const patch = createStagedPatch(ctx.getUserDataPath, ctx.userId, {
      projectId: ctx.projectId,
      taskId: ctx.taskId,
      agentRunId: ctx.agentRunId,
      filePath: proposal.filePath,
      originalContent: proposal.originalContent,
      proposedContent: proposal.proposedContent,
      unifiedDiff: proposal.unifiedDiff,
      summary: proposal.summary,
      patchEdits: proposal.patchEdits,
      patchQuality: proposal.patchQuality,
    });
    return {
      ok: true,
      stagedPatchId: patch.id,
      status: patch.status,
      summary: patch.summary,
      patchQuality: proposal.patchQuality,
    };
  },
  compress_context(ctx, args) {
    const compressionManager = require("./context-compression/contextCompressionManager.js");
    const namespace = buildTaskNamespace(ctx.projectId, ctx.taskId);
    const result = compressionManager.applyCompression(ctx.getUserDataPath, ctx.userId, {
      namespace,
      messages: [],
      reason: args.reason || "manual",
      mode: args.mode || "normal",
    });
    return {
      ok: Boolean(result.applied),
      applied: result.applied,
      snapshotId: result.snapshot?.id || null,
      revision: result.snapshot?.revision || null,
      tokensBefore: result.tokensBefore,
      tokensAfter: result.tokensAfter,
      summaryPreview: result.snapshot?.snapshot?.currentObjective?.text || "",
      error: result.message || null,
    };
  },
  list_verification_profiles(ctx) {
    const { listProfiles } = require("./verificationProfileRegistry.js");
    return { ok: true, profiles: listProfiles(ctx.root), trust: "system" };
  },
  async run_verification(ctx, args) {
    if (!ctx.autoVerifyGranted) {
      return {
        ok: false,
        code: "USER_APPROVAL_REQUIRED",
        error: "run_verification 需要任务级自动验证授权（autoVerify / task_once）",
      };
    }
    const { resolveProfileId } = require("./verificationProfileRegistry.js");
    const { runVerification } = require("./verificationService.js");
    let profileId;
    try {
      profileId = resolveProfileId(args.profileId || args.scriptName);
    } catch (e) {
      return { ok: false, code: e.code || "VERIFY_PROFILE_INVALID", error: e.message };
    }
    const result = await runVerification(
      ctx.getUserDataPath,
      ctx.userId,
      {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        profileId,
        scriptName: profileId,
        userApproved: true,
      },
      { getDefaultProjectRoot: ctx.getDefaultProjectRoot }
    );
    return {
      ok: Boolean(result.ok),
      skipped: Boolean(result.skipped),
      profileId,
      scriptName: result.scriptName,
      exitCode: result.exitCode,
      message: result.message || result.parsed?.summary || null,
      stdoutTail: String(result.stdout || "").slice(-4000),
      stderrTail: String(result.stderr || "").slice(-4000),
      trust: "system",
    };
  },
};

module.exports = {
  PERMISSION,
  MODE_ALLOWED,
  TOOL_DEFS,
  normalizeToolName,
  getToolDef,
  listToolSchemas,
  assertToolAllowed,
  dispatchTool,
  llmVerifyToolEnabled,
};
