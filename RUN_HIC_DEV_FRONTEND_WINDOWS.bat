@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - Vite React Development Server
if not exist "frontend\package.json" (
    echo ERROR: Missing frontend\package.json.
    pause
    exit /b 1
)
cd frontend
if not exist "node_modules\vite\bin\vite.js" (
    echo Frontend dependencies are missing. Installing them once...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo ERROR: npm install failed. Check network and Node.js installation.
        pause
        exit /b 1
    )
)
echo [Haven Home] React dev server with live UI updates...
echo Local URL: http://127.0.0.1:5173
echo.
call npm run dev
echo.
echo Vite stopped. If it exited unexpectedly, read the error above.
pause
