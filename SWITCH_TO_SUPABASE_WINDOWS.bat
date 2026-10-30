@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - Switch Database to Supabase
echo ============================================================
echo   HAVEN HOME - SWITCH BACKEND TO SUPABASE
 echo ============================================================
echo.
echo Close all Haven Home backend windows before proceeding.
echo This will change only backend\.env, NOT any household records.
echo.
if not exist "backend\.env.supabase" (echo ERROR: backend\.env.supabase is missing.& pause & exit /b 1)
if not exist ".venv\Scripts\python.exe" (echo ERROR: Python virtual environment missing.& pause & exit /b 1)
echo Verifying migrated data before switch...
".venv\Scripts\python.exe" -m backend.scripts.migrate_sqlite_to_supabase --verify
if errorlevel 1 (echo ERROR: Verification failed. No database settings changed.& pause & exit /b 1)
choice /M "Switch backend\.env to verified Supabase database"
if errorlevel 2 (echo Database switch canceled.& pause & exit /b 0)
if exist "backend\.env" (
  copy /Y "backend\.env" "backend\.env.before_supabase" >nul
  if errorlevel 1 (echo ERROR: Cannot back up original backend\.env.& pause & exit /b 1)
)
copy /Y "backend\.env.supabase" "backend\.env" >nul
if errorlevel 1 (echo ERROR: Could not update backend\.env.& pause & exit /b 1)
echo.
echo SUCCESS: backend\.env now points to your Supabase PostgreSQL.
echo Restart the FastAPI backend. Your SQLite file and backup still exist.
echo If you need rollback, restore backend\.env.before_supabase to backend\.env.
pause
