@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - Verify Supabase Migration
if not exist ".venv\Scripts\python.exe" (echo ERROR: Python virtual environment missing.& pause & exit /b 1)
".venv\Scripts\python.exe" -m backend.scripts.migrate_sqlite_to_supabase --verify
if errorlevel 1 (echo Verification FAILED. Do not switch databases.& pause & exit /b 1)
echo.
echo Every table matches the original SQLite file.
pause
