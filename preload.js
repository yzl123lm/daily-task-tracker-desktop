const { contextBridge, ipcRenderer } = require("electron");



contextBridge.exposeInMainWorld("electronAPI", {

  getAISettings: () => ipcRenderer.invoke("ai-settings-get"),

  setAISettings: (settings) => ipcRenderer.invoke("ai-settings-set", settings),

  getAIState: () => ipcRenderer.invoke("ai-state-get"),

  setActiveAIProfile: (id) => ipcRenderer.invoke("ai-profile-set-active", { id }),

  saveAIProfile: (payload) => ipcRenderer.invoke("ai-profile-save", payload),

  deleteAIProfile: (id) => ipcRenderer.invoke("ai-profile-delete", { id }),

  setWebSearchEnabled: (enabled) => ipcRenderer.invoke("ai-web-search-set", { enabled }),

  aiChat: (payload) => ipcRenderer.invoke("ai-chat", payload),

  aiChatAbort: (payload) => ipcRenderer.invoke("ai-chat-abort", payload),

  aiLocationContext: () => ipcRenderer.invoke("ai-location-context"),

  aiExportDocument: (payload) => ipcRenderer.invoke("ai-export-document", payload),

  taskExportExcel: (payload) => ipcRenderer.invoke("task-export-excel", payload),

  embeddingOpenAi: (payload) => ipcRenderer.invoke("embedding-openai", payload),

  getASRSettings: () => ipcRenderer.invoke("asr-settings-get"),

  setASRSettings: (settings) => ipcRenderer.invoke("asr-settings-set", settings),

  asrTranscribe: (payload) => ipcRenderer.invoke("asr-transcribe", payload),

  getCapabilitySettings: () => ipcRenderer.invoke("capability-settings-get"),

  setCapabilitySettings: (settings) => ipcRenderer.invoke("capability-settings-set", settings),

  getTTSSettings: () => ipcRenderer.invoke("tts-settings-get"),

  setTTSSettings: (settings) => ipcRenderer.invoke("tts-settings-set", settings),

  getImageSettings: () => ipcRenderer.invoke("image-settings-get"),

  setImageSettings: (settings) => ipcRenderer.invoke("image-settings-set", settings),

  ttsSpeak: (payload) => ipcRenderer.invoke("tts-speak", payload),

  imageGenerate: (payload) => ipcRenderer.invoke("image-generate", payload),

  imageUnderstand: (payload) => ipcRenderer.invoke("image-understand", payload),

  getOllamaSettings: () => ipcRenderer.invoke("ollama-settings-get"),

  setOllamaSettings: (payload) => ipcRenderer.invoke("ollama-settings-set", payload),

  getOllamaLibraryCatalog: () => ipcRenderer.invoke("ollama-library-catalog"),

  getOllamaStatus: () => ipcRenderer.invoke("ollama-status"),

  listOllamaLocalModels: () => ipcRenderer.invoke("ollama-list-local"),

  pullOllamaModel: (payload) => ipcRenderer.invoke("ollama-pull", payload),

  deleteOllamaModel: (payload) => ipcRenderer.invoke("ollama-delete", payload),

  onOllamaPullProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("ollama-pull-progress", listener);
    return () => ipcRenderer.removeListener("ollama-pull-progress", listener);
  },

  getCpuLocalLlmHint: () => ipcRenderer.invoke("cpu-local-llm-hint"),

  getOllamaHardwareRecommend: () => ipcRenderer.invoke("ollama-hardware-recommend"),

  getVoiceLibraryCatalog: () => ipcRenderer.invoke("voice-library-catalog"),

  getVoiceLibraryStatus: () => ipcRenderer.invoke("voice-library-status"),

  installVoiceLibraryItem: (payload) => ipcRenderer.invoke("voice-library-install", payload),

  onVoiceLibraryInstallProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("voice-library-install-progress", listener);
    return () => ipcRenderer.removeListener("voice-library-install-progress", listener);
  },

  runtimePrerequisitesEvaluate: () => ipcRenderer.invoke("runtime-prerequisites-evaluate"),

  runtimePrerequisitesRemediate: (payload) => ipcRenderer.invoke("runtime-prerequisites-remediate", payload),

  runtimePrerequisitesOpenUrl: (payload) => ipcRenderer.invoke("runtime-prerequisites-open-url", payload),

  runtimePrerequisitesRemediateAuto: () => ipcRenderer.invoke("runtime-prerequisites-remediate-auto"),

  getStartupReport: () => ipcRenderer.invoke("startup-get-report"),

  onStartupReport: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("startup-report", handler);
    return () => ipcRenderer.removeListener("startup-report", handler);
  },

  environmentEvaluate: (payload) => ipcRenderer.invoke("environment-evaluate", payload),

  environmentGetProfile: () => ipcRenderer.invoke("environment-get-profile"),

  environmentShouldShowWizard: () => ipcRenderer.invoke("environment-should-show-wizard"),

  environmentWizardSkip: () => ipcRenderer.invoke("environment-wizard-skip"),

  environmentRemediate: (payload) => ipcRenderer.invoke("environment-remediate", payload),

  environmentRemediateBatch: (payload) => ipcRenderer.invoke("environment-remediate-batch", payload),

  environmentGetInstallPaths: () => ipcRenderer.invoke("environment-get-install-paths"),

  environmentChooseInstallPath: (payload) => ipcRenderer.invoke("environment-choose-install-path", payload),

  environmentSaveInstallPaths: (payload) => ipcRenderer.invoke("environment-save-install-paths", payload),

  taskAttachmentGetSettings: () => ipcRenderer.invoke("task-attachment-get-settings"),

  taskAttachmentSetRoot: (payload) => ipcRenderer.invoke("task-attachment-set-root", payload),

  taskAttachmentChooseRoot: (payload) => ipcRenderer.invoke("task-attachment-choose-root", payload),

  taskAttachmentPickFiles: () => ipcRenderer.invoke("task-attachment-pick-files"),

  taskAttachmentPrepareDir: (payload) => ipcRenderer.invoke("task-attachment-prepare-dir", payload),

  taskAttachmentSaveBuffers: (payload) => ipcRenderer.invoke("task-attachment-save-buffers", payload),

  taskAttachmentCopyFiles: (payload) => ipcRenderer.invoke("task-attachment-copy-files", payload),

  taskAttachmentList: (payload) => ipcRenderer.invoke("task-attachment-list", payload),

  taskAttachmentOpenFile: (payload) => ipcRenderer.invoke("task-attachment-open-file", payload),

  taskAttachmentShowInFolder: (payload) => ipcRenderer.invoke("task-attachment-show-in-folder", payload),

  taskAttachmentDeleteForTask: (payload) => ipcRenderer.invoke("task-attachment-delete-for-task", payload),

  onEnvironmentProfile: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("environment-profile", handler);
    return () => ipcRenderer.removeListener("environment-profile", handler);
  },

  onEnvironmentShowWizard: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("environment-show-wizard", handler);
    return () => ipcRenderer.removeListener("environment-show-wizard", handler);
  },

  onEnvironmentRemediationProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("environment-remediation-progress", handler);
    return () => ipcRenderer.removeListener("environment-remediation-progress", handler);
  },

  lunarCalendarQuery: (payload) => ipcRenderer.invoke("lunar-calendar-query", payload),

  cnlunarCalendarQuery: (payload) => ipcRenderer.invoke("cnlunar-calendar-query", payload),

  kbGetState: () => ipcRenderer.invoke("kb-get-state"),

  kbLibraryList: () => ipcRenderer.invoke("kb-library-list"),

  kbLibraryCreate: (payload) => ipcRenderer.invoke("kb-library-create", payload),

  kbLibrarySetActive: (libraryId) => ipcRenderer.invoke("kb-library-set-active", libraryId),

  kbLibraryRename: (payload) => ipcRenderer.invoke("kb-library-rename", payload),
  kbLibraryDelete: (payload) => ipcRenderer.invoke("kb-library-delete", payload),

  kbStorageChooseDir: () => ipcRenderer.invoke("kb-storage-choose-dir"),

  kbStorageSetDir: (dirPath) => ipcRenderer.invoke("kb-storage-set-dir", dirPath),

  kbOpenLibraryDir: (payload) => ipcRenderer.invoke("kb-open-library-dir", payload),

  kbSetSettings: (payload) => ipcRenderer.invoke("kb-set-settings", payload),

  kbPickAndIngest: (payload) => ipcRenderer.invoke("kb-pick-and-ingest", payload),

  kbIngestPath: (filePath) => ipcRenderer.invoke("kb-ingest-path", filePath),

  kbParseLocalFile: (payload) => ipcRenderer.invoke("kb-parse-local-file", payload),

  kbDeleteDocument: (docId) => ipcRenderer.invoke("kb-delete-document", docId),

  kbMoveDocument: (payload) => ipcRenderer.invoke("kb-move-document", payload),

  kbSearch: (payload) => ipcRenderer.invoke("kb-search", payload),

  kbWarmEmbedModel: (payload) => ipcRenderer.invoke("kb-warm-embed-model", payload),

  kbRebuildEmbeddings: (payload) => ipcRenderer.invoke("kb-rebuild-embeddings", payload),
  kbRebuildFtsIndex: (payload) => ipcRenderer.invoke("kb-rebuild-fts-index", payload),
  kbIndexHealth: (payload) => ipcRenderer.invoke("kb-index-health", payload),

  kbModelHealthCheck: (payload) => ipcRenderer.invoke("kb-model-health-check", payload),

  kbWebVerifyQuery: (query) => ipcRenderer.invoke("kb-web-verify-query", query),

  kbAutoLearnIngest: (payload) => ipcRenderer.invoke("kb-auto-learn-ingest", payload),

  kbAutoLearnQueueList: (payload) => ipcRenderer.invoke("kb-auto-learn-queue-list", payload),

  kbAutoLearnApprove: (payload) => ipcRenderer.invoke("kb-auto-learn-approve", payload),

  kbAutoLearnReject: (payload) => ipcRenderer.invoke("kb-auto-learn-reject", payload),

  kbAutoLearnPromote: (payload) => ipcRenderer.invoke("kb-auto-learn-promote", payload),

  kbAutoLearnRollback: (payload) => ipcRenderer.invoke("kb-auto-learn-rollback", payload),

  kbAutoLearnAuditList: (payload) => ipcRenderer.invoke("kb-auto-learn-audit-list", payload),

  kbOpsLogList: (payload) => ipcRenderer.invoke("kb-ops-log-list", payload),

  kbGraphSnapshot: (payload) => ipcRenderer.invoke("kb-graph-snapshot", payload),

  kbGraphRebuild: (payload) => ipcRenderer.invoke("kb-graph-rebuild", payload),

  kbOpenDocument: (payload) => ipcRenderer.invoke("kb-open-document", payload),

  kbListFixedDrives: () => ipcRenderer.invoke("kb-list-fixed-drives"),

  kbChooseRelocateFile: (payload) => ipcRenderer.invoke("kb-choose-relocate-file", payload),

  onKbOpenDocumentProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-open-document-progress", handler);
    return () => ipcRenderer.removeListener("kb-open-document-progress", handler);
  },

  kbUnlockDocument: (payload) => ipcRenderer.invoke("kb-unlock-document", payload),

  kbSubmitDocumentPassword: (payload) => ipcRenderer.invoke("kb-submit-document-password", payload),

  kbCancelDocumentPassword: (payload) => ipcRenderer.invoke("kb-cancel-document-password", payload),

  kbWatchChooseDir: () => ipcRenderer.invoke("kb-watch-choose-dir"),

  kbWatchScanNow: (payload) => ipcRenderer.invoke("kb-watch-scan-now", payload),

  onKbWatchEvent: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-watch-event", handler);
    return () => ipcRenderer.removeListener("kb-watch-event", handler);
  },

  onKbIngestProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-ingest-progress", handler);
    return () => ipcRenderer.removeListener("kb-ingest-progress", handler);
  },

  onKbDocumentPasswordRequest: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-document-password-request", handler);
    return () => ipcRenderer.removeListener("kb-document-password-request", handler);
  },

  onKbSearchProgress: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-search-progress", handler);
    return () => ipcRenderer.removeListener("kb-search-progress", handler);
  },

  onKbSearchResult: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("kb-search-result", handler);
    return () => ipcRenderer.removeListener("kb-search-result", handler);
  },

  searchQueryProcess: (payload) => ipcRenderer.invoke("search-query-process", payload),

  searchMultiSourceRetrieve: (payload) => ipcRenderer.invoke("search-multi-source-retrieve", payload),

  searchContentProcess: (payload) => ipcRenderer.invoke("search-content-process", payload),

  searchResultGenerate: (payload) => ipcRenderer.invoke("search-result-generate", payload),

  searchSourceStatus: (payload) => ipcRenderer.invoke("search-source-status", payload),

  searchRuleConfigGet: (payload) => ipcRenderer.invoke("search-rule-config-get", payload),

  searchRuleConfigSet: (payload) => ipcRenderer.invoke("search-rule-config-set", payload),

  openWorkbenchWindow: (payload) => ipcRenderer.invoke("workbench-window-open", payload),

  getWindowMode: () => {
    const mode = new URLSearchParams(window.location.search).get("window");
    return mode === "workbench" ? "workbench" : "ai";
  },

  onWorkbenchNavigate: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("workbench-navigate", handler);
    return () => ipcRenderer.removeListener("workbench-navigate", handler);
  },

});

