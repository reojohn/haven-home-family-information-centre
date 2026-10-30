# Haven Home — Two ways to run the same website

This update changes **how the website starts during development**. It does **not** modify React screens, FastAPI APIs, login/session logic, database tables, or household records. SQLite remains the database until you choose to migrate to Supabase later.

## Recommended: Development mode (live editing)

1. If Haven Home is already running at `127.0.0.1:8000`, **you may leave it running**. The new launcher detects an active Haven Home API and uses it. For **backend code hot reload**, stop the old production backend window first.
2. Double-click **`START_HIC_DEV_WINDOWS.bat`** in the `HIC_Family_Centre` folder.
3. This starts the FastAPI and React/Vite terminal windows as needed, waits for React to become available, and opens **http://127.0.0.1:5173**.
4. When you replace/edit `frontend/src/main.jsx`, `frontend/src/styles.css`, or `frontend/src/premium.css`, Vite automatically refreshes your browser. **Do not run the rebuild BAT for UI changes in development mode.**
5. Leave the FastAPI and Vite terminal windows open while using the site. To stop development mode, press `Ctrl+C` in the Vite window and (if you started FastAPI in development mode) `Ctrl+C` in the backend window.

**Use `127.0.0.1:5173`, not `localhost:5173`.** Haven Home authenticates using cookies and the backend was already accessed on `127.0.0.1`; keeping the hostname identical avoids cookie/login confusion. The app's `/api` requests are forwarded by Vite to the backend on port 8000. The same household database is used in both modes.

If Node/npm or Python dependencies aren't installed, run the **existing** `SETUP_WINDOWS.bat` once. The Vite helper can install missing npm dependencies automatically if internet is available.

## Normal / production-style local mode (optimized built React)

1. If development servers are running, stop them to avoid port 8000 conflicts.
2. When you want UI edits to appear at **http://127.0.0.1:8000**, run **`REBUILD_PREMIUM_UI_WINDOWS.bat`**. You need to rebuild only when the React/CSS source has changed since your last production build.
3. Double-click your original **`START_HIC_WINDOWS.bat`**, then use **http://127.0.0.1:8000**.

This mode serves prebuilt files from `frontend/dist/` through FastAPI. Editing React or CSS does **not** update port 8000 until you rebuild. Backend changes may need a FastAPI restart.

### Quick comparison

| Feature | Development mode | Normal mode |
|---|---|---|
| Open website | `http://127.0.0.1:5173` | `http://127.0.0.1:8000` |
| Start | `START_HIC_DEV_WINDOWS.bat` | `START_HIC_WINDOWS.bat` |
| React / CSS edits | Hot refresh automatically | Rebuild using `REBUILD_PREMIUM_UI_WINDOWS.bat` |
| Backend | FastAPI port 8000 with reload if launched by dev BAT | FastAPI port 8000 without reload |
| Database | Same existing household SQLite database | Same existing household SQLite database |
| Suitable for family use | Primarily developers / local testing | Normal local use once tested |

**Note:** Both modes are LOCALHOST modes, not an internet-ready production deployment. Hosting Haven Home for family access outside your own computer still needs a secure backend, HTTPS, authentication review, and Supabase/PostgreSQL migration as planned.

## Troubleshooting

- **UI still looks unchanged:** Check the address bar is `127.0.0.1:5173`, verify you updated files under `HIC_Family_Centre/frontend/src/`, then use `Ctrl+Shift+R` if needed. Do not edit `frontend/dist` directly.
- **API says unavailable:** Check FastAPI on http://127.0.0.1:8000/api/health, and read the backend terminal. Vite's terminal can run but still show an API error if FastAPI is down.
- **Port 8000 already in use:** The dev launcher normally reuses an existing Haven Home backend. Close unrelated apps on this port, or stop the old FastAPI window to enable backend auto-reload.
- **Port 5173 already in use:** The dev launcher reuses a running Vite page; otherwise, Vite reports the conflict and does not switch silently to a new port.
- **Changes to React or CSS accidentally break the UI:** Restore your backed-up original files; the backend/database are unaffected by this configuration update.
- **Run only one backend at a time** against the household database to avoid unintended concurrent development processes.

## Applied files

```text
HIC_Family_Centre/
├── START_HIC_DEV_WINDOWS.bat           (new)
├── RUN_HIC_DEV_BACKEND_WINDOWS.bat     (new)
├── RUN_HIC_DEV_FRONTEND_WINDOWS.bat    (new)
├── DEVELOPMENT_AND_PRODUCTION.md      (new)
└── frontend/
    ├── vite.config.js                 (modified)
    └── package.json                   (modified)
```

No backend/database files, and no existing React or CSS component files, were changed.
