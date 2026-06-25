const fs = require("fs");
const path = require("path");

const BRANDS = {
  minimax: { file: "minimax", bg: "#0f1117", fill: "#ffffff" },
  deepseek: { file: "deepseek", bg: "#4D6BFE", fill: "#ffffff" },
  qwen: { file: "alibabacloud", bg: "#5B4DFF", fill: "#ffffff" },
  moonshot: {
    custom:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#0B0F19"/><path d="M16.2 7.1a5.6 5.6 0 1 0 2.1 10.7 4.4 4.4 0 1 1-2.1-10.7Z" fill="#F8FAFC"/></svg>',
  },
  zhipu: {
    custom:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#2563EB"/><path d="M7.4 16.6V7.4h2.1l2.3 4 2.3-4h2.1v9.2h-1.9v-5.2l-2.1 3.7h-1.1l-2.1-3.7v5.2H7.4Z" fill="#fff"/></svg>',
  },
  baidu: { file: "baidu", bg: "#2932E1", fill: "#ffffff" },
  openai: {
    custom:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="#0F172A"/><g transform="translate(4.2 4.2) scale(0.65)"><path d="M22.28 9.82a4.98 4.98 0 0 0-2.03-2.03l-3.9-2.26a4.98 4.98 0 0 0-4.34 0l-3.9 2.26a4.98 4.98 0 0 0-2.03 2.03l-2.26 3.9a4.98 4.98 0 0 0 0 4.34l2.26 3.9a4.98 4.98 0 0 0 2.03 2.03l3.9 2.26a4.98 4.98 0 0 0 4.34 0l3.9-2.26a4.98 4.98 0 0 0 2.03-2.03l2.26-3.9a4.98 4.98 0 0 0 0-4.34l-2.26-3.9Z" stroke="#10B981" stroke-width="1.4" fill="none"/><path d="M12 8.2v7.6M9.2 10.2l5.6 3.2M14.8 10.2l-5.6 3.2" stroke="#ECFDF5" stroke-width="1.2" stroke-linecap="round"/></g></svg>',
  },
  ollama: { file: "ollama", bg: "#F1F5F9", fill: "#111827" },
  generic: {
    custom:
      '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><rect width="24" height="24" rx="6" fill="url(#genericGrad)"/><defs><linearGradient id="genericGrad" x1="5" y1="5" x2="19" y2="19"><stop stop-color="#6366F1"/><stop offset="1" stop-color="#3B82F6"/></linearGradient></defs><path d="M12 6.5l1.1 3.4h3.6l-2.9 2.1 1.1 3.4L12 13.3l-2.9 2.1 1.1-3.4-2.9-2.1h3.6L12 6.5Z" fill="#fff"/></svg>',
  },
};

function wrapPath(bg, pathD, fill, pad = 4) {
  const scale = (24 - pad * 2) / 24;
  return (
    `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">` +
    `<rect width="24" height="24" rx="6" fill="${bg}"/>` +
    `<g transform="translate(${pad} ${pad}) scale(${scale})">` +
    `<path d="${pathD}" fill="${fill}"/>` +
    `</g></svg>`
  );
}

const svgs = {};
for (const [id, cfg] of Object.entries(BRANDS)) {
  if (cfg.custom) {
    svgs[id] = cfg.custom;
    continue;
  }
  const svg = fs.readFileSync(
    path.join("node_modules/simple-icons/icons", `${cfg.file}.svg`),
    "utf8"
  );
  const m = svg.match(/d="([^"]+)"/);
  if (!m) throw new Error(`No path for ${id}`);
  svgs[id] = wrapPath(cfg.bg, m[1], cfg.fill);
}

const out = `/**
 * Provider brand marks for configured model cards (inline SVG, no external assets).
 * Generated from simple-icons where available.
 */
(function initProviderBrandIcons(global) {
  const BRAND_SVGS = ${JSON.stringify(svgs, null, 2)};

  function applyProviderBrandIcon(host, providerId, fallbackText) {
    if (!host) return;
    const id = BRAND_SVGS[providerId] ? providerId : "generic";
    host.className = \`cap-chat-profile-card-icon cap-chat-profile-card-icon--brand is-\${id}\`;
    host.innerHTML = BRAND_SVGS[id];
    host.setAttribute("role", "img");
    host.setAttribute("aria-label", fallbackText || providerId || "模型");
  }

  global.applyProviderBrandIcon = applyProviderBrandIcon;
})(typeof window !== "undefined" ? window : globalThis);
`;

fs.writeFileSync("providerBrandIcons.js", out, "utf8");
console.log("Wrote providerBrandIcons.js with", Object.keys(svgs).length, "icons");
