function wbApi() {
  return window.electronAPI || {};
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_TEST_COMMANDS = [
  "node scripts/wb-namespace-test.js",
  "node scripts/wb-compression-test.js",
  "node scripts/wb-plan-output-test.js",
  "node scripts/wb-code-read-test.js",
  "node scripts/wb-controlled-dev-test.js",
  "node scripts/wb-backup-restore-test.js",
];

let panelState = {
  projectId: null,
  taskId: null,
  codeRoot: null,
  selectedPath: null,
  fileContent: "",
};

function getTaskId() {
  return (
    panelState.taskId ||
    document.getElementById("wbTaskList")?.dataset?.selectedTaskId ||
    null
  );
}

function ensureSidebarMounts() {
  const fileMount = document.getElementById("wbPwsFileTreeMount");
  const searchMount = document.getElementById("wbPwsSearchMount");
  if (fileMount && !fileMount.querySelector("#wbFileTree")) {
    fileMount.innerHTML = `
      <div class="wb-pws-file-tree-toolbar">
        <input id="wbFileTreeFilter" type="search" placeholder="筛选文件…" autocomplete="off" aria-label="筛选文件" />
        <button type="button" id="wbFileTreeRefreshBtn" class="wb-pws-btn wb-pws-btn--ghost" title="刷新文件树" aria-label="刷新文件树">↻</button>
      </div>
      <p id="wbPwsSidebarSelectedFile" class="wb-pws-selected-file">未选择文件</p>
      <ul id="wbFileTree" class="wb-file-tree scroll-tech" role="tree"></ul>
    `;
  }
  if (searchMount && !searchMount.querySelector("#wbCodeSearchInput")) {
    searchMount.innerHTML = `
      <div class="wb-code-panel__search wb-pws-search-form">
        <input id="wbCodeSearchInput" type="search" placeholder="搜索代码…" autocomplete="off" aria-label="搜索代码" />
        <button type="button" id="wbCodeSearchBtn" class="wb-pws-btn wb-pws-btn--ghost">搜索</button>
      </div>
      <ul id="wbCodeSearchHits" class="wb-code-search-hits scroll-tech" hidden></ul>
    `;
  }
  return { fileMount, searchMount };
}

function highlightFileTreeSelection(relPath) {
  const tree = document.getElementById("wbFileTree");
  if (!tree) {
    return;
  }
  tree.querySelectorAll(".wb-file-tree__item").forEach((item) => {
    item.classList.toggle("is-selected", item.dataset.path === relPath);
  });
  const sidebarPath = document.getElementById("wbPwsSidebarSelectedFile");
  if (sidebarPath) {
    sidebarPath.textContent = relPath || "未选择文件";
  }
}

async function wbAlert(message, { title = "提示", detail = "" } = {}) {
  if (typeof window.__wbAlert === "function") {
    await window.__wbAlert({ title, message, detail });
    return;
  }
  alert(message);
}

async function wbConfirm(message, { title = "确认操作", detail = "" } = {}) {
  if (typeof window.__wbConfirm === "function") {
    return window.__wbConfirm({ title, message, detail });
  }
  return window.confirm(detail ? `${message}\n\n${detail}` : message);
}

function getCreateGitBranchChecked() {
  return (
    document.getElementById("wbCreateBranchBeforeWrite")?.checked ??
    document.getElementById("wbCreateGitBranch")?.checked ??
    false
  );
}

function hasPendingManualWrite() {
  if (!panelState.selectedPath) {
    return false;
  }
  const patchContent = document.getElementById("wbPatchContent");
  if (!patchContent) {
    return false;
  }
  const proposed = String(patchContent.value ?? "");
  if (!proposed.trim()) {
    return false;
  }
  const original = String(panelState.fileContent ?? "");
  if (patchContent.dataset.userEdited !== "1") {
    return false;
  }
  return proposed !== original;
}

function bindSourceRootCardEvents() {
  const btn = document.getElementById("wbProjectChooseRootBtn");
  if (!btn || btn.dataset.bound === "1") {
    return;
  }
  btn.dataset.bound = "1";
  btn.addEventListener("click", () => {
    void chooseProjectRoot();
  });
}

function ensureSourceRootCard() {
  if (document.getElementById("wbPwsSourceRootCard")) {
    bindSourceRootCardEvents();
    return document.getElementById("wbPwsSourceRootCard");
  }
  const switcher = document.querySelector(
    '.wb-pws-sidebar-pane[data-pane="tasks"] .wb-pws-project-switcher'
  );
  if (!switcher) {
    return null;
  }
  const card = document.createElement("div");
  card.className = "wb-pws-source-root-card";
  card.id = "wbPwsSourceRootCard";
  card.innerHTML = `
    <div class="wb-pws-source-root-card__header">
      <span class="wb-pws-source-root-card__title">项目源码目录</span>
      <button type="button" id="wbProjectChooseRootBtn" class="wb-pws-source-root-card__action wb-pws-btn wb-pws-btn--ghost">
        设置项目源码目录
      </button>
    </div>
    <div class="wb-pws-source-root-card__path" id="wbProjectSourceRootText">未配置项目源码目录</div>
    <p class="wb-pws-source-root-card__hint" id="wbProjectSourceRootHint">当前使用默认工作区，AI 编程能力可能受限</p>
    <div class="wb-pws-source-root-card__meta">
      <span id="wbProjectGitStatusText">Git：未知</span>
    </div>
  `;
  switcher.insertAdjacentElement("afterend", card);
  bindSourceRootCardEvents();
  return card;
}

function renderSourceRootGitStatus(status) {
  const gitEl = document.getElementById("wbProjectGitStatusText");
  if (!gitEl) {
    return;
  }
  if (!status?.isRepo) {
    gitEl.textContent = "Git：非仓库";
    return;
  }
  const branch = status.branch || "detached";
  if (status.clean) {
    gitEl.textContent = `Git：${branch}`;
    return;
  }
  const count = status.changeCount ?? status.changes?.length ?? status.lines?.length ?? 0;
  gitEl.textContent = `Git：${branch} · ${count} 项变更`;
}

function renderSourceRootCard(info = {}) {
  ensureSourceRootCard();
  const card = document.getElementById("wbPwsSourceRootCard");
  const pathEl = document.getElementById("wbProjectSourceRootText");
  const hintEl = document.getElementById("wbProjectSourceRootHint");
  if (!card || !pathEl) {
    return;
  }
  const codeRoot = String(info.codeRoot || "").trim();
  const localPath = String(info.localPath || "").trim();
  const hasConfiguredPath = Boolean(localPath);
  const isFallback = Boolean(info.isFallback);
  const isAsar = /app\.asar/i.test(codeRoot);
  const isWarning = isFallback || isAsar;

  card.classList.toggle("is-warning", isWarning);

  if (!hasConfiguredPath) {
    pathEl.textContent = "未配置项目源码目录";
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = "当前使用默认工作区，AI 编程能力可能受限";
    }
  } else if (isWarning) {
    pathEl.textContent = codeRoot || localPath || "默认工作区";
    if (hintEl) {
      hintEl.hidden = false;
      hintEl.textContent = "当前为默认工作区，建议选择真实源码根目录";
    }
  } else {
    pathEl.textContent = codeRoot || localPath;
    if (hintEl) {
      hintEl.hidden = true;
      hintEl.textContent = "";
    }
  }
}

