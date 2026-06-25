#Requires -Version 5.1
<#
  项目固定发布入口（Windows）：每次迭代客户端后应通过本脚本或 npm run ship:latest-client 执行。

  行为（由同目录 release-client-to-latest.ps1 实现）：
  1. npm run build
  2. 将 dist 下安装包/便携包/blockmap 复制到 <项目根>/最新客户端/（时间戳子目录 + 扁平版本目录）
  3. 追加 release-history.jsonl
  4. 运行本机 NSIS 静默安装（最新版安装程序）

  本脚本会移除环境变量 SKIP_INSTALL，避免误跳过「写入 最新客户端 + 安装」；
  若需装完不自动启动应用，可在命令前设置 SKIP_LAUNCH_AFTER_INSTALL=1。

  目录名「最新客户端」在 release-client-to-latest.ps1 内用 Unicode 码点拼接，避免脚本编码导致路径乱码。
#>
$ErrorActionPreference = "Stop"
Remove-Item Env:\SKIP_INSTALL -ErrorAction SilentlyContinue

$releaseScript = Join-Path $PSScriptRoot "release-client-to-latest.ps1"
if (-not (Test-Path -LiteralPath $releaseScript)) {
  Write-Error "Missing release script: $releaseScript"
  exit 1
}

. $releaseScript
