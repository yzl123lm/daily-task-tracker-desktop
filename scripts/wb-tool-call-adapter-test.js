const assert = require("assert");
const {
  extractJsonActionToolCalls,
  extractToolCallsFromResponse,
  buildAssistantToolCallMessage,
} = require("../main/ai/toolCallAdapter.js");

const jsonContent = `\`\`\`json
{"action":"read_file","arguments":{"path":"app.js"}}
\`\`\``;
const calls = extractJsonActionToolCalls(jsonContent);
assert.strictEqual(calls.length, 1);
assert.strictEqual(calls[0].name, "read_file");
assert.strictEqual(calls[0].source, "json-action");

const fromResponse = extractToolCallsFromResponse({
  message: { role: "assistant", content: jsonContent },
  content: jsonContent,
});
assert.strictEqual(fromResponse[0].name, "read_file");

const assistantMsg = buildAssistantToolCallMessage(calls);
assert.strictEqual(assistantMsg.role, "assistant");
assert.ok(Array.isArray(assistantMsg.tool_calls));

console.log("wb-tool-call-adapter-test: OK");