function migrateLegacyCodeHeader(section) {
  section?.querySelector("#wbCodeRootLabel")?.remove();
  section?.querySelector("#wbGitStatusLabel")?.remove();
  section?.querySelector("#wbSetCodeRootBtn")?.remove();
  const head = section?.querySelector(".wb-code-panel__head");
  if (head && !head.querySelector("#wbFilePreviewPath")) {
    head.remove();
  } else if (head) {
    head.classList.add("wb-code-file-head");
    head.id = "wbCodeFileHead";
    head.querySelector(".wb-code-panel__head-main")?.replaceChildren?.();
    const breadcrumb = head.querySelector(".wb-code-panel__breadcrumb");
    if (!breadcrumb) {
      const nav = document.createElement("nav");
      nav.className = "wb-code-panel__breadcrumb";
      nav.setAttribute("aria-label", "文件路径");
      const path = document.getElementById("wbFilePreviewPath");
      if (path) {
        nav.appendChild(path);
      } else {
        nav.innerHTML = '<span id="wbFilePreviewPath" class="wb-code-panel__file-path"></span>';
      }
      head.prepend(nav);
    }
    head.querySelector(".wb-code-panel__head-main")?.remove();
  }
}

function syncCodeWriteUiState() {
  const emptyState = document.getElementById("wbCodeEmptyState");
  const editorView = document.getElementById("wbCodeEditorView");
  const writeHint = document.getElementById("wbCodeWriteHint");
  const manualWrite = document.getElementById("wbCodeManualWrite");
  const writebar = document.getElementById("wbCodeWritebar");
  const fileHead = document.getElementById("wbCodeFileHead");
  const hasFile = Boolean(panelState.selectedPath);
  const pendingWrite = hasPendingManualWrite();
  const manualOpen = manualWrite?.dataset.open === "1";

  if (emptyState) {
    emptyState.hidden = hasFile;
  }
  if (editorView) {
    editorView.hidden = !hasFile;
  }
  if (fileHead) {
    fileHead.hidden = !hasFile;
  }
  if (writeHint) {
    writeHint.hidden = !hasFile || pendingWrite || manualOpen;
  }
  const startManualBtn = document.getElementById("wbStartManualWriteBtn");
  if (startManualBtn) {
    startManualBtn.hidden = !hasFile || pendingWrite || manualOpen;
  }
  if (manualWrite) {
    manualWrite.hidden = !hasFile || (!pendingWrite && !manualOpen);
  }
  if (writebar) {
    writebar.hidden = !pendingWrite;
  }
}

function migrateLegacyWriteUi(section) {
  if (!section || section.querySelector("#wbCodeEmptyState")) {
    return;
  }
  const main = section.querySelector(".wb-code-panel__main");
  if (!main) {
    return;
  }
  const preview = main.querySelector("#wbFilePreview");
  const patchContent = main.querySelector("#wbPatchContent");
  const patchProposal = main.querySelector("#wbPatchProposal");
  const diffPreview = main.querySelector("#wbDiffPreview");
  const postDiff = main.querySelector("#wbPostWriteDiff");
  main.innerHTML = `
    <div id="wbCodeEmptyState" class="wb-code-empty-state">
      <div class="wb-code-empty-state__title">请选择文件</div>
      <div class="wb-code-empty-state__desc">
        从左侧「文件」中选择文件后，可预览代码、生成 Diff 或进行受控写入。
      </div>
    </div>
    <div id="wbCodeEditorView" class="wb-code-editor-view" hidden></div>
    <div id="wbCodeWritebar" class="wb-code-writebar" hidden>
      <label class="wb-code-writebar__branch">
        <input type="checkbox" id="wbCreateBranchBeforeWrite" checked />
        写入前创建 Git 分支
      </label>
      <div class="wb-code-writebar__actions">
        <button type="button" id="wbPreviewDiffBtn" class="wb-pws-btn wb-pws-btn--ghost">预览 Diff</button>
        <button type="button" id="wbConfirmWriteBtn" class="wb-pws-btn wb-pws-btn--primary">确认并写入</button>
      </div>
    </div>
  `;
  const editorView = main.querySelector("#wbCodeEditorView");
  if (editorView && preview) {
    editorView.appendChild(preview);
    preview.textContent = preview.textContent || "";
    const hint = document.createElement("p");
    hint.id = "wbCodeWriteHint";
    hint.className = "wb-code-write-hint";
    hint.innerHTML =
      '可在下方输入拟写入内容后预览 Diff <button type="button" id="wbStartManualWriteBtn" class="wb-pws-btn wb-pws-btn--ghost wb-code-write-hint__btn">编辑拟写入内容</button>';
    editorView.appendChild(hint);
    const manualWrite = document.createElement("div");
    manualWrite.id = "wbCodeManualWrite";
    manualWrite.className = "wb-code-manual-write";
    manualWrite.hidden = true;
    if (patchContent?.parentElement) {
      manualWrite.appendChild(patchContent.parentElement);
    }
    if (patchProposal?.parentElement && patchProposal.parentElement !== patchContent?.parentElement) {
      manualWrite.appendChild(patchProposal.parentElement);
    }
    editorView.appendChild(manualWrite);
    if (diffPreview) {
      editorView.appendChild(diffPreview);
    }
    if (postDiff) {
      editorView.appendChild(postDiff);
    }
  }
  main.querySelector(".wb-code-panel__actions")?.remove();
  section.querySelector(".wb-tool-ops-panel")?.remove();
  const legacyBackup = section.querySelector("#wbBackupPanel");
  if (legacyBackup) {
    legacyBackup.remove();
  }
  ensureTerminalToolsMount();
  delete section.dataset.wbBound;
  bindCodePanelEvents();
  syncCodeWriteUiState();
}

