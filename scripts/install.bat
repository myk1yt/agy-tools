@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   Antigravity CLI Developer Toolkit (agy-tools) Installer
echo =======================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js v16+ from https://nodejs.org/
    exit /b 1
)

node -e "process.exit(parseInt(process.versions.node.split('.')[0], 10) >= 16 ? 0 : 1)" >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js version 16 or higher is required.
    echo Please upgrade Node.js from https://nodejs.org/
    exit /b 1
)

where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm is not installed or not in your PATH.
    echo Please ensure npm is installed and in your PATH.
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "ROOT_DIR=%%~fI"

echo [INFO] Linking agy-tools globally via npm link...
cd /d "%ROOT_DIR%"
call npm link

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] agy-tools, agy-tokens, agy-dashboard, and antigravity-tools installed successfully!
) else (
    echo.
    echo [WARN] npm link failed. Setting up fallback launchers...
    set "USER_BIN=%USERPROFILE%\.gemini\antigravity-cli\bin"
    if not exist "!USER_BIN!" mkdir "!USER_BIN!"

    echo @echo off > "!USER_BIN!\agy-tools.bat"
    echo node "%ROOT_DIR%\bin\agy-tools.js" %%* >> "!USER_BIN!\agy-tools.bat"

    echo @echo off > "!USER_BIN!\antigravity-tools.bat"
    echo node "%ROOT_DIR%\bin\agy-tools.js" %%* >> "!USER_BIN!\antigravity-tools.bat"

    echo @echo off > "!USER_BIN!\agy-tokens.bat"
    echo node "%ROOT_DIR%\bin\agy-tokens.js" %%* >> "!USER_BIN!\agy-tokens.bat"

    echo @echo off > "!USER_BIN!\agy-dashboard.bat"
    echo node "%ROOT_DIR%\bin\agy-tokens.js" %%* >> "!USER_BIN!\agy-dashboard.bat"

    echo [SUCCESS] Created launchers in !USER_BIN!
    echo Make sure !USER_BIN! is in your PATH.
)

echo.
echo [INFO] Statusline integration (the ONLY integration point — agy itself is never modified):
echo.
echo   Add this entry to %USERPROFILE%\.gemini\antigravity-cli\settings.json
echo   (merge into the existing JSON object, then restart agy):
echo.
echo   "statusLine": {
echo     "type": "command",
echo     "command": "agy-tokens --hook --raw --write-dashboard",
echo     "enabled": true,
echo     "stack_with_default": true
echo   }
echo.
echo   Windows 8.3 short-path alternative (if PATH is not inherited by subprocesses):
echo   "command": "C:\\PROGRA~1\\nodejs\\node.exe %%APPDATA%%\\npm\\NODE_M~1\\AGY-TO~1\\bin\\AGY-TO~1.JS --hook --raw --write-dashboard"
echo.
echo   - Standard command "agy-tokens --hook --raw --write-dashboard" works when npm global bin or fallback bin is in PATH.
echo   - If using 8.3 short paths, ensure backslashes are double-escaped (\\) for JSON.
echo   - --write-dashboard refreshes the browser dashboard data on every state change.
echo   - Run "agy-tokens --html" once to generate the initial dashboard.
echo.

echo Try running:
echo   agy-tools --version
echo   agy-tools prices --currency krw
echo   agy-tokens --help
echo.

endlocal