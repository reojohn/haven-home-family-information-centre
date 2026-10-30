@echo off
setlocal
cd /d "%~dp0"
echo ===========================================
echo    HAVEN HOME - First-time setup
 echo ===========================================
where python >nul 2>nul
if errorlevel 1 (
  echo ERROR: Python is not installed or is not on PATH.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js/npm is not installed or is not on PATH.
  pause
  exit /b 1
)
if not exist .venv (
  python -m venv .venv
  if errorlevel 1 (echo Could not create Python environment.& pause & exit /b 1)
)
call .venv\Scripts\activate.bat
python -m pip install -r backend\requirements.txt
if errorlevel 1 (echo Backend package installation failed.& pause & exit /b 1)
cd frontend
call npm install --no-audit --no-fund
if errorlevel 1 (echo Frontend package installation failed.& pause & exit /b 1)
call npm run build
if errorlevel 1 (echo Frontend build failed.& pause & exit /b 1)
cd ..
echo.
echo SETUP COMPLETE. Run START_HIC_WINDOWS.bat next.
pause