function ensureCodePanelMount() {
  ensureSidebarMounts();
  let section = document.getElementById("wbCodePanel");
  if (section) {
    migrateLegacyCodeSidebar(section);
    migrateLegacyWriteUi(section);
    migrateLegacyCodeHeader(section);
    ensureSourceRootCard();
    ensureTerminalToolsMount();
    syncCodeWriteUiState();
    return section;
  }
  const workspace = document.getElementById("wbProjectWorkspace");
  const mount = document.getElementById("wbPwsCodeMount") || workspace;
  if (!mount) {
    return null;
  }
  section = document.createElement("section");
  section.id = "wbCodePanel";
  section.className = "wb-code-panel";
  section.innerHTML = `
    <header class="wb-code-panel__head wb-code-file-head" id="wbCodeFileHead" hidden>
      <nav class="wb-code-panel__breadcrumb" aria-label="文件路径">
        <span id="wbFilePreviewPath" class="wb-code-panel__file-path"></span>
      </nav>
    </header>
    <div class="wb-code-panel__layout main-workspace">
      <div class="wb-code-panel__main main-editor-body">
        <div id="wbCodeEmptyState" class="wb-code-empty-state">
          <div class="wb-code-empty-state__title">请选择文件</div>
          <div class="wb-code-empty-state__desc">
            从左侧文件列表选择文件后，可预览代码、生成 Diff 或进行受控写入。
          </div>
        </div>
        <div id="wbCodeEditorView" class="wb-code-editor-view" hidden>
          <pre id="wbFilePreview" class="wb-file-preview scroll-tech"></pre>
          <p id="wbCodeWriteHint" class="wb-code-write-hint">
            可在下方输入拟写入内容后预览 Diff
            <button type="button" id="wbStartManualWriteBtn" class="wb-pws-btn wb-pws-btn--ghost wb-code-write-hint__btn">
              编辑拟写入内容
            </button>
          </p>
          <div id="wbCodeManualWrite" class="wb-code-manual-write" hidden>
            <label class="wb-field wb-code-panel__patch-label">
              <span>拟写入内容</span>
              <textarea id="wbPatchContent" rows="6" placeholder="编辑后将写入磁盘（需确认）…"></textarea>
            </label>
            <label class="wb-field wb-code-panel__patch-label">
              <span>补丁说明（Diff 预览）</span>
              <textarea id="wbPatchProposal" rows="2" placeholder="描述拟议修改…"></textarea>
            </label>
          </div>
          <pre id="wbDiffPreview" class="wb-diff-preview scroll-tech" hidden></pre>
          <pre id="wbPostWriteDiff" class="wb-diff-preview wb-diff-preview--applied scroll-tech" hidden></pre>
        </div>
        <div id="wbCodeWritebar" class="wb-code-writebar" hidden>
          <label class="wb-code-writebar__branch">
            <input type="checkbox" id="wbCreateBranchBeforeWrite" checked />
            写入前创建 Git 分支
          </label>
          <div class="wb-code-writebar__actions">
            <button type="button" id="wbPreviewDiffBtn" class="wb-pws-btn wb-pws-btn--ghost">预览 Diff</button>
            <button type="button" id="wbConfirmWriteBtn" class="wb-pws-btn wb-pws-btn--primary">确认并写入</button>
          </div>
        </div>
      </div>
    </div>
    <div class="wb-shell-panel" id="wbShellPanel" hidden>
      <h4>受控 Shell（需确认）</h4>
      <p class="wb-shell-panel__hint">仅允许白名单命令（npm run / node scripts / git status 等），禁止链式与危险操作。</p>
      <div class="wb-shell-panel__row">
        <select id="wbShellPreset"></select>
        <input id="wbShellCommand" type="text" placeholder="或输入受控命令…" />
        <button type="button" id="wbRunShellBtn" class="primary">确认运行</button>
      </div>
      <pre id="wbShellOutput" class="wb-test-output scroll-tech">选择或输入命令后运行，将记入 tool_operations。</pre>
      <ul id="wbShellFixSuggestions" class="wb-fix-suggestions" hidden></ul>
    </div>
  `;
  mount.appendChild(section);
  ensureTerminalToolsMount();
  bindCodePanelEvents();
  syncCodeWriteUiState();
  return section;
}

function migrateLegacyCodeSidebar(section) {
  const legacySidebar = section.querySelector(".wb-code-panel__sidebar");
  if (!legacySidebar) {
    return;
  }
  ensureSidebarMounts();
  const fileMount = document.getElementById("wbPwsFileTreeMount");
  const searchMount = document.getElementById("wbPwsSearchMount");
  const tree = legacySidebar.querySelector("#wbFileTree");
  const hits = legacySidebar.querySelector("#wbCodeSearchHits");
  const searchInput = legacySidebar.querySelector("#wbCodeSearchInput");
  const searchBtn = legacySidebar.querySelector("#wbCodeSearchBtn");
  if (tree && fileMount && !fileMount.querySelector("#wbFileTree")) {
    fileMount.appendChild(tree);
  }
  if (searchInput && searchMount) {
    const form = searchMount.querySelector(".wb-pws-search-form");
    if (form && !searchMount.querySelector("#wbCodeSearchInput")) {
      form.prepend(searchInput);
      if (searchBtn && !form.querySelector("#wbCodeSearchBtn")) {
        form.appendChild(searchBtn);
      }
    }
  }
  if (hits && searchMount && !searchMount.querySelector("#wbCodeSearchHits")) {
    searchMount.appendChild(hits);
  }
  legacySidebar.remove();
}

function renderFileTree(entries) {
  const tree = document.getElementById("wbFileTree");
  const hits = document.getElementById("wbCodeSearchHits");
  if (!tree) {
    return;
  }
  if (hits) {
    hits.hidden = true;
  }
  tree.hidden = false;
  tree.replaceChildren();
  if (!entries?.length) {
    tree.innerHTML = '<li class="wb-file-tree__empty">目录为空或未配置</li>';
    return;
  }
  entries.forEach((entry) => {
    const li = document.createElement("li");
    li.className = `wb-file-tree__item wb-file-tree__item--${entry.type}`;
    li.dataset.path = entry.path;
    li.textContent = entry.type === "dir" ? `📁 ${entry.path}` : entry.path;
    if (entry.type === "file") {
      li.addEventListener("click", () => {
        window.__wbSwitchSidebarTab?.("files", { persist: false });
        window.__wbSwitchCodeTab?.("code");
        void loadFilePreview(entry.path);
      });
    }
    tree.appendChild(li);
  });
}

