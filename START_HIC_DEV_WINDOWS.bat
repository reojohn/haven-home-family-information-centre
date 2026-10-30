@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - Start Development Mode
echo ========================================================
echo   HAVEN HOME - LIVE REACT DEVELOPMENT MODE
echo ========================================================
echo.
if not exist "frontend\package.json" (
    echo ERROR: This file must be inside HIC_Family_Centre.
    pause
    exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js / npm not found. Run SETUP_WINDOWS.bat first.
    pause
    exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
    where python >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python not found. Run SETUP_WINDOWS.bat first.
        pause
        exit /b 1
    )
)
echo Checking FastAPI on port 8000...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch {exit 1}" >nul 2>&1
if errorlevel 1 (
    echo Starting backend in a separate window ^(automatic Python reload^)...
    start "Haven Home - FastAPI (DEV)" /D "%~dp0" cmd /k "call RUN_HIC_DEV_BACKEND_WINDOWS.bat"
) else (
    echo FastAPI is already running. Using the existing backend and household database.
    echo NOTE: If it was started using START_HIC_WINDOWS.bat, Python changes will NOT auto-reload.
)
echo Checking Vite on port 5173...
powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch {exit 1}" >nul 2>&1
if errorlevel 1 (
    echo Starting Vite in a separate window ^(React/CSS auto-refresh^)...
    start "Haven Home - Vite React (DEV)" /D "%~dp0" cmd /k "call RUN_HIC_DEV_FRONTEND_WINDOWS.bat"
) else (
    echo Vite is already running at 127.0.0.1:5173.
)
echo.
echo Waiting for the live React server to become ready...
powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 60;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/' -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true;break}}catch{}; Start-Sleep -Seconds 1}; if($ok){exit 0}else{exit 1}"
if errorlevel 1 (
    echo.
    echo ERROR: Vite did not become ready. Read the Vite window for the error.
    echo The backend and database were not modified.
    pause
    exit /b 1
)
echo.
echo ========================================================
echo   DEVELOPMENT WEBSITE: http://127.0.0.1:5173
echo   BACKEND API:         http://127.0.0.1:8000
echo ========================================================
echo.
echo Edit React/CSS and Vite updates the browser automatically.
echo Your existing accounts and data are shared between modes.
echo For normal/production mode use START_HIC_WINDOWS.bat on port 8000.
echo To publish frontend edits in normal mode, run REBUILD_PREMIUM_UI_WINDOWS.bat.
echo Keep the server windows open while using the website.
start "" "http://127.0.0.1:5173"
echo.
pause
