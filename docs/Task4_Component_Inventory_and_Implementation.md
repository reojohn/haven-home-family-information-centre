# IT114 Final Laboratory Activity — Task 4
## Reusable Components and Interactive Prototype

**Project:** Home Information Centre (HIC), known in the interface as Haven Home  
**Methodology:** Iterative Prototyping Model  
**Iteration:** Prototype Version 1  
**System type:** Responsive interactive website with a real backend and persistent database

### 1. Alignment with Tasks 1–3

- Intended users: **Parent** (household activities and expenses), **Student** (schedule and announcements), **Older Household Member** (readable controls and simple navigation).
- Supported user tasks: view family schedule; add reminder; read announcements; review energy; review expenses; update a household bill's recorded status; find important contacts.
- Modules: Dashboard; Family Calendar; Household Information; Energy Information; Household Expenses; Settings & Accessibility.
- Navigational approach: Dashboard overview; persistent main navigation; active location indicator; back/cancel affordances for task and detail screens.

### 2. Screens implemented

| Screen | Purpose |
|---|---|
| Sign in / Create household / Join household | Authenticate and enter a private family space |
| Dashboard | Show today's household overview, reminders, bills, notices and energy summary |
| Family Calendar | Interactive month navigation, event list, selected day |
| Add Family Reminder | Form with date, time, category, description and save/cancel |
| Reminder Details | View/edit/delete reminder, return to Calendar/Dashboard |
| Household Information | Read/post/delete announcements; view/add/delete family contacts |
| Energy Information | Monthly consumption chart, records, new/update reading |
| Household Expenses | Overview, filter bills and add new bill |
| Bill Details | Inspect bill, mark as paid/unpaid with confirmation, delete |
| Settings and Accessibility | Light/dark themes, text sizes, member invite, sign-out, optional sample data |

### 3. Reusable component inventory

| Component | Purpose | Reusable consistency behavior |
|---|---|---|
| `AppShell` | Shared navigation, active module state, page header, account access | Sidebar and header remain stable across screens; nav active indicator reflects location |
| `Button` | Primary/secondary and destructive actions | Consistent labels, spacing, icons, keyboard focus and disabled/busy behavior |
| `IconButton` | Small controls (close, previous/next month, remove item) | Every icon-only control has an accessible text label |
| `Panel` | Group related information in cards | Same title/subtitle hierarchy, spacing and border style |
| `StatCard` | Present key household metrics | Same icon-and-number hierarchy and readable supporting text |
| `Field` | Form inputs, selectors, dates, text areas | Always includes a visible field label; consistent focus and input layout |
| `Pill` | Indicate status, category and sample data | Standardized readable labels and status colors (not color alone) |
| `Modal` | Confirmation dialogs and simple create forms | Common overlay, close button, Escape support and Cancel actions |
| `Empty` | Explain pages without data | Standardized helpful message and optional task action |
| `Toast` | Provide system action feedback | Clear success or failure message after important mutations |

### 4. Two complete user workflows

**Workflow A: Add a family reminder**  
Dashboard → Family Calendar → Add reminder → Enter valid title/date/time → Save reminder → Success toast → Reminder details → Calendar and Dashboard reflect new upcoming event.  
**Pass condition:** Data persists after refresh; household members can see it; validation rejects invalid dates, missing titles, and invalid times. **Cancel** and **Back** do not create records.

**Workflow B: Update household bill**  
Dashboard → Household Expenses → Bill Details → Mark as paid → Confirm update → Success toast and changed status → Unpaid summary automatically updates.  
**Pass condition:** Server stores updated status, reflected after browser refresh and for other household members. Cancel leaves the record unchanged. This does not initiate a real payment.

### 5. Interaction and usability requirements

- Working navigation: all six modules, detail pages, forms, and return paths.
- Clear labels: descriptive page headers, buttons and explicitly labeled form inputs.
- Feedback: success and error toasts; empty states; confirmation dialogs for payment-status change and deletions.
- Consistent controls: shared UI components and a common page layout.
- Recovery: Back links, Cancel buttons, reversible paid/unpaid status, Escape to close dialogs.
- Accessibility: adjustable text size, two themes, keyboard focus outlines, controls with names, responsive sidebar and mobile view.

### 6. Alternative interaction considered

**Proposed future alternative:** Voice command such as **“Show today's schedule.”**  
**Supported task:** Open the Family Calendar or today's scheduled events.  
**Benefit:** Hands-free, potentially easier for household members with limited mobility.  
**Limitation:** Voice recognition can be inaccurate with noise, local language varieties and poor microphones; microphone permissions may be unwanted. **No voice recognition is enabled in Version 1.**  
**Non-voice equivalent:** Select the Family Calendar link in the navigation, or use the Dashboard's upcoming schedule section. These options do not require speech, a microphone, or internet-based speech processing.

### 7. Backend and data notes

- Account authentication and household sharing use cookie-based sessions and a shared household invite code.
- The API stores records in SQLite by default; PostgreSQL is supported using an environment variable.
- All queries and mutations are scoped to a household ID; individual appearance settings are scoped to the user ID.
- Sample records are optional, tagged and removable, rather than being mixed into new families' real data by default.
- No external financial or electricity system is connected. Recorded bill status is not an actual transaction.

### 8. Evaluation status

Prototype Version 1 is the **starting point** for Task 5 (Heuristic Evaluation), not the final evaluated design. Backend regression tests exercise the two complete workflows and cross-household isolation. The frontend source has passed a JSX syntax parse check, but an end-to-end browser session and real-user evaluation are still required. No heuristic problems or user-testing results should be claimed until actual independent evaluations occur.
