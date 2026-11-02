# Haven Home — Collapsible Kanban Progress Board

## Scope
A frontend-only addition to Household Tasks & Chores. This patch builds on the November 2, 2026 **Two-Step Task Status Fix** and is intended for the working Haven Home prototype after that patch.

## Files in this package
- `frontend/src/HouseholdTasks.jsx` (modified from the Two-Step Task Status Fix release)
- `frontend/src/ChoreKanbanBoard.jsx` (new)
- `frontend/src/ChoreKanbanBoard.css` (new)
- `frontend/src/choreKanbanUtils.js` (new)
- `frontend/tests/chore-kanban.test.mjs` (new regression tests)

## Design and behavior
- The Kanban Progress Board is inserted **below** the existing paginated chore list and **above** the existing permission guidance.
- Collapsed by default; a single Show board / Hide board control expands or collapses it.
- Three stage columns: **To do**, **In progress**, and **Completed**.
- Cards show title, priority, overdue indicator, assignee avatar/name, due date and recurrence.
- Stage counts and the completion percentage derive from the same task array already loaded for the existing chore list. No additional network requests, backend endpoints, Supabase tables or migrations.
- The board reflects **My tasks / All household** and the current search, priority and assignee filters. It deliberately ignores the task list's selected status tab and pagination so all progress stages remain visible at once.
- Each column initially shows up to six cards and provides Show all / Show fewer when necessary; no extra nested vertical scroll areas are introduced.
- Status actions call the existing `changeStatus` function; the same assignee authorization applies. Start task moves `pending -> in_progress`, Mark complete moves `in_progress -> completed`, and only completed non-recurring chores can be reopened.
- No drag and drop; this avoids bypassing established permission and lifecycle checks.
- Responsive three-column desktop / single-column mobile design. Supports Light, Dark and Haven Luxe (Luxe translucent glass styling).

## Install
1. Back up the existing project.
2. Ensure the **Haven_Home_Tasks_Chores_Two_Step_Status_Fix_Changed_Files.zip** patch is already installed.
3. Copy these files into your existing `HIC_Family_Centre` folder, preserving paths.
4. Restart the Vite frontend or run `npm run dev` in `frontend`.
5. Verify the new section below the chore list, including both statuses and household member permissions.
6. For live deployment, redeploy the **Vercel frontend only**. No backend or Supabase changes are required for the Kanban feature itself.

## Verification
- Existing and new frontend regression tests: `node --test tests/*.mjs` (16/16 passed using the baseline plus the previous Two-Step Task Status Fix).
- JSX parsing: pass for the modified and new React components.
- CSS parsing: pass for the relevant stylesheets.
- A full production Vite build and device-browser verification were not run in this environment because the available Windows dependency archive lacks the required Linux-native Rollup and esbuild packages.

## Manual smoke test
- Open Tasks & Chores > Show board. Verify stage counts match the source task statuses.
- Choose All household; all household chores should display by stage.
- Start a chore assigned to your account. It should leave To do and appear in In progress after the server confirms success.
- Mark that chore complete. It should move to Completed.
- As a different member, confirm there is no status button for chores assigned to another family member.
- Refresh and reopen the board; task statuses should still match the saved records.
- Check Light, Dark, Haven Luxe, and a narrow phone viewport.
