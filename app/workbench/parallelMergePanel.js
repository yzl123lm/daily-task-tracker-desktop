/**
 * REQ-011 Parallel merge conflict panel
 */
(function () {
  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getCtx() {
    const s = window.__wbStore?.getState?.() || {};
    return {
      projectId: s.selectedProjectId,
      taskId: s.selectedTaskId || s.activeTaskId || null,
    };
  }

  function ensureParallelMergePanel() {
    let panel = document.getElementById("wbParallelMergePanel");
    if (panel) return panel;
    const mount = document.getElementById("wbPwsCodeMount");
    if (!mount) return null;
    panel = document.createElement("section");
    panel.id = "wbParallelMergePanel";
    panel.className = "wb-parallel-merge-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <header class="wb-parallel-merge-panel__head">
        <div>
          <h3>并行合并</h3>
          <p id="wbParallelMergeMeta" class="wb-parallel-merge-panel__meta">创建并行组以检测冲突</p>
        </div>
        <div class="wb-parallel-merge-panel__actions">
          <button type="button" id="wbParallelCreateBtn" class="wb-pws-btn wb-pws-btn--ghost">创建双分支组</button>
          <button type="button" id="wbParallelPreviewBtn" class="wb-pws-btn wb-pws-btn--ghost">预览冲突</button>
          <button type="button" id="wbParallelApplyBtn" class="wb-pws-btn wb-pws-btn--primary">合并应用</button>
        </div>
      </header>
      <input type="hidden" id="wbParallelGroupId" value="" />
      <pre id="wbParallelMergeBody" class="wb-parallel-merge-panel__body scroll-tech"></pre>
    `;
    mount.appendChild(panel);
    return panel;
  }

  function showParallelMergePanel(show = true) {
    const panel = ensureParallelMergePanel();
    if (panel) panel.hidden = !show;
  }

  async function createParallelGroup() {
    const api = window.electronAPI || {};
    const { projectId, taskId } = getCtx();
    if (!projectId || !taskId || typeof api.wbParallelGroupCreate !== "function") {
      window.__wbShowComposerToast?.("需要选中任务", { type: "error" });
      return;
    }
    const group = await api.wbParallelGroupCreate({
      projectId,
      taskId,
      branches: [
        { branchId: "a", label: "分支 A" },
        { branchId: "b", label: "分支 B" },
      ],
      allocateWorkspaces: true,
    });
    document.getElementById("wbParallelGroupId").value = group.id;
    const meta = document.getElementById("wbParallelMergeMeta");
    if (meta) {
      meta.textContent = `组 ${group.id} · ${group.branches.length} 分支 · 隔离工作区已分配`;
    }
    const body = document.getElementById("wbParallelMergeBody");
    if (body) {
      body.textContent = JSON.stringify(
        group.branches.map((b) => ({
          branchId: b.branchId,
          workspaceSessionId: b.workspaceSessionId,
          status: b.status,
        })),
        null,
        2
      );
    }
    showParallelMergePanel(true);
  }

  async function previewMerge() {
    const api = window.electronAPI || {};
    const groupId = document.getElementById("wbParallelGroupId")?.value;
    if (!groupId) {
      window.__wbShowComposerToast?.("请先创建并行组", { type: "error" });
      return;
    }
    const preview = await api.wbParallelMergePreview({ groupId });
    const body = document.getElementById("wbParallelMergeBody");
    const meta = document.getElementById("wbParallelMergeMeta");
    if (meta) {
      meta.textContent = preview.ok
        ? `可干净合并 · ${preview.mergedPatches?.length || 0} 补丁`
        : `冲突 ${preview.conflictCount} · MERGE_CONFLICT`;
    }
    if (body) body.textContent = JSON.stringify(preview, null, 2);
  }

  async function applyMerge() {
    const api = window.electronAPI || {};
    const groupId = document.getElementById("wbParallelGroupId")?.value;
    if (!groupId) return;
    const requestId = `parallel-merge:${groupId}:${Date.now()}`;
    let approved = true;
    if (typeof window.__wbRequestApproval === "function") {
      approved = await window.__wbRequestApproval({
        title: "并行合并写入",
        purpose: "将并行分支补丁合并并写入磁盘",
        risk: "write",
        requestId,
      });
    }
    if (!approved) return;
    const result = await api.wbParallelMergeApply({
      groupId,
      userApproved: true,
      requestId,
      approvalId: requestId,
    });
    const body = document.getElementById("wbParallelMergeBody");
    if (body) body.textContent = JSON.stringify(result, null, 2);
    window.__wbShowComposerToast?.(result.ok ? "合并已应用" : result.mergeStatus || "合并未完成", {
      type: result.ok ? "success" : "error",
    });
  }

  function bindParallelMergePanel() {
    ensureParallelMergePanel();
    const panel = document.getElementById("wbParallelMergePanel");
    if (!panel || panel.dataset.bound === "1") return;
    panel.dataset.bound = "1";
    document.getElementById("wbParallelCreateBtn")?.addEventListener("click", () => {
      void createParallelGroup().catch((e) =>
        window.__wbShowComposerToast?.(e?.message || "创建失败", { type: "error" })
      );
    });
    document.getElementById("wbParallelPreviewBtn")?.addEventListener("click", () => {
      void previewMerge().catch((e) =>
        window.__wbShowComposerToast?.(e?.message || "预览失败", { type: "error" })
      );
    });
    document.getElementById("wbParallelApplyBtn")?.addEventListener("click", () => {
      void applyMerge().catch((e) =>
        window.__wbShowComposerToast?.(e?.message || "合并失败", { type: "error" })
      );
    });
  }

  window.__wbEnsureParallelMergePanel = ensureParallelMergePanel;
  window.__wbBindParallelMergePanel = bindParallelMergePanel;
  window.__wbShowParallelMergePanel = showParallelMergePanel;
})();
