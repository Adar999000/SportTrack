# Handoff: content

## Done
- T6 copy review (branch `team/content`):
  - `src/i18n-en.ts`: 13 English values fixed for wording and consistency only (Hebrew keys unchanged). Examples: "Two-step verification turned on/off" (was "Two-step turned on/off"), "Do I need to download it from an app store?", "Yesterday", "Fasting" (was "Fast"), "Dismiss reports" (was "Keep and clear reports"), "Are you sure?" (was "Sure?"), "Beta" tag, "colors" (US spelling, as elsewhere), " counts as a workout" lowercase suffix, "In the store".
  - `src/i18n-fem.ts`: 54 feminine entries added for masculine address without a "/" form (imperatives such as "מחקי", "הסירי", "הצטרפי", "פרסמי", "צרי אתגר", "שחררי את היום", "הזיזי למעלה", plus "אני באה", "אלופה השכונה", "הוזמנה אותך" in the invite note, "כבר רשומה?"). Imperatives addressed to a user are feminized; third-person text about another user is left alone (e.g., the landing mock "העלה סטורי" and "הקש שוב: כל הנתונים שלו").
  - `docs/help.md`: Hebrew help center with sections for getting started, Today, workouts & GPS, stories & community, challenges & leagues, music, privacy & blocking, backup, and settings & accessibility. Every claim was checked against UI strings or server code (e.g., 3 reports hide content, invite coins 50 each, backups folder, 5 active challenges).
- Checks: `npx tsc --noEmit` clean, `npx vitest run` 94/94, `node scripts/i18n-keys.mjs --missing` prints `[]`.

## In progress
- Nothing.

## Requests to other agents
- frontend: `src/ui/authView.ts` / settings: the Hebrew key "כובה אימות דו-שלבי" is a typo for "כבוי" (value is correct in English). Fixing the key needs a matching key change in both i18n files; left as is.
- frontend: landing level names (`src/ui/landingView.ts`: מתחיל, ממושמע, אלוף השכונה) are shown to visitors only, so no feminine forms were added. If the same names appear for signed-in users, add FEM entries.
- backend/frontend: the password-length message is inconsistent in Hebrew ("לפחות 6 תווים" vs "8 תווים לפחות" elsewhere). Product decision needed; see chief notes.

## Notes for the chief
- Open question: "חד\"כ" is translated as "Functional training". If it means "gym" in the app's sport list, the English should change. Please confirm with the owner.
- "הפעל" (value "Use") and "הפעלה" (value "Play") are ambiguous out of context; kept as is.
- Lowercase English values are intentional where they are used mid-sentence or as units ("cleared", "empty", "locked", "hours", "steps", "glasses", "workouts", "runs", "meals", "days", "posted a story: 8.1 km" after a name). Do not capitalize them.
- The Hebrew key "שפה / Language" keeps its bilingual value on purpose.
- Feminine forms only apply when the user picked "אישה" in the profile. Some admin-only strings (e.g., "שאל את העוזר...", "אשר", "עדכני את השרת") got feminine forms too; harmless for admins of any gender.

## T16 (quest and onboarding copy)
- Merged `origin/claude/personal-discipline-pwa-13qhdk` into `team/content` first.
- Only one new Hebrew key came in with the merge ("התאמה"), already covered. The T8–T12 and T14 strings are not in the code yet, so there was nothing new to translate.
- Added EN entries (not yet used in code, so the missing check is unaffected):
  - "מטבעות קונים סקינים, צבעים ודמויות בחנות" → "Coins buy skins, colors and characters in the store" (6 Hebrew words, F14 coin line; put it under the quest claim button in `src/ui/questCard.ts`).
  - "ארוחות + ספורט ביום אחד" → "Meals + sport in one day" (F12 proposed label for step 4).
- Quest step labels that are in code (infinitives, neutral, no feminine form needed): "לסמן ארוחה ראשונה", "להזין משקל התחלתי", "לסמן אימון ראשון", "לסגור יום מלא".
- Request to frontend (owns `src/ui/questCard.ts`): add the coin line under the claim button, and use the step-4 label above if F12 is applied.

## Chief answers applied (6.3.0 merge)
- "חד"כ" → "Gym" (chief confirmed; already in the merged file).
- Password minimum is 8 (MIN_PASSWORD). EN values for the 6-character keys now read "8 characters". Those Hebrew keys are no longer used in code; only the English values changed.
- "כובה אימות דו-שלבי" keeps its key; the English value reads "Two-step verification turned off".
