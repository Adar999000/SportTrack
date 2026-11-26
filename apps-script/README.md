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

## Automatic updates (from v3.9)
After a one-time setup the server updates itself: every hour (and from Admin → Server → "Update now")
it downloads `Code.gs` and `appsscript.json` from this branch on GitHub, saves them into the project,
creates a version and points the **existing** deployment at it, so the URL never changes.

One-time setup:
1. Turn on **Google Apps Script API** at https://script.google.com/home/usersettings
2. In the editor: Project Settings → tick "Show appsscript.json manifest file in editor".
3. Paste `Code.gs` and `appsscript.json` from this folder, save.
4. Run `setup` once and approve the new permissions (manage projects/deployments; installs the hourly trigger).
5. Manage deployments → edit the existing deployment → New version → Deploy (last manual time).

Safety: a downloaded file is installed only if it looks complete (contains `doPost` and `selfUpdate`).
If an update ever breaks something, Manage deployments → edit → pick the previous version.
