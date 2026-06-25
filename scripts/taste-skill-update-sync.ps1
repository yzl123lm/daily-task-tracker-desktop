#Requires -Version 5.1
<#
  Update design-taste-frontend via official skills CLI, then mirror into
  .cursor/skills/taste-skill/ for Cursor agent discovery.

  Idempotent: exits 0 when remote is already current (skills update no-op).
#>
param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"

$logPrefix = "[taste-skill-update]"
$skillName = "design-taste-frontend"
$repoUrl = "https://github.com/Leonxlnx/taste-skill"
$agentsSkill = Join-Path $ProjectRoot ".agents\skills\$skillName\SKILL.md"
$cursorSkillDir = Join-Path $ProjectRoot ".cursor\skills\taste-skill"
$cursorSkill = Join-Path $cursorSkillDir "SKILL.md"
$statePath = Join-Path $PSScriptRoot "taste-skill-update-state.json"
$logPath = Join-Path $PSScriptRoot "taste-skill-update.log"

function Write-Log([string]$Message) {
  $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Write-Host $line
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

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

function Invoke-Npx([string[]]$NpxArgs) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & npx @NpxArgs 2>&1
    return @{
      Output   = $output
      ExitCode = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Write-State([hashtable]$obj) {
  ($obj | ConvertTo-Json -Depth 6) | Set-Content -LiteralPath $statePath -Encoding UTF8
}

$gitCmd = Join-Path ${env:ProgramFiles} "Git\cmd"
if (Test-Path -LiteralPath $gitCmd) {
  $env:Path = "$gitCmd;$env:Path"
}

Push-Location -LiteralPath $ProjectRoot
try {
  Write-Log "$logPrefix Checking for updates ($skillName)..."

  $beforeHash = $null
  if (Test-Path -LiteralPath $agentsSkill) {
    $beforeHash = (Get-FileHash -LiteralPath $agentsSkill -Algorithm SHA256).Hash
  }

  $updateResult = Invoke-Npx @("skills", "update", $skillName, "-p", "-y")
  $updateText = ($updateResult.Output | ForEach-Object { "$_" }) -join "`n"
  foreach ($line in $updateResult.Output) {
    Write-Log "$logPrefix $line"
  }
  $updateOk = ($updateResult.ExitCode -eq 0) -and ($updateText -notmatch "Failed to update")
  if (-not $updateOk) {
    Write-Log "$logPrefix skills update did not succeed (exit=$($updateResult.ExitCode)); trying skills add..."
    $addResult = Invoke-Npx @("skills", "add", $repoUrl, "--skill", $skillName, "-y")
    foreach ($line in $addResult.Output) {
      Write-Log "$logPrefix $line"
    }
    if ($addResult.ExitCode -ne 0) {
      throw "skills add failed with exit code $($addResult.ExitCode)"
    }
  }

  if (-not (Test-Path -LiteralPath $agentsSkill)) {
    throw "Official skill not found after update: $agentsSkill"
  }

  $afterHash = (Get-FileHash -LiteralPath $agentsSkill -Algorithm SHA256).Hash

  if (-not (Test-Path -LiteralPath $cursorSkillDir)) {
    New-Item -ItemType Directory -Path $cursorSkillDir -Force | Out-Null
  }

  Copy-Item -LiteralPath $agentsSkill -Destination $cursorSkill -Force

  $changed = ($beforeHash -ne $afterHash)
  if ($changed) {
    Write-Log "$logPrefix Updated and mirrored to $cursorSkill"
  } else {
    Write-Log "$logPrefix Already up to date (hash unchanged). Mirrored to Cursor path."
  }

  Write-State @{
    skillName   = $skillName
    sha256      = $afterHash
    updatedAt   = (Get-Date).ToUniversalTime().ToString("o")
    changed     = $changed
    source      = $repoUrl
    agentsPath  = $agentsSkill
    cursorPath  = $cursorSkill
  }
} finally {
  Pop-Location
}
