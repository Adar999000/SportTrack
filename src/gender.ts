import { currentUser } from './session';

export type Gender = 'male' | 'female' | '';
export const myGender = (): Gender => (currentUser()?.profile?.gender as Gender) || '';
/** Pick the Hebrew form that matches the user: male, female, or the neutral "/ה" form when not set. */
export const gx = (male: string, female: string, neutral = male) => (myGender() === 'female' ? female : myGender() === 'male' ? male : neutral);
