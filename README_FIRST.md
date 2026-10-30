# Haven Home — family chores demonstration pack

**Purpose:** Populate the existing Supabase `public.household_tasks` table with 32 fictional household chores for the four currently displayed members of Vinsmoke Family: **Reo, Tyron, Ibhan, Jon** (eight tasks each). No React or FastAPI changes required.

## Load in Supabase

1. Back up your production project or make an appropriate export first. These are fictional records and will affect dashboard counts.
2. In the correct Supabase project, open **SQL Editor** and execute `00_PREVIEW_HOUSEHOLD_AND_MEMBERS.sql`. Check the household is `Vinsmoke Family` and the **first names** of four registered users are `Reo`, `Tyron`, `Ibhan`, `Jon`. If any are different, **do not run the insert** until verified. Do not guess IDs.
3. Execute **all of** `01_LOAD_32_FAMILY_CHORES.sql` using the SQL Editor. The script validates that exactly one household and one user per first name exist. An error stops the transaction, and no records are added.
4. Run `02_VERIFY_INSERTED_CHORES.sql`. Expect 8 demo tasks for each member (32 overall), unless already-existing tasks with the exact same title and assignee were intentionally skipped.
5. Refresh Haven Home at `http://127.0.0.1:5173/tasks`, select **All tasks** to see completed as well as active chores, and test the filters.

## Expected statuses

- Pending: 18
- In progress: 6
- Completed: 8
- Some pending entries may be overdue, depending on the date you load them.
- All date offsets are relative to the **Philippines local date when executed**.
- Repeated chores are **active** entries only. Their next occurrences will be created by the existing backend when you mark them completed.

## Safeguards

- The script uses the **current registered user IDs** from `public.users`, not hardcoded numeric IDs.
- It only touches `public.household_tasks` for the uniquely named target household. It will never update existing records.
- It refuses to seed the batch again if any record contains `[HAVEN_CHORES_V1]`. It also skips title+assignee pairs that already exist.
- The tasks table has no `is_demo` column, so demonstration tasks are tagged in **description** as `Demonstration record for interface testing. [HAVEN_CHORES_V1]`. Their titles remain natural-looking.
- The audit/verification script is read-only. The optional removal script contains a **commented-out** DELETE and only becomes destructive if you explicitly uncomment it.
- The existing UI default status filter is **Active**; completed tasks will appear only with **All tasks** or **Completed**.
- No email/password, invite codes, or connection credentials are required.

## Troubleshooting

- `relation public.household_tasks does not exist`: restart your upgraded FastAPI backend, or use the already-supplied optional create-table SQL from the Tasks & Chores update. This pack does not create tables.
- `Expected one registered <name> ...`: read the preview results; the registered first-name key differs or is not unique. Confirm before editing the script.
- No new rows after rerun: the pack already exists, or the intended task title/assignee pair exists. Review the NOTICE and verification query.
- No tasks visible in the site: make sure the FastAPI backend points to this Supabase project, refresh the browser, and choose **All tasks** or the appropriate status.

**This is a prepared SQL file, not an executed database insertion.** You run it in your Supabase SQL Editor.
