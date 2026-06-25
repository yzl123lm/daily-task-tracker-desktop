/**
 * Strip dangerous markup from untrusted HTML previews (DOC/DOCX conversion output).
 */
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

module.exports = { sanitizePreviewHtml };
