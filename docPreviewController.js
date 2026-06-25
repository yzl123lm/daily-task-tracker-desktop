/**
 * AI 对话区右侧文档预览控制器（拆分自 ai.js，便于维护与审计）。
 * 依赖：浏览器 DOM API；由 index.html 在 ai.js 之前加载。
 */
(function initDocPreviewController(global) {
  const ZOOM_MIN = 0.5;
  const ZOOM_MAX = 2;
  const ZOOM_STEP = 0.1;
  const SPLIT_MIN = 0.35;
  const SPLIT_MAX = 0.75;
  const DEFAULT_SPLIT = 0.56;

  function stripDocTextBlock(raw) {
    return String(raw || "")
      .replace(/^【上传文档：[^\n]*】\n?/g, "")
      .replace(/\n?【文档结束】$/g, "")
      .trim();
  }

  function normalizePreviewEntry(raw, fileExtFn) {
    const fileExt = typeof fileExtFn === "function" ? fileExtFn : () => "";
    return {
      name: String(raw?.name || "未命名文档"),
      ext: String(raw?.ext || fileExt(raw?.name || "") || ""),
      status: String(raw?.status || ""),
      errorMsg: String(raw?.errorMsg || ""),
      previewText: String(raw?.previewText || stripDocTextBlock(raw?.textBlock || "")),
      previewKind: String(raw?.previewKind || ""),
      previewUrl: String(raw?.previewUrl || ""),
      previewHtml: String(raw?.previewHtml || ""),
      previewWarn: String(raw?.previewWarn || ""),
      textBlock: String(raw?.textBlock || ""),
    };
  }

  function isPreviewableEntry(entry) {
    if (!entry || entry.status !== "ready") {
      return false;
    }
    return Boolean(
      String(entry.previewText || "").trim() ||
        String(entry.previewHtml || "").trim() ||
        String(entry.previewUrl || "").trim()
    );
  }

  /**
   * @param {{
   *   elements: {
   *     workspace?: HTMLElement|null,
   *     mainCol?: HTMLElement|null,
   *     splitHandle?: HTMLElement|null,
   *     pane?: HTMLElement|null,
   *     select?: HTMLSelectElement|null,
   *     content?: HTMLElement|null,
   *     frame?: HTMLIFrameElement|null,
   *     image?: HTMLImageElement|null,
   *     html?: HTMLElement|null,
   *     contentWrap?: HTMLElement|null,
   *     zoomOutBtn?: HTMLButtonElement|null,
   *     zoomResetBtn?: HTMLButtonElement|null,
   *     zoomInBtn?: HTMLButtonElement|null,
   *     closeBtn?: HTMLButtonElement|null,
   *     toggleBtn?: HTMLButtonElement|null,
   *   },
   *   docVisualByExtName: (ext: string, name?: string) => { badge: string },
   *   fileExt: (name: string) => string,
   * }} options
   */
  function createDocPreviewController(options) {
    const els = options?.elements || {};
    const docVisualByExtName = options?.docVisualByExtName || (() => ({ badge: "FILE" }));
    const fileExt = options?.fileExt || (() => "");

    let activeEntries = [];
    let activeIndex = 0;
    let zoom = 1;
    let splitRatio = DEFAULT_SPLIT;
    let eventsBound = false;

    function hasEntries() {
      return activeEntries.some(isPreviewableEntry);
    }

    function isOpen() {
      return Boolean(els.pane && !els.pane.hidden);
    }

    function syncToggleButton() {
      const btn = els.toggleBtn;
      if (!btn) {
        return;
      }
      const show = hasEntries() && !isOpen();
      btn.hidden = !show;
      btn.disabled = !hasEntries();
    }

    function setOpen(open) {
      if (els.pane) {
        els.pane.hidden = !open;
      }
      if (els.splitHandle) {
        els.splitHandle.hidden = !open;
      }
      if (els.workspace) {
        els.workspace.classList.toggle("has-doc-preview", Boolean(open));
      }
      if (open) {
        applySplitRatio();
      } else {
        resetSplitLayout();
      }
      syncToggleButton();
    }

    function applySplitRatio() {
      if (!els.mainCol || !els.pane) {
        return;
      }
      const left = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, Number(splitRatio) || DEFAULT_SPLIT));
      const right = 1 - left;
      els.mainCol.style.flex = `0 0 ${(left * 100).toFixed(2)}%`;
      els.pane.style.flex = `0 0 ${(right * 100).toFixed(2)}%`;
    }

    function resetSplitLayout() {
      if (els.mainCol) {
        els.mainCol.style.flex = "";
      }
      if (els.pane) {
        els.pane.style.flex = "";
      }
    }

    function updateZoomUi() {
      if (els.zoomResetBtn) {
        els.zoomResetBtn.textContent = `${Math.round(zoom * 100)}%`;
      }
    }

    function applyZoom() {
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number(zoom) || 1));
      zoom = z;
      if (els.html) {
        els.html.style.zoom = String(z);
      }
      if (els.content) {
        els.content.style.zoom = String(z);
      }
      if (els.image) {
        els.image.style.transformOrigin = "top center";
        els.image.style.transform = `scale(${z})`;
      }
      updateZoomUi();
    }

    function clearPreviewSurfaces() {
      if (els.select) {
        els.select.innerHTML = "";
      }
      if (els.content) {
        els.content.textContent = "";
        els.content.hidden = false;
        els.content.style.zoom = "";
      }
      if (els.frame) {
        els.frame.hidden = true;
        els.frame.src = "about:blank";
      }
      if (els.image) {
        els.image.hidden = true;
        els.image.src = "";
        els.image.style.transform = "";
      }
      if (els.html) {
        els.html.hidden = true;
        els.html.innerHTML = "";
        els.html.style.zoom = "";
      }
    }

    function revokeBlobUrls(entries) {
      for (const entry of entries) {
        const url = String(entry?.previewUrl || "");
        if (!url.startsWith("blob:")) {
          continue;
        }
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* ignore */
        }
      }
    }

    function hide() {
      setOpen(false);
      syncToggleButton();
    }

    function dispose() {
      revokeBlobUrls(activeEntries);
      activeEntries = [];
      activeIndex = 0;
      zoom = 1;
      clearPreviewSurfaces();
      setOpen(false);
      applyZoom();
    }

    function render() {
      if (!els.pane || !els.select || !els.content) {
        return false;
      }
      const ready = activeEntries.filter(isPreviewableEntry);
      if (!ready.length) {
        hide();
        return false;
      }
      if (activeIndex < 0 || activeIndex >= ready.length) {
        activeIndex = 0;
      }

      els.select.innerHTML = "";
      ready.forEach((entry, index) => {
        const opt = document.createElement("option");
        const badge = docVisualByExtName(entry.ext, entry.name).badge;
        opt.value = String(index);
        opt.textContent = `[${badge}] ${entry.name || `文档 ${index + 1}`}`;
        els.select.appendChild(opt);
      });
      els.select.value = String(activeIndex);

      const active = ready[activeIndex] || ready[0];
      const text = String(active?.previewText || "").trim();
      const previewKind = String(active?.previewKind || "").toLowerCase();
      const previewUrl = String(active?.previewUrl || "").trim();
      const previewHtmlValue = String(active?.previewHtml || "").trim();

      if (els.frame) {
        els.frame.hidden = true;
        els.frame.src = "about:blank";
      }
      if (els.image) {
        els.image.hidden = true;
        els.image.src = "";
      }
      if (els.html) {
        els.html.hidden = true;
        els.html.innerHTML = "";
      }
      if (els.content) {
        els.content.hidden = false;
        els.content.textContent = text || "（该文档未提取到可用文本）";
      }

      if (previewKind === "pdf" && previewUrl && els.frame) {
        const src = /#/.test(previewUrl) ? previewUrl : `${previewUrl}#zoom=page-width`;
        els.frame.src = src;
        els.frame.hidden = false;
        if (els.content) {
          els.content.hidden = true;
        }
      } else if (previewKind === "image" && previewUrl && els.image) {
        els.image.src = previewUrl;
        els.image.hidden = false;
        if (els.content) {
          els.content.hidden = true;
        }
      } else if (previewKind === "html" && previewHtmlValue && els.html) {
        const safeHtml =
          typeof sanitizePreviewHtml === "function" ? sanitizePreviewHtml(previewHtmlValue) : previewHtmlValue;
        els.html.innerHTML = safeHtml;
        els.html.hidden = false;
        if (els.content) {
          els.content.hidden = true;
        }
      }

      setOpen(true);
      applyZoom();
      return true;
    }

    function openByEntries(entries) {
      const normalized = (Array.isArray(entries) ? entries : [])
        .map((x) => normalizePreviewEntry(x, fileExt))
        .filter(isPreviewableEntry);
      if (!normalized.length) {
        return false;
      }
      activeEntries = normalized;
      activeIndex = 0;
      return render();
    }

    function bindEvents() {
      if (eventsBound) {
        return;
      }
      eventsBound = true;

      if (els.select) {
        els.select.addEventListener("change", () => {
          const idx = Number(els.select.value);
          if (Number.isFinite(idx) && idx >= 0) {
            activeIndex = idx;
            render();
          }
        });
      }

      if (els.closeBtn) {
        els.closeBtn.addEventListener("click", () => {
          hide();
        });
      }

      if (els.toggleBtn) {
        els.toggleBtn.addEventListener("click", () => {
          if (!hasEntries()) {
            return;
          }
          if (isOpen()) {
            hide();
          } else {
            render();
          }
        });
      }

      if (els.zoomOutBtn) {
        els.zoomOutBtn.addEventListener("click", () => {
          zoom = Math.max(ZOOM_MIN, Number((zoom - ZOOM_STEP).toFixed(2)));
          applyZoom();
        });
      }

      if (els.zoomInBtn) {
        els.zoomInBtn.addEventListener("click", () => {
          zoom = Math.min(ZOOM_MAX, Number((zoom + ZOOM_STEP).toFixed(2)));
          applyZoom();
        });
      }

      if (els.zoomResetBtn) {
        els.zoomResetBtn.addEventListener("click", () => {
          zoom = 1;
          applyZoom();
        });
        updateZoomUi();
      }

      if (els.contentWrap) {
        els.contentWrap.addEventListener(
          "wheel",
          (ev) => {
            if (!ev.ctrlKey) {
              return;
            }
            ev.preventDefault();
            const delta = ev.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
            zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Number((zoom + delta).toFixed(2))));
            applyZoom();
          },
          { passive: false }
        );
      }

      if (els.splitHandle && els.workspace) {
        let dragging = false;
        const onMove = (clientX) => {
          const rect = els.workspace.getBoundingClientRect();
          if (!rect.width) {
            return;
          }
          const ratio = (clientX - rect.left) / rect.width;
          splitRatio = Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio));
          applySplitRatio();
        };
        els.splitHandle.addEventListener("mousedown", (ev) => {
          if (!els.workspace.classList.contains("has-doc-preview")) {
            return;
          }
          dragging = true;
          ev.preventDefault();
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        });
        window.addEventListener("mousemove", (ev) => {
          if (!dragging) {
            return;
          }
          onMove(ev.clientX);
        });
        window.addEventListener("mouseup", () => {
          if (!dragging) {
            return;
          }
          dragging = false;
          document.body.style.cursor = "";
          document.body.style.userSelect = "";
        });
      }
    }

    bindEvents();
    dispose();

    return {
      openByEntries,
      render,
      hide,
      dispose,
      hasEntries,
      isOpen,
      syncToggleButton,
    };
  }

  global.createDocPreviewController = createDocPreviewController;
})(typeof window !== "undefined" ? window : globalThis);
