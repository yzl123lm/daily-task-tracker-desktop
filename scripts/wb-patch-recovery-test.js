/**
 * Patch recovery + plan step file enrichment tests
 */
const assert = require("assert");
const {
  buildPatchFailureRecovery,
  buildPatchRecoveryNudge,
  shouldDeferNoProgressBlock,
} = require("../main/workbench/patchRecoveryHints.js");
const { enrichStepsWithExpectedFiles } = require("../main/workbench/planStepsService.js");

const rec = buildPatchFailureRecovery({
  error: new Error('replace 锚点未找到："foo"'),
  filePath: "index.html",
  originalContent: "<html></html>",
  args: { summary: "draw canvas snake" },
});
assert.ok(rec.recoveryHint.includes("proposedContent"));
assert.strictEqual(rec.suggestFullContent, true);

const nudge = buildPatchRecoveryNudge([
  { tool: "stage_patch", args: { path: "index.html" }, result: { ok: false, error: "replace 锚点未找到" } },
  { tool: "stage_patch", args: { path: "index.html" }, result: { ok: false, error: "replace 锚点未找到" } },
  { tool: "stage_patch", args: { path: "style.css" }, result: { ok: false, error: "replace 唯一匹配 0" } },
]);
assert.ok(nudge.includes("【补丁恢复提示】"));
assert.ok(shouldDeferNoProgressBlock(
  [
    { tool: "stage_patch", args: { path: "a.js" }, result: { ok: false, error: "replace 锚点未找到" } },
    { tool: "stage_patch", args: { path: "a.js" }, result: { ok: false, error: "replace 锚点未找到" } },
    { tool: "stage_patch", args: { path: "a.js" }, result: { ok: false, error: "replace 锚点未找到" } },
  ],
  []
));

const steps = enrichStepsWithExpectedFiles(
  [
    { id: "step_1", text: "创建主界面、画布、状态栏和电脑控制面板。", status: "done" },
    { id: "step_2", text: "使用 Canvas 绘制网格、蛇、食物和游戏状态遮罩。", status: "pending" },
  ],
  { goalHint: "开发贪吃蛇游戏" }
);
assert.deepStrictEqual(steps[1].expectedFiles, ["game.js", "index.html"]);

// HTML-as-edits misuse: first create_file + junk fragments → keep valid op only
const {
  buildProposalFromArgs,
  normalizePatchEdits,
} = require("../main/workbench/patchProposalService.js");
const fs = require("fs");
const path = require("path");
const os = require("os");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-patch-rec-"));
fs.writeFileSync(path.join(tmp, "index.html"), "<html></html>\n", "utf8");
const junk = normalizePatchEdits([
  { op: "full_content", content: "<html><body>ok</body></html>\n" },
  { $text: " " },
  { strong: {}, $text: "x" },
  { dt: {}, $text: "y" },
]);
assert.strictEqual(junk.edits.length, 1);
assert.strictEqual(junk.dropped, 3);
const fixed = buildProposalFromArgs(tmp, {
  path: "index.html",
  edits: [
    { op: "full_content", content: "<html><body>snake</body></html>\n" },
    { $text: "fragment" },
    { strong: { $text: "bad" } },
  ],
  summary: "fix html-as-edits",
});
assert.ok(fixed.proposedContent.includes("snake"));
fs.rmSync(tmp, { recursive: true, force: true });

console.log("wb-patch-recovery-test: OK");
