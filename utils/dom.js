/**
 * Shared DOM string helpers for renderer scripts (loaded before app.js / ai.js).
 */
(function initDomUtils(global) {
  function escapeHtml(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeHtmlAttr(text) {
    return escapeHtml(text);
  }

  /** Defense-in-depth for DOC/DOCX preview HTML before innerHTML. */
  function sanitizePreviewHtml(html) {
    let s = String(html || "");
    if (!s) {
      return "";
    }
    const dangerousTags = ["script", "iframe", "object", "embed", "form", "link", "meta", "base", "svg"];
    dangerousTags.forEach((tag) => {
      s = s.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi"), "");
      s = s.replace(new RegExp(`<${tag}[^>]*\\/?>`, "gi"), "");
    });
    s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
    s = s.replace(/\s(href|src|xlink:href)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");
    s = s.replace(/\s(href|src|xlink:href)\s*=\s*("|')\s*data:(?!image\/)[^"']*\2/gi, "");
    return s;
  }

  const api = { escapeHtml, escapeHtmlAttr, sanitizePreviewHtml };
  global.DomUtils = api;
  global.escapeHtml = escapeHtml;
  global.escapeHtmlAttr = escapeHtmlAttr;
  global.sanitizePreviewHtml = sanitizePreviewHtml;
})(typeof window !== "undefined" ? window : globalThis);
