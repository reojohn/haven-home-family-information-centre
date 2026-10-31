# Haven Home — Private Family Chat setup

This patch adds a **Members / Family Chat** tab to the existing household drawer. Messages are persisted in PostgreSQL/SQLite and are isolated by the current authenticated user's household. There is no direct client-side Supabase access.

## Setup

1. **Back up** your production Supabase database.
2. Open Supabase **SQL Editor** and execute `backend/sql/CREATE_PRIVATE_FAMILY_CHAT_SUPABASE.sql` once. This creates `family_chat_messages` and `family_chat_reads`, enables RLS, and denies direct access to browser-facing Supabase roles. The backend's startup `create_all()` also creates tables when the database role has permission, but the explicit SQL is more reliable for hosted deployments.
3. Copy the patch files into `HIC_Family_Centre` and restart **FastAPI** and **Vite**. For local development, the Vite proxy is updated to support WebSocket upgrades. No new Python or npm dependency is required.
4. Sign in with two different family accounts in different browsers. Open **Vinsmoke Family → Family Chat** in both and send a message. Test unread counts and chat history after refresh. Also test a second household; it must not see the first household's messages.
5. If deploying, publish **both** the backend and frontend changes. Never publish `.env` files or hardcoded demo passwords.

## Live transport and hosting limitations

- On a persistent, WebSocket-capable FastAPI server, messages are delivered via `/api/chat/live` within about 1–2 seconds. It re-validates the cookie session repeatedly; messages are stored in the database, so WebSocket notifications work across processes.
- **The current Vercel Serverless backend does not provide persistent WebSocket connections.** The client automatically falls back to authenticated HTTP sync approximately every 3.5 seconds while the chat is open. This is near-real-time rather than instantaneous and typing indicators are available only when a WebSocket is connected. For low-latency Messenger-style delivery on production, host FastAPI on a persistent WebSocket-capable service (or implement a separate authenticated Supabase Realtime bridge).
- Unread counts while the chat is closed refresh roughly every 45 seconds in visible browser tabs. Historical messages are loaded in pages of 50.
- Chat is text-only for this release (max 2,000 characters). It supports basic delivery status and retry, but **does not yet implement image attachments, push notifications, read-by-member receipts, or cross-process typing presence**.
- When an owner removes a member, their live session is revoked; messages stay with their saved display name, but the removed user ID and read cursor are cleared. A removed user cannot request any chat data.

## Security

The frontend uses the existing HTTP-only `hic_session` cookie; private messages are not stored in browser local storage. The API validates household membership for every query and every send. WebSockets validate `Origin` and revalidate sessions. The Supabase SQL creates no policies granting browser roles direct access. Add your production frontend origin to backend `CORS_ORIGINS` if you use a separate WebSocket-accessible backend origin. The WebSocket endpoint deliberately accepts cookies, not tokens in URLs.

**Important:** Previous source versions contained a publicly hardcoded demonstration email/password in `frontend/src/main.jsx`. Remove those values and rotate the account password before enabling any private chat for actual household communications.
