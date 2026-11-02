# Haven Home — Chore Status Workflow Fix

Source baseline: `HIC_Family_Centre(20261102-024609).zip`; `frontend/src/main.jsx` also retains the subsequent Premium Sign Out patch from this conversation so installing the ZIP does **not** revert that update.

## Fixed behavior

1. **To do** → select **Start task** → **In progress**. The task is **not** completed.
2. **In progress** → select **Mark complete** → **Completed**. The interface opens the Completed tab to make the final status visible.
3. **Completed** (non-recurring only) → **Reopen** → **To do**.
4. Recurring tasks only create their next occurrence when explicitly marked **Completed**.
5. While a change is saving, its row displays **Starting…**, **Completing…**, or **Reopening…** instead of another clickable action.
6. A delayed older `/bootstrap` response cannot immediately replace a just-saved status with the previous status; the temporary overlay is cleared when confirmed, or after a 15-second safety limit.
7. Existing permission rules remain: **only the assigned member** changes the status; **only the household creator** manages assignments and task details.
8. The backend now rejects invalid state jumps with HTTP 409 (for example To do directly to Completed). No Supabase schema migration is necessary.

## Installation

Extract this archive into the **same parent folder** as the current `HIC_Family_Centre` directory and replace only included files. Restart the FastAPI backend and the Vite frontend. Deploy **both** backend and frontend to Vercel because server-side status handling changed. Existing task records remain unchanged.

## Local validation

- `PYTHONPATH=$PWD:$PWD/backend:$PWD/backend/tests pytest -q backend/tests`
- `cd frontend && node --test tests/*.mjs`
- React JSX parse checked with TypeScript's JSX parser; CSS parsed using PostCSS.

## Manual verification

1. Sign in as a family member assigned to a **To do** task, select **Start task**. Confirm **Status: In progress**, and the new **Mark complete** action. Refresh and verify it stays In progress.
2. Select **Mark complete**. Confirm it switches to the **Completed** tab and shows **Status: Completed**. Refresh and confirm persistence.
3. If non-recurring, select **Reopen** and verify **Status: To do**. If recurring, check a **new** To do occurrence appears only after completion.
4. Sign in as a different member and confirm you cannot change a chore assigned to someone else.

No production browser / live Supabase save was executed during packaging. Review in your deployed environment after installation.
