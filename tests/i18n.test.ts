import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';

it('every Hebrew UI string has an English translation', () => {
  const out = execFileSync('node', ['scripts/i18n-keys.mjs', '--missing'], { encoding: 'utf8' }).trim();
  expect(JSON.parse(out)).toEqual([]);
});
