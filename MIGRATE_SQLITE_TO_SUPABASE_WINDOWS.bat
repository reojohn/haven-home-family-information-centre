@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Haven Home - Migrate SQLite to Supabase

echo ============================================================
echo   HAVEN HOME - SQLITE TO SUPABASE (ONE-TIME DATA MIGRATION)
echo ============================================================
echo.
echo IMPORTANT: Close ALL Haven Home backend and Vite windows first.
echo This script never modifies the source SQLite file.
echo It refuses to copy data into a populated Supabase database.
echo.
if not exist "backend\.env.supabase" (
  echo ERROR: Missing backend\.env.supabase
  echo Copy backend\.env.supabase.example and add your Supabase connection URL.
  pause
  exit /b 1
)
if not exist "backend\data\hic.sqlite3" (
  echo ERROR: Missing backend\data\hic.sqlite3
  echo Confirm this is your ORIGINAL project folder with real household records.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo ERROR: Missing .venv Python. Run SETUP_WINDOWS.bat first.
  pause
  exit /b 1
)
if not exist "backend\data\hic.sqlite3.pre_supabase_backup" (
  copy /Y "backend\data\hic.sqlite3" "backend\data\hic.sqlite3.pre_supabase_backup" >nul
  if errorlevel 1 (echo ERROR: Could not create SQLite backup.& pause & exit /b 1)
)
echo An untouched SQLite backup is stored in backend\data.
echo.
echo [1/2] Checking Supabase connection...
".venv\Scripts\python.exe" -m backend.scripts.migrate_sqlite_to_supabase --check
if errorlevel 1 (echo Connection check FAILED. Nothing migrated.& pause & exit /b 1)
echo.
choice /M "Copy existing SQLite data into the EMPTY Supabase project now"
if errorlevel 2 (echo Migration canceled.& pause & exit /b 0)
echo.
echo [2/2] Copying data and verifying checksums...
".venv\Scripts\python.exe" -m backend.scripts.migrate_sqlite_to_supabase --migrate
if errorlevel 1 (echo Migration FAILED. Do NOT switch the database yet.& pause & exit /b 1)
echo.
echo Migration verified. Read SUPABASE_MIGRATION_GUIDE.md for the final switch.
pause
