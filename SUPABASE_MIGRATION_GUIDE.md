# Haven Home: SQLite → Supabase PostgreSQL

This is a **real data migration**, not just a database configuration change. The existing React frontend and FastAPI endpoints remain the same. The app uses SQLAlchemy to connect to Supabase's hosted PostgreSQL database. **This does not introduce Supabase Auth or the Supabase JavaScript client.**

## What's preserved

Your original household IDs, family accounts, password hashes, sessions, user avatars, reminders, announcements, contacts, energy records, bills and paid statuses, manually recorded devices, personal display preferences, and the household Sun Hours city are all copied to Supabase. Primary keys are preserved, and Postgres ID sequences are advanced so creating new entries won't cause duplicate IDs.

## Step 0: Keep the original project and database safe

- Work in your **existing** `HIC_Family_Centre` folder on your Windows computer. Do not replace the folder with a fresh ZIP or delete `backend/data/hic.sqlite3`.
- Close **both** the FastAPI and Vite windows before copying your current data; otherwise data could change while it is being transferred.
- Back up the complete project folder somewhere safe. The migration BAT also copies `backend/data/hic.sqlite3` to `hic.sqlite3.pre_supabase_backup`.
- The supplied update ZIP contains **no** database file and **no** personal credentials.

## Step 1: Create a Supabase project

1. Go to https://supabase.com/dashboard and log in/create an account.
2. Select **New project**, choose an organization, name the project (e.g. `haven-home`), and set a strong **database password**. Keep the password private.
3. Wait until Supabase finishes provisioning the database.
4. Open the project and choose **Connect** at the top. Select **Session pooler** (`5432`). This is preferred for a persistent FastAPI server when your local internet connection uses IPv4.
5. Copy the **exact PostgreSQL connection string** from Supabase. Do not reconstruct the pooler host or username yourself. It usually looks like:

   `postgresql://postgres.PROJECT_REF:[YOUR-PASSWORD]@THE_POOLER_HOST.pooler.supabase.com:5432/postgres`

6. Replace `[YOUR-PASSWORD]` with your password. If it includes `@`, `#`, `%`, `/`, `?`, or another reserved URL character, **percent-encode** it. The example below demonstrates the format, not real credentials:

   `DATABASE_URL=postgresql://postgres.abc123:My%40Secret%23Pass@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require`

Use `sslmode=require` (or, for certificate verification, `sslmode=verify-full` and `sslrootcert=...`). **Never put a database password, DB URL, or privileged Supabase service key in frontend JavaScript or Vite environment variables.**

Supabase reference: https://supabase.com/docs/guides/database/connecting-to-postgres

## Step 2: Configure the private URL on your computer

1. Copy `backend/.env.supabase.example` as **`backend/.env.supabase`**.
2. Edit the copied file using Notepad, and paste in the `DATABASE_URL` from Step 1.
3. Keep `COOKIE_SECURE=0` **only while running the website over local HTTP** (`127.0.0.1`). If you deploy Haven Home over HTTPS, set it to `1`.
4. Don't upload, share, or commit `.env.supabase`. It's explicitly ignored by Git.

## Step 3: Migrate and verify all household data

1. Make sure your original local SQLite file exists: `backend/data/hic.sqlite3`.
2. Make sure you already ran `SETUP_WINDOWS.bat` earlier so `.venv` contains `psycopg` (the original backend requirements already include `psycopg[binary]`). If Python says `No module named psycopg`, run `SETUP_WINDOWS.bat` again or `\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt`.
3. Close the Haven Home **FastAPI and Vite** command windows to stop new SQLite writes.
4. Double-click **`MIGRATE_SQLITE_TO_SUPABASE_WINDOWS.bat`**. It will:
   - make a backup of the SQLite file;
   - check the connection to Supabase;
   - ask for confirmation;
   - refuse to overwrite any preexisting Haven Home records in Supabase;
   - create the app tables and enable RLS and restrictive access;
   - copy existing records inside a transaction;
   - sync auto-increment sequences; and
   - verify both record counts **and** content checksums across every table.
5. Wait for **`MIGRATION SUCCESS`**. If the script prints an error, **do not switch** your backend database yet. The SQLite source remains intact.
6. Optionally run `VERIFY_SUPABASE_MIGRATION_WINDOWS.bat` again. It is read-only.

If you prefer Command Prompt from your project root:

```bat
.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite_to_supabase --check
.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite_to_supabase --migrate
.venv\Scripts\python.exe -m backend.scripts.migrate_sqlite_to_supabase --verify
```

**Important:** The migration only accepts an empty target. If it finds records already present, it stops. Never run the migration twice; run `--verify` after the first success.

## Step 4: Switch and restart the app

1. Close any remaining FastAPI windows.
2. Double-click **`SWITCH_TO_SUPABASE_WINDOWS.bat`**. It re-verifies the migration, backs up the existing `backend/.env` to `.env.before_supabase`, and copies `backend/.env.supabase` to `backend/.env`.
3. Restart `START_HIC_DEV_WINDOWS.bat` and visit http://127.0.0.1:5173.
4. Sign in with your **existing email and password**. New reminders, bills, appliance updates, and other records are now written to Supabase.
5. Inspect your Supabase Dashboard → **Table Editor** and confirm the app tables exist. You can inspect aggregate counts, but keep account/session data private.

**Do not keep an old FastAPI process running.** An already-running process may still point to SQLite even after `.env` changes. Closing and restarting it ensures the switch takes effect.

## Step 5: Test the app carefully

- Existing login works; household and avatar show correctly.
- Reminders and Calendar previews are intact.
- Expense totals and paid/unpaid statuses match.
- Announcements, contacts and energy history match.
- Household Devices display the same manual statuses.
- Sun Hours city and display preferences are preserved.
- Try creating one new reminder, refresh, and verify it persists.
- If another household already exists, test that it still cannot see another family's records.

## Rollback if anything goes wrong

1. Close FastAPI and Vite.
2. If `.env.before_supabase` exists, copy it back to `backend/.env`. If it didn't exist before, remove `backend/.env` so SQLite is selected by default.
3. Restart the original startup script. Your SQLite database and its backup remain unchanged.
4. **Important:** Records added after switching to Supabase do **not** automatically move back to SQLite. Export/reconcile them before switching back if necessary.

## Security and deployment notes

- Data is stored in Supabase **PostgreSQL**, not Supabase Auth. Your existing FastAPI session cookies, PBKDF2 password hashes, and household-scoped endpoint checks are retained.
- The migration sets `ENABLE ROW LEVEL SECURITY` on Haven Home tables and revokes grants from Supabase `anon`/`authenticated` roles. Because the app connects as the privileged PostgreSQL role via **FastAPI only**, it does not use RLS policies for household isolation: existing FastAPI checks remain essential.
- **Never** use the PostgreSQL connection string in React; keep the password only in the backend's `.env`.
- For an internet-accessible deployment, use HTTPS, set `COOKIE_SECURE=1`, restrict FastAPI CORS/origins, secure the backend, and create a backup/recovery plan before allowing family members to rely on the service.
- Hosting PostgreSQL on Supabase **does not make your local FastAPI server publicly accessible**; the backend needs its own hosting later.
- The connection uses Supabase's **Session pooler**, rather than transaction mode, to work well with an always-running FastAPI server. Direct PostgreSQL connections often require IPv6, which might not be available on your home connection.
- Keep your original SQLite database until you have tested the migrated application and arranged cloud backups.

## Need help?

If migration produces an error, send the *error text* or a screenshot **after hiding your database connection string and password**. Do not share `.env` files or real session tokens.
