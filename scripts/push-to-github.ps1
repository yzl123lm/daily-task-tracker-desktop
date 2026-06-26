#Requires -Version 5.1
<#
  将当前工作区改动提交并推送到 origin（默认 main）。
  由 npm run ship:latest-client 在打包安装成功后自动调用。

  跳过推送：SKIP_GITHUB_PUSH=1
  自定义提交说明：GITHUB_COMMIT_MESSAGE="fix: ..."
  推送失败时非零退出：GITHUB_PUSH_STRICT=1
#>
$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  $root = Split-Path -Parent $PSScriptRoot
  if (-not (Test-Path -LiteralPath (Join-Path $root "package.json"))) {
    throw "Cannot find project root (package.json)."
  }
  return $root
}

function Get-PackageVersion {
  param([string]$ProjectRoot)
  try {
    $pkg = Get-Content -LiteralPath (Join-Path $ProjectRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    return [string]$pkg.version
  } catch {
    return ""
  }
}

if ($env:SKIP_GITHUB_PUSH -eq "1") {
  Write-Host "(push-to-github) Skipped (SKIP_GITHUB_PUSH=1)."
  exit 0
}

$projectRoot = Get-ProjectRoot
Set-Location -LiteralPath $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot ".git"))) {
  Write-Warning "(push-to-github) Not a git repository; skip."
  exit 0
}

$remotes = git remote 2>$null
if (-not $remotes -or -not ($remotes -contains "origin")) {
  Write-Warning "(push-to-github) No origin remote; skip."
  exit 0
}

$branch = (git rev-parse --abbrev-ref HEAD 2>$null)
if (-not $branch) {
  $branch = "main"
}

$porcelain = git status --porcelain 2>$null
if ($porcelain) {
  git add -A
  $message = [string]$env:GITHUB_COMMIT_MESSAGE
  if (-not $message.Trim()) {
    $ver = Get-PackageVersion -ProjectRoot $projectRoot
    if ($ver) {
      $message = "chore: ship client v$ver"
    } else {
      $message = "chore: sync local changes"
    }
  }
  Write-Host "(push-to-github) Commit: $message"
  git commit -m $message
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "(push-to-github) git commit failed (exit $LASTEXITCODE)."
    if ($env:GITHUB_PUSH_STRICT -eq "1") { exit $LASTEXITCODE }
    exit 0
  }
} else {
  Write-Host "(push-to-github) Working tree clean; push existing commits only."
}

Write-Host "(push-to-github) Pushing to origin/$branch ..."
git push -u origin $branch
if ($LASTEXITCODE -ne 0) {
  Write-Warning "(push-to-github) git push failed. Check network and GitHub credentials."
  if ($env:GITHUB_PUSH_STRICT -eq "1") { exit $LASTEXITCODE }
  exit 0
}

Write-Host "(push-to-github) Done."
