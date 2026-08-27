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

:: Ensure Gemini skill and hook integration
set "GEMINI_DIR=%USERPROFILE%\.gemini"
if exist "%GEMINI_DIR%" (
    echo [INFO] Configuring Gemini skill and hook integrations...

    if not exist "%GEMINI_DIR%\skills\usage" mkdir "%GEMINI_DIR%\skills\usage"
    copy /y "%ROOT_DIR%\integrations\skills\usage\SKILL.md" "%GEMINI_DIR%\skills\usage\SKILL.md" >nul 2>nul

    if not exist "%GEMINI_DIR%\skills\tokens" mkdir "%GEMINI_DIR%\skills\tokens"
    copy /y "%ROOT_DIR%\integrations\skills\tokens\SKILL.md" "%GEMINI_DIR%\skills\tokens\SKILL.md" >nul 2>nul

    REM Merge-safe hooks.json: only write if missing OR no "token-tracker" key (never clobber other hooks)
    set "HOOKS_MERGE_NEEDED=0"
    if not exist "%GEMINI_DIR%\hooks.json" set "HOOKS_MERGE_NEEDED=1"
    if "!HOOKS_MERGE_NEEDED!"=="0" (
        findstr /c:"token-tracker" "%GEMINI_DIR%\hooks.json" >nul 2>nul
        if errorlevel 1 set "HOOKS_MERGE_NEEDED=1"
    )
    if "!HOOKS_MERGE_NEEDED!"=="1" (
        copy /y "%ROOT_DIR%\integrations\hooks.json" "%GEMINI_DIR%\hooks.json" >nul 2>nul
        echo [INFO] Installed token-tracker PostInvocation hook in %GEMINI_DIR%\hooks.json
    ) else (
        echo [INFO] Existing hooks.json already contains token-tracker; left untouched.
    )

    echo [SUCCESS] Configured usage + tokens skills and PostInvocation hook in %GEMINI_DIR%
)

echo.
echo Try running:
echo   agy-tools --version
echo   agy-tools prices --currency krw
echo   agy-tokens --help
echo.

endlocal

