@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0node_modules\electron\dist\electron.exe" (
  exit /b 1
)

set "MSYS_NO_PATHCONV=1"
"%~dp0node_modules\electron\dist\electron.exe" "%~dp0." 2>nul
exit /b 0