function renderSearchHits(hits) {
  const tree = document.getElementById("wbFileTree");
  const list = document.getElementById("wbCodeSearchHits");
  if (!list) {
    return;
  }
  if (tree) {
    tree.hidden = true;
  }
  list.hidden = false;
  list.replaceChildren();
  if (!hits?.length) {
    list.innerHTML = '<li class="wb-code-search-hits__empty">无匹配</li>';
    return;
  }
  hits.forEach((hit) => {
    const li = document.createElement("li");
    li.className = "wb-code-search-hits__item";
    li.innerHTML = `
      <button type="button" class="wb-code-search-hits__btn" data-path="${escapeHtml(hit.path)}">
        <code>${escapeHtml(hit.path)}</code>:${hit.line}
      </button>
      <pre class="wb-code-search-hits__snippet">${escapeHtml(hit.snippet)}</pre>
    `;
    li.querySelector("button")?.addEventListener("click", () => {
      window.__wbSwitchSidebarTab?.("search", { persist: false });
      window.__wbSwitchCodeTab?.("code");
      void loadFilePreview(hit.path);
    });
    list.appendChild(li);
  });
}

async function loadFilePreview(relPath) {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  if (!projectId || !relPath || typeof api.wbProjectFileRead !== "function") {
    return;
  }
  const file = await api.wbProjectFileRead({ projectId, taskId, path: relPath });
  panelState.selectedPath = relPath;
  panelState.fileContent = file.content || "";
  const pathEl = document.getElementById("wbFilePreviewPath");
  const preview = document.getElementById("wbFilePreview");
  if (pathEl) {
    pathEl.textContent = `${relPath} · ${file.lines || 0} 行`;
  }
  highlightFileTreeSelection(relPath);
  if (preview) {
    preview.textContent = file.content || "";
  }
  const patchContent = document.getElementById("wbPatchContent");
  if (patchContent) {
    patchContent.dataset.userEdited = "";
    patchContent.value = file.content || "";
  }
  const diffPreview = document.getElementById("wbDiffPreview");
  const postDiff = document.getElementById("wbPostWriteDiff");
  if (diffPreview) {
    diffPreview.hidden = true;
    diffPreview.textContent = "";
  }
  if (postDiff) {
    postDiff.hidden = true;
  }
  const manualWrite = document.getElementById("wbCodeManualWrite");
  if (manualWrite) {
    delete manualWrite.dataset.open;
  }
  syncCodeWriteUiState();
  await refreshToolOps();
}

function startManualWriteEdit() {
  if (!panelState.selectedPath) {
    return;
  }
  const patchContent = document.getElementById("wbPatchContent");
  const manualWrite = document.getElementById("wbCodeManualWrite");
  if (patchContent) {
    if (!patchContent.value) {
      patchContent.value = panelState.fileContent || "";
    }
    patchContent.dataset.userEdited = "1";
    patchContent.focus();
  }
  if (manualWrite) {
    manualWrite.hidden = false;
    manualWrite.dataset.open = "1";
  }
  syncCodeWriteUiState();
}

async function refreshCodeRoot(projectId) {
  const api = wbApi();
  if (typeof api.wbProjectCodeRoot !== "function") {
    return;
  }
  const info = await api.wbProjectCodeRoot({ projectId });
  panelState.codeRoot = info.codeRoot;
  renderSourceRootCard(info);
}

async function refreshFileTree(projectId) {
  const api = wbApi();
  if (typeof api.wbProjectFilesTree !== "function") {
    return;
  }
  const { entries } = await api.wbProjectFilesTree({
    projectId,
    taskId: getTaskId(),
  });
  renderFileTree(entries);
}

window.__wbRefreshFileTree = refreshFileTree;

async function refreshTestCommands() {
  const select = document.getElementById("wbTestCommand");
  if (!select) {
    return;
  }
  const api = wbApi();
  const commands = [...DEFAULT_TEST_COMMANDS];
  const projectId = panelState.projectId;
  if (projectId && typeof api.wbProjectVerifyScripts === "function") {
    try {
      const scripts = await api.wbProjectVerifyScripts({ projectId });
      (scripts || []).forEach((s) => {
        if (s.command && !commands.includes(s.command)) {
          commands.unshift(s.command);
        }
      });
    } catch {
      /* ignore */
    }
  }
  select.replaceChildren();
  commands.forEach((cmd) => {
    const opt = document.createElement("option");
    opt.value = cmd;
    opt.textContent = cmd;
    select.appendChild(opt);
  });
}

async function refreshToolOps() {
  const api = wbApi();
  const list = document.getElementById("wbToolOpsList");
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  if (!list || !projectId || typeof api.wbProjectToolOpsList !== "function") {
    return;
  }
  const ops = await api.wbProjectToolOpsList({ projectId, taskId, limit: 12 });
  list.replaceChildren();
  if (!ops?.length) {
    list.innerHTML = '<li class="wb-tool-ops__empty">暂无工具记录</li>';
    return;
  }
  ops.forEach((op) => {
    const li = document.createElement("li");
    li.className = "wb-tool-ops__item";
    li.innerHTML = `
      <span class="wb-tool-ops__name">${escapeHtml(op.toolName)}</span>
      <span class="wb-tool-ops__result">${escapeHtml(op.resultText?.slice(0, 120) || "")}</span>
      <time>${escapeHtml(op.createdAt || "")}</time>
    `;
    list.appendChild(li);
  });
  window.__wbSyncTerminalDrawer?.();
}

async function runCodeSearch() {
  const api = wbApi();
  const query = document.getElementById("wbCodeSearchInput")?.value?.trim();
  const projectId = panelState.projectId;
  if (!query || !projectId || typeof api.wbProjectCodeSearch !== "function") {
    return;
  }
  const { hits } = await api.wbProjectCodeSearch({
    projectId,
    taskId: getTaskId(),
    query,
  });
  renderSearchHits(hits);
  await refreshToolOps();
}

