# Remove stale dist-alt build output (~0.9GB). Close 鲸落AI / Electron first.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$target = Join-Path $root "dist-alt"
if (-not (Test-Path -LiteralPath $target)) {
  Write-Host "[remove-dist-alt] Already removed."
  exit 0
}
Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Remove-Item -LiteralPath $target -Recurse -Force
if (Test-Path -LiteralPath $target) {
  Write-Host "[remove-dist-alt] Failed: close all 鲸落AI/Electron windows and retry." -ForegroundColor Red
  exit 1
}
Write-Host "[remove-dist-alt] Done."
