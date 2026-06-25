function initMediaPanel() {
  const api = window.electronAPI;
  const genBtn = document.getElementById("mediaGenBtn");
  const motionEl = document.getElementById("mediaMotionCheck");
  const promptEl = document.getElementById("mediaGenPrompt");
  const imgEl = document.getElementById("mediaGenPreview");
  const genStatus = document.getElementById("mediaGenStatus");
  const fileEl = document.getElementById("mediaUnderstandFile");
  const understandPrompt = document.getElementById("mediaUnderstandPrompt");
  const understandBtn = document.getElementById("mediaUnderstandBtn");
  const understandOut = document.getElementById("mediaUnderstandOut");
  const understandStatus = document.getElementById("mediaUnderstandStatus");
  const ttsTestBtn = document.getElementById("mediaTtsTestBtn");
  const ttsTestText = document.getElementById("mediaTtsTestText");
  const ttsStatus = document.getElementById("mediaTtsStatus");
  const fallback = document.getElementById("mediaWebFallback");
  const main = document.getElementById("mediaPanelMain");

  if (!genBtn || !promptEl) {
    return;
  }

  if (!api) {
    if (fallback) {
      fallback.hidden = false;
    }
    if (main) {
      main.hidden = true;
    }
    return;
  }
  if (fallback) {
    fallback.hidden = true;
  }
  if (main) {
    main.hidden = false;
  }

  let lastObjectUrl = "";
  function formatMediaError(e, scene) {
    const msg = String(e?.message || e || "");
    if (/404 page not found/i.test(msg) || /\/images\/generations/i.test(msg)) {
      return `${scene}失败：当前图像 Base URL 或接口路径不匹配。若使用 MiniMax，请将图像请求走其原生图像接口（/v1/image_generation）。`;
    }
    return `${scene}失败：${msg}`;
  }

  genBtn.addEventListener("click", async () => {
    const prompt = promptEl.value.trim();
    if (!prompt) {
      alert("请输入文生图提示词。");
      return;
    }
    if (genStatus) {
      genStatus.textContent = "生成中…";
    }
    genBtn.disabled = true;
    try {
      const motion = motionEl && motionEl.checked;
      const res = await api.imageGenerate({ prompt, motion: motion ? true : false });
      if (lastObjectUrl) {
        URL.revokeObjectURL(lastObjectUrl);
        lastObjectUrl = "";
      }
      if (res.imageUrl) {
        if (imgEl) {
          imgEl.src = res.imageUrl;
          imgEl.hidden = false;
        }
      } else if (res.b64_json && imgEl) {
        imgEl.src = `data:image/png;base64,${res.b64_json}`;
        imgEl.hidden = false;
      } else {
        alert("接口未返回图片 URL 或 base64。");
      }
      if (genStatus) {
        genStatus.textContent = res.revised_prompt ? `已生成（修订提示：${res.revised_prompt}）` : "已生成。";
      }
    } catch (e) {
      if (genStatus) {
        genStatus.textContent = formatMediaError(e, "生成");
      }
    } finally {
      genBtn.disabled = false;
    }
  });

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const dataUrl = String(r.result || "");
        const marker = ";base64,";
        const idx = dataUrl.indexOf(marker);
        if (idx !== -1) {
          const header = dataUrl.slice("data:".length, idx);
          const mimeType = (header.split(";")[0] || "").trim() || "application/octet-stream";
          const base64 = dataUrl.slice(idx + marker.length).replace(/\s/g, "");
          if (base64.length) {
            resolve({ mimeType, base64 });
            return;
          }
        }
        const r2 = new FileReader();
        r2.onload = () => {
          const buf = r2.result;
          if (!(buf instanceof ArrayBuffer) || !buf.byteLength) {
            reject(new Error("无法读取图片（文件为空或未被识别为图片）"));
            return;
          }
          const bytes = new Uint8Array(buf);
          let bin = "";
          const chunk = 0x8000;
          for (let i = 0; i < bytes.length; i += chunk) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
          }
          const mimeType = String(file.type || "").trim() || "application/octet-stream";
          resolve({ mimeType, base64: btoa(bin) });
        };
        r2.onerror = () => reject(r2.error || new Error("读取失败"));
        r2.readAsArrayBuffer(file);
      };
      r.onerror = () => reject(r.error || new Error("读取失败"));
      r.readAsDataURL(file);
    });
  }

  if (understandBtn) {
    understandBtn.addEventListener("click", async () => {
      const f = fileEl && fileEl.files && fileEl.files[0];
      if (!f) {
        alert("请先选择一张图片。");
        return;
      }
      if (understandStatus) {
        understandStatus.textContent = "分析中…";
      }
      understandBtn.disabled = true;
      try {
        const { mimeType, base64 } = await readFileAsBase64(f);
        const prompt = (understandPrompt && understandPrompt.value.trim()) || "请详细描述图片内容。";
        const res = await api.imageUnderstand({
          imageBase64: base64,
          mimeType,
          prompt,
        });
        if (understandOut) {
          understandOut.value = res.content || "";
        }
        if (understandStatus) {
          understandStatus.textContent = "完成。";
        }
      } catch (e) {
        if (understandStatus) {
          understandStatus.textContent = formatMediaError(e, "图像理解");
        }
      } finally {
        understandBtn.disabled = false;
      }
    });
  }

  if (ttsTestBtn) {
    ttsTestBtn.addEventListener("click", async () => {
      const text = (ttsTestText && ttsTestText.value.trim()) || "这是一条语音合成测试。";
      ttsTestBtn.disabled = true;
      if (ttsStatus) {
        ttsStatus.textContent = "语音合成中…";
      }
      try {
        const { audioBase64, mimeType } = await api.ttsSpeak({ text });
        const url = `data:${mimeType || "audio/mpeg"};base64,${audioBase64}`;
        const audio = new Audio(url);
        await audio.play();
        if (ttsStatus) {
          ttsStatus.textContent = "播放完成。";
        }
      } catch (e) {
        const msg = String(e?.message || e || "");
        if (ttsStatus) {
          if (/usage limit exceeded|quota|配额|额度|限额/i.test(msg)) {
            ttsStatus.textContent = "TTS 配额不足（usage limit exceeded）。请更换可用的 TTS Key 或稍后重试。";
          } else {
            ttsStatus.textContent = `TTS 失败：${msg}`;
          }
        }
        if (typeof window.offerRuntimePrereqAfterTtsFailure === "function") {
          void window.offerRuntimePrereqAfterTtsFailure(msg);
        }
      } finally {
        ttsTestBtn.disabled = false;
      }
    });
  }

  window.onMediaPanelVisible = () => {
    /* 预留：可在此刷新能力开关状态 */
  };
}

initMediaPanel();
