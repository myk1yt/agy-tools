#!/usr/bin/env bash
set -e

echo "======================================================="
echo "  Antigravity Token & Cost Tracker Installer (Unix)    "
echo "======================================================="

if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in your PATH."
    echo "Please install Node.js (v16+) from https://nodejs.org/"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

chmod +x "$ROOT_DIR/bin/agy-tokens.js"

echo "[INFO] Linking agy-tokens globally via npm link..."
cd "$ROOT_DIR"

if npm link 2>/dev/null; then
    echo ""
    echo "[SUCCESS] agy-tokens installed globally!"
    echo "Try running: agy-tokens --help"
else
    echo ""
    echo "[WARN] Global npm link required sudo or failed. Setting up user symlink..."
    USER_BIN="$HOME/.local/bin"
    mkdir -p "$USER_BIN"
    ln -sf "$ROOT_DIR/bin/agy-tokens.js" "$USER_BIN/agy-tokens"
    echo "[SUCCESS] Created symlink at $USER_BIN/agy-tokens"
    echo "Make sure $USER_BIN is in your PATH."
fi
