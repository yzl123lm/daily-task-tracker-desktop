## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current

## 客户端迭代交付

每次完成桌面客户端相关改动并准备交付时，**必须自动**执行 `npm run ship:latest-client`（打包 → 归档到 `最新客户端` → 本机静默安装），无需用户另行要求「打包安装」。详见 `.cursor/rules/client-ship-after-change.mdc`。

## Electron 桌面 / IPC / 安全

修改主进程、preload、IPC 处理器或打包脚本时，遵循 `.cursor/rules/electron-desktop-ipc.mdc`：

1. **分层**：主进程（`main.js`、`main/**`）→ preload（`contextBridge`）→ 渲染层（禁止直接 `require("electron")`）
2. **IPC**：kebab-case 通道、`ipcMain.handle` + `invoke`；在 `register*Handlers` 模块注册，不散落 `main.js`
3. **安全**：payload 经 `utils/ipcValidate.js` 校验；密钥用 `safeStorage`；路径白名单；禁止向 renderer 泄漏 `ipcRenderer` 或明文密钥
4. **风格**：CommonJS、最小改动；交付流程仍见上一节 `client-ship-after-change.mdc`

## UI design (taste-skill)

For UI design, frontend visuals, layout, styling, motion, landing pages, portfolios, or redesigns:

1. **Always read first:** `.cursor/skills/taste-skill/SKILL.md` ([taste-skill](https://github.com/Leonxlnx/taste-skill))
2. Follow brief inference, three dials, anti-slop rules, and pre-flight check in that skill
3. Do not substitute other design skills unless the user explicitly requests a variant (e.g. redesign-skill, soft-skill)

**Update via official CLI** (requires Git):

```bash
npx skills add https://github.com/Leonxlnx/taste-skill --skill "design-taste-frontend" -y
```

Canonical install: `.agents/skills/design-taste-frontend/` (tracked in `skills-lock.json`).

**Auto-update:** Windows scheduled task `DailyTaskTracker-TasteSkillUpdate` runs `npm run taste-skill:update-sync` every Monday 09:00. Register once: `npm run taste-skill:register-weekly-task`
