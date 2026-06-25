# 配置与数据文件说明

本目录仅存放**文档化配置说明**。运行时配置与用户数据由 Electron 写入系统用户目录，不放在仓库内。

## 打包进客户端的文件（仓库内）

| 优先级 | 文件 | 用途 |
|--------|------|------|
| P0 | `package.json` | 应用版本、npm 脚本、electron-builder 打包清单 |
| P0 | `prerequisites-manifest.json` / `environmentManifest.json` | 运行环境检测项与修复动作映射（Python、Ollama、模型、重排） |
| P1 | `build/icon.ico` / `build/icon.png` | 应用与快捷方式图标 |
| P2 | `.env.example` | 开发环境变量说明（示例，不含真实密钥） |
| P2 | `utils/settingsStore.js` | 用户数据目录 JSON 读写（主进程） |
| P2 | `utils/ipcValidate.js` | IPC 入参校验（path/url/id） |

## 用户数据目录（安装后自动生成）

Windows 默认路径：

```text
%APPDATA%\daily-task-tracker-desktop\
```

常见文件：

| 文件 | 说明 |
|------|------|
| `ai-settings.json` | AI 配置与模型档案（API Key 以 `encryptedKeyB64` 加密存储） |
| `asr-settings.json` | 语音识别配置 |
| `tts-settings.json` | 语音合成配置 |
| `image-settings.json` | 图像生成/理解配置 |
| `capability-settings.json` | 能力开关 |
| `ollama-settings.json` | 本地 Ollama 连接配置 |
| `runtime-profile.json` | 本地 AI 环境就绪画像与功能降级状态 |
| `search-rules.json` | 联网搜索数据源规则 |
| `knowledge-base\` | 默认知识库数据（可被用户自定义根目录覆盖） |

任务列表等业务数据保存在渲染进程 **localStorage**（键名由 `app.js` 定义），卸载应用前不会随仓库迁移。

## 发布归档（本地，已 gitignore）

| 目录 | 说明 |
|------|------|
| `最新客户端/` | 每次 `npm run ship:latest-client` 的安装包归档与 `release-history.jsonl` |
| `dist/` | `npm run build` 临时构建输出 |

## 新电脑验收清单（本地 AI）

1. 启动应用 → 若环境未就绪，应弹出「本地 AI 环境配置」向导。
2. 点击「一键配置」→ 静默安装 Ollama（UAC）→ 拉取 `bge-m3` 与推荐对话模型。
3. 顶栏「环境」指示器变为绿色「环境就绪」。
4. 知识库可正常入库；若跳过配置，入库应被拦截并提示打开向导。
5. 设置 → 技能中心 →「运行环境评估」应显示可自动修复项（Ollama / 模型 / Python winget）。


1. **不要**在源码、`README` 或 `.env` 中提交真实 API Key。
2. 在应用内「AI 设置」等界面填写密钥；主进程使用 `safeStorage` 加密后落盘。
3. 需要备份时，请单独备份 `%APPDATA%\daily-task-tracker-desktop\`，勿与公开仓库混放。
