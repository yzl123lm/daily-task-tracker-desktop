#Requires -Version 5.1
# Each iteration: npm run build, copy installers to:
#   - <repo>\<archiveRoot>\v<ver>_<timestamp>\   (history)
#   - <repo>\<archiveRoot>\<ver>\                (flat folder per semver, overwrite latest)
# append release-history.jsonl, then silent-install latest.
# Folder name is built from Unicode code points (ASCII-only script) so GBK/UTF-8 PS parsing cannot mojibake the path.
#
# 项目约定（写死）：迭代桌面客户端后须归档到「最新客户端」并执行安装程序 —— 请使用
#   npm run ship:latest-client
# （scripts/ship-latest-client-win.ps1 会清除 SKIP_INSTALL，确保必定写入「最新客户端」并静默安装。）
#
# 本脚本仍可直接调用：npm run release:latest-client
# Optional: SKIP_INSTALL=1  skip NSIS install; SKIP_LAUNCH_AFTER_INSTALL=1  skip starting app after install.
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) {
  Write-Error "package.json not found above scripts folder."
  exit 1
}
Set-Location $ProjectRoot

# 避免本机存在证书/签名探测时 electron-builder 在 NSIS 阶段偶发 spawn UNKNOWN（execWine/signtool 链）
if (-not $env:CSC_IDENTITY_AUTO_DISCOVERY) {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
}

$pkgPath = Join-Path $ProjectRoot "package.json"
$pkgRaw = Get-Content -LiteralPath $pkgPath -Raw -Encoding UTF8
if ($pkgRaw -notmatch '"version"\s*:\s*"([^"]+)"') {
  Write-Error "Cannot read version from package.json"
  exit 1
}
$ver = $Matches[1].Trim()
$productName = ""
if ($pkgRaw -match '"productName"\s*:\s*"([^"]+)"') {
  $productName = $Matches[1].Trim()
}
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
# Unicode code points U+6700 U+65B0 U+5BA2 U+6237 U+7AEF (folder name zui-xin-ke-hu-duan; script stays ASCII-only).
$archiveRootName = "$([char]0x6700)$([char]0x65B0)$([char]0x5BA2)$([char]0x6237)$([char]0x7AEF)"
$archiveRoot = Join-Path $ProjectRoot $archiveRootName
$verDirName = "v{0}_{1}" -f $ver, $stamp
$verDir = Join-Path $archiveRoot $verDirName

New-Item -ItemType Directory -Force -Path $archiveRoot | Out-Null
New-Item -ItemType Directory -Force -Path $verDir | Out-Null

Write-Host "(release-client-to-latest) ProjectRoot: $ProjectRoot"
Write-Host "(release-client-to-latest) Version: $ver Archive: $verDir"

$dist = Join-Path $ProjectRoot "dist"
if (Test-Path -LiteralPath $dist) {
  Get-ChildItem -LiteralPath $dist -File -Filter "*.exe" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
  Get-ChildItem -LiteralPath $dist -File -Filter "*.blockmap" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Stop-InstalledClientProcesses {
  param([Parameter(Mandatory = $true)][string]$InstallDir)
  $stopped = 0
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath -like "*\daily-task-tracker-desktop\*"
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        $stopped += 1
      } catch {
        Write-Warning "(release-client-to-latest) Failed to stop PID $($_.ProcessId)"
      }
    }
  if ($stopped -gt 0) {
    Write-Host "(release-client-to-latest) Stopped $stopped running client process(es) before build."
    Start-Sleep -Seconds 2
  }
}

