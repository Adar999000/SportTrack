# Survey and Feedback copy (T30)

Source: `team/specs/beta-feedback.md` §1. Content owns the strings; frontend plugs them in with `t('<he>')`, the key being the Hebrew text exactly as written here.

Feminine form: every string below is written so the Hebrew reads the same for a man and a woman (no masculine-only second-person verb or noun). So `he-fem` equals `he`, and no `i18n-fem.ts` entry is needed. If frontend changes a string, check it for a masculine form before shipping.

Entries are in `src/i18n-en.ts` (21 new, plus "שליחה" which already existed with the value "Send").

## Day-3 and day-7 survey (user-facing)

| key (he) | he-fem | en |
|---|---|---|
| כמה קל היה להתחיל? | כמה קל היה להתחיל? | How easy was it to get started? |
| 1 = קשה, 5 = קל מאוד | 1 = קשה, 5 = קל מאוד | 1 = hard, 5 = very easy |
| מה הכי הפריע או בלבל? | מה הכי הפריע או בלבל? | What got in the way or confused you? |
| כמה האפליקציה עוזרת לך להתמיד? | כמה האפליקציה עוזרת לך להתמיד? | How much does the app help you stay consistent? |
| 1 = בכלל לא, 5 = מאוד | 1 = בכלל לא, 5 = מאוד | 1 = not at all, 5 = a lot |
| מה הדבר האחד שהיית רוצה שנוסיף או נתקן? | מה הדבר האחד שהיית רוצה שנוסיף או נתקן? | The one thing you'd add or fix? |
| שתי שאלות קצרות | שתי שאלות קצרות | Two quick questions |
| אפשר לחזור אליי | אפשר לחזור אליי | You can contact me |
| לא עכשיו | לא עכשיו | Not now |
| ✕ לא להציג שוב | ✕ לא להציג שוב | ✕ Don't show again |
| תודה! זה עוזר לנו | תודה! זה עוזר לנו | Thanks! This helps us |
| שליחה (existing) | שליחה | Send |
| עד 500 תווים | עד 500 תווים | Up to 500 characters |

## Admin Feedback card

| key (he) | he-fem | en |
|---|---|---|
| משוב | משוב | Feedback |
| משוב יום 3 | משוב יום 3 | Feedback day 3 |
| משוב יום 7 | משוב יום 7 | Feedback day 7 |
| ממוצע | ממוצע | Average |
| מספר תשובות | מספר תשובות | Answers |
| התפלגות | התפלגות | Distribution |
| תשובות טקסט אחרונות | תשובות טקסט אחרונות | Latest text answers |
| רוצה מענה | רוצה מענה | Wants a reply |
| פחות מ-5 תשובות: מוצגים הציונים הגולמיים במקום ממוצע | פחות מ-5 תשובות: מוצגים הציונים הגולמיים במקום ממוצע | Fewer than 5 answers: raw scores shown instead of the average |

## Notes for frontend
- Scale: five labelled buttons in a `role="radiogroup"` (labels: the two end labels above, numbers 1–5 visible).
- The reply message subject `משוב יום 3` / `משוב יום 7` is server-side; the admin sees the English labels above only in the admin UI.
- "אפשר לחזור אליי" appears only when text is entered (spec §1.1).
