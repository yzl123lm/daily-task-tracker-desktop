# 参与贡献

感谢你对 **鲸落AI**（`daily-task-tracker-desktop`）的关注。本文说明如何在 GitHub 上协作开发。

## 开始之前

1. Fork 本仓库库，或向维护者申请 Collaborator 权限。
2. 克隆到本地：

```bash
git clone https://github.com/<你的用户名>/daily-task-tracker-desktop.git
cd daily-task-tracker-desktop
npm install
```

3. 复制环境变量示例（可选，仅本地开发参考）：

```bash
copy .env.example .env
```

**请勿**在 `.env` 或任何提交文件中写入真实 API Key；桌面版密钥由应用内设置并加密保存在用户数据目录。

## 开发流程

1. 从 `main` 拉取最新代码并创建分支：

```bash
git checkout main
git pull origin main
git checkout -b feat/your-topic
```

2. 本地运行：

```bash
npm run start
```

3. 若修改了 Electron 客户端相关文件（`main.js`、`preload.js`、`index.html`、打包配置等），迭代发布前请执行：

```bash
npm run ship:latest-client
```

4. 若改动知识库检索逻辑，可运行回归：

```bash
npm run kb:eval
```

5. 提交时请写清楚「为什么改」，PR 描述里说明测试方式。

## 提 Pull Request

- 目标分支：`main`
- 一个 PR 聚焦一类改动（功能、修复或文档），便于审查
- 确保未提交 `node_modules/`、`dist/`、`最新客户端/`、`.env` 等（已在 `.gitignore` 中排除）
- 大文件（安装包、模型权重、个人知识库数据）不要放进仓库库

## 代码约定

- 遵循现有目录与命名风格；优先扩展 `main/`、`utils/` 中已有模块
- UI 改动注意 `index.html` / `styles.css` 与渲染进程脚本的一致性
- 修改代码后若项目启用了 graphify，可在本地重建知识图：

```bash
python3 -c "from graphify.watch import _rebuild_code; from pathlib import Path; _rebuild_code(Path('.'))"
```

## 报告问题

在 GitHub Issues 中请尽量包含：操作系统版本、Node 版本、应用版本（`package.json`）、复现步骤与相关日志（勿贴密钥）。

## 许可证

贡献代码即表示同意以 [MIT License](./LICENSE) 发布。
