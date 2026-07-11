/**
 * BL-011 / VER-004: Start ephemeral HTTP server, fetch page, basic DOM assertions.
 * Works in Node (tests) and Electron main (optional BrowserWindow console capture).
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};

function findHtmlEntry(root) {
  const candidates = ["index.html", "public/index.html", "src/index.html", "app.html"];
  for (const rel of candidates) {
    if (fs.existsSync(path.join(root, rel))) return rel;
  }
  try {
    for (const name of fs.readdirSync(root)) {
      if (name.startsWith(".") || name === "node_modules") continue;
      if (/\.html?$/i.test(name) && fs.statSync(path.join(root, name)).isFile()) return name;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function startStaticServer(root, { preferredEntry } = {}) {
  const entry = preferredEntry || findHtmlEntry(root);
  if (!entry) {
    const err = new Error("未找到 HTML 入口，无法启动 web-http-smoke");
    err.code = "WEB_SMOKE_NO_ENTRY";
    throw err;
  }

  const server = http.createServer((req, res) => {
    try {
      const u = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(u.pathname);
      if (rel === "/" || rel === "") rel = `/${entry.split(/[/\\]/).pop()}`;
      // map /index.html to entry directory
      const entryDir = path.dirname(path.join(root, entry));
      const safeRoot = path.resolve(entryDir === root ? root : entryDir);
      let filePath = path.resolve(safeRoot, `.${rel}`);
      if (!filePath.startsWith(safeRoot)) {
        res.writeHead(403);
        res.end("forbidden");
        return;
      }
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(root, entry);
      }
      const data = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      res.end(data);
    } catch (e) {
      res.writeHead(500);
      res.end(String(e.message || e));
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr.port : 0;
      resolve({
        server,
        port,
        entry,
        baseUrl: `http://127.0.0.1:${port}/`,
        close: () =>
          new Promise((res) => {
            server.close(() => res());
          }),
      });
    });
    server.on("error", reject);
  });
}

function httpGet(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("HTTP 请求超时"));
    });
    req.on("error", reject);
  });
}

function assertDomBasics(html) {
  const body = String(html || "");
  const checks = [];
  const hasHtml = /<html[\s>]/i.test(body) || /<body[\s>]/i.test(body) || /<div[\s>]/i.test(body);
  checks.push({ id: "has_markup", ok: hasHtml, detail: hasHtml ? "found markup" : "no html/body" });
  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
  checks.push({
    id: "has_title_or_heading",
    ok: Boolean(titleMatch) || /<h[1-3][\s>]/i.test(body),
    detail: titleMatch ? `title=${titleMatch[1].trim()}` : "heading-or-missing",
  });
  // Block empty shell
  const textish = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
  const visible = textish.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  checks.push({
    id: "non_empty_content",
    ok: visible.length >= 1,
    detail: `visibleChars=${visible.length}`,
  });
  return {
    ok: checks.every((c) => c.ok),
    checks,
    title: titleMatch ? titleMatch[1].trim() : null,
  };
}

/**
 * Optional Electron BrowserWindow console capture (main process only).
 */
async function captureConsoleWithElectron(url, timeoutMs = 8000) {
  let BrowserWindow;
  try {
    ({ BrowserWindow } = require("electron"));
  } catch {
    return { available: false, consoleErrors: [], skipped: true, reason: "not_electron" };
  }
  if (!BrowserWindow) {
    return { available: false, consoleErrors: [], skipped: true, reason: "no_BrowserWindow" };
  }

  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false,
      webPreferences: { offscreen: true, sandbox: true },
    });
    const consoleErrors = [];
    const timer = setTimeout(() => {
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
      resolve({ available: true, consoleErrors, timedOut: true });
    }, timeoutMs);

    win.webContents.on("console-message", (_e, level, message) => {
      if (level >= 2) consoleErrors.push(String(message || ""));
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => {
      consoleErrors.push(`did-fail-load:${code}:${desc}`);
    });
    win
      .loadURL(url)
      .then(() => {
        setTimeout(() => {
          clearTimeout(timer);
          try {
            win.destroy();
          } catch {
            /* ignore */
          }
          resolve({ available: true, consoleErrors, timedOut: false });
        }, 1200);
      })
      .catch((err) => {
        clearTimeout(timer);
        try {
          win.destroy();
        } catch {
          /* ignore */
        }
        resolve({ available: true, consoleErrors: [String(err.message || err)], timedOut: false });
      });
  });
}

async function runWebHttpSmokeVerification(root, options = {}) {
  const startedAt = new Date().toISOString();
  if (!root || !fs.existsSync(root)) {
    return {
      ok: false,
      skipped: false,
      profileId: "web-http-smoke",
      scriptName: "web-http-smoke",
      message: "项目目录不存在",
      evidence: [],
    };
  }

  let srv;
  try {
    srv = await startStaticServer(root, { preferredEntry: options.entry });
    const pageUrl = new URL(path.basename(srv.entry), srv.baseUrl).href;
    const resp = await httpGet(pageUrl, options.timeoutMs || 10000);
    const dom = assertDomBasics(resp.body);
    let consoleProbe = { available: false, consoleErrors: [], skipped: true };
    if (options.captureConsole !== false) {
      try {
        consoleProbe = await captureConsoleWithElectron(pageUrl, 6000);
      } catch {
        consoleProbe = { available: false, consoleErrors: [], skipped: true, reason: "capture_failed" };
      }
    }

    const consoleBlocking =
      consoleProbe.available && (consoleProbe.consoleErrors || []).length > 0 && options.failOnConsole !== false;
    const ok = resp.statusCode === 200 && dom.ok && !consoleBlocking;

    const evidence = [
      {
        type: "http_response",
        url: pageUrl,
        statusCode: resp.statusCode,
        at: startedAt,
      },
      {
        type: "dom_assert",
        checks: dom.checks,
        title: dom.title,
        at: new Date().toISOString(),
      },
    ];
    if (consoleProbe.available) {
      evidence.push({
        type: "console_probe",
        errors: consoleProbe.consoleErrors,
        at: new Date().toISOString(),
      });
    } else {
      evidence.push({
        type: "console_probe_skipped",
        reason: consoleProbe.reason || "http_dom_only",
        at: new Date().toISOString(),
      });
    }

    return {
      ok,
      skipped: false,
      profileId: "web-http-smoke",
      scriptName: "web-http-smoke",
      message: ok
        ? `Web HTTP 冒烟通过：${pageUrl}`
        : `Web HTTP 冒烟失败：status=${resp.statusCode} dom=${dom.ok} consoleErrors=${(consoleProbe.consoleErrors || []).length}`,
      url: pageUrl,
      entry: srv.entry,
      evidence,
      stdout: `GET ${pageUrl} -> ${resp.statusCode}`,
      stderr: consoleBlocking ? (consoleProbe.consoleErrors || []).join("\n") : "",
    };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      profileId: "web-http-smoke",
      scriptName: "web-http-smoke",
      message: err.message || String(err),
      code: err.code,
      evidence: [],
    };
  } finally {
    if (srv) await srv.close();
  }
}

module.exports = {
  findHtmlEntry,
  startStaticServer,
  httpGet,
  assertDomBasics,
  runWebHttpSmokeVerification,
  captureConsoleWithElectron,
};
