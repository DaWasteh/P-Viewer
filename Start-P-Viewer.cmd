@echo off
setlocal
set "ROOT=%~dp0"

if exist "%ROOT%P-Viewer.exe" (
  start "P-Viewer" "%ROOT%P-Viewer.exe" %*
  exit /b 0
)

if exist "%ROOT%src-tauri\target\release\p-viewer.exe" (
  start "P-Viewer" "%ROOT%src-tauri\target\release\p-viewer.exe" %*
  exit /b 0
)

if exist "%ROOT%src-tauri\target\debug\p-viewer.exe" (
  start "P-Viewer" "%ROOT%src-tauri\target\debug\p-viewer.exe" %*
  exit /b 0
)

echo P-Viewer wurde noch nicht gebaut.
echo.
echo Im Projektordner einmal ausfuehren:
echo   npm run build:launcher
echo.
pause
exit /b 1
