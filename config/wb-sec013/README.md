# SEC-013 持续红队套件

持续安全回归：提示注入、数据外传、路径越狱、命令注入、包脚本、秘密泄露、沙箱逃逸、Agent/Hook 策略。

## 运行

```bash
npm run wb:sec013-redteam
# 或更宽门禁（含 KB）
npm run wb:security-gate
```

任一 **P0/P1** 失败 → `exit 1`。

## 发布阻断

`npm run ship:latest-client` / `release-client-to-latest.ps1` 在 `npm run build` **之前**自动执行本套件。

跳过（仅调试，禁止用于正式交付）：

```powershell
$env:SKIP_SEC013_GATE='1'; npm run ship:latest-client
```

## 用例目录

见 `cases.v1.json`（`SEC013-*`）。