async function runDiffPreview() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const relPath = panelState.selectedPath;
  const description = document.getElementById("wbPatchProposal")?.value?.trim();
  const out = document.getElementById("wbDiffPreview");
  if (!projectId || !relPath || typeof api.wbProjectDiffPreview !== "function") {
    if (out) {
      out.hidden = false;
      out.textContent = "请先选择文件。";
    }
    return;
  }
  const preview = await api.wbProjectDiffPreview({
    projectId,
    taskId: getTaskId(),
    path: relPath,
    description,
    proposedContent: document.getElementById("wbPatchContent")?.value,
  });
  if (out) {
    out.hidden = false;
    out.textContent = preview.unifiedDiff || "";
  }
  await refreshToolOps();
}

async function refreshBackupList() {
  const api = wbApi();
  const list = document.getElementById("wbBackupList");
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  if (!list || !projectId || typeof api.wbProjectBackupsList !== "function") {
    return;
  }
  const backups = await api.wbProjectBackupsList({ projectId, taskId, limit: 15 });
  list.replaceChildren();
  if (!backups?.length) {
    list.innerHTML = '<li class="wb-backup-list__empty">暂无写入备份（受控写入后会出现在此）</li>';
    return;
  }
  backups.forEach((item) => {
    const li = document.createElement("li");
    li.className = "wb-backup-list__item";
    const typeLabel = item.hadOriginal ? "覆盖写入" : "新建文件";
    const statusLabel = item.canRestore ? "" : "（备份文件缺失）";
    li.innerHTML = `
      <div class="wb-backup-list__meta">
        <code>${escapeHtml(item.relPath)}</code>
        <span class="wb-backup-list__type">${escapeHtml(typeLabel)}${escapeHtml(statusLabel)}</span>
        <time>${escapeHtml(item.createdAt || "")}</time>
      </div>
      <button type="button" class="secondary wb-backup-restore-btn" data-backup-id="${escapeHtml(item.id)}" ${item.canRestore ? "" : "disabled"}>还原此备份</button>
    `;
    li.querySelector(".wb-backup-restore-btn")?.addEventListener("click", () => {
      void restoreBackup(item);
    });
    list.appendChild(li);
  });
}

async function restoreBackup(backup) {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  if (!backup?.id || !projectId || typeof api.wbProjectBackupRestore !== "function") {
    return;
  }
  const action = backup.hadOriginal
    ? `将 ${backup.relPath} 还原到该备份时间点`
    : `删除受控写入创建的文件 ${backup.relPath}`;
  const ok = await wbConfirm(`确认还原？`, {
    title: "还原备份",
    detail: `${action}\n\n还原前会再次备份当前文件内容。`,
  });
  if (!ok) {
    return;
  }
  try {
    const result = await api.wbProjectBackupRestore({
      projectId,
      taskId,
      backupId: backup.id,
      userApproved: true,
    });
    const postDiff = document.getElementById("wbPostWriteDiff");
    if (postDiff && result.patch?.unifiedDiff) {
      postDiff.hidden = false;
      postDiff.textContent = result.patch.unifiedDiff;
    }
    if (result.mode === "restored_content" && backup.relPath) {
      await loadFilePreview(backup.relPath);
    }
    await refreshBackupList();
    await refreshToolOps();
    await refreshFileTree(projectId);
    window.__wbRefreshTaskList?.();
  } catch (err) {
    await wbAlert(err?.message || "还原失败", { title: "还原失败" });
  }
}

async function refreshGitStatus(projectId) {
  await window.__wbRefreshGitChangePanel?.(projectId);
}

async function applyControlledPatch() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const relPath = panelState.selectedPath;
  const content = document.getElementById("wbPatchContent")?.value;
  const createGitBranch = getCreateGitBranchChecked();
  const postDiff = document.getElementById("wbPostWriteDiff");
  if (!projectId || !taskId || !relPath || typeof api.wbProjectApplyPatch !== "function") {
    await wbAlert("请先选择任务和文件。", {
      title: "无法写入",
      detail: "请在左侧选择任务，并在「文件」Tab 中选中要写入的文件。",
    });
    return;
  }
  const approved = await window.__wbRequestApproval?.({
    taskId,
    projectId,
    actionType: "write_file",
    title: `写入文件：${relPath}`,
    summary: "受控写入将创建备份，可在备份面板还原。",
    scope: [
      relPath,
      createGitBranch ? "写入前尝试创建 Git 分支" : "不创建 Git 分支",
    ],
    riskLevel: "MEDIUM",
  });
  if (!approved) {
    return;
  }
  try {
    const result = await api.wbProjectApplyPatch({
      projectId,
      taskId,
      path: relPath,
      content,
      userApproved: true,
      createGitBranch: Boolean(createGitBranch),
    });
    if (postDiff) {
      postDiff.hidden = false;
      postDiff.textContent = result.writeResult?.patch?.unifiedDiff || "（无 diff）";
    }
    panelState.fileContent = content || "";
    document.getElementById("wbFilePreview").textContent = content || "";
    const patchContent = document.getElementById("wbPatchContent");
    if (patchContent) {
      patchContent.dataset.userEdited = "";
    }
    syncCodeWriteUiState();
    await refreshGitStatus(projectId);
    await refreshToolOps();
    await refreshBackupList();
    await refreshFileTree(projectId);
    window.__wbRefreshTaskList?.();
  } catch (err) {
    await wbAlert(err?.message || "写入失败", { title: "写入失败" });
  }
}

async function runTestWithFix() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const command = document.getElementById("wbTestCommand")?.value;
  const out = document.getElementById("wbTestOutput");
  const fixList = document.getElementById("wbFixSuggestions");
  if (!projectId || !command || typeof api.wbProjectRunTestFix !== "function") {
    return;
  }
  const approved = await window.__wbRequestApproval?.({
    taskId,
    projectId,
    actionType: "run_test",
    title: "运行测试并分析",
    summary: "将在项目目录执行白名单测试命令。",
    scope: [command],
    riskLevel: "MEDIUM",
  });
  if (!approved) {
    return;
  }
  if (out) {
    out.textContent = "运行中…";
  }
  if (fixList) {
    fixList.hidden = true;
    fixList.replaceChildren();
  }
  try {
    const result = await api.wbProjectRunTestFix({
      projectId,
      taskId,
      command,
      userApproved: true,
    });
    if (out) {
      out.textContent = [
        `exitCode: ${result.exitCode}`,
        `success: ${result.success}`,
        "--- stdout ---",
        result.stdout || "",
        "--- stderr ---",
        result.stderr || "",
      ].join("\n");
    }
    const suggestions = result.fixSuggestions?.suggestions || [];
    if (fixList && suggestions.length) {
      fixList.hidden = false;
      suggestions.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s.text;
        fixList.appendChild(li);
      });
    }
    recordTestRun(projectId, taskId, command, result, suggestions.length);
    window.__wbSwitchCodeTab?.("test");
    window.__wbRefreshTaskList?.();
  } catch (err) {
    if (out) {
      out.textContent = err?.message || "运行失败";
    }
  }
  await refreshToolOps();
  window.__wbSyncTerminalDrawer?.();
  window.__wbExpandTerminalDrawer?.("test");
}