function Stop-DistLockingProcesses {
  param([Parameter(Mandatory = $true)][string]$DistRoot)
  $distNorm = ($DistRoot.TrimEnd('\') + '\')
  $stopped = 0
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath -like "$distNorm*"
    } |
    ForEach-Object {
      try {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
        $stopped += 1
      } catch {
        Write-Warning "(release-client-to-latest) Failed to stop dist PID $($_.ProcessId)"
      }
    }
  if ($stopped -gt 0) {
    Write-Host "(release-client-to-latest) Stopped $stopped process(es) locking dist before build."
    Start-Sleep -Seconds 2
  }
}

function Clear-DistWinUnpacked {
  param([Parameter(Mandatory = $true)][string]$DistRoot)
  $unpacked = Join-Path $DistRoot "win-unpacked"
  if (-not (Test-Path -LiteralPath $unpacked)) {
    return
  }
  try {
    Remove-Item -LiteralPath $unpacked -Recurse -Force -ErrorAction Stop
    Write-Host "(release-client-to-latest) Cleared dist\win-unpacked before build."
  } catch {
    Write-Warning "(release-client-to-latest) Could not remove dist\win-unpacked: $($_.Exception.Message)"
  }
}

function Test-DistAppAsarLocked {
  param([Parameter(Mandatory = $true)][string]$DistRoot)
  $probe = Join-Path $DistRoot "win-unpacked\resources\app.asar"
  if (-not (Test-Path -LiteralPath $probe)) {
    return $false
  }
  try {
    $stream = [System.IO.File]::Open($probe, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $stream.Close()
    return $false
  } catch {
    return $true
  }
}

$instDirEarly = Join-Path (Join-Path $env:LOCALAPPDATA "Programs") "daily-task-tracker-desktop"
Stop-InstalledClientProcesses -InstallDir $instDirEarly
Stop-DistLockingProcesses -DistRoot $dist
Clear-DistWinUnpacked -DistRoot $dist

$buildOutName = "dist"
if (Test-DistAppAsarLocked -DistRoot $dist) {
  $buildOutName = "dist_build_" + (Get-Date -Format "yyyyMMdd-HHmmss")
  Write-Warning "(release-client-to-latest) dist is locked; building to $buildOutName instead."
}
$dist = Join-Path $ProjectRoot $buildOutName
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$iconScript = Join-Path $PSScriptRoot "generate-app-icon.py"
if (Test-Path -LiteralPath $iconScript) {
  $iconPython = $null
  $venvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
  if (Test-Path -LiteralPath $venvPython) {
    $iconPython = $venvPython
  } else {
    $sysPy = Get-Command python -ErrorAction SilentlyContinue
    if ($sysPy) { $iconPython = $sysPy.Source }
  }
  $iconIco = Join-Path $ProjectRoot "build\icon.ico"
  if ($iconPython) {
    Write-Host "(release-client-to-latest) generate whale icon..."
    & $iconPython $iconScript
    if ($LASTEXITCODE -ne 0) {
      if (Test-Path -LiteralPath $iconIco) {
        Write-Warning "(release-client-to-latest) icon script failed; using existing build/icon.ico"
      } else {
        exit $LASTEXITCODE
      }
    }
  } elseif (-not (Test-Path -LiteralPath $iconIco)) {
    Write-Error "(release-client-to-latest) missing build/icon.ico and no Python for generate-app-icon.py"
    exit 1
  }
}

Write-Host "(release-client-to-latest) npm run build..."
if ($buildOutName -eq "dist") {
  npm run build
} else {
  npx electron-builder --win --config.directories.output=$buildOutName
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not (Test-Path -LiteralPath $dist)) {
  Write-Error "dist folder missing after build."
  exit 1
}

function Copy-DistArtifactsToDir {
  param([Parameter(Mandatory = $true)][string]$DestDir)
  New-Item -ItemType Directory -Force -Path $DestDir | Out-Null
  Get-ChildItem -LiteralPath $dist -File -Filter "*.exe" | Where-Object { $_.Name -notlike "*__uninstaller*" } | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestDir $_.Name) -Force
  }
  Get-ChildItem -LiteralPath $dist -File -Filter "*.blockmap" -ErrorAction SilentlyContinue | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $DestDir $_.Name) -Force
  }
}

$copied = @()
Get-ChildItem -LiteralPath $dist -File -Filter "*.exe" | Where-Object { $_.Name -notlike "*__uninstaller*" } | ForEach-Object { $copied += $_.Name }
Get-ChildItem -LiteralPath $dist -File -Filter "*.blockmap" -ErrorAction SilentlyContinue | ForEach-Object { $copied += $_.Name }

Copy-DistArtifactsToDir -DestDir $verDir
$flatVerDir = Join-Path $archiveRoot $ver
Copy-DistArtifactsToDir -DestDir $flatVerDir
Write-Host "(release-client-to-latest) Flat latest folder (overwrite): $flatVerDir"

$setupCandidates = Get-ChildItem -LiteralPath $dist -Filter "*Setup*.exe" |
  Where-Object { $_.Name -notlike "*__uninstaller*" }
$setup = $null
if ($productName) {
  $setup = $setupCandidates | Where-Object { $_.Name -like "$productName*" } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $setup) {
  $setup = $setupCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}
if (-not $setup) {
  Write-Error "No NSIS *Setup*.exe in dist."
  exit 1
}

