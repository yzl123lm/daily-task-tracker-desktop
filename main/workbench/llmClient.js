const { chatCompletions } = require("../ai/chatCompletionsClient.js");
const {
  extractToolCallsFromResponse,
  buildToolResultMessage,
  buildAssistantToolCallMessage,
} = require("../ai/toolCallAdapter.js");

async function llmChatWithTools({ messages, tools, mode, signal, credentials }) {
  const response = await chatCompletions({
    messages,
    tools,
    tool_choice: tools?.length ? "auto" : undefined,
    signal,
    credentials,
  });
  const toolCalls = extractToolCallsFromResponse(response);
  return {
    response,
    message: response.message || { role: "assistant", content: response.content },
    toolCalls,
  };
}

module.exports = {
  llmChatWithTools,
  chatCompletions,
};
