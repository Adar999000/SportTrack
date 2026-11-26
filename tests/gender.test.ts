import { describe, expect, it } from 'vitest';
import { genderize, setGender, t } from '../src/i18n';

describe('Hebrew wording by gender', () => {
  it('keeps the "/" forms when not set, picks a form otherwise', () => {
    setGender('');
    expect(genderize('סיכום שבוע: אל תשכח/י להזין משקל, את/ה קרוב/ה')).toBe('סיכום שבוע: אל תשכח/י להזין משקל, את/ה קרוב/ה');
    setGender('female');
    expect(genderize('אל תשכח/י להזין משקל, את/ה קרוב/ה. סמן/י אותו')).toBe('אל תשכחי להזין משקל, את קרובה. סמני אותו');
    expect(t('שמור')).toBe('שמרי');
    expect(t('יום מלא. אלוף/ה')).toBe('יום מלא. אלופה');
    setGender('male');
    expect(genderize('אל תשכח/י להזין משקל, את/ה קרוב/ה')).toBe('אל תשכח להזין משקל, אתה קרוב');
    expect(t('שמור')).toBe('שמור');
    expect(genderize('ק"מ/שעה 3/4')).toBe('ק"מ/שעה 3/4');
    setGender('');
  });
});
