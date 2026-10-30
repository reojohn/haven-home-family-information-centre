# Haven Home: Hardcoded classroom sign-in

**Public credential warning:** This build hardcodes the account email and password directly in `frontend/src/main.jsx`. Both values are visible to anyone using the deployed site and to everyone who views the GitHub repository. The browser automatically fills the Sign In form for this account. Anyone using the site can potentially read, modify, or delete household data according to that account's permissions. **Use a dedicated demonstration account and non-private data only.** If the account credentials have ever been used for email or another service, change those passwords immediately.

## Apply

1. Back up your frontend `src/main.jsx` and `src/premium.css`.
2. Extract this ZIP to the existing project directory (keep the `HIC_Family_Centre/` folder structure). Replace `main.jsx` and `premium.css`.
3. The previous `VITE_SHARED_LOGIN_EMAIL` and `VITE_SHARED_LOGIN_PASSWORD` Vercel environment variables are **no longer needed**. You can remove them from Vercel (the app ignores them).
4. Before pushing, run `git diff -- frontend/src/main.jsx` and inspect the changes. Remember that committing adds the plaintext password to your repository history. Removing it later does **not** reliably erase it from Git history.
5. If you accept that exposure, in Git Bash run:
   ```bash
   git add frontend/src/main.jsx frontend/src/premium.css HARDCODED_SHARED_LOGIN_SETUP.md
   git commit -m "Add public classroom demo login prefill"
   git push origin main
   ```
6. Vercel should redeploy your frontend project (`havenhome-web1`) after the GitHub push. If it does not, manually redeploy the frontend. Your backend project requires no changes.
7. Test the live site in a fresh Incognito window, choose Sign In, and confirm that the fields are populated. Click **Continue to Haven** to verify normal authentication.

## Behavior

- Sign In initializes with the hardcoded values and provides **Restore details** if modified.
- Password remains masked until the visitor chooses Show.
- Switching to Create Household or Join Family clears these shared credentials so the password is not reused in those forms.
- Authentication, Supabase records, and member task permissions remain untouched.
- The hardcoded password is **not protected** by masking or by GitHub being private, because the frontend sends it to every browser.
- After the classroom demo, rotate the password, remove the hardcoded values, and publish a new frontend build.
