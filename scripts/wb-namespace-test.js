const assert = require("assert");
const {
  buildProjectNamespace,
  buildTaskNamespace,
  buildChatNamespace,
  assertNoCrossScopeRead,
  assertNamespaceAllowed,
  namespacesForProjectScope,
  isDevToolName,
  NAMESPACE_FORBIDDEN,
} = require("../main/workbench/namespace.js");
const { assertChatAgentTool } = require("../main/workbench/agentOrchestrator.js");

function expectForbidden(fn) {
  let caught = null;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  assert(caught, "expected error");
  assert.strictEqual(caught.code, NAMESPACE_FORBIDDEN);
}

assert.strictEqual(buildProjectNamespace("proj_1"), "project:proj_1");
assert.strictEqual(buildTaskNamespace("proj_1", "task_1"), "task:proj_1:task_1");
assert.strictEqual(buildChatNamespace("chat_1"), "chat:chat_1");

expectForbidden(() =>
  assertNoCrossScopeRead("chat:chat_1", "project:proj_1")
);
expectForbidden(() =>
  assertNoCrossScopeRead("project:proj_a", "project:proj_b")
);

const allowed = namespacesForProjectScope("proj_1", "task_1");
assertNamespaceAllowed("project:proj_1", allowed);
assertNamespaceAllowed("task:proj_1:task_1", allowed);
expectForbidden(() => assertNamespaceAllowed("chat:chat_1", allowed));

try {
  assertChatAgentTool("write_project_file");
  assert.fail("expected tool forbidden");
} catch (err) {
  assert.strictEqual(err.code, "TOOL_FORBIDDEN");
}
assert.strictEqual(isDevToolName("git_commit"), true);

console.log("wb-namespace-test: OK");
