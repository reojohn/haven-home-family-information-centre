@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - FastAPI Development Server
echo [Haven Home] Starting FastAPI with Python auto-reload...
echo Database and household records are NOT reset.
echo.
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" -m uvicorn backend.app.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
) else (
    python -m uvicorn backend.app.main:app --reload --reload-dir backend --host 127.0.0.1 --port 8000
)
echo.
echo Backend stopped. If it exited unexpectedly, read the error above.
pause
