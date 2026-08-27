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

echo ""
echo "[INFO] Statusline integration (the ONLY integration point — agy itself is never modified):"
echo ""
echo "  Add this entry to $HOME/.gemini/antigravity-cli/settings.json"
echo "  (merge into the existing JSON object, then restart agy):"
echo ""
echo '  "statusLine": {'
echo '    "type": "command",'
echo '    "command": "C:\\PROGRA~1\\nodejs\\node.exe C:\\Users\\k1yt\\AppData\\Roaming\\npm\\NODE_M~1\\AGY-TO~1\\bin\\AGY-TO~1.JS --hook --raw --write-dashboard",'
echo '    "enabled": true,'
echo '    "stack_with_default": true'
echo '  }'
echo ""
echo "  - The 8.3 short-path command above is the Windows form; on Linux/macOS use:"
echo '      "command": "agy-tokens --hook --raw --write-dashboard"'
echo "  - --write-dashboard refreshes the browser dashboard data on every state change."
echo "  - Run \"agy-tokens --html\" once to generate the initial dashboard."
echo ""

echo "Try running:"
echo "  agy-tools --version"
echo "  agy-tools prices --currency krw"
echo "  agy-tokens --help"
echo ""