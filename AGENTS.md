## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- After modifying code files in this session, run `python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"` to keep the graph current

## 客户端迭代交付

每次完成桌面客户端相关改动并准备交付时，**必须自动**执行 `npm run ship:latest-client`（打包 → 归档到 `最新客户端` → 本机静默安装），无需用户另行要求「打包安装」。详见 `.cursor/rules/client-ship-after-change.mdc`。

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