async function gitCommitConfirmed() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const message = document.getElementById("wbGitCommitMsg")?.value?.trim();
  if (!projectId || typeof api.wbProjectGitCommit !== "function") {
    return;
  }
  const approved = await window.__wbRequestApproval?.({
    taskId,
    projectId,
    actionType: "git_commit",
    title: "Git Commit",
    summary: "将提交当前仓库所有已跟踪变更。",
    scope: [message || "wb: controlled dev", "提交所有已跟踪变更"],
    riskLevel: "HIGH",
    rollbackHint: "提交后可通过 Git 历史或备份面板处理；请确认变更范围。",
  });
  if (!approved) {
    return;
  }
  try {
    const result = await api.wbProjectGitCommit({
      projectId,
      taskId,
      message: message || "wb: controlled dev",
      userApproved: true,
    });
    await wbAlert(
      result.commitResult?.committed
        ? `已提交 ${result.commitResult.shortHash}`
        : result.commitResult?.reason || "无可提交变更",
      { title: "Git Commit" }
    );
    await refreshGitStatus(projectId);
    await refreshToolOps();
    window.__wbSwitchCodeTab?.("git");
  } catch (err) {
    await wbAlert(err?.message || "Git commit 失败", { title: "Git Commit 失败" });
  }
}

async function applyPlanPatch(diffPreview) {
  if (!diffPreview?.filePath) {
    return;
  }
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const reviewStore = window.__wbCodeReviewStore;
  if (reviewStore && projectId && taskId) {
    try {
      await reviewStore.syncFromStagedPatches?.(projectId, taskId);
    } catch {
      /* optional */
    }
    const changes = reviewStore.getChanges(projectId, taskId) || [];
    const match = changes.find((c) => c.path === diffPreview.filePath);
    if (match) {
      reviewStore.setSelectedChange?.(projectId, taskId, match.id);
    }
  }
  window.__wbSwitchCodeTab?.("diff");
  window.__wbRenderDiffReviewPanel?.();
}

function recordTestRun(projectId, taskId, command, result, fixCount = 0) {
  window.__wbTestResultStore?.recordRun?.(projectId, taskId, {
    command,
    success: result.success,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    fixCount,
  });
  window.__wbRenderTestResultPanel?.();
  window.__wbSyncTerminalDrawer?.();
  window.__wbExpandTerminalDrawer?.("test");
}

async function runWhitelistedTest() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const command = document.getElementById("wbTestCommand")?.value;
  const out = document.getElementById("wbTestOutput");
  if (!projectId || !command || typeof api.wbProjectRunTest !== "function") {
    return;
  }
  if (out) {
    out.textContent = "运行中…";
  }
  try {
    const result = await api.wbProjectRunTest({
      projectId,
      taskId: getTaskId(),
      command,
    });
    if (out) {
      out.textContent = [
        `exitCode: ${result.exitCode}`,
        `success: ${result.success}`,
        "--- stdout ---",
        result.stdout || "",
        "--- stderr ---",
        result.stderr || "",
      ].join("\n");
    }
    recordTestRun(projectId, getTaskId(), command, result);
    window.__wbSwitchCodeTab?.("test");
  } catch (err) {
    if (out) {
      out.textContent = err?.message || "运行失败";
    }
  }
  await refreshToolOps();
}

async function chooseProjectRoot() {
  const api = wbApi();
  const projectId = panelState.projectId;
  if (!projectId || typeof api.wbProjectChooseRoot !== "function") {
    return;
  }
  const dir = await api.wbProjectChooseRoot();
  if (!dir || typeof api.wbProjectUpdate !== "function") {
    return;
  }
  await api.wbProjectUpdate({ projectId, localPath: dir });
  await refreshCodePanel(projectId, getTaskId());
}

function ensureShellPanel() {
  if (document.getElementById("wbShellPanel")) {
    return;
  }
  const anchor = document.querySelector(".wb-code-panel__layout")?.parentElement;
  if (!anchor) {
    return;
  }
  const panel = document.createElement("div");
  panel.id = "wbShellPanel";
  panel.className = "wb-shell-panel";
  panel.innerHTML = `
    <h4>受控 Shell（需确认）</h4>
    <p class="wb-shell-panel__hint">仅允许白名单命令（npm run / node scripts / git status 等），禁止链式与危险操作。</p>
    <div class="wb-shell-panel__row">
      <select id="wbShellPreset"></select>
      <input id="wbShellCommand" type="text" placeholder="或输入受控命令…" />
      <button type="button" id="wbRunShellBtn" class="primary">确认运行</button>
    </div>
    <pre id="wbShellOutput" class="wb-test-output scroll-tech">选择或输入命令后运行，将记入 tool_operations。</pre>
    <ul id="wbShellFixSuggestions" class="wb-fix-suggestions" hidden></ul>
  `;
  const backup = document.getElementById("wbBackupPanel");
  if (backup) {
    anchor.insertBefore(panel, backup);
  } else {
    anchor.appendChild(panel);
  }
}

async function refreshShellPresets() {
  const api = wbApi();
  const presetSelect = document.getElementById("wbShellPreset");
  const cmdInput = document.getElementById("wbShellCommand");
  if (!presetSelect) {
    return;
  }
  let presets = [
    "npm run build",
    "npm run test",
    "git status",
    "git diff",
    "node scripts/wb-namespace-test.js",
  ];
  if (typeof api.wbProjectShellPresets === "function") {
    try {
      const info = await api.wbProjectShellPresets();
      if (info?.presets?.length) {
        presets = info.presets;
      }
    } catch {
      /* keep defaults */
    }
  }
  presetSelect.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "选择预设…";
  presetSelect.appendChild(empty);
  presets.forEach((cmd) => {
    const opt = document.createElement("option");
    opt.value = cmd;
    opt.textContent = cmd;
    presetSelect.appendChild(opt);
  });
  presetSelect.onchange = () => {
    if (presetSelect.value && cmdInput) {
      cmdInput.value = presetSelect.value;
    }
  };
}

