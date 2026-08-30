@echo off
setlocal
pushd "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo [P-Viewer] npm wurde nicht gefunden. Bitte Node.js installieren und das Terminal neu starten.
  popd
  exit /b 1
)

if not exist "node_modules\@tauri-apps\cli\package.json" (
  echo [P-Viewer] Abhaengigkeiten fehlen. Bitte zuerst "npm install" ausfuehren.
  popd
  exit /b 1
)

echo [P-Viewer] Pruefe Dateizuordnungen ...
call npm run check:associations
if errorlevel 1 goto :failed

echo [P-Viewer] Erzeuge optimierten Windows-Build ...
call npm run build:launcher
if errorlevel 1 goto :failed

if not exist "P-Viewer.exe" (
  echo [P-Viewer] Build beendet, aber P-Viewer.exe wurde nicht erstellt.
  popd
  exit /b 1
)

echo.
echo [P-Viewer] Fertig: "%CD%\P-Viewer.exe"
popd
exit /b 0

:failed
echo.
echo [P-Viewer] Build fehlgeschlagen. Details stehen oberhalb.
popd
exit /b 1
