(function (global) {
  const NAV_ITEMS = [
    { view: "capture", icon: "🎙", label: "录音", desc: "开始录制音频" },
    { view: "transcript", icon: "〰", label: "转写", desc: "音频转文字" },
    { view: "summary", icon: "📄", label: "纪要", desc: "智能生成纪要" },
    { view: "recent", icon: "🕐", label: "最近记录", desc: "查看历史记录" },
  ];

  function setActiveView(view) {
    const shell = document.querySelector(".record-assistant");
    if (!shell) {
      return;
    }
    shell.querySelectorAll("[data-record-nav]").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.recordNav === view);
    });
    shell.querySelectorAll("[data-record-panel]").forEach((panel) => {
      const active = panel.dataset.recordPanel === view;
      panel.hidden = !active;
      panel.classList.toggle("is-active", active);
    });
  }

  function bindNav() {
    document.querySelectorAll("[data-record-nav]").forEach((btn) => {
      if (btn.dataset.jlRecordNavBound === "1") {
        return;
      }
      btn.dataset.jlRecordNavBound = "1";
      btn.addEventListener("click", () => {
        const view = btn.dataset.recordNav;
        if (view) {
          setActiveView(view);
        }
      });
    });
  }

  function initRecordAssistantUI() {
    bindNav();
    setActiveView("capture");
  }

  global.initRecordAssistantUI = initRecordAssistantUI;
  global.setRecordAssistantView = setActiveView;
})(typeof window !== "undefined" ? window : globalThis);
