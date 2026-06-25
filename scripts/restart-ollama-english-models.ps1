# Restart Ollama service with ASCII-only OLLAMA_MODELS (fixes llama-server path encoding on Windows)
param(
  [string]$ModelsDir = 'D:\OllamaModels'
)

$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($ModelsDir)

if (-not (Test-Path (Join-Path $target 'blobs'))) {
  throw "Models directory missing blobs folder: $target"
}

Write-Host "(restart-ollama) Stopping Ollama processes..."
Get-Process -Name 'ollama*' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'llama-server' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name 'llama-server' -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$pyScript = Join-Path $PSScriptRoot 'update-ollama-app-models-path.py'
if (Test-Path $pyScript) {
  Write-Host "(restart-ollama) Updating Ollama app db.sqlite settings.models..."
  python $pyScript $target
}

[Environment]::SetEnvironmentVariable('OLLAMA_MODELS', $target, 'User')
$env:OLLAMA_MODELS = $target
Write-Host "(restart-ollama) OLLAMA_MODELS=$target"

$ollamaExe = 'D:\Ollama\ollama.exe'
if (-not (Test-Path $ollamaExe)) {
  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if ($cmd) { $ollamaExe = $cmd.Source }
}
if (-not $ollamaExe -or -not (Test-Path $ollamaExe)) {
  throw 'ollama.exe not found. Install Ollama or add it to PATH.'
}

Write-Host "(restart-ollama) Starting: $ollamaExe serve"
Start-Process -FilePath $ollamaExe -ArgumentList 'serve' -WindowStyle Hidden
Start-Sleep -Seconds 3

Write-Host "(restart-ollama) Verifying /api/version..."
try {
  $ver = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/version' -TimeoutSec 8
  Write-Host "(restart-ollama) Ollama version: $($ver.version)"
} catch {
  Write-Warning "Ollama API not ready yet: $($_.Exception.Message)"
}

Write-Host "(restart-ollama) Ollama app settings.models synced to: $target"
Write-Host "(restart-ollama) Done."
