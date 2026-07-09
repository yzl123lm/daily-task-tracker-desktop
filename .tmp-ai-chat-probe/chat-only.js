const { app } = require("electron");
const path = require("path");
app.setPath("userData", path.join(process.env.APPDATA, "daily-task-tracker-desktop"));
app.whenReady().then(async () => {
  try {
    const store = require("../main/aiSessionStore.js");
    const cred = store.getActiveProfileCredentials();
    console.log("cred", cred.model, cred.baseUrl, !!cred.apiKey);
    // Load search helpers from main by extracting - instead duplicate call chatCompletions
    const { chatCompletions } = require("../main/ai/chatCompletionsClient.js");
    try {
      const r = await chatCompletions({
        messages: [
          { role: "system", content: "简短回答" },
          { role: "user", content: "南宁有什么美食？一句话" }
        ],
        temperature: 0.3,
      });
      console.log("CHAT_OK", String(r.content||"").slice(0,200));
    } catch (e) {
      console.log("CHAT_ERR", e.name, e.message);
      console.log(String(e.stack||"").split("\n").slice(0,8).join("\n"));
    }
  } catch (e) {
    console.log("OUTER", e.message);
  }
  app.exit(0);
});
