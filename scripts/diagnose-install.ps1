#Requires -Version 5.1
$ErrorActionPreference = "Continue"
$instDir = Join-Path $env:LOCALAPPDATA "Programs\daily-task-tracker-desktop"
Write-Host "=== Install dir: $instDir ==="
Write-Host "Exists: $(Test-Path -LiteralPath $instDir)"
if (Test-Path -LiteralPath $instDir) {
  Get-ChildItem -LiteralPath $instDir -Force | ForEach-Object {
    Write-Host "  $($_.Name)  $($_.Length)  $($_.LastWriteTime)"
  }
  $asar = Join-Path $instDir "resources\app.asar"
  if (Test-Path -LiteralPath $asar) {
    Write-Host "app.asar size: $((Get-Item -LiteralPath $asar).Length)"
  }
}

Write-Host "`n=== Running processes (daily-task-tracker) ==="
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like "*daily-task-tracker-desktop*" } |
  ForEach-Object { Write-Host "PID $($_.ProcessId) $($_.Name) $($_.ExecutablePath)" }

$archiveRoot = Join-Path (Split-Path -Parent $PSScriptRoot) "$([char]0x6700)$([char]0x65B0)$([char]0x5BA2)$([char]0x6237)$([char]0x7AEF)"
Write-Host "`n=== Archive root: $archiveRoot ==="
if (Test-Path -LiteralPath $archiveRoot) {
  Get-ChildItem -LiteralPath $archiveRoot -Directory | Sort-Object Name -Descending | Select-Object -First 8 | ForEach-Object {
    Write-Host "  $($_.Name)"
  }
  $flat = Join-Path $archiveRoot "1.24.76"
  if (Test-Path -LiteralPath $flat) {
    Write-Host "`n=== 1.24.76 artifacts ==="
    Get-ChildItem -LiteralPath $flat -File | ForEach-Object { Write-Host "  $($_.Name)  $($_.Length)" }
  }
}

$dist = Join-Path (Split-Path -Parent $PSScriptRoot) "dist"
if (Test-Path -LiteralPath $dist) {
  Write-Host "`n=== dist Setup exe ==="
  Get-ChildItem -LiteralPath $dist -Filter "*Setup*.exe" -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "  $($_.Name)  $($_.Length)  $($_.LastWriteTime)"
  }
}
