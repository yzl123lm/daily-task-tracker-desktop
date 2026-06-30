(function initTaskAttachmentsUI(global) {
  const api = global.electronAPI;
  if (!api) {
    return;
  }

  const pendingFiles = [];
  let rootDialogSession = null;

  const el = {
    pickBtn: document.getElementById("taskAttachPickBtn"),
    clearBtn: document.getElementById("taskAttachClearBtn"),
    dropzone: document.getElementById("taskAttachDropzone"),
    fileInput: document.getElementById("taskAttachFileInput"),
    list: document.getElementById("taskAttachPendingList"),
    rootDialog: document.getElementById("taskAttachRootDialog"),
    rootInput: document.getElementById("taskAttachRootInput"),
    rootBrowseBtn: document.getElementById("taskAttachRootBrowseBtn"),
    rootCancelBtn: document.getElementById("taskAttachRootCancelBtn"),
    rootConfirmBtn: document.getElementById("taskAttachRootConfirmBtn"),
    attachmentsWrap: document.getElementById("taskContentAttachments"),
    attachmentsBody: document.getElementById("taskContentAttachmentsBody"),
  };

  async function triggerPickAttachments() {
    const out = await pickAttachmentsViaDialog();
    if (out?.ok && out.paths?.length) {
      await addPendingFromPaths(out.paths);
      return;
    }
    if (out?.canceled) {
      return;
    }
    if (el.fileInput) {
      el.fileInput.click();
      return;
    }
    if (out?.error) {
      alert(`无法打开文件选择窗口：${out.error}`);
    }
  }

  function formatSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) {
      return `${n} B`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(1)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileSizeLabel(file) {
    if (file instanceof File) {
      return formatSize(file.size);
    }
    return "";
  }

  function renderPendingList() {
    if (!el.list) {
      return;
    }
    if (!pendingFiles.length) {
      el.list.innerHTML = "";
      if (el.clearBtn) {
        el.clearBtn.hidden = true;
      }
      return;
    }
    if (el.clearBtn) {
      el.clearBtn.hidden = false;
    }
    el.list.innerHTML = pendingFiles
      .map(
        (f, idx) =>
          `<li class="task-attach-pending-item"><span class="task-attach-pending-name">${escapeHtml(f.name)}</span><span class="task-attach-pending-meta">${escapeHtml(fileSizeLabel(f))}</span><button type="button" class="task-attach-pending-remove secondary" data-idx="${idx}" aria-label="移除">×</button></li>`
      )
      .join("");
    el.list.querySelectorAll(".task-attach-pending-remove").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-idx"));
        if (idx >= 0 && idx < pendingFiles.length) {
          pendingFiles.splice(idx, 1);
          renderPendingList();
        }
      });
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || "");
        const comma = result.indexOf(",");
        resolve(comma >= 0 ? result.slice(comma + 1) : result);
      };
      reader.onerror = () => reject(reader.error || new Error("读取文件失败"));
      reader.readAsDataURL(file);
    });
  }

  async function filesToPayload(files) {
    const out = [];
    for (const file of files) {
      if (!file) {
        continue;
      }
      const base64 = await readFileAsBase64(file);
      out.push({ name: file.name || "file", base64 });
    }
    return out;
  }

  function openRootConfigureDialog(defaultPath) {
    if (!el.rootDialog || typeof el.rootDialog.showModal !== "function") {
      return Promise.resolve({ confirmed: false });
    }
    if (el.rootInput) {
      el.rootInput.value = defaultPath || "";
    }
    return new Promise((resolve) => {
      rootDialogSession = { resolve };
      el.rootDialog.showModal();
    });
  }

  async function ensureRootConfigured() {
    const settings = await api.taskAttachmentGetSettings?.();
    if (settings?.configuredAt) {
      return { ok: true, rootDir: settings.rootDir };
    }
    const picked = await openRootConfigureDialog(settings?.defaultRootDir || settings?.rootDir || "");
    if (!picked?.confirmed) {
      return { ok: false, canceled: true };
    }
    return { ok: true, rootDir: picked.rootDir };
  }

  async function addPendingFromFileList(fileList) {
    const list = Array.from(fileList || []);
    for (const file of list) {
      if (file) {
        pendingFiles.push(file);
      }
    }
    renderPendingList();
  }

  async function pickAttachmentsViaDialog() {
    if (typeof api.taskAttachmentPickFiles !== "function") {
      return { ok: false, error: "附件接口未就绪" };
    }
    try {
      return await api.taskAttachmentPickFiles();
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  }

  async function addPendingFromPaths(paths) {
    const list = Array.isArray(paths) ? paths : [];
    if (!list.length) {
      return;
    }
    for (const p of list) {
      pendingFiles.push({ name: String(p).split(/[/\\]/).pop() || "file", path: p, isPath: true });
    }
    renderPendingList();
  }

  async function savePendingToDir(dir) {
    if (!dir || !pendingFiles.length) {
      return { ok: true, saved: [] };
    }
    const pathItems = pendingFiles.filter((f) => f.isPath && f.path);
    const blobItems = pendingFiles.filter((f) => !f.isPath && f instanceof File);
    let saved = [];
    if (pathItems.length) {
      const copied = await api.taskAttachmentCopyFiles?.({
        dir,
        paths: pathItems.map((f) => f.path),
      });
      if (copied?.saved) {
        saved = saved.concat(copied.saved);
      }
    }
    if (blobItems.length) {
      const payload = await filesToPayload(blobItems);
      const out = await api.taskAttachmentSaveBuffers?.({ dir, files: payload });
      if (out?.saved) {
        saved = saved.concat(out.saved);
      }
    }
    pendingFiles.length = 0;
    renderPendingList();
    return { ok: true, saved };
  }

  async function prepareTaskWithAttachments(task) {
    const rootOk = await ensureRootConfigured();
    if (!rootOk.ok) {
      return { ok: false, canceled: rootOk.canceled };
    }
    const prep = await api.taskAttachmentPrepareDir?.({
      issueType: task.issueType,
      createdAtIsoDate: task.createdAtIsoDate,
      taskId: task.taskId,
    });
    if (!prep?.ok || !prep.dir) {
      return { ok: false, error: prep?.error || "无法创建任务附件目录" };
    }
    if (pendingFiles.length) {
      await savePendingToDir(prep.dir);
    }
    return { ok: true, attachmentDir: prep.dir };
  }

  async function saveFilesToTaskDir(task, files) {
    if (!task) {
      return { ok: false, error: "无效任务" };
    }
    const rootOk = await ensureRootConfigured();
    if (!rootOk.ok) {
      return { ok: false, canceled: rootOk.canceled, error: "未配置附件存储目录" };
    }
    const prep = await api.taskAttachmentPrepareDir?.({
      issueType: task.issueType,
      createdAtIsoDate: task.createdAtIsoDate,
      taskId: task.taskId,
    });
    if (!prep?.ok || !prep.dir) {
      return { ok: false, error: prep?.error || "无法创建任务附件目录" };
    }
    const list = Array.isArray(files) ? files : [];
    if (!list.length) {
      return { ok: true, attachmentDir: prep.dir, saved: [] };
    }
    const pathItems = list.filter((f) => f?.path && !(f instanceof File));
    const blobItems = list.filter((f) => f instanceof File);
    let saved = [];
    if (pathItems.length) {
      const copied = await api.taskAttachmentCopyFiles?.({
        dir: prep.dir,
        paths: pathItems.map((f) => f.path),
      });
      saved = saved.concat(copied?.saved || []);
    }
    if (blobItems.length) {
      const payload = await filesToPayload(blobItems);
      const out = await api.taskAttachmentSaveBuffers?.({ dir: prep.dir, files: payload });
      saved = saved.concat(out?.saved || []);
    }
    return { ok: true, attachmentDir: prep.dir, saved };
  }

  async function renderTaskContentAttachments(task) {
    if (!el.attachmentsWrap || !el.attachmentsBody) {
      return;
    }
    el.attachmentsBody.innerHTML = `<p class="task-content-attachments-loading">正在加载附件…</p>`;
    el.attachmentsWrap.hidden = false;
    const out = await api.taskAttachmentList?.({ task });
    const files = Array.isArray(out?.files) ? out.files : [];
    if (!files.length) {
      el.attachmentsWrap.hidden = true;
      el.attachmentsBody.innerHTML = "";
      return;
    }
    el.attachmentsWrap.hidden = false;
    el.attachmentsBody.innerHTML = files
      .map((f) => {
        if (f.isImage && f.dataUrl) {
          return `<figure class="task-content-attach-image"><img src="${escapeHtmlAttr(f.dataUrl)}" alt="${escapeHtmlAttr(f.name)}" loading="lazy" /><figcaption><button type="button" class="task-content-attach-open" data-path="${escapeHtmlAttr(f.path)}">${escapeHtml(f.name)}</button></figcaption></figure>`;
        }
        return `<button type="button" class="task-content-attach-doc" data-path="${escapeHtmlAttr(f.path)}" title="${escapeHtmlAttr(f.path)}">📄 ${escapeHtml(f.name)} <span class="task-content-attach-size">${escapeHtml(formatSize(f.size))}</span></button>`;
      })
      .join("");
    el.attachmentsBody.querySelectorAll("[data-path]").forEach((node) => {
      node.addEventListener("click", () => {
        const p = node.getAttribute("data-path");
        if (p) {
          void api.taskAttachmentOpenFile?.({ path: p });
        }
      });
    });
  }

  el.pickBtn?.addEventListener("click", () => {
    void triggerPickAttachments();
  });

  el.dropzone?.addEventListener("click", () => {
    void triggerPickAttachments();
  });

  el.dropzone?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      void triggerPickAttachments();
    }
  });

  el.dropzone?.addEventListener("dragover", (ev) => {
    ev.preventDefault();
    el.dropzone.classList.add("is-dragover");
  });

  el.dropzone?.addEventListener("dragleave", () => {
    el.dropzone.classList.remove("is-dragover");
  });

  el.dropzone?.addEventListener("drop", (ev) => {
    ev.preventDefault();
    el.dropzone.classList.remove("is-dragover");
    if (ev.dataTransfer?.files?.length) {
      void addPendingFromFileList(ev.dataTransfer.files);
    }
  });

  el.fileInput?.addEventListener("change", () => {
    if (el.fileInput?.files?.length) {
      void addPendingFromFileList(el.fileInput.files);
      el.fileInput.value = "";
    }
  });

  el.clearBtn?.addEventListener("click", () => {
    pendingFiles.length = 0;
    renderPendingList();
  });

  el.rootBrowseBtn?.addEventListener("click", async () => {
    const out = await api.taskAttachmentChooseRoot?.({ currentPath: el.rootInput?.value || "" });
    if (out?.ok && out.path && el.rootInput) {
      el.rootInput.value = out.path;
    }
  });

  el.rootCancelBtn?.addEventListener("click", () => {
    el.rootDialog?.close();
    rootDialogSession?.resolve?.({ confirmed: false });
    rootDialogSession = null;
  });

  el.rootConfirmBtn?.addEventListener("click", async () => {
    const rootDir = String(el.rootInput?.value || "").trim();
    const saved = await api.taskAttachmentSetRoot?.({ rootDir });
    if (!saved?.ok) {
      alert(saved?.error || "路径无效，请重新选择。");
      return;
    }
    el.rootDialog?.close();
    rootDialogSession?.resolve?.({ confirmed: true, rootDir: saved.rootDir });
    rootDialogSession = null;
  });

  el.rootDialog?.addEventListener("cancel", (ev) => {
    ev.preventDefault();
    rootDialogSession?.resolve?.({ confirmed: false });
    rootDialogSession = null;
  });

  global.TaskAttachmentsUI = {
    getPendingCount: () => pendingFiles.length,
    clearPending: () => {
      pendingFiles.length = 0;
      renderPendingList();
    },
    ensureRootConfigured,
    prepareTaskWithAttachments,
    saveFilesToTaskDir,
    renderTaskContentAttachments,
  };

  global.getAiComposerPendingFiles = function getAiComposerPendingFiles() {
    if (typeof global.__getAiComposerPendingFiles === "function") {
      return global.__getAiComposerPendingFiles() || [];
    }
    return [];
  };

  global.saveAiAttachmentsToTask = async function saveAiAttachmentsToTask(taskRef) {
    const task = typeof taskRef === "object" ? taskRef : null;
    if (!task?.taskId) {
      return { ok: false, error: "无效任务" };
    }
    const files = global.getAiComposerPendingFiles();
    return saveFilesToTaskDir(task, files);
  };
})(typeof window !== "undefined" ? window : globalThis);
