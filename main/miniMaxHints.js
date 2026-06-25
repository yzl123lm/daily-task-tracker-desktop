function appendMiniMaxErrorHints(baseMsg) {
  const s = String(baseMsg);
  let extra = "";
  if (/2049|invalid api key/i.test(s)) {
    extra +=
      " 请到 https://platform.minimax.io 的「API 密钥」复制密钥（通常为 sk- 开头）；勿使用 ey 开头的登录 JWT 当作 API Key。";
  }
  if (/2013|unknown model/i.test(s) && /minimax\s*m2/i.test(s)) {
    extra += " 模型名请使用官方 ID（连字符），例如 MiniMax-M3、MiniMax-M2.7，勿使用「MiniMax M3」等带空格的写法。";
  }
  if (/\b520\b|\b1000\b|\(1000\)|unknown error/i.test(s)) {
    extra +=
      " 【常见原因】MiniMax 错误码 1000 为「未知错误」（官方文档），多因服务端短时异常、限流或负载；HTTP 520 常出现在网关/代理层未拿到正常响应。可隔 1～3 分钟重试、切换网络、关闭「联网检索」以缩短请求体，或减少任务数量后再问。";
  }
  if (/\b2064\b|负载较高|retry later/i.test(s)) {
    extra += " 【服务繁忙】当前模型服务端负载较高（2064），已自动重试；若仍失败，请稍后重试或临时切换到同厂商其它模型。";
  }
  if (/\b404\b|page not found/i.test(s)) {
    extra +=
      " 【404】请检查 API Base URL：只填 OpenAI 兼容根路径（例如 https://api.minimax.io/v1），勿在末尾加 /chat/completions（应用会自动拼接）。";
  }
  if (
    /\b2061\b|token plan not support|plan not support model|current token plan not support/i.test(s)
  ) {
    extra +=
      " 【套餐与密钥】MiniMax 返回「当前 Token 套餐不支持该模型」时：(1) 若已订阅 Token Plan（Plus 等），请到 https://platform.minimax.io/user-center/basic-information/interface-key 创建并粘贴「Token Plan 专属」API Key——它与按量计费密钥不可混用；(2) 若套餐为 Plus 标准版而不含高速权益，请把模型从 MiniMax-M2.7-highspeed 改为 MiniMax-M2.7（无 -highspeed 后缀）后再试；(3) 图像理解若提示不支持 MiniMax-Text-01，请核对 Token Plan 是否包含该多模态模型或改用账号已开通的视觉模型。";
  }
  return s + extra;
}

module.exports = { appendMiniMaxErrorHints };
