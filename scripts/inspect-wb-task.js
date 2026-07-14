/**
 * Inspect workbench task by id/title keyword.
 * Usage: node scripts/inspect-wb-task.js [keyword]
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const { DatabaseSync } = require("node:sqlite");

const keyword = process.argv[2] || "贪吃蛇";

function findDbPaths() {
  const roots = [
    path.join(process.env.APPDATA || "", "daily-task-tracker-desktop"),
    path.join(process.env.LOCALAPPDATA || "", "daily-task-tracker-desktop"),
    path.join(os.homedir(), "AppData", "Roaming", "daily-task-tracker-desktop"),
    path.join(os.homedir(), "AppData", "Local", "daily-task-tracker-desktop"),
  ];
  const dbs = [];
  for (const root of roots) {
    const p = path.join(root, "workbench.sqlite");
    if (fs.existsSync(p)) dbs.push(p);
  }
  return dbs;
}

function q(db, sql, params = []) {
  return db.prepare(sql).all(...params);
}

const dbs = findDbPaths();
if (!dbs.length) {
  console.error("No workbench.sqlite found under userData paths");
  process.exit(1);
}

for (const dbPath of dbs) {
  console.log("\n=== DB:", dbPath, "===");
  const db = new DatabaseSync(dbPath);
  const tasks = q(
    db,
    `SELECT t.*, p.name AS project_name, p.local_path
     FROM project_tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.id LIKE ?
     ORDER BY t.updated_at DESC LIMIT 20`,
    [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%121%`]
  );
  if (!tasks.length) {
    console.log("No tasks matching:", keyword);
    continue;
  }
  for (const task of tasks) {
    console.log("\n--- Task ---");
    console.log(JSON.stringify(
      {
        id: task.id,
        title: task.title,
        status: task.status,
        current_step: task.current_step,
        project: task.project_name,
        local_path: task.local_path,
        fix_loop: task.fix_loop_json ? JSON.parse(task.fix_loop_json) : null,
        task_spec: task.task_spec_json ? JSON.parse(task.task_spec_json) : null,
        plan_steps: task.plan_steps_json ? JSON.parse(task.plan_steps_json) : null,
      },
      null,
      2
    ));
    const runs = q(
      db,
      `SELECT id, status, agent_type, input_text, output_text, error_message, created_at, completed_at
       FROM agent_runs WHERE task_id = ? ORDER BY created_at DESC LIMIT 8`,
      [task.id]
    );
    console.log("\nAgent runs:", runs.length);
    for (const run of runs) {
      console.log(JSON.stringify({
        id: run.id,
        status: run.status,
        agent_type: run.agent_type,
        error: run.error_message,
        input: run.input_text?.slice?.(0, 200),
        created_at: run.created_at,
      }));
      const tools = q(
        db,
        `SELECT tool_name, args_json, result_text, created_at
         FROM tool_operations WHERE agent_run_id = ? ORDER BY created_at ASC`,
        [run.id]
      );
      console.log("  tool_operations:", tools.length);
      const counts = {};
      for (const t of tools) {
        let parsed = {};
        try {
          parsed = JSON.parse(t.result_text || "{}");
        } catch {
          parsed = { raw: t.result_text?.slice?.(0, 80) };
        }
        const err = parsed.error || parsed.code || parsed.message || "";
        const k = `${t.tool_name}|${String(t.args_json || "").slice(0, 80)}|${String(err).slice(0, 60)}`;
        counts[k] = (counts[k] || 0) + 1;
        if (parsed.ok === false || /error|reject|fail/i.test(String(t.result_text || ""))) {
          console.log("  FAIL:", t.tool_name, parsed.code, String(parsed.error || t.result_text || "").slice(0, 180));
        }
      }
      const dupes = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
      if (dupes.length) console.log("  repeated:", dupes.slice(0, 6));
      const audits = q(
        db,
        `SELECT action, detail_json, created_at FROM audit_logs
         WHERE scope_id = ? OR detail_json LIKE ? ORDER BY created_at DESC LIMIT 15`,
        [task.id, `%${run.id}%`]
      );
      for (const a of audits.slice(0, 8)) {
        console.log("  audit:", a.action, a.detail_json?.slice?.(0, 150));
      }
      const trace = q(
        db,
        `SELECT tool_trace_json FROM agent_run_sessions WHERE task_id = ? ORDER BY created_at DESC LIMIT 3`,
        [task.id]
      );
      if (trace?.tool_trace_json) {
        try {
          const tt = JSON.parse(trace.tool_trace_json);
          const fails = tt.filter((t) => t.result?.ok === false);
          console.log("\n  toolTrace total:", tt.length, "failures:", fails.length);
          const counts = {};
          for (const t of tt) {
            const k = `${t.tool}|${JSON.stringify(t.args || {}).slice(0, 80)}|${String(t.result?.error || t.result?.code || "").slice(0, 60)}`;
            counts[k] = (counts[k] || 0) + 1;
          }
          const dupes = Object.entries(counts).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]);
          console.log("  repeated tools:", dupes.slice(0, 8));
          for (const f of fails.slice(0, 10)) {
            console.log("  FAIL:", f.tool, f.result?.code, f.result?.error?.slice?.(0, 150));
          }
        } catch (e) {
          console.log("  toolTrace parse error", e.message);
        }
      }
    }
    const patches = q(
      db,
      `SELECT id, file_path, status, summary, patch_quality_json, created_at
       FROM staged_patches WHERE task_id = ? ORDER BY created_at DESC LIMIT 10`,
      [task.id]
    );
    console.log("\nStaged patches:", patches.length);
    for (const p of patches) {
      let pq = null;
      try {
        pq = p.patch_quality_json ? JSON.parse(p.patch_quality_json) : null;
      } catch {
        /* ignore */
      }
      console.log(" ", p.status, p.file_path, p.summary?.slice?.(0, 80), pq?.issues);
    }
  }
  db.close();
}
