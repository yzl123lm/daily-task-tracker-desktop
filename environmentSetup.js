(function initEnvironmentSetup() {
  const api = window.electronAPI;
  if (!api) {
    return;
  }

  const dialog = document.getElementById("environmentSetupDialog");
  if (!dialog) {
    return;
  }

  const el = {
    message: document.getElementById("envSetupMessage"),
    issues: document.getElementById("envSetupIssueList"),
    progress: document.getElementById("envSetupProgress"),
    skipBtn: document.getElementById("envSetupSkipBtn"),
    recheckBtn: document.getElementById("envSetupRecheckBtn"),
    autoFixBtn: document.getElementById("envSetupAutoFixBtn"),
    doneBtn: document.getElementById("envSetupDoneBtn"),
    steps: document.getElementById("envSetupSteps"),
  };

  let lastProfile = null;
  let busy = false;

  function setStep(active) {
    el.steps?.querySelectorAll(".env-setup-step").forEach((node) => {
      node.classList.toggle("is-active", node.dataset.step === active);
      node.classList.toggle("is-done", node.dataset.step !== active && getStepOrder(node.dataset.step) < getStepOrder(active));
    });
  }

  function getStepOrder(step) {
    return { detect: 0, python: 1, ollama: 2, models: 3, verify: 4 }[step] ?? 0;
  }

  function appendProgress(line) {
    if (!el.progress) {
      return;
    }
    el.progress.hidden = false;
    el.progress.textContent = `${el.progress.textContent || ""}${line}\n`.slice(-4000);
  }

  function renderIssues(profile) {
    if (!el.issues) {
      return;
    }
    const issues = Array.isArray(profile?.issues) ? profile.issues : [];
    el.issues.innerHTML = issues
      .slice(0, 8)
      .map(
        (i) =>
          `<li class="env-setup-issue env-setup-issue--${escapeHtml(i.severity || "info")}"><strong>${escapeHtml(i.title || "")}</strong><span>${escapeHtml(i.detail || "")}</span></li>`
      )
      .join("");
  }

  function deriveActiveStep(profile) {
    const core = profile?.core || {};
    if (!core.pythonReady) {
      return "python";
    }
    if (!core.ollamaInstalled && !core.ollamaRunning) {
      return "ollama";
    }
    if (!core.knowledgeBaseEmbedReady) {
      return "models";
    }
    return "verify";
  }

  async function runEvaluate(full) {
    const out = await api.environmentEvaluate({ depth: full ? "full" : "lite" });
    lastProfile = out?.profile || null;
    if (typeof window.applyRuntimeProfile === "function") {
      window.applyRuntimeProfile(lastProfile);
    }
    return out;
  }

  async function refreshUi(full) {
    if (el.message) {
      el.message.textContent = "正在检测本地 AI 环境…";
    }
    setStep("detect");
    const out = await runEvaluate(full);
    const profile = out?.profile;
    setStep(deriveActiveStep(profile));
    if (el.message) {
      const ready = profile?.core?.knowledgeBaseEmbedReady;
      el.message.textContent = ready
        ? "环境已就绪，可正常使用知识库与本地模型。"
        : "检测到以下待配置项，可点击「一键配置」自动安装与下载。";
    }
    renderIssues(profile);
    if (el.doneBtn) {
      el.doneBtn.hidden = profile?.core?.knowledgeBaseEmbedReady !== true;
    }
    return profile;
  }

  async function openWizard() {
    if (!dialog.open) {
      if (el.progress) {
        el.progress.textContent = "";
        el.progress.hidden = true;
      }
      dialog.showModal();
    }
    await refreshUi(false);
  }

  window.openEnvironmentSetupWizard = openWizard;

  el.skipBtn?.addEventListener("click", async () => {
    await api.environmentWizardSkip?.();
    dialog.close();
  });

  el.recheckBtn?.addEventListener("click", () => {
    if (busy) {
      return;
    }
    void refreshUi(true);
  });

  el.doneBtn?.addEventListener("click", () => {
    dialog.close();
  });

  el.autoFixBtn?.addEventListener("click", async () => {
    if (busy) {
      return;
    }
    busy = true;
    el.autoFixBtn.disabled = true;
    if (el.message) {
      el.message.textContent = "正在按 Python → Ollama → 模型 顺序自动配置，请勿关闭窗口…";
    }
    setStep("python");
    try {
      const batch = await api.environmentRemediateBatch({ autoOnly: true });
      const lines = (batch?.results || []).map((r) => {
        if (r.skipped) {
          return `${r.issueId}: 已跳过${r.message ? `（${r.message}）` : r.error ? `（${r.error}）` : ""}`;
        }
        return `${r.issueId}: ${r.ok ? "完成" : r.error || "失败"}`;
      });
      if (lines.length) {
        appendProgress(lines.join("\n"));
      }
      setStep("verify");
      await refreshUi(true);
      const stillNoPython = lastProfile?.core?.pythonReady !== true;
      const manualPython = (batch?.results || []).some(
        (r) =>
          (r.issueId === "python_missing" || r.issueId === "python_high_version") &&
          (r.manual || r.needsUserAction)
      );
      if (stillNoPython && manualPython && el.message) {
        el.message.textContent =
          "Python 需在本机安装窗口中手动完成（勾选 Add to PATH）。完成后请点击「重新检测」，再继续 Ollama 与模型下载。";
      }
    } catch (err) {
      if (el.message) {
        el.message.textContent = `自动配置失败：${err?.message || err}`;
      }
    } finally {
      busy = false;
      el.autoFixBtn.disabled = false;
    }
  });

  api.onEnvironmentRemediationProgress?.((payload) => {
    if (payload?.message) {
      appendProgress(payload.message);
    }
    if (payload?.stage === "skip") {
      return;
    }
    if (payload?.issueId === "python_missing" || payload?.issueId === "python_high_version") {
      setStep("python");
    } else if (
      payload?.issueId === "ollama_missing" ||
      payload?.issueId === "ollama_not_running" ||
      payload?.stage === "install" ||
      payload?.stage === "download"
    ) {
      setStep("ollama");
    } else if (
      payload?.issueId === "bge_m3_missing" ||
      payload?.issueId === "chat_model_missing" ||
      payload?.issueId === "rerank_cache_missing" ||
      payload?.stage === "pull" ||
      payload?.stage === "pull_start" ||
      payload?.stage === "pull_skip"
    ) {
      setStep("models");
    }
  });

  api.onEnvironmentProfile?.((profile) => {
    lastProfile = profile;
    if (typeof window.applyRuntimeProfile === "function") {
      window.applyRuntimeProfile(profile);
    }
  });

  api.onEnvironmentShowWizard?.(() => {
    void openWizard();
  });

  void (async () => {
    try {
      const gate = await api.environmentShouldShowWizard?.();
      if (gate?.show) {
        await openWizard();
      } else {
        const profile = await api.environmentGetProfile?.();
        if (profile && typeof window.applyRuntimeProfile === "function") {
          window.applyRuntimeProfile(profile);
        }
      }
    } catch {
      /* optional first-run wizard */
    }
  })();
})();
