/** A mark for a meal cell: done, missed, not applicable. `null` = not filled. */
export type Mark = 'V' | 'X' | '-';

export interface SportCell {
  status: Mark | null;
  /** Free text or a chosen type, e.g. "ריצה 3 ק\"מ". Only meaningful when status === 'V'. */
  label?: string;
  /** False for vacation / rest entries (they are logged but are not workouts). */
  countsAsWorkout: boolean;
}

export interface Day {
  breakfast: Mark | null;
  lunch: Mark | null;
  dinner: Mark | null;
  sport: SportCell;
  smoked?: boolean | null;
  /** Free text written in a cell instead of a mark, e.g. "חופשה". */
  text?: Partial<Record<TextCellKey, string>>;
}

export type TextCellKey = 'breakfast' | 'lunch' | 'dinner' | 'smoked';

export interface Week {
  /** ISO date (YYYY-MM-DD) of the week's Sunday. Identifies the week. */
  sundayDate: string;
  startWeight?: number;
  note?: string;
  /** Exactly 7 entries, Sunday → Saturday. */
  days: Day[];
  /** ms timestamp of the last local edit (used for sync conflict resolution). */
  updatedAt?: number;
  /** Drive file id of the week's photo (accounts only). */
  photoId?: string;
}

export type MealKey = 'breakfast' | 'lunch' | 'dinner';
export const MEALS: MealKey[] = ['breakfast', 'lunch', 'dinner'];

export type Theme = 'auto' | 'light' | 'dark';
export type Lang = 'he' | 'en';

export interface Settings {
  showSmoking: boolean;
  theme: Theme;
  /** User-added sport types, remembered for the sport picker. */
  customSportTypes: string[];
  dailyReminder: boolean;
  /** "HH:MM" local time. */
  reminderTime: string;
  weeklyWeightReminder: boolean;
  /** Settings schema revision, for one-time migrations. */
  rev?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  showSmoking: false,
  theme: 'auto',
  customSportTypes: [],
  dailyReminder: false,
  reminderTime: '21:00',
  weeklyWeightReminder: true,
  rev: 2,
};
