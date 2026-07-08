const { runVerification } = require("./verificationService.js");
const { runProjectAgentLLM } = require("./projectAgentLLM.js");
const { updateTask } = require("./projectService.js");
const { resolveUserId } = require("./projectService.js");
const { resolveProjectRoot } = require("./projectCodeService.js");
const { getProject } = require("./projectService.js");
const { TASK_STATUS } = require("./taskStatus.js");

const MAX_FIX_ROUNDS = 3;

async function runFixLoop(
  getUserDataPath,
  userId,
  ctx,
  { scriptName = "build", getDefaultProjectRoot } = {}
) {
  const uid = resolveUserId(userId);
  const project = getProject(getUserDataPath, uid, ctx.projectId);
  const root = resolveProjectRoot(project, getDefaultProjectRoot);
  if (!root) {
    throw new Error("未配置项目代码目录");
  }

  let round = 0;
  let lastVerify = null;
  while (round < MAX_FIX_ROUNDS) {
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.TESTING,
      currentStep: `验证 ${scriptName}${round ? ` (第 ${round + 1} 轮)` : ""}`,
    });
    lastVerify = await runVerification(
      getUserDataPath,
      uid,
      {
        projectId: ctx.projectId,
        taskId: ctx.taskId,
        scriptName,
        userApproved: true,
      },
      { getDefaultProjectRoot }
    );
    if (lastVerify.ok) {
      updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
        status: TASK_STATUS.COMPLETED,
        currentStep: "验证通过",
      });
      return { ok: true, rounds: round + 1, verify: lastVerify };
    }
    if (lastVerify.skipped) {
      return { ok: false, skipped: true, message: lastVerify.message, verify: lastVerify };
    }
    round += 1;
    if (round >= MAX_FIX_ROUNDS) {
      break;
    }
    updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
      status: TASK_STATUS.FIXING,
      currentStep: `构建失败，Agent 修复中 (${round}/${MAX_FIX_ROUNDS})`,
    });
    const fixMessage = [
      "构建/测试失败，请根据错误信息生成修复补丁（stage_patch），不要直接写入。",
      lastVerify.parsed?.summary || "",
      ...(lastVerify.parsed?.issues || []).slice(0, 5).map((i) => `${i.file}:${i.line}`),
    ].join("\n");
    const agentCtx = {
      ...ctx,
      root,
      mode: "VERIFY_FIX",
      promptContext: ctx.promptContext,
    };
    await runProjectAgentLLM(agentCtx, { message: fixMessage, mode: "VERIFY_FIX" });
    return {
      ok: false,
      waitingApproval: true,
      round,
      verify: lastVerify,
      message: "已生成修复补丁，等待用户审阅接受",
    };
  }
  updateTask(getUserDataPath, uid, ctx.projectId, ctx.taskId, {
    status: TASK_STATUS.FAILED,
    currentStep: `${MAX_FIX_ROUNDS} 轮修复后仍失败`,
  });
  return { ok: false, failed: true, rounds: MAX_FIX_ROUNDS, verify: lastVerify };
}

module.exports = {
  MAX_FIX_ROUNDS,
  runFixLoop,
};
