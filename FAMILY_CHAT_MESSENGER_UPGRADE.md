# Haven Home — Family Chat Messenger Upgrade

This patch **upgrades the existing, working private Family Chat**. It keeps all current messages, member profiles, login sessions, previous features, and household-isolation rules.

## Setup — in this order

1. Back up your **Supabase PostgreSQL database** and current HIC project. Apply the files from this changed-files ZIP to their matching original paths.
2. In your existing Supabase project, run `backend/sql/UPGRADE_FAMILY_CHAT_MESSENGER_FEATURES.sql` in **SQL Editor**. It adds three nullable fields to `family_chat_messages` and creates `family_chat_reactions`, `family_chat_changes`, and `family_chat_presence`. **It does not delete existing messages.** The earlier `CREATE_PRIVATE_FAMILY_CHAT_SUPABASE.sql` must have been applied for the original chat already.
3. Deploy/restart the **FastAPI backend** with the new `chat.py`, `models.py`, and `main.py`, then deploy/restart the **React frontend** with the new `FamilyChat.jsx` and `FamilyChat.css`. If deployed separately, perform the SQL migration before updating backend code.
4. In two different browsers or devices, log into *different accounts in the same household* and open **Vinsmoke Family → Family Chat**. Test reactions ❤️ 😂 👍, reply, edit own message, unsend own message, active member indicators, read receipts, and Today/Yesterday separators.
5. Test a separate household and verify it cannot view or modify the first household's chat. Test removing a member, and verify they can no longer access the chat.

## Feature behavior

- Reactions: **one choice per member per message**; clicking the same emoji again removes it. Only ❤️ 😂 👍 are accepted server-side.
- Replies: quote a message in a new message; quoted previews follow edits and unsends. You cannot start a new reply to an already-unsent message.
- Edit/Unsend: authors can edit or unsend **their own messages only**. Unsend hides message content permanently, removes its reactions, and shows a shared **Message unsent** placeholder; this is not recoverable from the chat UI. Other family members cannot perform these actions.
- Online: displays members **active in Family Chat** (not everyone signed into Haven Home) within approximately **55 seconds** of their latest authenticated presence heartbeat. This is best-effort presence, not proof of continuous availability or a guarantee of instant offline indicators.
- Read receipts: uses each family member's existing last-viewed message cursor; “Seen by” means the recipient had Family Chat open while the message was marked read. This is not a device-delivery guarantee. Removed members do not appear in current receipts.
- Date headings: Today, Yesterday, otherwise full dates based on **Asia/Manila**.
- Accessibility: message controls are keyboard-focusable, available via a visible actions button on touch screens, and can also be opened with a long press.

## Live delivery and hosting

On a persistent WebSocket-capable FastAPI server, new messages and mutations are delivered through the server's `/api/chat/live` stream. The cross-worker change log lets different backend processes observe changes. Typing notices use best-effort connections in the same process.

**Vercel Serverless does not provide persistent WebSocket connections for the existing setup**. Automatic authenticated HTTP sync continues about every 3.5 seconds while the chat panel is open. This means reaction/edit/unsend updates still arrive, but not necessarily instantly. When two browsers connect through a WebSocket-capable backend, updates are faster. The WebSocket connection automatically reconnects after interruptions.

## Security, maintenance and caveats

- All reads/mutations rely on the existing authenticated FastAPI session, and must pass household authorization. `Origin` is verified on WebSockets. No Supabase anon/authenticated role is granted direct table access by the migration.
- If a household owner removes a member, their reaction and online-presence records are deleted with the account. Existing messages stay with the saved sender name, and current read-receipt membership is recalculated.
- The new change log grows as people communicate; use a trusted database-owner maintenance process to prune old change rows **only after clients have had a chance to sync**. Message history is not stored in this log and must not be pruned accidentally.
- Existing local SQLite installations auto-add the three nullable columns at FastAPI startup; PostgreSQL requires the SQL migration above.
- For real private family conversations, remove demonstration credentials hardcoded in older frontend versions and rotate those passwords before public deployment.
- The full Vite production bundle and a live Supabase integration test are best checked in your own Windows/production environment after installation.
