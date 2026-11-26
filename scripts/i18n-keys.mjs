// Lists every Hebrew UI string that needs an English entry in src/i18n-en.ts.
// Usage: node scripts/i18n-keys.mjs [--missing]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts') && !p.endsWith('i18n-en.ts')) files.push(p);
  }
})('src');

const HEB = /[֐-׿]/;
const keys = new Set();
const unq = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/\bt\('((?:[^'\\\n]|\\.)*)'/g)) if (HEB.test(m[1])) keys.add(unq(m[1]));
  for (const m of src.matchAll(/\btr`((?:[^`\\]|\\.)*)`/g)) {
    let i = 0;
    const k = m[1].replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, () => `{${i++}}`);
    if (HEB.test(k)) keys.add(k);
  }
}
// data lists shown through t(...)
const grabList = (file, name) => {
  const src = readFileSync(file, 'utf8');
  const m = new RegExp(name + '[^=]*=\\s*\\[([\\s\\S]*?)\\];').exec(src);
  if (m) for (const s of m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)) keys.add(unq(s[1]));
};
grabList('src/dates.ts', 'DAY_NAMES');
grabList('src/dates.ts', 'MONTH_NAMES');
grabList('src/model.ts', 'BUILTIN_SPORT_TYPES');
grabList('src/ui/cellTextSheet.ts', 'QUICK');
for (const m of readFileSync('src/version.ts', 'utf8').matchAll(/^\s*'((?:[^'\\]|\\.)*)',$/gm)) if (HEB.test(m[1])) keys.add(unq(m[1]));
for (const m of readFileSync('apps-script/Code.gs', 'utf8').matchAll(/new Error\('((?:[^'\\]|\\.)*)'\)/g)) keys.add(unq(m[1]).replace(/^AUTH:\s*/, ''));

const list = [...keys].sort();
if (process.argv.includes('--missing')) {
  const en = readFileSync('src/i18n-en.ts', 'utf8');
  const missing = list.filter((k) => !en.includes(JSON.stringify(k)));
  console.log(JSON.stringify(missing, null, 1));
  process.exitCode = missing.length ? 1 : 0;
} else console.log(JSON.stringify(list, null, 1));