$logPath = Join-Path $archiveRoot "release-history.jsonl"
$logObj = [ordered]@{
  version        = $ver
  stamp          = $stamp
  archiveDir     = $verDirName
  latestFlatDir  = $ver
  copiedFiles    = $copied
  utc            = (Get-Date).ToUniversalTime().ToString("o")
}
$logLine = ($logObj | ConvertTo-Json -Compress)
Add-Content -LiteralPath $logPath -Value $logLine -Encoding UTF8
Write-Host "(release-client-to-latest) Logged: $logPath"

if ($env:SKIP_INSTALL -eq "1") {
  Write-Host "(release-client-to-latest) SKIP_INSTALL=1, skip silent install."
  exit 0
}

$instParent = Join-Path $env:LOCALAPPDATA "Programs"
$instDir = Join-Path $instParent "daily-task-tracker-desktop"
New-Item -ItemType Directory -Force -Path $instDir | Out-Null

Stop-InstalledClientProcesses -InstallDir $instDir

function Clear-LeftoverInstallArtifacts {
  param([Parameter(Mandatory = $true)][string]$InstallDir)
  if (-not (Test-Path -LiteralPath $InstallDir)) {
    return
  }
  $uninstaller = Get-ChildItem -LiteralPath $InstallDir -Filter "Uninstall*.exe" -File -ErrorAction SilentlyContinue |
    Select-Object -First 1
  if ($uninstaller) {
    Write-Host "(release-client-to-latest) Silent uninstall: $($uninstaller.Name)"
    $u = Start-Process -FilePath $uninstaller.FullName -ArgumentList "/S" -PassThru -Wait
    if ($u.ExitCode -ne 0) {
      Write-Warning "(release-client-to-latest) Uninstaller exit code: $($u.ExitCode)"
    }
    Start-Sleep -Seconds 2
  }
  $asar = Join-Path $InstallDir "resources\app.asar"
  for ($i = 0; $i -lt 6; $i += 1) {
    if (-not (Test-Path -LiteralPath $asar)) {
      break
    }
    try {
      Remove-Item -LiteralPath $asar -Force -ErrorAction Stop
      Write-Host "(release-client-to-latest) Removed leftover app.asar."
      break
    } catch {
      if ($i -lt 5) {
        Write-Host "(release-client-to-latest) app.asar locked, retry $($i + 1)/5..."
        Stop-InstalledClientProcesses -InstallDir $InstallDir
        Start-Sleep -Seconds 2
      } else {
        Write-Warning "(release-client-to-latest) Cannot delete locked app.asar: $asar"
        Write-Warning "(release-client-to-latest) Close the client in Task Manager, delete the file, then rerun ship."
      }
    }
  }
}

Stop-InstalledClientProcesses -InstallDir $instDir
Clear-LeftoverInstallArtifacts -InstallDir $instDir

Write-Host "(release-client-to-latest) Silent install: $($setup.Name) -> $instDir"
$proc = Start-Process -FilePath $setup.FullName -ArgumentList "/S", "/D=$instDir" -PassThru -Wait
if ($proc.ExitCode -ne 0) {
  $hint = if ($proc.ExitCode -eq 2) {
    "Install exit 2: client still running or app.asar locked. Stop all client processes and delete resources\app.asar under install dir, then retry."
  } else {
    ""
  }
  if ($hint) {
    Write-Error "Installer exit code: $($proc.ExitCode). $hint"
  } else {
    Write-Error "Installer exit code: $($proc.ExitCode)"
  }
  exit $proc.ExitCode
}

$mainExe = Get-ChildItem -LiteralPath $instDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notlike "Uninstall*" } |
  Select-Object -First 1
if (-not $mainExe) {
  Write-Error "Main .exe not found under install dir."
  exit 1
}

$repoIcon = Join-Path $ProjectRoot "build\icon.ico"
if (Test-Path -LiteralPath $repoIcon) {
  Copy-Item -LiteralPath $repoIcon -Destination (Join-Path $instDir "icon.ico") -Force
}

$shortcutScript = Join-Path $PSScriptRoot "create-client-shortcut.ps1"
if (Test-Path -LiteralPath $shortcutScript) {
  try {
    & $shortcutScript
  } catch {
    Write-Warning "(release-client-to-latest) Shortcut creation failed: $($_.Exception.Message)"
  }
}

if ($env:SKIP_LAUNCH_AFTER_INSTALL -ne "1") {
  Write-Host "(release-client-to-latest) Starting app..."
  Start-Process -FilePath $mainExe.FullName -WorkingDirectory $instDir
}

Write-Host "(release-client-to-latest) Done. MainExe: $($mainExe.FullName)"
Write-Host "(release-client-to-latest) Tip: use Desktop shortcut or npm run start:installed"