async function runControlledShell() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const command =
    document.getElementById("wbShellCommand")?.value?.trim() ||
    document.getElementById("wbShellPreset")?.value?.trim();
  const out = document.getElementById("wbShellOutput");
  const fixList = document.getElementById("wbShellFixSuggestions");
  if (!projectId || !command || typeof api.wbProjectRunShell !== "function") {
    await wbAlert("请输入受控 shell 命令。", { title: "Shell 命令" });
    return;
  }
  const approved = await window.__wbRequestApproval?.({
    taskId,
    projectId,
    actionType: "shell",
    title: "受控 Shell 执行",
    summary: "命令将受白名单与注入检测约束。",
    scope: [command],
    riskLevel: "HIGH",
    rollbackHint: "Shell 输出将记入工具记录；高风险命令需人工确认。",
  });
  if (!approved) {
    return;
  }
  if (out) {
    out.textContent = "运行中…";
  }
  if (fixList) {
    fixList.hidden = true;
    fixList.replaceChildren();
  }
  try {
    const result = await api.wbProjectRunShell({
      projectId,
      taskId,
      command,
      userApproved: true,
    });
    if (out) {
      out.textContent = [
        `tier: ${result.classified?.tier || "controlled"}`,
        `exitCode: ${result.exitCode}`,
        `success: ${result.success}`,
        "--- stdout ---",
        result.stdout || "",
        "--- stderr ---",
        result.stderr || "",
      ].join("\n");
    }
    const suggestions = result.fixSuggestions?.suggestions || [];
    if (fixList && suggestions.length && !result.success) {
      fixList.hidden = false;
      suggestions.forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s.text;
        fixList.appendChild(li);
      });
    }
    await refreshToolOps();
    window.__wbSyncTerminalDrawer?.();
    window.__wbExpandTerminalDrawer?.("shell");
    window.__wbRefreshTaskList?.();
  } catch (err) {
    if (out) {
      out.textContent = err?.message || "运行失败";
    }
  }
}

function ensureTerminalToolsMount() {
  const mount = document.getElementById("wbPwsTerminalToolsMount");
  if (!mount) {
    return;
  }
  mount.querySelector(".wb-pws-terminal-tools-placeholder")?.remove();
  if (!mount.querySelector("#wbToolOpsList")) {
    const toolSection = document.createElement("section");
    toolSection.className = "wb-pws-terminal-section wb-tool-ops-panel";
    toolSection.innerHTML = `
      <h4 class="wb-pws-terminal-section__title">工具操作记录</h4>
      <ul id="wbToolOpsList" class="wb-tool-ops-list scroll-tech"></ul>
    `;
    mount.appendChild(toolSection);
  }
  ensureBackupPanel(mount);
}

function ensureBackupPanel(parent = document.body) {
  if (document.getElementById("wbBackupPanel")) {
    const existing = document.getElementById("wbBackupPanel");
    if (parent !== document.body && existing.parentElement !== parent) {
      parent.appendChild(existing);
    }
    return;
  }
  const panel = document.createElement("div");
  panel.id = "wbBackupPanel";
  panel.className = "wb-backup-panel wb-pws-terminal-section";
  panel.innerHTML = `
    <h4 class="wb-pws-terminal-section__title">写入备份与还原</h4>
    <p class="wb-backup-panel__hint">每次受控写入前会自动备份；可在此一键还原到写入前状态。</p>
    <ul id="wbBackupList" class="wb-backup-list scroll-tech"></ul>
  `;
  parent.appendChild(panel);
}

function bindCodePanelEvents() {
  ensureTerminalToolsMount();
  ensureShellPanel();
  const panel = document.getElementById("wbCodePanel");
  if (!panel || panel.dataset.wbBound === "1") {
    return;
  }
  panel.dataset.wbBound = "1";
  document.getElementById("wbCodeSearchBtn")?.addEventListener("click", () => {
    void runCodeSearch();
  });
  document.getElementById("wbCodeSearchInput")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      void runCodeSearch();
    }
  });
  document.getElementById("wbPreviewDiffBtn")?.addEventListener("click", () => {
    void runDiffPreview();
  });
  document.getElementById("wbConfirmWriteBtn")?.addEventListener("click", () => {
    void applyControlledPatch();
  });
  document.getElementById("wbPatchContent")?.addEventListener("input", (ev) => {
    if (ev.target) {
      ev.target.dataset.userEdited = "1";
    }
    syncCodeWriteUiState();
  });
  document.getElementById("wbStartManualWriteBtn")?.addEventListener("click", () => {
    startManualWriteEdit();
  });
  document.getElementById("wbRunShellBtn")?.addEventListener("click", () => {
    void runControlledShell();
  });
  document.getElementById("wbShellCommand")?.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      void runControlledShell();
    }
  });
  document.getElementById("wbFileTreeRefreshBtn")?.addEventListener("click", () => {
    const projectId = panelState.projectId;
    if (projectId) {
      void refreshFileTree(projectId);
    }
  });
  document.getElementById("wbFileTreeFilter")?.addEventListener("input", (ev) => {
    const query = String(ev.target?.value || "").trim().toLowerCase();
    const tree = document.getElementById("wbFileTree");
    if (!tree) {
      return;
    }
    tree.querySelectorAll(".wb-file-tree__item").forEach((item) => {
      const path = String(item.dataset.path || "").toLowerCase();
      item.hidden = Boolean(query) && !path.includes(query);
    });
  });
}

async function refreshCodePanel(projectId, taskId) {
  window.__wbEnsureTestResultPanel?.();
  window.__wbEnsureGitChangePanel?.();
  ensureCodePanelMount();
  ensureSourceRootCard();
  ensureTerminalToolsMount();
  ensureShellPanel();
  panelState.projectId = projectId;
  panelState.taskId = taskId || getTaskId();
  panelState.selectedPath = null;
  panelState.fileContent = "";
  await refreshCodeRoot(projectId);
  await refreshGitStatus(projectId);
  await refreshFileTree(projectId);
  await refreshTestCommands();
  await refreshShellPresets();
  await refreshBackupList();
  await refreshToolOps();
  window.__wbRenderTestResultPanel?.();
  syncCodeWriteUiState();
}

