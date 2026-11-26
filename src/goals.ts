/** What people want from the app. Picked in onboarding (multi-select) and editable under Me. */
export const GOALS: { id: string; emoji: string; label: string }[] = [
  { id: 'lose', emoji: '⚖️', label: 'לרדת במשקל' },
  { id: 'muscle', emoji: '💪', label: 'לבנות שריר' },
  { id: 'fit', emoji: '🏃', label: 'לשפר כושר' },
  { id: 'eat', emoji: '🥗', label: 'לאכול מסודר' },
  { id: 'habit', emoji: '📅', label: 'להתמיד בשגרה' },
  { id: 'smoke', emoji: '🚭', label: 'להפסיק לעשן' },
  { id: 'sleep', emoji: '😴', label: 'לישון טוב יותר' },
  { id: 'race', emoji: '🏅', label: 'להתכונן לתחרות' },
  { id: 'stress', emoji: '🧘', label: 'פחות סטרס' },
  { id: 'friends', emoji: '👯', label: 'להתאמן עם חברים' },
];
export const GOAL_IDS = GOALS.map((g) => g.id);
