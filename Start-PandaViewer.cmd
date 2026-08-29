@echo off
setlocal
set "ROOT=%~dp0"

if exist "%ROOT%PandaViewer.exe" (
  start "PandaViewer" "%ROOT%PandaViewer.exe" %*
  exit /b 0
)

if exist "%ROOT%src-tauri\target\release\pandaviewer.exe" (
  start "PandaViewer" "%ROOT%src-tauri\target\release\pandaviewer.exe" %*
  exit /b 0
)

if exist "%ROOT%src-tauri\target\debug\pandaviewer.exe" (
  start "PandaViewer" "%ROOT%src-tauri\target\debug\pandaviewer.exe" %*
  exit /b 0
)

echo PandaViewer wurde noch nicht gebaut.
echo.
echo Im Projektordner einmal ausfuehren:
echo   npm run build:launcher
echo.
pause
exit /b 1
