# Haven Home — Home Information Centre (HIC)

**IT114 Advanced Human–Computer Interaction | Task 4 | Prototype Version 1**

A working full-stack family dashboard aligned with the user requirements, modular structure, navigation, and wireframes approved for Tasks 1–3. Unlike a click-only mockup, the site stores reminders, household information, family chores, and bill statuses in a **real database**. Historical electricity readings remain preserved in the database.

## Features

| Module | Functional scope |
|---|---|
| Dashboard | Overview of upcoming events, unpaid bills, recent announcements, and open household chores; cross-module updates |
| Family Calendar | Month navigation, create/edit/delete events, event details, date-specific list |
| Household Information | Create/read/delete announcements and family contacts; tap to call |
| Household Tasks & Chores | Add and assign family chores, edit status, track deadlines and recurring tasks, search and filter |
| Household Expenses | Add bills, filter paid/unpaid, view bill details, confirm status changes, delete bills |
| Settings & Accessibility | Personal dark/light mode and text size, shared household invite code, logout, optional demo records |

Energy readings are retained in the database for historical reference, but the Energy Information navigation page has been replaced.

Plus login, household registration, invite-code joining, mobile-friendly layouts, consistent confirmation/error feedback and two complete lab tasks.

**Sample information:** New household accounts start EMPTY by default. You may explicitly load example records for the laboratory demo. They are visibly marked SAMPLE and removable without deleting your own data.

## Recommended setup: Windows (one terminal after installation)

Prerequisites: **Python 3.11+** and **Node.js 20+**, installed locally and available from Command Prompt.

1. Unzip the project anywhere on your computer.
2. Double-click `SETUP_WINDOWS.bat`. Internet access is needed *once* to install the Python and Node dependencies.
3. When installation is complete, double-click `START_HIC_WINDOWS.bat`.
4. Open **http://127.0.0.1:8000** in a browser (the script normally opens it for you).
5. Choose **Create household**, then enter a family name and create your first user account.
6. To add another family member, open **Settings**, copy the invite code, and have them select **Join family** on the sign-in page.

If scripts are blocked or fail, use the manual steps below.

## Manual setup (Windows PowerShell / macOS / Linux)

Run from the project root (the directory containing `backend` and `frontend`):

```bash
python -m pip install -r backend/requirements.txt
cd frontend
npm install
npm run build
cd ..
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Then open **http://127.0.0.1:8000**. The backend serves the compiled frontend at the same address. **Important:** build the frontend *before* starting the backend.

### Separate development servers (recommended while editing code)

Backend, from project root:

```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite forwards `/api` requests to FastAPI.

## Where data is saved

- Local/default database: `backend/data/hic.sqlite3` (created when the backend starts).
- The database is **NOT in the ZIP by default**. A fresh installation begins with an empty database.
- Data survives website refreshes, browser restarts, and application restarts. **Back up this SQLite file regularly** if you use real household information.
- The `.gitignore` excludes local databases and `.env` credentials.
- SQLite works well for local tests and light household usage, but a reliably hosted, multi-user public deployment should use managed PostgreSQL and backup policies. Set `DATABASE_URL=postgresql://...` in `backend/.env` before starting the server (example in `backend/.env.example`).

## Tasks & Chores upgrade

The new `household_tasks` table is created on FastAPI startup (provided database permissions allow it). For Supabase setup, safe schema fallback, and testing steps, see [`TASKS_AND_CHORES_SETUP.md`](TASKS_AND_CHORES_SETUP.md).

## Lab tasks demonstrated

**Complete task A — Create a family reminder**
Dashboard → Family Calendar → Add reminder → Fill and Save → Success feedback → Reminder details; new reminder also appears in Calendar and upcoming Dashboard list (when dated today or later).

**Complete task B — Update a household bill**
Dashboard → Household Expenses → Select unpaid bill → Mark as paid → Confirm → Success feedback → Updated bill status and Dashboard unpaid summary.

The system also provides cancellation and return navigation for both tasks.

## Reusable components

`AppShell` (consistent sidebar, header, active location), `Button`, `IconButton`, `Panel`, `StatCard`, `Pill`, `Field`, `Modal`, `Empty`, and `Toast`. The Task 4 report in `docs/Task4_Component_Inventory_and_Implementation.md` describes each component and its consistency contract.

## Backend architecture

- `FastAPI + SQLAlchemy + SQLite` (optionally PostgreSQL with `psycopg`).
- Passwords are hashed with salted PBKDF2-HMAC-SHA256 (450,000 iterations).
- Random sessions stored as hashed tokens in the database and delivered in HTTP-only cookies.
- Users are separated by household ID on all record reads/writes; joins require a household invite code.
- Database changes are made through `/api` endpoints; main frontend data is refreshed after each successful mutation.
- No payment provider, bank connection, live electricity meter, email sending, or voice recognition is integrated. `Mark as Paid` updates your own household record ONLY.
- API health check: `http://127.0.0.1:8000/api/health`
- Interactive API docs for development: `http://127.0.0.1:8000/docs`

## Tests

From project root, with `pytest` installed:

```bash
python -m pip install pytest httpx
python -m pytest backend/tests -q
```

Tests cover creation and persistence of a family reminder, adding a bill and marking it paid, household sharing via invite code, cross-household access prevention, personal settings, and demo data removal.

## Family use and security limits — PLEASE READ

This is a **functional Version 1 prototype**, not a fully hardened production website. It is safe to experiment with locally, but **do not put it on the public internet with sensitive household data yet**. Before a public multi-device deployment, add and verify:

- HTTPS/TLS at the domain/reverse proxy and `COOKIE_SECURE=1` in `backend/.env`.
- Durable, backed-up PostgreSQL database and managed deployment/restore procedures.
- Rate limiting and abuse protection for sign-in, registration and invite-code attempts; email verification, password reset and recovery.
- Household role permissions (currently, each joined household member can modify or delete shared records).
- Invitation-code rotation and membership removal/revocation tools.
- Database migrations, production monitoring, deployment configuration, privacy review and additional automated/browser security tests.

On a single trusted computer you can start using it now. For use across family phones/computers outside that machine, properly deploy it with HTTPS and the safety measures above first. **Do not share the SQLite file or the invitation code publicly.**

## Structure

```text
HIC_Family_Centre/
├── backend/
│   ├── app/
│   │   ├── db.py           # database & configuration
│   │   ├── models.py       # household/user/data tables
│   │   └── main.py         # authentication and data API
│   ├── tests/              # backend regression checks
│   ├── data/               # local database created on startup
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/main.jsx        # screens & shared components
│   ├── src/styles.css      # styles & responsive themes
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── docs/
│   └── Task4_Component_Inventory_and_Implementation.md
├── SETUP_WINDOWS.bat
├── START_HIC_WINDOWS.bat
└── README.md
```

## Iterative Prototyping Model

**Version 1:** Based on approved Tasks 1–3, functional modules and two user workflows. **Task 5** is the next stage: each group member independently evaluates this working prototype using the ten usability heuristics. Evaluate first; do not invent issues. Record real problems and severity (Task 6), apply priority changes (Task 7), and preserve a separate Version 2 for comparison. Then perform a quick peer usability check (Task 8) and prepare the final report (Task 9).
