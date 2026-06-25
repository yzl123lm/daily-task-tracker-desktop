#Requires -Version 5.1
<#
  One-time: register a scheduled task (schtasks) to run taste-skill-update-sync.ps1
  every week on Monday at 09:00 local time.
#>
$ErrorActionPreference = "Stop"

$taskName = "DailyTaskTracker-TasteSkillUpdate"
$scriptPath = Join-Path $PSScriptRoot "taste-skill-update-sync.ps1"
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "Missing script: $scriptPath"
}

$trScript = $scriptPath
try {
  $fso = New-Object -ComObject Scripting.FileSystemObject
  $trScript = $fso.GetFile($scriptPath).ShortPath
} catch {
  Write-Host "Warning: could not get short path; if task creation fails, move the repo to an ASCII-only path."
}

$taskRun = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$trScript`""

& schtasks.exe /Create `
  /TN $taskName `
  /TR $taskRun `
  /SC WEEKLY `
  /D MON `
  /ST 09:00 `
  /RL LIMITED `
  /F | Out-Host

Write-Host ""
Write-Host "Registered task: $taskName (weekly, Monday 09:00)"
Write-Host "Run now:  npm run taste-skill:update-sync"
Write-Host "Run task: schtasks /Run /TN `"$taskName`""
Write-Host "Delete:   schtasks /Delete /TN `"$taskName`" /F"
