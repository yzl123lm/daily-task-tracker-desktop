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

const {
  buildMissingFileRecoveryNudge,
  buildPreemptiveMissingFilesNote,
  listMissingProjectFiles,
  pickRecoveryNudge,
} = require("../main/workbench/patchRecoveryHints.js");

const missingNudge = buildMissingFileRecoveryNudge([
  {
    tool: "read_file",
    args: { path: "game.js" },
    result: { ok: false, code: "FILE_NOT_FOUND", error: "文件不存在：game.js", hint: "use_stage_patch" },
  },
]);
assert.ok(missingNudge.includes("【新建文件提示】"));
assert.ok(missingNudge.includes("game.js"));
assert.ok(missingNudge.includes("stage_patch"));

const fs = require("fs");
const path = require("path");
const os = require("os");
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wb-missing-"));
fs.writeFileSync(path.join(tmpRoot, "index.html"), "<html></html>\n", "utf8");
assert.deepStrictEqual(listMissingProjectFiles(tmpRoot, ["index.html", "game.js"]), ["game.js"]);
const note = buildPreemptiveMissingFilesNote(tmpRoot, "目标文件：game.js, index.html\nCanvas 绘制");
assert.ok(note.includes("game.js"));
assert.ok(!note.includes("- index.html") || note.indexOf("game.js") >= 0);
fs.rmSync(tmpRoot, { recursive: true, force: true });

const picked = pickRecoveryNudge(
  [
    {
      tool: "read_file",
      args: { path: "game.js" },
      result: { ok: false, code: "FILE_NOT_FOUND", hint: "use_stage_patch" },
    },
  ],
  []
);
assert.ok(picked.includes("【新建文件提示】"));

// HTML-as-edits misuse: first create_file + junk fragments → keep valid op only
const {
  buildProposalFromArgs,
  normalizePatchEdits,
} = require("../main/workbench/patchProposalService.js");
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
