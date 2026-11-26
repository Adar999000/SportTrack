# Backend: Google Apps Script

`Code.gs` is the server for accounts, sync, photos, the admin panel and the AI assistant.
It stores everything in the owner's Google Drive:

- Spreadsheet **משמעת אישית - נתונים** (tabs `Users`, `Weeks`, `Invites`)
- Folder **משמעת אישית / תמונות** for profile and weekly photos

The spreadsheet and folder IDs are set at the top of `Code.gs`.

## Deploy (one time, on a computer)

1. Open the spreadsheet → **Extensions → Apps Script**.
2. Delete the sample code, paste all of `Code.gs`, and save.
3. Choose the `setup` function in the toolbar → **Run** → allow the permissions.
   It asks for Sheets, Drive and external requests.
4. **Project Settings (gear) → Script properties → Add**:
   - `OPENAI_API_KEY` = your OpenAI key (for the assistant)
   - optional: `OPENAI_MODEL` (default `gpt-4o-mini`), `CHAT_DAILY_LIMIT` (default 20 per user per day), `CHAT_GLOBAL_DAILY_LIMIT` (default 150 per day for everyone), `CHAT_MAX_REPLY_TOKENS` (default 350)
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the **Web app URL** (`https://script.google.com/macros/s/…/exec`) into `src/config.ts`, or set it as `VITE_API_URL`.

After changing `Code.gs`: **Deploy → Manage deployments → edit → Version: New version**. This keeps the same URL.

The first account to register becomes the admin. Everyone else needs an invite code from the admin panel.

## Security notes

- Passwords are salted and hashed (iterated SHA-256). Sessions are HMAC-signed tokens; the secret is generated on first run and stored in script properties.
- Users can read only their own data and photos. Admins can read everyone's.
- The OpenAI key stays in script properties and never reaches the browser.

## Testing locally

`tests/gas/mock.mjs` runs the real `Code.gs` against in-memory Sheets and Drive:

```bash
npm test                          # includes tests/backend.test.ts
node scripts/mock-server.mjs      # local API on :8787
VITE_API_URL=http://localhost:8787 npm run dev
```

## Automatic updates (from v4.1)
`Code.gs` is a small **loader** and is the only file pasted into Apps Script. The real server code is
`server.js` in this folder: the loader fetches it from GitHub, caches it for 10 minutes, keeps the last
working copy in Drive (`server-last-good.js` in the app folder) and runs it. Pushing to GitHub updates
the server within 10 minutes, with no paste and no redeploy. Admin → Server → "Update now" fetches at once.

One-time setup (replaces any older copy of the code):
1. Paste `Code.gs` (the loader) and `appsscript.json` from this folder into the project, save.
2. Run `setup` once and approve the permissions.
3. Manage deployments → edit the existing deployment → New version → Deploy (the last manual deploy).

Safety: new code is used only if it compiles and looks complete; otherwise the last good copy keeps running.
Whoever can push to this branch can change the server code (same as the web app itself).
A change to `appsscript.json` (new permissions) or to `Code.gs` itself still needs a manual paste.
