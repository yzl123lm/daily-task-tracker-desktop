#Requires -Version 5.1
<#
  One-time: register a scheduled task (schtasks) to run impeccable-cursor-skills-sync.ps1
  every month on day 25 at 15:00 local time.

  Run in your user session (no admin required for per-user tasks on most Windows builds).
#>
$ErrorActionPreference = "Stop"

$taskName = "DailyTaskTracker-ImpeccableCursorSkills"
$scriptPath = Join-Path $PSScriptRoot "impeccable-cursor-skills-sync.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Missing script: $scriptPath"
}

# schtasks /TR breaks on some Unicode paths; prefer 8.3 short path when available
$trScript = $scriptPath
try {
  $fso = New-Object -ComObject Scripting.FileSystemObject
  $trScript = $fso.GetFile($scriptPath).ShortPath
} catch {
  Write-Host "Warning: could not get short path; if task creation fails, move the repo to an ASCII-only path."
}

$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File $trScript"

& schtasks.exe /Create `
  /TN $taskName `
  /TR $taskRun `
  /SC MONTHLY `
  /D 25 `
  /ST 15:00 `
  /RL LIMITED `
  /F | Out-Host

Write-Host ""
Write-Host "Registered task: $taskName (monthly, day 25, 15:00)"
Write-Host "Run now: schtasks /Run /TN `"$taskName`""
Write-Host "Delete:  schtasks /Delete /TN `"$taskName`" /F"
