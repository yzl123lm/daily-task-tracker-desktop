const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  buildUnifiedDiff,
  suggestPatchFromDescription,
  commentPatchFallbackEnabled,
} = require("../main/workbench/diffPreviewService.js");
const {
  applyPatchEdits,
  buildProposalFromArgs,
  scorePatchQuality,
} = require("../main/workbench/patchProposalService.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "wb-pq-"));
const root = path.join(tmp, "proj");
fs.mkdirSync(path.join(root, "src"), { recursive: true });
fs.writeFileSync(path.join(root, "src", "a.js"), "const x = 1;\nconst y = 2;\n", "utf8");

// jsdiff unified output should include hunk headers
const diff = buildUnifiedDiff("src/a.js", "a\nb\nc\n", "a\nB\nc\n");
assert.ok(diff.includes("--- a/src/a.js"));
assert.ok(diff.includes("+++ b/src/a.js"));
assert.ok(/@@/.test(diff));
assert.ok(diff.includes("-b") || diff.includes("-b\n"));
assert.ok(diff.includes("+B") || diff.includes("+B\n"));

// comment fallback disabled by default
delete process.env.WB_ALLOW_COMMENT_PATCH_FALLBACK;
assert.strictEqual(commentPatchFallbackEnabled(), false);
try {
  suggestPatchFromDescription("src/a.js", "hi", "fake");
  assert.fail("should reject comment fallback");
} catch (err) {
  assert.strictEqual(err.code, "COMMENT_PATCH_FALLBACK_DISABLED");
}

process.env.WB_ALLOW_COMMENT_PATCH_FALLBACK = "1";
const fake = suggestPatchFromDescription("src/a.js", "hi", "fake");
assert.ok(fake.proposedContent.includes("// [PLAN_ONLY 建议]"));
delete process.env.WB_ALLOW_COMMENT_PATCH_FALLBACK;

// replace unique match
const replaced = applyPatchEdits("hello world", [{ op: "replace", find: "world", replace: "earth" }]);
assert.strictEqual(replaced, "hello earth");
try {
  applyPatchEdits("aa aa", [{ op: "replace", find: "aa", replace: "b" }]);
  assert.fail("multi match should fail");
} catch (err) {
  assert.ok(String(err.message).includes("唯一匹配"));
}

// create_file proposal
const created = buildProposalFromArgs(root, {
  path: "src/new.js",
  edits: [{ op: "create_file", content: "export const n = 1;\n" }],
  summary: "create",
});
assert.ok(created.patchQuality.applicable);
assert.ok(created.unifiedDiff.includes("new.js"));

// no-op rejected
try {
  buildProposalFromArgs(root, {
    path: "src/a.js",
    proposedContent: fs.readFileSync(path.join(root, "src", "a.js"), "utf8"),
  });
  assert.fail("noop should reject");
} catch (err) {
  assert.strictEqual(err.code, "PATCH_QUALITY_REJECTED");
}

const q = scorePatchQuality({
  filePath: "x.js",
  originalContent: "a",
  proposedContent: "// [PLAN_ONLY 建议] x\na",
  patchEdits: [],
  isCreate: false,
});
assert.strictEqual(q.applicable, false);

console.log("wb-patch-quality-test: OK");
fs.rmSync(tmp, { recursive: true, force: true });
