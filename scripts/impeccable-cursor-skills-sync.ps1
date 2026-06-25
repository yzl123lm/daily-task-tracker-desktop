#Requires -Version 5.1
<#
  Monthly sync: download Impeccable universal bundle from impeccable.style,
  merge only .cursor/skills/* into this repo's .cursor/skills (overwrites same  skill names; does not delete custom skills like bazi / voxcpm).

  Skip download/merge when remote bundle unchanged (ETag, Last-Modified, or SHA256 of zip).

  Source URL matches upstream CLI: https://github.com/pbakaus/impeccable/blob/main/bin/commands/skills.mjs
#>
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$bundleUrl = "https://impeccable.style/api/download/bundle/universal"
$commandsUrl = "https://impeccable.style/api/commands"
$statePath = Join-Path $PSScriptRoot "impeccable-sync-state.json"
$destSkills = Join-Path $ProjectRoot ".cursor\skills"
$logPrefix = "[impeccable-sync]"

function Read-State {
  if (-not (Test-Path -LiteralPath $statePath)) {
    return $null
  }
  try {
    Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    $null
  }
}

function Write-State([hashtable]$obj) {
  ($obj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $statePath -Encoding UTF8
}

function Find-CursorSkillsDir([string]$extractRoot) {
  $direct = Join-Path $extractRoot ".cursor\skills"
  if (Test-Path -LiteralPath $direct) {
    return $direct
  }
  $first = Get-ChildItem -LiteralPath $extractRoot -Directory -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($first) {
    $nested = Join-Path $first.FullName ".cursor\skills"
    if (Test-Path -LiteralPath $nested) {
      return $nested
    }
  }
  return $null
}

$etag = $null
$lastMod = $null
try {
  $head = Invoke-WebRequest -Uri $bundleUrl -Method Head -UseBasicParsing -TimeoutSec 60
  if ($head.Headers["ETag"]) {
    $etag = [string]$head.Headers["ETag"]
  }
  if ($head.Headers["Last-Modified"]) {
    $lastMod = [string]$head.Headers["Last-Modified"]
  }
} catch {
  Write-Host "$logPrefix HEAD request failed (will still try full download): $($_.Exception.Message)"
}

$state = Read-State
if ($etag -and $state -and $state.etag -eq $etag) {
  Write-Host "$logPrefix No update (ETag unchanged). Exit."
  exit 0
}
if ($lastMod -and $state -and $state.lastModified -eq $lastMod) {
  Write-Host "$logPrefix No update (Last-Modified unchanged). Exit."
  exit 0
}

# 轻量指纹：上游未发 ETag 时，用 api/commands 文本哈希避免每月拉取整包 ZIP
$commandsSha256 = $null
try {
  $cmdBody = (Invoke-WebRequest -Uri $commandsUrl -UseBasicParsing -TimeoutSec 90).Content
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try {
    $commandsSha256 = [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($cmdBody))).Replace("-", "")
  } finally {
    $sha.Dispose()
  }
  if ($state -and $state.commandsSha256 -eq $commandsSha256) {
    Write-Host "$logPrefix No update (api/commands unchanged). Exit."
    exit 0
  }
} catch {
  Write-Host "$logPrefix api/commands check failed (will try full bundle): $($_.Exception.Message)"
}

$tmpZip = Join-Path $env:TEMP ("impeccable-universal-{0:yyyyMMddHHmmss}.zip" -f (Get-Date))
$tmpDir = Join-Path $env:TEMP ("impeccable-extract-{0}" -f ([guid]::NewGuid().ToString("N")))

try {
  Write-Host "$logPrefix Downloading bundle..."
  Invoke-WebRequest -Uri $bundleUrl -OutFile $tmpZip -UseBasicParsing -TimeoutSec 300

  $hash = (Get-FileHash -LiteralPath $tmpZip -Algorithm SHA256).Hash
  if ($state -and $state.sha256 -eq $hash) {
    Write-Host "$logPrefix No update (bundle SHA256 unchanged). Exit."
    if ($commandsSha256 -and (-not $state.commandsSha256 -or $state.commandsSha256 -ne $commandsSha256)) {
      Write-State @{
        etag             = $state.etag
        lastModified     = $state.lastModified
        sha256           = $hash
        commandsSha256   = $commandsSha256
        updatedAt        = $state.updatedAt
        bundleUrl = $bundleUrl
        mergedFolders    = $state.mergedFolders
      }
    }
    exit 0
  }

  New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
  Expand-Archive -LiteralPath $tmpZip -DestinationPath $tmpDir -Force

  $cursorSkills = Find-CursorSkillsDir $tmpDir
  if (-not $cursorSkills) {
    throw "Could not find .cursor/skills inside the downloaded bundle."
  }

  if (-not (Test-Path -LiteralPath $destSkills)) {
    New-Item -ItemType Directory -Path $destSkills -Force | Out-Null
  }

  $dirs = Get-ChildItem -LiteralPath $cursorSkills -Directory
  $count = 0
  foreach ($d in $dirs) {
    $src = $d.FullName
    $dst = Join-Path $destSkills $d.Name
    Copy-Item -LiteralPath $src -Destination $dst -Recurse -Force
    $count++
  }

  $resp = $null
  try {
    $resp = Invoke-WebRequest -Uri $bundleUrl -Method Head -UseBasicParsing -TimeoutSec 30
  } catch { }

  if ($resp -and $resp.Headers["ETag"]) {
    $etag = [string]$resp.Headers["ETag"]
  }
  if ($resp -and $resp.Headers["Last-Modified"]) {
    $lastMod = [string]$resp.Headers["Last-Modified"]
  }

  Write-State @{
    etag             = $etag
    lastModified     = $lastMod
    sha256           = $hash
    commandsSha256   = $commandsSha256
    updatedAt        = (Get-Date).ToUniversalTime().ToString("o")
    bundleUrl        = $bundleUrl
    mergedFolders    = $count
  }

  Write-Host "$logPrefix Merged $count skill folder(s) into $destSkills"
} finally {
  Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
