const fs = require("fs");
const path = require("path");
const { readCapabilitySettings } = require("../credentialSettings.js");
const { readOllamaSettings } = require("../ollamaRuntime.js");
const { getActiveProfileCredentials } = require("../aiSessionStore.js");
const { EnvironmentReadinessManager } = require("../environment/EnvironmentReadinessManager.js");

function withTimeout(promise, ms, label) {
  const timeoutMs = Math.max(300, Number(ms) || 3000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label || "任务"}超时（>${timeoutMs}ms）`)), timeoutMs);
    }),
  ]);
}

function kbRoot(userDataPath) {
  return path.join(userDataPath, "knowledge-base");
}

function kbMetaPath(userDataPath) {
  return path.join(kbRoot(userDataPath), "meta.json");
}

async function fetchOllamaQuick(host, pathname, timeoutMs) {
  const base = normalizeOllamaHost(host);
  const url = `${base}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
    if (!res.ok) {
      throw new Error((data && (data.error || data.message)) || text || `HTTP ${res.status}`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function ollamaModelInstalled(tagsData, modelName) {
  const want = String(modelName || "bge-m3").trim().toLowerCase();
  const list = Array.isArray(tagsData?.models) ? tagsData.models : [];
  return list.some((m) => {
    const name = String(m?.name || m?.model || "").trim().toLowerCase();
    return name === want || name.startsWith(`${want}:`);
  });
}

/**
 * @param {{
 *   app: import("electron").App,
 *   getMainWindow: () => import("electron").BrowserWindow | null,
 *   userDataPath: string,
 * }} deps
 */
function createWarmupTasks(deps) {
  const { app, getMainWindow, userDataPath } = deps;

  return [
    {
      id: "config",
      label: "加载应用配置",
      critical: false,
      timeoutMs: 2000,
      weight: 12,
      run: async () => {
        readCapabilitySettings();
        readOllamaSettings();
        getActiveProfileCredentials();
        return { ok: true, message: "配置已加载" };
      },
    },
    {
      id: "directories",
      label: "初始化工作目录",
      critical: false,
      timeoutMs: 2000,
      weight: 10,
      run: async () => {
        const dirs = [userDataPath, kbRoot(userDataPath)];
        dirs.forEach((dir) => {
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
        });
        return { ok: true, message: "目录就绪" };
      },
    },
    {
      id: "environment",
      label: "检测本地 AI 环境",
      critical: false,
      timeoutMs: 5000,
      weight: 34,
      dependsOn: ["directories"],
      run: async () => {
        try {
          const mgr = new EnvironmentReadinessManager({
            appPath: app.getAppPath(),
            userDataPath,
          });
          const { profile } = await mgr.evaluate({ depth: "lite" });
          const issues = profile?.issues || [];
          const errors = issues.filter((i) => i.severity === "error");
          const warns = issues.filter((i) => i.severity === "warn" || i.severity === "info");
          if (errors.length) {
            return {
              ok: false,
              warning: true,
              message: errors.map((i) => i.title).join("；"),
              detail: { profile, issueCount: issues.length },
            };
          }
          if (warns.length) {
            return {
              ok: true,
              warning: true,
              message: warns[0]?.title || "部分环境项待配置",
              detail: { profile },
            };
          }
          return { ok: true, message: "本地 AI 环境就绪", detail: { profile } };
        } catch (err) {
          return {
            ok: false,
            warning: true,
            message: `环境检测跳过（${String(err?.message || err)}）`,
          };
        }
      },
    },
    {
      id: "knowledgeBase",
      label: "检查本地知识库",
      critical: false,
      timeoutMs: 2000,
      weight: 14,
      run: async () => {
        const metaPath = kbMetaPath(userDataPath);
        if (!fs.existsSync(metaPath)) {
          return { ok: true, message: "知识库尚未初始化（首次使用正常）" };
        }
        const raw = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        const libs = Array.isArray(raw?.libraries) ? raw.libraries.length : 0;
        return { ok: true, message: libs ? `已发现 ${libs} 个知识库目录` : "知识库元数据可读" };
      },
    },
    {
      id: "cloudApi",
      label: "检查云端模型配置",
      critical: false,
      timeoutMs: 2000,
      weight: 12,
      run: async () => {
        const creds = getActiveProfileCredentials();
        if (!creds?.baseUrl) {
          return { ok: false, warning: true, message: "尚未配置对话模型，可在设置中完成" };
        }
        const hasKey = Boolean(creds.apiKey);
        return {
          ok: true,
          message: hasKey ? "对话模型配置就绪" : "已配置 Base URL（本地/免 Key 模式）",
        };
      },
    },
    {
      id: "mainUi",
      label: "加载主界面",
      critical: true,
      timeoutMs: 12000,
      weight: 18,
      run: async () => {
        const win = getMainWindow();
        if (!win || win.isDestroyed()) {
          throw new Error("主窗口未创建");
        }
        if (win.webContents.isLoading()) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("主界面加载超时")), 11000);
            win.webContents.once("did-finish-load", () => {
              clearTimeout(timer);
              resolve();
            });
            win.webContents.once("did-fail-load", (_e, code, desc) => {
              clearTimeout(timer);
              reject(new Error(`主界面加载失败：${desc || code}`));
            });
          });
        }
        return { ok: true, message: "主界面已就绪" };
      },
    },
  ];
}

module.exports = {
  createWarmupTasks,
  withTimeout,
};
