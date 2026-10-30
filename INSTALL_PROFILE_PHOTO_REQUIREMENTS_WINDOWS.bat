@echo off
setlocal
cd /d "%~dp0"
title Haven Home - Profile Photo Dependencies
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: Python environment not found. Run SETUP_WINDOWS.bat first.
  pause
  exit /b 1
)
echo Installing the backend image-upload requirements...
".venv\Scripts\python.exe" -m pip install -r "backend\requirements.txt"
if errorlevel 1 (
  echo INSTALLATION FAILED. Verify your internet connection and Python setup.
  pause
  exit /b 1
)
echo Requirements installed. Restart the Haven Home backend.
pause
