@echo off
rem ============================================================
rem  浮動注音 — 安裝/更新 Electron（需 proxy，首次下載約 110MB）
rem  執行完畢後用 start.bat 啟動
rem ============================================================
setlocal
set "HTTP_PROXY=http://127.0.0.1:15722"
set "HTTPS_PROXY=http://127.0.0.1:15722"
set "ELECTRON_GET_USE_PROXY=1"
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 node。請確認 D:\nodejs 或 PATH 中有 Node.js。
  pause
  exit /b 1
)

call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [錯誤] npm install 失敗。請確認 DigestRelay proxy (127.0.0.1:15722) 正在執行。
  pause
  exit /b 1
)
echo.
echo 完成！雙擊 start.bat 啟動。
pause