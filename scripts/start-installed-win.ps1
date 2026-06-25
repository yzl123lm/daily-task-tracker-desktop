#Requires -Version 5.1
# Start installed app from per-user Programs folder.
$instDir = Join-Path $env:LOCALAPPDATA "Programs\daily-task-tracker-desktop"
if (-not (Test-Path $instDir)) {
  Write-Error "Install dir not found: $instDir. Run npm run install:client first."
  exit 1
}
$mainExe = Get-ChildItem -LiteralPath $instDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notlike "Uninstall*" } |
  Select-Object -First 1
if (-not $mainExe) {
  Write-Error "Main .exe not found under install dir."
  exit 1
}
Start-Process -FilePath $mainExe.FullName -WorkingDirectory $instDir
Write-Host "(start-installed-win) Started: $($mainExe.FullName)"
