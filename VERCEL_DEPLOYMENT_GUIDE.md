# Haven Home: Vercel Deployment Guide

This repository contains **two Vercel projects** sharing one GitHub repository:

| Project | Root Directory | Preset | Output |
| --- | --- | --- | --- |
| Haven Home API | `backend` | FastAPI / Python | Vercel Function |
| Haven Home Web | `frontend` | Vite | `dist` |

**Create the backend project first.** The frontend project needs the backend production URL.

## 1. Push the complete safe project to GitHub (Git Bash)

The public GitHub URL appeared **empty** when this guide was prepared. If your project has not been pushed yet, run from inside your existing local `HIC_Family_Centre` folder (after extracting this patch into it):

```bash
cd "/c/Users/REO JOHN/OneDrive/Desktop/it 114/Home Information Centre (HIC)/HIC_Family_Centre"
git init
git branch -M main
git remote -v
# Add the origin only if 'git remote -v' does not already show it:
git remote add origin https://github.com/reojohn/haven-home-family-information-centre.git
git add .
git status --short
git diff --cached --name-only
git commit -m "Prepare Haven Home frontend and backend for Vercel"
git push -u origin main
```

**Do not run `git remote add origin` if it already exists.** Do not commit or push until you have reviewed the staged file list. Stop if it shows `.env`, `.env.supabase`, secret keys, `.venv`, `node_modules`, databases, or private household data. The included `.gitignore` excludes known private demo SQL and CSV exports. If you have already pushed the complete project, run only `git add .`, review, commit and push the deployment changes. Never use `git push --force` to resolve an unexpected rejection.

## 2. Deploy the backend (first)

1. Visit https://vercel.com/new and connect `reojohn/haven-home-family-information-centre`.
2. Name this Vercel project something like `haven-home-api` (the exact public URL will be assigned by Vercel).
3. Set **Root Directory** to `backend`.
4. Use **FastAPI** preset if detected. No custom build command or output directory is needed.
5. In **Environment Variables**, add for **Production**:
   - `DATABASE_URL`: the existing Supabase PostgreSQL pooler URL (`sslmode=require`). Copy only the *value* from your private server config; never publish it.
   - `COOKIE_SECURE`: `1`
6. Deploy. Confirm `https://<your-actual-api-domain>/api/health` returns JSON (usually `{"ok":true}` or a similar health response).
7. If a new table or RLS change is required by the application, apply it through your authorized database migration process. The current app still runs its pre-existing schema initialization at startup.

**Security:** The database URL is a server-side secret. Do not put it in any `VITE_` variable or commit it to GitHub. For Vercel, you MUST configure `DATABASE_URL`; no local SQLite fallback is used.

## 3. Deploy the frontend (second)

1. In Vercel, select **Add New > Project**, import the **same GitHub repository again**.
2. Name this project `haven-home-web` (or any available name).
3. Set **Root Directory** to `frontend` and **Framework Preset** to `Vite`.
4. Leave the default Vite settings: **Build Command** `npm run build`, **Output Directory** `dist`.
5. In **Environment Variables**, add for **Production**:
   - `HAVEN_API_ORIGIN`: `https://<actual-backend-domain>.vercel.app` **without `/api` and without a trailing slash**.
6. Deploy and open the frontend's assigned URL. Test `/api/health` from the FRONTEND domain as well.

`frontend/vercel.mjs` forwards `/api/*` on the frontend domain to the backend and sends all other client-side routes to `/index.html`. It intentionally requires `HAVEN_API_ORIGIN` so deployments cannot silently route API calls into the React app.

**Do not use `VITE_API_URL` or change frontend `fetch('/api/...')` calls.** They already use same-origin cookies. Setting `CORS_ORIGINS` is not necessary for this frontend-through-rewrite architecture.

## 4. Test the deployed system

1. Visit `https://<frontend-domain>/api/health` and confirm the backend JSON response.
2. Open the **frontend** home page, create or sign into a test account, and refresh.
3. Verify Dashboard, Calendar, Household Information, Expenses, Chores, and Settings.
4. Test an Add/Edit or status change, then reload; it should persist to the existing Supabase DB.
5. Test an avatar photo and login/logout, and load `/dashboard` directly in a fresh tab.
6. Verify all three themes and mobile navigation.

## Troubleshooting

- **Build fails: missing HAVEN_API_ORIGIN:** Set it on the *frontend* project and redeploy. Do not put the backend's `/api` path in the value.
- **Frontend `/api/health` returns HTML:** The API rewrite did not apply. Confirm `frontend` is the Root Directory and `frontend/vercel.mjs` is committed; rebuild after setting `HAVEN_API_ORIGIN`.
- **API returns 500 or cold starts time out:** Review the backend Vercel Function logs. Confirm `DATABASE_URL` is correct and Supabase allows the connection. Verify the database tables exist and that startup schema/RLS operations are permitted.
- **Login/session fails after refresh:** Check frontend origin `/api/*` rewrites, `COOKIE_SECURE=1` and the browser's `hic_session` cookie. Never change to cross-origin `fetch` without redesigning cookie authentication.
- **404 when opening `/calendar` or `/dashboard`:** Ensure the SPA catch-all rewrite is deployed.
- **Your login/API works locally but not on Vercel:** Vite's development `server.proxy` operates only locally. The production proxy is `frontend/vercel.mjs`.
- **Changing Vercel environment variables:** Redeploy after updating values.

## Serverless considerations

Vercel FastAPI is request-driven serverless compute. It is not a permanently running Uvicorn host. The existing project stores user content (including compressed profile photos) in PostgreSQL and requires that persistent hosted database. Vercel functions have execution timeouts and a 4.5 MB HTTP payload limit. The original photo selected in the browser can be up to 10 MB because the frontend crops/compresses it before upload; the **actual final request body** still has to fit under 4.5 MB. Test large uploads, and use object storage/direct uploads if future features require larger request bodies. For request latency, prefer a Vercel region near the Supabase database's region.

Vercel documentation:
- https://vercel.com/docs/frameworks/backend/fastapi
- https://vercel.com/docs/frameworks/frontend/vite
- https://vercel.com/docs/monorepos
- https://vercel.com/docs/project-configuration/vercel-ts
- https://vercel.com/docs/functions/limitations
