#!/usr/bin/env bash
set -e

echo "======================================================="
echo "  Antigravity CLI Developer Toolkit (agy-tools) Installer"
echo "======================================================="

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in your PATH."
    echo "Please install Node.js (v16+) from https://nodejs.org/"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

chmod +x "$ROOT_DIR/bin/agy-tools.js"
chmod +x "$ROOT_DIR/bin/agy-tokens.js"

echo "[INFO] Linking agy-tools globally via npm link..."
cd "$ROOT_DIR"

if npm link 2>/dev/null; then
    echo ""
    echo "[SUCCESS] agy-tools, agy-dashboard, and agy-tokens installed globally!"
else
    echo ""
    echo "[WARN] Global npm link required sudo or failed. Setting up user symlinks..."
    USER_BIN="$HOME/.local/bin"
    mkdir -p "$USER_BIN"
    ln -sf "$ROOT_DIR/bin/agy-tools.js" "$USER_BIN/agy-tools"
    ln -sf "$ROOT_DIR/bin/agy-tokens.js" "$USER_BIN/agy-tokens"
    ln -sf "$ROOT_DIR/bin/agy-tokens.js" "$USER_BIN/agy-dashboard"
    echo "[SUCCESS] Created symlinks in $USER_BIN"
    echo "Make sure $USER_BIN is in your PATH."
fi

# Configure Gemini skills and hooks
GEMINI_DIR="$HOME/.gemini"
if [ -d "$GEMINI_DIR" ]; then
    echo "[INFO] Configuring Gemini skill and hook integrations..."
    mkdir -p "$GEMINI_DIR/skills/usage"
    cp "$ROOT_DIR/integrations/skills/usage/SKILL.md" "$GEMINI_DIR/skills/usage/SKILL.md"
    cp "$ROOT_DIR/integrations/hooks.json" "$GEMINI_DIR/hooks.json"
    echo "[SUCCESS] Configured /usage skill and PostInvocation hook in $GEMINI_DIR"
fi

echo ""
echo "Try running:"
echo "  agy-tools --version"
echo "  agy-tools prices --currency krw"
echo "  agy-tokens --help"
echo ""