function renderPlanCodeExtras(output) {
  const card = document.getElementById("wbPlanCard");
  if (!card || !output) {
    return;
  }
  const snippets = output.codeAnalysis?.snippets || [];
  const diffs = output.diffPreviews || [];
  if (!snippets.length && !diffs.length) {
    return;
  }
  let extra = card.querySelector(".wb-plan-card__code");
  if (!extra) {
    extra = document.createElement("div");
    extra.className = "wb-plan-card__code";
    card.appendChild(extra);
  }
  const snippetHtml = snippets
    .map(
      (s) =>
        `<li><code>${escapeHtml(s.path)}</code><pre class="wb-plan-card__snippet">${escapeHtml(s.preview || "")}</pre></li>`
    )
    .join("");
  extra.innerHTML = `
    ${snippets.length ? `<h5>代码分析</h5><ul>${snippetHtml}</ul>` : ""}
    ${diffs.length ? `<p class="wb-plan-card__diff-hint">右侧 <strong>Diff 审阅</strong> 面板已加载 ${diffs.length} 个文件变更，可逐文件接受/拒绝后批量写入。</p>` : ""}
  `;
  window.__wbLastPlanDiffs = diffs;
}

async function applyAcceptedDiffsLegacy(api, projectId, taskId, accepted, createGitBranch) {
  const postDiff = document.getElementById("wbPostWriteDiff");
  const results = [];
  for (const change of accepted) {
    const result = await api.wbProjectApplyPatch({
      projectId,
      taskId,
      path: change.path,
      content: change.proposedContent,
      userApproved: true,
      createGitBranch: Boolean(createGitBranch),
      stagedPatchId: change.stagedPatchId || null,
    });
    results.push({ path: change.path, ok: true, result });
  }
  if (postDiff && results.length) {
    const last = results[results.length - 1];
    postDiff.hidden = false;
    postDiff.textContent =
      last.result?.writeResult?.patch?.unifiedDiff || `已写入 ${results.length} 个文件`;
  }
  return results;
}

async function applyAcceptedDiffs() {
  const api = wbApi();
  const projectId = panelState.projectId;
  const taskId = getTaskId();
  const reviewStore = window.__wbCodeReviewStore;
  if (!projectId || !taskId || !reviewStore) {
    return;
  }
  const accepted = reviewStore.getAcceptedChanges(projectId, taskId);
  if (!accepted.length) {
    await wbAlert("请先在 Diff 审阅面板中「接受」至少一个文件。", {
      title: "无可写入变更",
      detail: "在「Diff 审阅」Tab 中逐文件接受后，再执行批量写入。",
    });
    return;
  }
  const createGitBranch = getCreateGitBranchChecked();
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const approved = await window.__wbRequestApproval?.({
    taskId,
    projectId,
    actionType: "write_batch",
    title: `批量写入 ${accepted.length} 个文件`,
    summary: "将应用 Diff 审阅中已接受的变更。",
    scope: accepted.map((c) => `${c.path} (+${c.additions}/-${c.deletions})`),
    riskLevel: "MEDIUM",
    details: {
      requestId,
      stagedPatchIds: accepted.map((c) => c.stagedPatchId).filter(Boolean),
    },
  });
  if (!approved) {
    return;
  }
  const patchIds = accepted.map((c) => c.stagedPatchId).filter(Boolean);
  const useBatchApply = window.__wbApplyBatchEnabled !== false;
  try {
    let applyOutput = null;
    if (useBatchApply && typeof api.wbProjectAgentRun === "function" && patchIds.length) {
      const result = await api.wbProjectAgentRun({
        projectId,
        taskId,
        message: "用户已接受 Diff，批量写入",
        mode: "APPLY_APPROVED",
        userApproved: true,
        requestId,
        approvalId: requestId,
        patchIds,
        createGitBranch: Boolean(createGitBranch),
      });
      applyOutput = result.output;
      if (!result.output?.applyResult?.ok) {
        throw new Error(result.output?.applyResult?.error || result.output?.summary || "批量写入失败");
      }
    } else {
      await applyAcceptedDiffsLegacy(api, projectId, taskId, accepted, createGitBranch);
    }
    reviewStore.clearChanges(projectId, taskId);
    window.__wbExpandTerminalDrawer?.("log");
    await refreshGitStatus(projectId);
    await refreshFileTree(projectId);
    await refreshBackupList();
    await refreshToolOps();
    window.__wbRefreshTaskList?.();
    window.__wbRenderDiffReviewPanel?.();
    await window.__wbLoadTaskContext?.(projectId, taskId);
    const autoVerify = document.getElementById("wbAutoVerifyAfterWrite")?.checked;
    if (autoVerify && typeof api.wbProjectAgentRun === "function") {
      const approvedVerify = await window.__wbRequestApproval?.({
        taskId,
        projectId,
        actionType: "run_test",
        title: "写入后自动验证 build",
        summary: "运行 npm run build 验证写入结果",
        riskLevel: "MEDIUM",
        details: { auto_verify: true, requestId: `verify_${requestId}` },
      });
      if (approvedVerify) {
        const fixResult = applyOutput?.fixResult;
        if (fixResult?.waitingApproval) {
          await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
          window.__wbRenderDiffReviewPanel?.();
        } else if (!fixResult?.ok) {
          await api.wbProjectAgentRun({
            projectId,
            taskId,
            message: "构建失败，请修复",
            mode: "VERIFY_FIX",
            fixContext: { scriptName: "build" },
          });
          await window.__wbCodeReviewStore?.syncFromStagedPatches?.(projectId, taskId);
          window.__wbRenderDiffReviewPanel?.();
        }
      }
    }
  } catch (err) {
    await wbAlert(err?.message || "批量写入失败", { title: "批量写入失败" });
  }
}

window.__wbRefreshCodePanel = refreshCodePanel;
window.__wbRenderSourceRootCard = renderSourceRootCard;
window.__wbRenderSourceRootGitStatus = renderSourceRootGitStatus;
window.__wbEnsureSourceRootCard = ensureSourceRootCard;
window.__wbRenderPlanCodeExtras = renderPlanCodeExtras;
window.__wbBindCodePanel = ensureCodePanelMount;
window.__wbApplyPlanPatch = applyPlanPatch;
window.__wbApplyAcceptedDiffs = applyAcceptedDiffs;
window.__wbRunWhitelistedTest = runWhitelistedTest;
window.__wbRunTestWithFix = runTestWithFix;
window.__wbGitCommitConfirmed = gitCommitConfirmed;
window.__wbLoadFilePreview = loadFilePreview;
window.__wbSyncCodeWriteUi = syncCodeWriteUiState;
