# 鲸落AI

Electron 桌面客户端：每日工作任务跟进、AI 助手、知识库、本地模型与数据看板。

## 功能概览

- 任务登记：序列、事物 ID、问题类型、内容、反馈人、处理人、登记时间、备注与状态。
- 备注历史、完结操作、未完结提醒（每分钟轮询）。
- 查询筛选、数据看板、自定义报表与任务模板。
- AI 助手、知识库（LanceDB）、本地 Ollama 模型、文档导出等。

## 环境要求

- **Node.js 18+**（推荐 LTS；打包脚本在 Node 20 下验证通过）
- **Windows 10/11**（当前交付目标平台）
- 可选：Python 3.12 + `.venv`（仅用于 `scripts/generate-app-icon.py` 图标生成）

## 快速开始

### 安装依赖

```bash
npm install
```

### 本地开发运行

```bash
npm run start
```

### 仅打包（不归档、不安装）

```bash
npm run build
```

产物在 `dist/`（NSIS 安装包 + 便携版）。

### 迭代交付（推荐）

修改客户端相关文件后，在项目根执行：

```bash
npm run ship:latest-client
```

等价命令：`npm run install:client`

该命令会：

1. 重新生成鲸鱼图标（`scripts/generate-app-icon.py`）
2. 执行 `npm run build`
3. 归档到 `最新客户端/`（时间戳子目录 + 按版本扁平目录）
4. 本机静默安装，并创建桌面/开始菜单快捷方式

可选环境变量：

| 变量 | 作用 |
|------|------|
| `SKIP_LAUNCH_AFTER_INSTALL=1` | 安装完成后不自动启动应用 |
| `SKIP_INSTALL=1` | 仅配合 `npm run release:latest-client` 调试，跳过安装 |

### 启动已安装版本

```bash
npm run start:client
```

安装路径：`%LOCALAPPDATA%\Programs\daily-task-tracker-desktop\`

## 其他 npm 脚本

| 命令 | 说明 |
|------|------|
| `npm run build:portable` | 仅打便携版 exe |
| `npm run build:nsis` | 仅打 NSIS 安装包 |
| `npm run release:latest-client` | 构建 + 归档；默认仍会安装（除非 `SKIP_INSTALL=1`） |
| `npm run start:installed` | 同 `start:client` |

## 配置与数据

- 环境变量示例：`.env.example`（勿提交真实密钥）
- 用户数据与配置文件说明：`config/README.md`

## 项目结构（核心）

```text
main.js / main/**        # Electron 主进程（IPC 按域拆分：会话、导出、运行时等）
preload.js               # 渲染进程桥
index.html + app.js      # 任务工作台 UI
app/taskListView.js      # 任务列表渲染（增量 DOM）
ai.js / ai/aiDocVisual.js
knowledgeBase.js         # 知识库（渲染进程）
utils/                   # dom、settingsStore、ipcValidate
scripts/                 # 打包、安装、快捷方式（ship:latest-client）
build/                   # 应用图标（icon.ico / icon.png）
```

## 网页方式（无 Electron）

也可直接双击 `index.html` 使用基础任务功能；数据保存在浏览器 `localStorage`（与桌面版存储位置不同）。

## 故障排查

- **构建无响应**：确认 Node 18+，删除 `node_modules` 后重新 `npm install`。
- **桌面快捷方式图标不对**：关闭应用后重新 `npm run ship:latest-client`，或删除旧快捷方式再 `npm run start:client`。
- **不要在 Cursor 聊天里点击 `.exe` 路径**；用桌面快捷方式或 `npm run start:client` 启动。

## GitHub 协作

本项目采用 **MIT** 许可证，欢迎 Fork 与 Pull Request。协作说明见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

### 克隆与运行

```bash
git clone https://github.com/<owner>/daily-task-tracker-desktop.git
cd daily-task-tracker-desktop
npm install
npm run start
```

### 首次推送到 GitHub（维护者）

若本地尚未关联远程仓库库，在项目根目录执行：

```powershell
# 1. 在 https://github.com/new 创建空仓库库（不要勾选 README），记下仓库库 URL
# 2. 关联并推送
git remote add origin https://github.com/<你的用户名>/daily-task-tracker-desktop.git
git branch -M main
git push -u origin main
```

也可安装 [GitHub CLI](https://cli.github.com/) 后一键创建并推送：

```powershell
winget install GitHub.cli
gh auth login
gh repo create daily-task-tracker-desktop --public --source=. --remote=origin --push
```

### 协作设置建议

在 GitHub 仓库库 **Settings → General** 中可开启：

- **Issues**：方便他人报 bug、提需求
- **Allow fork syncing** / **Pull Requests**：接受外部贡献

在 **Settings → Collaborators** 中添加可写权限的协作者；或让对方 Fork 后通过 PR 合并。
