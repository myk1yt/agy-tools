# Uninstall Designer Agent and Skills Suite from Antigravity CLI
$ErrorActionPreference = "Continue"
Write-Host "Uninstalling Zero-MCP Designer Suite from Antigravity CLI..." -ForegroundColor Cyan

# 1. Uninstall Plugin via Antigravity CLI
Write-Host "Unregistering plugin via 'agy plugin uninstall designer'..." -ForegroundColor Gray
try {
    agy plugin uninstall designer
} catch {
    Write-Warning "Failed or plugin already uninstalled: $_"
}

# 2. Clean up deployed skills from ~/.gemini/config/skills and ~/.gemini/skills
$geminiDir = Join-Path $env:USERPROFILE ".gemini"
$configSkillsDir = Join-Path $geminiDir "config\skills"
$userSkillsDir = Join-Path $geminiDir "skills"

$designerSkills = @(
    "design-core-harness",
    "design-vector-svg",
    "design-interactive-sandbox",
    "design-3d-canvas",
    "design-cyberpunk-brainmap"
)

Write-Host "Cleaning up deployed skills from global ~/.gemini registries..." -ForegroundColor Gray
foreach ($skill in $designerSkills) {
    $targetConfig = Join-Path $configSkillsDir $skill
    $targetUser = Join-Path $userSkillsDir $skill

    if (Test-Path $targetConfig) {
        Remove-Item -Path $targetConfig -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  - Removed skill: $targetConfig" -ForegroundColor Yellow
    }
    if (Test-Path $targetUser) {
        Remove-Item -Path $targetUser -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  - Removed skill: $targetUser" -ForegroundColor Yellow
    }
}

# 3. Verify Active Agents Registration
Write-Host "`n[Success] Uninstallation Complete! Active agents:" -ForegroundColor Green
agy agents
