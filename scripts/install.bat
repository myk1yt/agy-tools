@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   Antigravity CLI Developer Toolkit (agy-tools) Installer
echo =======================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js (v16+) from https://nodejs.org/
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

echo [INFO] Linking agy-tools globally via npm link...
cd /d "%ROOT_DIR%"
call npm link

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] agy-tools, agy-dashboard, and agy-tokens installed successfully!
) else (
    echo.
    echo [WARN] npm link failed. Creating local batch runner...
    set "BIN_PATH=%USERPROFILE%\.gemini\antigravity-cli\bin\agy-tools.bat"
    echo @echo off > "%BIN_PATH%"
    echo node "%ROOT_DIR%\bin\agy-tools.js" %%* >> "%BIN_PATH%"
    echo [SUCCESS] Created launcher at %BIN_PATH%
)

echo.
echo [INFO] Statusline integration (the ONLY integration point — agy itself is never modified):
echo.
echo   Add this entry to %USERPROFILE%\.gemini\antigravity-cli\settings.json
echo   (merge into the existing JSON object, then restart agy):
echo.
echo   "statusLine": {
echo     "type": "command",
echo     "command": "C:\PROGRA~1\nodejs\node.exe C:\Users\k1yt\AppData\Roaming\npm\NODE_M~1\AGY-TO~1\bin\AGY-TO~1.JS --hook --raw --write-dashboard",
echo     "enabled": true,
echo     "stack_with_default": true
echo   }
echo.
echo   - 8.3 short paths, no inner quotes: survives cmd.exe parsing and npm path changes.
echo   - Adjust the short paths if your Node/npm locations differ ("dir /x" shows them).
echo   - --write-dashboard refreshes the browser dashboard data on every state change.
echo   - Run "agy-tokens --html" once to generate the initial dashboard.
echo.

echo Try running:
echo   agy-tools --version
echo   agy-tools prices --currency krw
echo   agy-tokens --help
echo.

endlocal