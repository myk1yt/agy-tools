# Uninstall Security Reviewer Multi-Agent Suite from Antigravity CLI
$ErrorActionPreference = "Continue"
Write-Host "Uninstalling Security Reviewer Multi-Agent Suite from Antigravity CLI..." -ForegroundColor Cyan

# 1. Uninstall Plugin via Antigravity CLI
Write-Host "Unregistering plugin via 'agy plugin uninstall security_reviewer'..." -ForegroundColor Gray
try {
    agy plugin uninstall security_reviewer
} catch {
    Write-Warning "Failed or plugin already uninstalled: $_"
}

# 2. Verify Active Agents Registration
Write-Host "`n[Success] Uninstallation Complete! Active agents:" -ForegroundColor Green
agy agents
