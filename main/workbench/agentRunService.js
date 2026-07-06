const { getDb } = require("./db.js");
const { resolveUserId } = require("./projectService.js");
const { assertSafeId } = require("../../utils/ipcValidate.js");

function listAgentRunsForTask(getUserDataPath, userId, projectId, taskId, { limit = 10 } = {}) {
  const db = getDb(getUserDataPath);
  const uid = resolveUserId(userId);
  const pid = assertSafeId(projectId, "projectId");
  const tid = assertSafeId(taskId, "taskId");
  const rows = db
    .prepare(
      `SELECT * FROM agent_runs
       WHERE user_id = ? AND project_id = ? AND task_id = ?
       ORDER BY created_at DESC LIMIT ?`
    )
    .all(uid, pid, tid, Math.min(Math.max(limit, 1), 50));
  return rows.map((row) => {
    let output = null;
    try {
      output = row.output_text ? JSON.parse(row.output_text) : null;
    } catch {
      output = null;
    }
    return {
      id: row.id,
      agentType: row.agent_type,
      status: row.status,
      inputText: row.input_text,
      output,
      createdAt: row.created_at,
      completedAt: row.completed_at,
    };
  });
}

module.exports = {
  listAgentRunsForTask,
};
