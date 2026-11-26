# Changelog

## 1.2.0 (2026-11-26)
- Password reset by email: "Forgot password" on the sign-in screen emails a 6-digit code (valid 15 minutes, 5 attempts, at most one email a minute). Needs the updated `apps-script/Code.gs` and the mail permission (run `setup` again).

## 1.1.0 (2026-11-26)
- Double-tap a table cell to write free text (e.g. "חופשה"). Text cells are ignored in V%.
- The "Smoked?" row is hidden by default and can be turned on in Settings.
- Fixed side navigation on wide screens (right in Hebrew, left in English), icon set and app logo.
- Quick light/dark toggle in the header.
- Hebrew and English UI (Settings → Language). The AI assistant answers in the chosen language.
- App version and an in-app "What's new" in Settings; a notice after updates.
- Service worker applies updates immediately.

## 1.0.0 (2026-11-25)
- Accounts with a Google Sheets / Drive backend (Apps Script), invite-only signup.
- Profile with photo and personal analysis, admin panel, weekly photo, AI assistant (OpenAI).
- Weekly table, history, statistics, Word/JSON import, JSON/CSV export, reminders, offline PWA.
