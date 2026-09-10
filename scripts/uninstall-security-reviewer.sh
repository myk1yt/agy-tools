#!/usr/bin/env bash
# Uninstall Security Reviewer Multi-Agent Suite from Antigravity CLI
set -e

echo "Uninstalling Security Reviewer Multi-Agent Suite from Antigravity CLI..."

# 1. Uninstall Plugin via Antigravity CLI
echo "Unregistering plugin via 'agy plugin uninstall security_reviewer'..."
agy plugin uninstall security_reviewer || true

# 2. Verify Active Agents Registration
echo -e "\n[Success] Uninstallation Complete! Active agents:"
agy agents || true
