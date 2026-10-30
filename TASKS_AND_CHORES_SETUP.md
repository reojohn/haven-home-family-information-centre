# Haven Home — Tasks & Chores Upgrade

This update replaces the visible **Energy Information** navigation page with **Household Tasks & Chores**. It does **not delete** the existing `energy_records` table or electricity readings. Existing electricity bills remain in Household Expenses.

## Installation

1. Make a backup of your Haven Home project and your Supabase database before updating.
2. Copy the supplied changed/new files into your `HIC_Family_Centre` folder, respecting their original paths.
3. **Restart the FastAPI backend.** A new table named `household_tasks` is created automatically by SQLAlchemy at startup if the backend's PostgreSQL role has `CREATE` permission. The code enables Row Level Security and revokes direct Data API access for `anon` and `authenticated`; tasks are accessed through the existing authenticated FastAPI endpoints.
4. If the backend cannot create the table due to database permissions, run `backend/sql/OPTIONAL_HOUSEHOLD_TASKS_SUPABASE.sql` using Supabase SQL Editor **in the correct project**, then restart FastAPI. The SQL creates only the new table, a lookup index and access protections. It is not required if the backend starts successfully.
5. Use the development frontend at `http://127.0.0.1:5173/tasks` (or your normal website address). Vite automatically refreshes frontend changes. The backend restart is required for new endpoints and the table.
6. If using `START_HIC_WINDOWS.bat` (compiled frontend), rebuild the frontend before launching the compiled site. In development mode (`START_HIC_DEV_WINDOWS.bat`) no rebuild is needed.

## What the update does

- Task creation, editing, deleting, due dates, priorities, categories, notes, and assignment to registered household members.
- States: **To do**, **In progress**, and **Completed**. Counts and Dashboard previews update after each successful save.
- Repeats: **daily**, **weekly**, **monthly**. Marking a recurring occurrence completed creates exactly one next task, preserving the original completion as history. Late completions skip missed intervals, using the next upcoming due date. Recurrences are not background cron jobs or notifications.
- Searching, filtering, sorting, and paginated lists with a custom scrollable panel.
- Every family member in a household may create/change/delete shared tasks, consistent with the existing shared-household prototype permissions. Assignments are labels for responsibility, **not private access restrictions**.
- Old `/energy` links redirect to `/tasks` without removing historical readings.
- No sample tasks or expenses are automatically added. A newly created household's task list begins empty.

## Optional rollback

If you restore your previous frontend and backend files, the new `household_tasks` table and its data remain safely stored in Supabase but will not be shown by the old app. Do not delete the table if you might want to bring back this module.

## Acceptance checklist

- Dashboard and sidebar both link to **Tasks & Chores**.
- Add a task; assign a household member; change status; edit; search; and delete.
- Complete a weekly recurring task and check that a new pending occurrence appears once.
- Open a second account in the same household and confirm shared visibility.
- Open an unrelated household and confirm tasks cannot be seen or changed.
- Test the visual layout in Light, Dark, Haven Luxe, and mobile size.
- Confirm old electricity readings remain present in Supabase and electricity bills remain under Household Expenses.

Tests: `python -m pytest -q backend/tests/test_flows.py backend/tests/test_tasks.py` from the project root.
