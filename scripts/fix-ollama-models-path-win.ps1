# Migrate Ollama models from non-ASCII path to D:\OllamaModels
param(
  [string]$TargetDir = 'D:\OllamaModels'
)

$ErrorActionPreference = 'Stop'

function Find-OllamaModelsSource {
  $candidates = @()
  if ($env:OLLAMA_MODELS -and (Test-Path $env:OLLAMA_MODELS)) {
    $candidates += $env:OLLAMA_MODELS
  }
  foreach ($root in @('D:\', 'C:\')) {
    if (-not (Test-Path $root)) { continue }
    Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like 'Ollama*' -and (Test-Path (Join-Path $_.FullName 'blobs')) } |
      ForEach-Object { $candidates += $_.FullName }
  }
  $userOllama = Join-Path $env:USERPROFILE '.ollama\models'
  if (Test-Path $userOllama) { $candidates += $userOllama }
  $candidates | Select-Object -Unique
}

function Read-OllamaModelsFromLog {
  $log = Join-Path $env:LOCALAPPDATA 'Ollama\server.log'
  if (-not (Test-Path $log)) { return '' }
  $tail = Get-Content $log -Tail 80 -ErrorAction SilentlyContinue | Out-String
  if ($tail -match 'OLLAMA_MODELS:([^\s\]]+)') {
    return ($Matches[1] -replace '\\\\', '\')
  }
  return ''
}

$logPath = Read-OllamaModelsFromLog
if ($logPath -and (Test-Path $logPath)) {
  $source = $logPath
} else {
  $found = Find-OllamaModelsSource | Where-Object { Test-Path (Join-Path $_ 'blobs') } | Select-Object -First 1
  if (-not $found) {
    throw 'No Ollama models directory with blobs folder was found.'
  }
  $source = $found
}

$target = [System.IO.Path]::GetFullPath($TargetDir)
$sourceNorm = $source.TrimEnd([char]92)
$targetNorm = $target.TrimEnd([char]92)
if ($sourceNorm -ieq $targetNorm) {
  Write-Host "(fix-ollama-models-path) Already using target path: $target"
  exit 0
}

Write-Host "(fix-ollama-models-path) Source: $source"
Write-Host "(fix-ollama-models-path) Target: $target"

New-Item -ItemType Directory -Force -Path $target | Out-Null

Write-Host "(fix-ollama-models-path) Stopping Ollama..."
Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'llama-server' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'ollama app' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$pyScript = Join-Path $PSScriptRoot 'update-ollama-app-models-path.py'
if (Test-Path $pyScript) {
  Write-Host "(fix-ollama-models-path) Updating Ollama app db.sqlite settings.models..."
  python $pyScript $target
}

Write-Host "(fix-ollama-models-path) Copying with robocopy..."
$robocopy = Start-Process -FilePath robocopy -ArgumentList @(
  "`"$source`"", "`"$target`"", '/E', '/COPY:DAT', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS'
) -Wait -PassThru -NoNewWindow
if ($robocopy.ExitCode -ge 8) {
  throw "robocopy failed with exit code $($robocopy.ExitCode)"
}

[Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $target, 'User')
$env:OLLAMA_MODELS = $target
Write-Host "(fix-ollama-models-path) Set user env OLLAMA_MODELS=$target"

$ollamaExe = 'D:\Ollama\ollama.exe'
if (-not (Test-Path $ollamaExe)) {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { $ollamaExe = $cmd.Source }
}
if ($ollamaExe -and (Test-Path $ollamaExe)) {
  Write-Host "(fix-ollama-models-path) Starting Ollama serve with English models path..."
  Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

Write-Host "(fix-ollama-models-path) Restart Ollama from tray, then run: ollama list"
Write-Host "(fix-ollama-models-path) Ollama app model folder synced to: $target"
Write-Host "(fix-ollama-models-path) Done."
