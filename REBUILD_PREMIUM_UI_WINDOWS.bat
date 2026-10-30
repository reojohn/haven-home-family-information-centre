@echo off
setlocal
cd /d "%~dp0"
echo ===========================================
echo     HAVEN HOME - Premium UI Build
 echo ===========================================
if not exist "frontend\package.json" (
  echo ERROR: Run this file inside the HIC_Family_Centre folder.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js / npm is not available. Install Node.js first.
  pause
  exit /b 1
)
pushd frontend
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing missing frontend dependencies...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    popd
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
)
echo Building the updated React interface...
call npm run build
if errorlevel 1 (
  popd
  echo ERROR: React build failed. Review the message above.
  pause
  exit /b 1
)
popd
echo.
echo Premium UI build completed successfully.
echo If Haven Home is already running, refresh the browser.
echo Otherwise, run START_HIC_WINDOWS.bat.
echo Your backend and existing database were not reset.
pause
