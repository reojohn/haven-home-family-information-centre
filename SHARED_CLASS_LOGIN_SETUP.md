# Haven Home: Shared Classroom Sign-in

This optional login-page feature fills the existing **Sign in** email and password fields automatically for visitors, including on new devices. It does not create new accounts or change the FastAPI backend, Supabase database, or any access permissions. Visitors still sign in normally by clicking **Continue to Haven**.

## Deploy to Vercel

1. Apply the updated `frontend/src/main.jsx` and `frontend/src/premium.css` and add `frontend/.env.example` to your local project.
2. In Git Bash, run `git add frontend/src/main.jsx frontend/src/premium.css frontend/.env.example SHARED_CLASS_LOGIN_SETUP.md`, review `git diff --cached`, then commit and push to your existing GitHub repository.
3. In Vercel, open **havenhome-web1** (your frontend project), then **Settings → Environment Variables**.
4. Add **`VITE_SHARED_LOGIN_EMAIL`** with the email of the account you have chosen to share.
5. Add **`VITE_SHARED_LOGIN_PASSWORD`** with that account's password. **Do not send this value in a screenshot or commit it to GitHub.**
6. Apply to **Production** (and optionally Preview if desired), save, and **redeploy the frontend** so Vite rebuilds with the values. Environment variable changes do not retroactively modify an existing deployed bundle.
7. Open the public frontend in a fresh/incognito browser. The two fields should be filled, with the password *masked by default*. Press **Show** if you want to see the password or **Restore details** if you change the inputs accidentally. Press **Continue to Haven** to sign in.

## Local development (optional)

You can set the same keys in `frontend/.env.local` and restart Vite. `.env.local` is ignored by the existing `.gitignore`. Keep it on your own computer only. Do **not** place a real password in `frontend/.env.example`.

## Security and important behavioral notes

- **Vite `VITE_` variables are public.** Even when you set them through Vercel's Environment Variables UI, a visitor can inspect the shipped JavaScript bundle and extract the password. This is **not a secret**, and anyone with the link can authenticate to that account.
- Prefer a **dedicated demo account** and a demo-only household without sensitive personal information. If you choose to expose your existing main account, everyone can view/change/delete records permitted to that account. In addition, all classmates appear to the app as **one member**; assigned-member chores and audit activity won't distinguish between classmates.
- Do not reuse a personal, email, or other website password for this shared account. Rotate the shared password or remove both frontend environment variables when the classroom demo ends, then redeploy.
- Switching the tabs to **Create household** / **Join family** clears the public shared password from those forms; switching back to **Sign in** restores it.
- If no two environment variables are set, the login screen behaves exactly as it did before the patch.
- This feature only changes the login screen. Your backend API, existing user records, and Supabase tables are untouched.
