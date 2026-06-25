#Requires -Version 5.1
# 本脚本：仅构建 + 静默安装，不写入仓库内「最新客户端」目录。
# 项目默认交付请使用：npm run ship:latest-client（或 npm run install:client，已指向 ship）。
# 仅在需要「本机快速重装、跳过归档」时可直接运行本 ps1。
# Optional: set SKIP_LAUNCH_AFTER_INSTALL=1 to skip starting the app.
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
  Write-Error "package.json not found above scripts folder."
  exit 1
}
Set-Location $ProjectRoot

Write-Host "(install-latest-win) ProjectRoot: $ProjectRoot"
Write-Host "(install-latest-win) Running npm run build..."
npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$dist = Join-Path $ProjectRoot "dist"
$setup = Get-ChildItem -LiteralPath $dist -Filter "*Setup*.exe" | Select-Object -First 1
if (-not $setup) {
  Write-Error "No *Setup*.exe found in dist. Build failed or output missing."
  exit 1
}

$instParent = Join-Path $env:LOCALAPPDATA "Programs"
$instDir = Join-Path $instParent "daily-task-tracker-desktop"
New-Item -ItemType Directory -Force -Path $instDir | Out-Null

Write-Host "(install-latest-win) Silent install: $($setup.Name) -> $instDir"
$proc = Start-Process -FilePath $setup.FullName -ArgumentList "/S", "/D=$instDir" -PassThru -Wait
if ($proc.ExitCode -ne 0) {
  Write-Error "Installer exit code: $($proc.ExitCode)"
  exit $proc.ExitCode
}

$mainExe = Get-ChildItem -LiteralPath $instDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notlike "Uninstall*" } |
  Select-Object -First 1
if (-not $mainExe) {
  Write-Error "Main .exe not found under install dir."
  exit 1
}

if ($env:SKIP_LAUNCH_AFTER_INSTALL -ne "1") {
  Write-Host "(install-latest-win) Starting app..."
  Start-Process -FilePath $mainExe.FullName
}

Write-Host "(install-latest-win) Done. MainExe: $($mainExe.FullName)"
