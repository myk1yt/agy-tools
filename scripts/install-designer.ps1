# Install Designer Agent and Skills Suite into Antigravity CLI
$ErrorActionPreference = "Stop"
Write-Host "Installing Zero-MCP Designer Suite into Antigravity CLI..." -ForegroundColor Cyan

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginPath = Resolve-Path (Join-Path $scriptPath "..\plugins\designer")

# 1. Install Plugin via Antigravity CLI
Write-Host "Registering plugin via 'agy plugin install'..." -ForegroundColor Gray
agy plugin install $pluginPath

# 2. Deploy Skills Globally into ~/.gemini/config/skills and ~/.gemini/skills
$geminiDir = Join-Path $env:USERPROFILE ".gemini"
$configSkillsDir = Join-Path $geminiDir "config\skills"
$userSkillsDir = Join-Path $geminiDir "skills"

if (-not (Test-Path $configSkillsDir)) {
    New-Item -ItemType Directory -Path $configSkillsDir -Force | Out-Null
}
if (-not (Test-Path $userSkillsDir)) {
    New-Item -ItemType Directory -Path $userSkillsDir -Force | Out-Null
}

$sourceSkillsDir = Join-Path $pluginPath "skills"
if (Test-Path $sourceSkillsDir) {
    Write-Host "Deploying skills to global ~/.gemini registries..." -ForegroundColor Gray
    Get-ChildItem -Path $sourceSkillsDir -Directory | ForEach-Object {
        $skillName = $_.Name
        $targetConfig = Join-Path $configSkillsDir $skillName
        $targetUser = Join-Path $userSkillsDir $skillName

        if (Test-Path $targetConfig) {
            Remove-Item -Path $targetConfig -Recurse -Force
        }
        if (Test-Path $targetUser) {
            Remove-Item -Path $targetUser -Recurse -Force
        }

        Copy-Item -Path $_.FullName -Destination $targetConfig -Recurse -Force
        Copy-Item -Path $_.FullName -Destination $targetUser -Recurse -Force
        Write-Host "  + Deployed skill: $skillName" -ForegroundColor Green
    }
}

# 3. Verify Active Agents Registration
Write-Host "`n[Success] Installation Complete! Active agents:" -ForegroundColor Green
agy agents
