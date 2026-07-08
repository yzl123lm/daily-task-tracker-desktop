const { isLocalChatInferenceBaseUrl } = require("../apiNormalize.js");
const {
  readOllamaSettings,
  normalizeOllamaHost,
  stripOpenAiV1BaseSuffix,
  isLikelyOllamaOpenAiBase,
  buildOllamaNativeOptions,
  extractOllamaNativeChatUsage,
} = require("../ollamaRuntime.js");
const { appendMiniMaxErrorHints } = require("../miniMaxHints.js");
const { resolveModelProfile } = require("./modelProfileResolver.js");

function assertNotAborted(signal) {
  if (signal && signal.aborted) {
    throw new Error("用户已取消生成");
  }
}

async function sleepMsAbortable(ms, signal) {
  if (!ms || ms <= 0) {
    return;
  }
  assertNotAborted(signal);
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error("用户已取消生成"));
    };
    if (signal && signal.aborted) {
      clearTimeout(t);
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function miniMaxFailureRetryable(httpStatus, data, rawText) {
  if ([520, 502, 503, 504, 429].includes(httpStatus)) {
    return true;
  }
  const msg = data && typeof data === "object" ? String(data.error?.message || data.message || "") : "";
  const code = data && typeof data === "object" ? data.error?.code ?? data.code : undefined;
  if (code === 1000 || code === "1000" || code === 2064 || code === "2064") {
    return true;
  }
  const choiceCount = data && typeof data === "object" && Array.isArray(data.choices) ? data.choices.length : -1;
  const baseStatusCode = data && typeof data === "object" ? data.base_resp?.status_code : undefined;
  if (httpStatus === 200 && choiceCount === 0 && (baseStatusCode === 0 || baseStatusCode === "0")) {
    return true;
  }
  if (/unknown error/i.test(msg) && /\b1000\b|\(1000\)/.test(msg)) {
    return true;
  }
  if (/集群负载较高|cluster.*load|please retry later/i.test(msg)) {
    return true;
  }
  if (!data && /\b1000\b|"code"\s*:\s*1000/i.test(String(rawText || ""))) {
    return true;
  }
  return false;
}

function normalizeMessages(rawMessages) {
  return (rawMessages || []).map((m) => {
    const base = {
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    };
    if (m && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      base.tool_calls = m.tool_calls;
    }
    if (m && typeof m.tool_call_id === "string" && m.tool_call_id.trim()) {
      base.tool_call_id = m.tool_call_id;
    }
    if (m && typeof m.name === "string" && m.name.trim()) {
      base.name = m.name;
    }
    return base;
  });
}

/**
 * Shared chat completions client for Workbench Agent (no web search).
 */
async function chatCompletions(options = {}) {
  const {
    messages: rawMessages,
    tools,
    tool_choice: toolChoice,
    signal,
    credentials,
    temperature = 1.0,
  } = options;
  if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
    throw new Error("缺少对话消息");
  }
  const cred = resolveModelProfile({ credentials });
  const messages = normalizeMessages(rawMessages);
  const apiKey = cred.apiKey;
  const localInference = isLocalChatInferenceBaseUrl(cred.baseUrl);
  if (!apiKey && !localInference) {
    throw new Error("未配置有效 API Key，且非本机推理地址");
  }
  const base = cred.baseUrl.replace(/\/$/, "");
  const useOllamaNative = localInference && isLikelyOllamaOpenAiBase(cred.baseUrl);
  let ollamaApiRoot = useOllamaNative ? stripOpenAiV1BaseSuffix(cred.baseUrl) : "";
  if (useOllamaNative && (!ollamaApiRoot || !/^https?:\/\//i.test(ollamaApiRoot))) {
    ollamaApiRoot = normalizeOllamaHost(readOllamaSettings().host);
  }

  const bodyPayload = {
    model: cred.model,
    messages,
    temperature,
  };
  if (Array.isArray(tools) && tools.length > 0) {
    bodyPayload.tools = tools;
    bodyPayload.tool_choice = toolChoice || "auto";
  }

  const maxAttempts = 4;
  const backoffMs = [0, 1200, 2600, 4200];
  let lastFailText = "";

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    assertNotAborted(signal);
    if (backoffMs[attempt] > 0) {
      await sleepMsAbortable(backoffMs[attempt], signal);
    }
    const headers = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    let url;
    let body;
    if (useOllamaNative) {
      const oset = readOllamaSettings();
      const toolsInUse = Array.isArray(tools) && tools.length > 0;
      const nativeOptions = buildOllamaNativeOptions(oset, { toolsInUse });
      url = `${ollamaApiRoot}/api/chat`;
      const nativeBody = {
        model: cred.model,
        messages,
        stream: false,
        options: nativeOptions,
      };
      if (Array.isArray(tools) && tools.length > 0) {
        nativeBody.tools = tools;
        nativeBody.tool_choice = toolChoice || "auto";
      }
      body = JSON.stringify(nativeBody);
    } else {
      url = `${base}/chat/completions`;
      body = JSON.stringify(bodyPayload);
    }

    let res;
    let text;
    try {
      res = await fetch(url, { method: "POST", headers, body, signal });
      text = await res.text();
    } catch (e) {
      if (signal?.aborted || e?.name === "AbortError") {
        throw new Error("用户已取消生成");
      }
      throw e;
    }

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }

    if (useOllamaNative) {
      const errFromNative =
        typeof data?.error === "string" ? data.error : data?.error?.message || data?.error;
      const assistantMsg = data?.message;
      const nativeOk =
        res.ok &&
        assistantMsg &&
        !errFromNative &&
        (assistantMsg.role == null || assistantMsg.role === "assistant");
      if (nativeOk) {
        const syntheticRaw = { choices: [{ message: assistantMsg }], model: data.model };
        const ollamaUsage = extractOllamaNativeChatUsage(data, assistantMsg);
        return {
          message: assistantMsg,
          content: assistantMsg.content ?? "",
          raw: syntheticRaw,
          ollamaUsage,
          provider: "ollama-native",
        };
      }
      lastFailText = errFromNative || text || res.statusText || `HTTP ${res.status}`;
      if (miniMaxFailureRetryable(res.status, data, text) && attempt < maxAttempts - 1) {
        continue;
      }
      throw new Error(appendMiniMaxErrorHints(lastFailText));
    }

    const hasChoices = data && Array.isArray(data.choices) && data.choices.length > 0;
    const apiErr = data && data.error && (data.error.message || data.error.code !== undefined);
    if (res.ok && hasChoices && !apiErr) {
      const msg = data.choices[0]?.message || {};
      return {
        message: msg,
        content: msg.content ?? "",
        raw: data,
        ollamaUsage: null,
        provider: "openai-compatible",
      };
    }

    lastFailText =
      (data && (data.error?.message || data.message)) || text || res.statusText || `HTTP ${res.status}`;
    if (miniMaxFailureRetryable(res.status, data, text) && attempt < maxAttempts - 1) {
      continue;
    }
    throw new Error(appendMiniMaxErrorHints(lastFailText));
  }

  throw new Error(appendMiniMaxErrorHints(lastFailText));
}

module.exports = {
  chatCompletions,
  normalizeMessages,
  miniMaxFailureRetryable,
};
