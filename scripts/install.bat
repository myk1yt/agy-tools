@echo off
setlocal enabledelayedexpansion

echo =======================================================
echo   Antigravity Token ^& Cost Tracker Installer (Windows)
echo =======================================================

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js (v16+) from https://nodejs.org/
    exit /b 1
)

set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."

echo [INFO] Linking agy-tokens globally via npm link...
cd /d "%ROOT_DIR%"
call npm link

if %ERRORLEVEL% equ 0 (
    echo.
    echo [SUCCESS] agy-tokens installed successfully!
    echo Try running: agy-tokens --help
) else (
    echo.
    echo [WARN] npm link failed. Creating local batch runner...
    set "BIN_PATH=%USERPROFILE%\.gemini\antigravity-cli\bin\agy-tokens.bat"
    echo @echo off > "%BIN_PATH%"
    echo node "%ROOT_DIR%\bin\agy-tokens.js" %%* >> "%BIN_PATH%"
    echo [SUCCESS] Created launcher at %BIN_PATH%
)

endlocal
