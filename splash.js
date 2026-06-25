(function initSplashPage() {
  const api = window.splashAPI;
  if (!api) {
    return;
  }

  const el = {
    title: document.getElementById("splashTitle"),
    subtitle: document.getElementById("splashSubtitle"),
    message: document.getElementById("splashMessage"),
    taskName: document.getElementById("splashTaskName"),
    percent: document.getElementById("splashPercent"),
    progressBar: document.getElementById("splashProgressBar"),
    version: document.getElementById("splashVersion"),
    hint: document.getElementById("splashHint"),
    error: document.getElementById("splashError"),
    logo: document.getElementById("splashLogo"),
  };

  function setProgress(percent, taskLabel, message) {
    const p = Math.max(0, Math.min(100, Number(percent) || 0));
    if (el.progressBar) {
      el.progressBar.style.width = `${p}%`;
    }
    if (el.percent) {
      el.percent.textContent = `${p}%`;
    }
    if (el.taskName && taskLabel) {
      el.taskName.textContent = taskLabel;
    }
    if (el.message && message) {
      el.message.textContent = message;
    }
  }

  api.getBootstrap().then((boot) => {
    if (!boot || typeof boot !== "object") {
      return;
    }
    if (el.title && boot.productName) {
      el.title.textContent = boot.productName;
    }
    if (el.subtitle && boot.tagline) {
      el.subtitle.textContent = boot.tagline;
    }
    if (el.version && boot.version) {
      el.version.textContent = `v${boot.version}`;
    }
    if (el.logo && boot.logoDataUrl) {
      el.logo.src = boot.logoDataUrl;
    }
  });

  api.onProgress((payload) => {
    if (!payload || typeof payload !== "object") {
      return;
    }
    const phase = String(payload.phase || "");
    const percent = payload.percent != null ? payload.percent : undefined;
    const taskLabel = payload.taskLabel || payload.message || "";
    const message =
      phase === "done"
        ? payload.message || "启动完成"
        : payload.message || taskLabel || "正在初始化…";

    if (percent != null) {
      setProgress(percent, taskLabel, message);
    } else if (taskLabel || message) {
      setProgress(undefined, taskLabel, message);
    }

    if (phase === "done" && el.hint) {
      el.hint.textContent =
        payload.status === "warning"
          ? "部分模块未就绪，进入后可在「设置」中查看详情"
          : "即将进入主界面…";
    }

    if (payload.status === "error" && el.error) {
      el.error.hidden = false;
      el.error.textContent = payload.message || "启动遇到问题，仍将尝试进入主界面";
    }
  });
})();
