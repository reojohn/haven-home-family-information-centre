# Haven Home - IT114 Task 7 Prototype Revisions

**Baseline:** `HIC_Family_Centre(20261102-005333).zip`  
**Scope:** Task 5 findings P1-P5, prioritized in Task 6.  
**Status:** Implemented and source-tested. Live UI verification / screenshots remain to be completed.

## Installation

1. Back up your currently working project and database. Do not replace your project with an older full ZIP.
2. Extract `Haven_Home_Task7_Changed_Files.zip` into the folder **containing** `HIC_Family_Centre`, keeping its folder structure. Replace matching files only.
3. Restart the FastAPI backend and Vite frontend. When deploying, redeploy **both** Vercel projects, because editing APIs were added to FastAPI.
4. **No Supabase SQL migration is required.** The update adds API routes, not database columns.
5. Verify the six scenarios below before using the changes as submission evidence.

## Changes implemented

| Issue | Priority | Actual modification |
| --- | --- | --- |
| P1 - Saved records cannot be edited | High | Prefilled Edit controls for announcements, contacts and bills. `PATCH /api/announcements/{id}`, `/api/contacts/{id}`, and `/api/bills/{id}`. Changes are household-scoped. Editing bill details retains the existing paid/unpaid status and paid timestamp. |
| P2 - Selected calendar date resets | High | Main Family Calendar **Add reminder** link includes `?date={selected}`; reminder form already uses that parameter. |
| P4 - Unclear overdue-task counts | Medium | Overdue subtitle explicitly reads **Included in To do / In progress**. |
| P3 - Nested list scrolling and pagination | Medium | Paginated chores, announcements and contacts show their current page without a second vertical scroll. Bills retain horizontal overflow on smaller screens without a vertical internal scroller. |
| P5 - Creator indistinguishable from member | Low | Sidebar profile displays **Household creator** or **Household member** according to the authenticated user's `is_household_owner` flag. |

## Manual verification checklist (required on real running prototype)

- [ ] **P1 - Edit a paid bill:** Open a paid bill, change title/amount/due date/notes, save, reload. Payment status remains Paid.
- [ ] **P1 - Edit records:** Edit a contact's valid telephone number, and edit an announcement. Verify changed values after reload.
- [ ] **P1 - Security:** Test using a different household. An account cannot edit records belonging to another household.
- [ ] **P2:** On the Family Calendar, select a date other than today, then press the *primary* Add reminder button. Verify the prefilled date matches the selection.
- [ ] **P3:** Confirm all current-page chores/contacts/announcements display with ordinary page scrolling; bills still scroll horizontally if too wide on mobile.
- [ ] **P4:** Confirm the Overdue card explains its relationship to To do / In progress.
- [ ] **P5:** Confirm the creator profile and non-creator profile show different role labels.
- [ ] **Regression:** Test family chat, household member removal, device status, dashboard Sunhours, digital clock, and Light/Dark/Haven Luxe modes.

## Automated checks performed in the working environment

- **41 backend tests passed**, including 3 new Task 7 backend tests covering household isolation, editing and validation.
- **7 frontend tests passed**, including 3 new Task 7 source-regression tests.
- Changed JSX files passed TypeScript JSX parser checks; changed CSS parsed with PostCSS; Python compiled successfully.
- **Limitations:** Full production Vite build and live physical-device tests were not completed. The source archive contains Windows-only Rollup binaries, which cannot run a native Linux Vite build without reinstalling dependencies. No production Supabase records were modified.

## Submission guidance

The included `docs/Task7_Prototype_Revisions_Implementation_Record.pdf` documents the changes. For final Task 7 submission, take genuine before/after screenshots on the running prototype as required by your instructor, and use this record as your implementation summary. The PDF does not claim unperformed participant tests or invent screenshots.
