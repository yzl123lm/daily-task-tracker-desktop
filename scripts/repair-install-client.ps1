#Requires -Version 5.1
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ver = "1.24.76"
$archiveRoot = Join-Path $ProjectRoot "$([char]0x6700)$([char]0x65B0)$([char]0x5BA2)$([char]0x6237)$([char]0x7AEF)"
$flatDir = Join-Path $archiveRoot $ver
$instDir = Join-Path $env:LOCALAPPDATA "Programs\daily-task-tracker-desktop"

function Stop-Client {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like "*\daily-task-tracker-desktop\*" } |
    ForEach-Object {
      Write-Host "Stopping PID $($_.ProcessId) $($_.Name)"
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
  Start-Sleep -Seconds 2
}

Stop-Client

if (Test-Path -LiteralPath $instDir) {
  $uninstaller = Get-ChildItem -LiteralPath $instDir -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($uninstaller) {
    Write-Host "Silent uninstall: $($uninstaller.Name)"
    $u = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -PassThru -Wait
    Write-Host "Uninstaller exit: $($u.ExitCode)"
    Start-Sleep -Seconds 3
  }
}

Stop-Client

if (Test-Path -LiteralPath $instDir) {
  try {
    Remove-Item -LiteralPath $instDir -Recurse -Force -ErrorAction Stop
    Write-Host "Removed install dir: $instDir"
  } catch {
    Write-Warning "Could not remove install dir: $($_.Exception.Message)"
    $asar = Join-Path $instDir "resources\app.asar"
    if (Test-Path -LiteralPath $asar) {
      Remove-Item -LiteralPath $asar -Force -ErrorAction SilentlyContinue
      Write-Host "Removed locked app.asar"
    }
  }
}

New-Item -ItemType Directory -Force -Path $instDir | Out-Null

$setup = Get-ChildItem -LiteralPath $flatDir -Filter "*Setup*.exe" |
  Where-Object { $_.Name -notlike "*__uninstaller*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $setup) {
  $setup = Get-ChildItem -LiteralPath (Join-Path $ProjectRoot "dist") -Filter "*Setup*.exe" |
    Where-Object { $_.Name -notlike "*__uninstaller*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
}
if (-not $setup) {
  Write-Error "No Setup exe found for $ver"
  exit 1
}

Write-Host "Installing: $($setup.FullName)"
Write-Host "Target: $instDir"
$proc = Start-Process -FilePath $setup.FullName -ArgumentList "/S", "/D=$instDir" -PassThru -Wait
Write-Host "Installer exit code: $($proc.ExitCode)"
if ($proc.ExitCode -ne 0) {
  Write-Error "Install failed with exit $($proc.ExitCode)"
  exit $proc.ExitCode
}

$mainExe = Get-ChildItem -LiteralPath $instDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notlike "Uninstall*" } |
  Select-Object -First 1
if (-not $mainExe) {
  Write-Error "Main exe missing after install"
  Get-ChildItem -LiteralPath $instDir -Recurse -ErrorAction SilentlyContinue | ForEach-Object { Write-Host $_.FullName }
  exit 1
}

Write-Host "SUCCESS: $($mainExe.FullName)"
$pkgPath = Join-Path $ProjectRoot "package.json"
$pkgRaw = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8
if ($pkgRaw -match '"version"\s*:\s*"([^"]+)"') {
  Write-Host "package.json version: $($Matches[1])"
}
