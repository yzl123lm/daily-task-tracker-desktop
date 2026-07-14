const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(
  path.join(process.env.APPDATA, "daily-task-tracker-desktop", "workbench.sqlite")
);

const rows = db
  .prepare(
    `SELECT tool_name, args_json, result_text, created_at
     FROM tool_operations
     WHERE tool_name = 'stage_patch'
     ORDER BY created_at DESC
     LIMIT 20`
  )
  .all();

for (const r of rows) {
  let args = {};
  let res = {};
  try {
    args = JSON.parse(r.args_json || "{}");
  } catch {
    /* ignore */
  }
  try {
    res = JSON.parse(r.result_text || "{}");
  } catch {
    res = { raw: String(r.result_text || "").slice(0, 200) };
  }
  const ops = (args.edits || []).map((e) => e.op || e.operation || "(empty)");
  const err = String(res.error || res.code || "");
  const interesting =
    /不支持|PatchEdit|TOOL_ERROR|唯一匹配|锚点/.test(err) ||
    ops.some((o) => !o || o === "(empty)" || !["replace", "replace_range", "insert_before", "insert_after", "delete", "create_file", "append_file", "full_content"].includes(String(o).toLowerCase()));
  if (!interesting && res.ok !== false) continue;
  console.log("---", r.created_at);
  console.log("path:", args.path);
  console.log("ops:", ops);
  console.log("edits keys:", (args.edits || []).map((e) => Object.keys(e || {})));
  console.log("edits sample:", JSON.stringify((args.edits || []).slice(0, 2)).slice(0, 500));
  console.log("error:", err.slice(0, 300) || JSON.stringify(res).slice(0, 300));
  console.log("ok:", res.ok, "hint:", res.hint);
}
