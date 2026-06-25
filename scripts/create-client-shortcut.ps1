#Requires -Version 5.1
# Create Desktop + Start Menu shortcuts for the installed client (.exe must not be opened inside Cursor).
$ErrorActionPreference = "Stop"

$instDir = Join-Path $env:LOCALAPPDATA "Programs\daily-task-tracker-desktop"
if (-not (Test-Path -LiteralPath $instDir)) {
  Write-Error "Install dir not found: $instDir"
  exit 1
}

$mainExe = Get-ChildItem -LiteralPath $instDir -Filter "*.exe" -File |
  Where-Object { $_.Name -notlike "Uninstall*" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $mainExe) {
  Write-Error "Main .exe not found under install dir."
  exit 1
}

$appName = [System.IO.Path]::GetFileNameWithoutExtension($mainExe.Name)
$wsh = New-Object -ComObject WScript.Shell

# Always prefer the packaged whale .ico — exe may still carry Electron's default icon.
$projectRoot = Split-Path -Parent $PSScriptRoot
$repoIcon = Join-Path $projectRoot "build\icon.ico"
if (-not (Test-Path -LiteralPath (Join-Path $instDir "icon.ico")) -and (Test-Path -LiteralPath $repoIcon)) {
  Copy-Item -LiteralPath $repoIcon -Destination (Join-Path $instDir "icon.ico") -Force
}

$iconCandidates = @(
  (Join-Path $instDir "icon.ico"),
  (Join-Path $instDir "resources\icon.ico"),
  (Join-Path $instDir "build\icon.ico"),
  $repoIcon
) | Where-Object { Test-Path -LiteralPath $_ }

function New-AppShortcut {
  param(
    [Parameter(Mandatory = $true)][string]$LinkPath,
    [Parameter(Mandatory = $true)][string]$TargetPath,
    [Parameter(Mandatory = $true)][string]$WorkingDir,
    [string]$Description = "",
    [string]$IconPath = ""
  )
  $dir = Split-Path -Parent $LinkPath
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }
  if (Test-Path -LiteralPath $LinkPath) {
    Remove-Item -LiteralPath $LinkPath -Force
  }
  $sc = $wsh.CreateShortcut($LinkPath)
  $sc.TargetPath = $TargetPath
  $sc.WorkingDirectory = $WorkingDir
  $sc.Description = $Description
  if ($IconPath) {
    $sc.IconLocation = "$IconPath,0"
  }
  $sc.Save()
}

if (-not $iconCandidates) {
  Write-Error "Whale icon.ico not found (install dir or build/icon.ico)."
  exit 1
}
$shortcutIcon = ($iconCandidates | Select-Object -First 1)

$desktop = [Environment]::GetFolderPath("Desktop")
$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs"
$desktopLink = Join-Path $desktop "$appName.lnk"
$startLink = Join-Path $startMenu "$appName.lnk"

function Remove-OldAppShortcuts {
  param([Parameter(Mandatory = $true)][string]$Folder)
  if (-not (Test-Path -LiteralPath $Folder)) { return }
  Get-ChildItem -LiteralPath $Folder -Filter "*.lnk" -File -ErrorAction SilentlyContinue | ForEach-Object {
    try {
      $sc = $wsh.CreateShortcut($_.FullName)
      if ($sc.TargetPath -like "$instDir\*") {
        Remove-Item -LiteralPath $_.FullName -Force
      }
    } catch { }
  }
}

Remove-OldAppShortcuts -Folder $desktop
Remove-OldAppShortcuts -Folder $startMenu
Remove-OldAppShortcuts -Folder (Join-Path $env:PUBLIC "Desktop")

New-AppShortcut -LinkPath $desktopLink -TargetPath $mainExe.FullName -WorkingDir $instDir -Description "鲸落AI" -IconPath $shortcutIcon
New-AppShortcut -LinkPath $startLink -TargetPath $mainExe.FullName -WorkingDir $instDir -Description "鲸落AI" -IconPath $shortcutIcon

try {
  $ie4u = Join-Path $env:WINDIR "System32\ie4uinit.exe"
  if (Test-Path -LiteralPath $ie4u) {
    Start-Process -FilePath $ie4u -ArgumentList "-show" -WindowStyle Hidden -Wait
  }
} catch { }

Write-Host "(create-client-shortcut) Desktop: $desktopLink"
Write-Host "(create-client-shortcut) StartMenu: $startLink"
Write-Host "(create-client-shortcut) Target: $($mainExe.FullName)"
Write-Host "(create-client-shortcut) Icon: $shortcutIcon"
