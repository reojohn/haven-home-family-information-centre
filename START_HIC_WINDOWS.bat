@echo off
setlocal
cd /d "%~dp0"
if not exist frontend\dist\index.html (
 echo Please run SETUP_WINDOWS.bat first to install and build the website.
 pause
 exit /b 1
)
if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat)
echo Starting Haven Home at http://127.0.0.1:8000
start "" http://127.0.0.1:8000
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
pause
