# Install only the Security Reviewer Multi-Agent Suite into Antigravity CLI
$ErrorActionPreference = "Stop"
Write-Host "Installing Security Reviewer Multi-Agent Suite into Antigravity CLI..." -ForegroundColor Cyan

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pluginPath = Resolve-Path (Join-Path $scriptPath "..\plugins\security-reviewer")

agy plugin install $pluginPath

Write-Host "`n[Success] Installation Complete! Active agents:" -ForegroundColor Green
agy agents
