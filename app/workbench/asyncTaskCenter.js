/**
 * UX-007 Async Task Center UI
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

  function ensureAsyncTaskCenter() {
    const panel = document.getElementById("wbAsyncRunsPanel");
    if (!panel) return null;
    if (panel.dataset.center === "1") return panel;
    panel.dataset.center = "1";
    panel.innerHTML = `
      <summary class="wb-async-runs-panel__summary">
        <span class="wb-async-runs-panel__summary-title">异步任务中心</span>
        <span id="wbAsyncCenterMeta" class="wb-async-runs-panel__meta"></span>
      </summary>
      <div class="wb-async-center__toolbar">
        <select id="wbAsyncFilterStatus" class="wb-pws-template-select" aria-label="状态筛选">
          <option value="">全部状态</option>
          <option value="RUNNING">运行中</option>
          <option value="PAUSED">已暂停</option>
          <option value="COMPLETED">已完成</option>
          <option value="FAILED">失败</option>
          <option value="CANCELED">已取消</option>
          <option value="BUDGET_EXCEEDED">超预算</option>
        </select>
        <button type="button" id="wbAsyncRunsRefreshBtn" class="wb-pws-btn wb-pws-btn--ghost">刷新</button>
        <button type="button" id="wbAsyncEnqueueBtn" class="wb-pws-btn wb-pws-btn--ghost">后台运行当前指令</button>
      </div>
      <ul id="wbAsyncRunsList" class="wb-async-runs-list scroll-tech"></ul>
    `;
    return panel;
  }

  function budgetLabel(job) {
    const b = job.budget || {};
    if (!b.tokenLimit && !b.tokensUsed) return "";
    const used = b.tokensUsed || 0;
    const lim = b.tokenLimit || "∞";
    return ` · tokens ${used}/${lim}`;
  }

  async function refreshAsyncTaskCenter(projectId, taskId) {
    ensureAsyncTaskCenter();
    const list = document.getElementById("wbAsyncRunsList");
    const meta = document.getElementById("wbAsyncCenterMeta");
    if (!list) return;
    const api = window.electronAPI || {};
    if (typeof api.wbAsyncRunsList !== "function") {
      list.innerHTML = '<li class="wb-async-runs-list__empty">异步队列不可用</li>';
      return;
    }
    const status = document.getElementById("wbAsyncFilterStatus")?.value || "";
    try {
      const jobs = (await api.wbAsyncRunsList({ projectId, taskId, status: status || null })) || [];
      if (meta) meta.textContent = `${jobs.length} 项`;
      if (!jobs.length) {
        list.innerHTML = '<li class="wb-async-runs-list__empty">暂无异步任务</li>';
        return;
      }
      list.innerHTML = jobs
        .slice(0, 40)
        .map((j) => {
          const st = String(j.status || "");
          const cls =
            st === "FAILED" || st === "CANCELED" || st === "BUDGET_EXCEEDED"
              ? "is-failed"
              : st === "COMPLETED"
                ? "is-done"
                : st === "PAUSED"
                  ? "is-paused"
                  : st === "RUNNING"
                    ? "is-running"
                    : "";
          const actions =
            st === "RUNNING"
              ? `<button type="button" class="wb-pws-btn wb-pws-btn--ghost" data-async-act="pause" data-run="${escapeHtml(j.runId)}" data-project="${escapeHtml(j.projectId)}" data-task="${escapeHtml(j.taskId)}">暂停</button>
                 <button type="button" class="wb-pws-btn wb-pws-btn--ghost" data-async-act="cancel" data-run="${escapeHtml(j.runId)}" data-project="${escapeHtml(j.projectId)}" data-task="${escapeHtml(j.taskId)}">取消</button>`
              : "";
          const iso = j.workspaceSessionId ? " · 隔离工作区" : "";
          return `<li class="wb-async-runs-list__item">
            <div class="wb-async-runs-list__main">
              <span><code>${escapeHtml((j.runId || "").slice(0, 16))}</code> · ${escapeHtml(j.mode || "")}${escapeHtml(budgetLabel(j))}${iso}</span>
              <span class="wb-async-runs-list__status ${cls}">${escapeHtml(st)}</span>
            </div>
            <div class="wb-async-runs-list__actions">${actions}</div>
          </li>`;
        })
        .join("");
    } catch (err) {
      list.innerHTML = `<li class="wb-async-runs-list__empty">${escapeHtml(err?.message || "加载失败")}</li>`;
    }
  }

  function bindAsyncTaskCenter() {
    const panel = ensureAsyncTaskCenter();
    if (!panel || panel.dataset.boundActions === "1") return;
    panel.dataset.boundActions = "1";
    document.getElementById("wbAsyncRunsRefreshBtn")?.addEventListener("click", () => {
      const { projectId, taskId } = getCtx();
      void refreshAsyncTaskCenter(projectId, taskId);
    });
    document.getElementById("wbAsyncFilterStatus")?.addEventListener("change", () => {
      const { projectId, taskId } = getCtx();
      void refreshAsyncTaskCenter(projectId, taskId);
    });
    document.getElementById("wbAsyncEnqueueBtn")?.addEventListener("click", () => {
      void enqueueCurrentAsAsync();
    });
    panel.addEventListener("click", (ev) => {
      const btn = ev.target?.closest?.("[data-async-act]");
      if (!btn) return;
      const act = btn.dataset.asyncAct;
      const runId = btn.dataset.run;
      const projectId = btn.dataset.project;
      const taskId = btn.dataset.task;
      void (async () => {
        const api = window.electronAPI || {};
        try {
          if (act === "pause" && api.wbAsyncJobPause) {
            await api.wbAsyncJobPause({ projectId, taskId, runId });
          } else if (act === "cancel" && api.wbAsyncJobCancel) {
            await api.wbAsyncJobCancel({ projectId, taskId, runId });
          }
          await refreshAsyncTaskCenter(projectId, taskId);
        } catch (err) {
          window.__wbShowComposerToast?.(err?.message || "操作失败", { type: "error" });
        }
      })();
    });
    const api = window.electronAPI || {};
    if (typeof api.onWbAsyncJobChange === "function") {
      api.onWbAsyncJobChange(() => {
        const { projectId, taskId } = getCtx();
        void refreshAsyncTaskCenter(projectId, taskId);
      });
    }
  }

  async function enqueueCurrentAsAsync() {
    const api = window.electronAPI || {};
    const { projectId, taskId } = getCtx();
    const message = document.getElementById("wbAgentInput")?.value?.trim();
    if (!projectId || !taskId || !message) {
      window.__wbShowComposerToast?.("请先选择任务并输入指令", { type: "error" });
      return;
    }
    if (typeof api.wbProjectAgentRunAsync !== "function") {
      window.__wbShowComposerToast?.("异步运行不可用", { type: "error" });
      return;
    }
    try {
      const r = await api.wbProjectAgentRunAsync({
        projectId,
        taskId,
        message,
        mode: "PLAN_ONLY",
      });
      window.__wbShowComposerToast?.(`已入队 ${String(r?.agentRunId || "").slice(0, 12)}`, {
        type: "success",
      });
      await refreshAsyncTaskCenter(projectId, taskId);
    } catch (err) {
      window.__wbShowComposerToast?.(err?.message || "入队失败", { type: "error" });
    }
  }

  window.__wbEnsureAsyncTaskCenter = ensureAsyncTaskCenter;
  window.__wbBindAsyncTaskCenter = bindAsyncTaskCenter;
  window.__wbRefreshAsyncTaskCenter = refreshAsyncTaskCenter;
  window.__wbRefreshAsyncRunsPanel = refreshAsyncTaskCenter;
})();
