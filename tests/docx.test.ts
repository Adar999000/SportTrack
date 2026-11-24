import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { parseDocx } from '../src/docx';
import { extractBlocks } from '../src/docx/extract';
import { parseBlocks, parseSportCell, rowKind } from '../src/docx/parse';

// ---- helpers that produce WordprocessingML like the real tracker file ----
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const run = (t: string) => `<w:r><w:rPr><w:rtl/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const p = (t: string) => `<w:p><w:pPr><w:bidi/></w:pPr>${t ? run(t) : ''}</w:p>`;
const tc = (t: string) => `<w:tc><w:tcPr><w:tcW w:w="1000"/></w:tcPr>${t.split('\n').map(p).join('')}</w:tc>`;
const tr = (cells: string[]) => `<w:tr><w:trPr/>${cells.map(tc).join('')}</w:tr>`;
const tbl = (rows: string[][]) => `<w:tbl><w:tblPr><w:bidiVisual/></w:tblPr><w:tblGrid/>${rows.map(tr).join('')}</w:tbl>`;
const HEADER = ['יום 👈\nמשימה 👇', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const doc = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`;

const week1 =
  p('תאריך -2/4/23 עד 8/4/23') +
  p('משקל התחלתי: 108.4 ק"ג') +
  tbl([
    HEADER,
    ['ארוחת בוקר בריאה', 'X', 'V', '-', 'V', '-', 'V', '-'],
    ['ארוחת צהריים בריאה', 'V', 'V', 'V', 'V', 'V', 'V', 'X'],
    ['ארוחת ערב בריאה', 'X', 'X', 'X', 'X', 'X', 'X', 'X'],
    ['פעילות ספורט', 'שעה הליכה (5ק"מ)', 'X', 'X', 'ריצה\n(3 ק"מ)', 'חופשה בברלין', '-', ''],
  ]);

const week2 =
  // date and weight in the same paragraph, alternative lunch spelling, smoking row
  p('תאריך 22/11/26 עד 28/11/26     משקל התחלתי: 104.2 ק"ג') +
  tbl([
    HEADER,
    ['ארוחת בוקר בריאה', '-', '', '', '', '', '', ''],
    ['ארוחת צהרים בריאה', 'V', '', '', '', '', '', ''],
    ['ארוחת ערב בריאה', 'V', '', '', '', '', '', ''],
    ['פעילות ספורט', 'אימון קיקבוקס\n(שעה)', '', '', '', '', '', ''],
    ['מעשן סיגריה?', 'כן', 'לא', '', '', '', '', ''],
  ]);

const week3NoWeight =
  p('תאריך - 16/04/23 עד 22/04/23') +
  tbl([
    HEADER,
    ['ארוחת בוקר בריאה', 'V', 'V', '-', 'X', 'V', 'V', '-'],
    ['ארוחת צהריים בריאה', 'V', 'X', 'V', 'V', 'V', 'X', 'V'],
    ['ארוחת ערב בריאה', 'X', 'V', 'V', 'X', 'V', 'V', '-'],
    ['פעילות ספורט', '-', 'ריצה\n(3 ק"מ)', '-', 'ריצה\n(3 ק"מ)', '-', 'ריצה\n(3 ק"מ)', '-'],
    ['מעשן?', 'כן', 'כן', 'כן', 'לא', 'לא', 'כן', 'כן'],
  ]);

const XML = doc(p('תכנית משמעת אישית 2026') + week1 + p('') + week2 + week3NoWeight);

describe('extractBlocks', () => {
  it('returns paragraphs and tables in order', () => {
    const blocks = extractBlocks(XML);
    expect(blocks.map((b) => b.type)).toEqual(['p', 'p', 'p', 'table', 'p', 'p', 'table', 'p', 'table']);
    const t = blocks[3];
    expect(t.type === 'table' && t.rows[4][4]).toBe('ריצה\n(3 ק"מ)');
    expect(t.type === 'table' && t.rows[0]).toHaveLength(8);
  });
});

describe('parseBlocks', () => {
  const { weeks, warnings } = parseBlocks(extractBlocks(XML));
  const byDate = Object.fromEntries(weeks.map((w) => [w.week.sundayDate, w.week]));

  it('finds every week, sorted, with no warnings', () => {
    expect(warnings).toEqual([]);
    expect(weeks.map((w) => w.week.sundayDate)).toEqual(['2023-04-02', '2023-04-16', '2026-11-22']);
  });

  it('parses starting weight, including when on the date line or missing', () => {
    expect(byDate['2023-04-02'].startWeight).toBe(108.4);
    expect(byDate['2026-11-22'].startWeight).toBe(104.2);
    expect(byDate['2023-04-16'].startWeight).toBeUndefined();
  });

  it('parses meal marks with both lunch spellings', () => {
    const w = byDate['2023-04-02'];
    expect(w.days.map((d) => d.breakfast)).toEqual(['X', 'V', '-', 'V', '-', 'V', '-']);
    expect(w.days[6].lunch).toBe('X');
    expect(byDate['2026-11-22'].days[0].lunch).toBe('V');
    expect(byDate['2026-11-22'].days[1].lunch).toBeNull();
  });

  it('parses sport free text, X, "-", empty, and marks vacation as non-workout', () => {
    const s = byDate['2023-04-02'].days.map((d) => d.sport);
    expect(s[0]).toEqual({ status: 'V', label: 'שעה הליכה (5ק"מ)', countsAsWorkout: true });
    expect(s[1]).toEqual({ status: 'X', countsAsWorkout: false });
    expect(s[3]).toEqual({ status: 'V', label: 'ריצה (3 ק"מ)', countsAsWorkout: true });
    expect(s[4]).toEqual({ status: 'V', label: 'חופשה בברלין', countsAsWorkout: false });
    expect(s[5].status).toBe('-');
    expect(s[6].status).toBeNull();
  });

  it('parses both smoking row spellings', () => {
    expect(byDate['2026-11-22'].days.slice(0, 3).map((d) => d.smoked)).toEqual([true, false, null]);
    expect(byDate['2023-04-16'].days.map((d) => d.smoked)).toEqual([true, true, true, false, false, true, true]);
    expect(byDate['2023-04-02'].days[0].smoked).toBeNull();
  });

  it('skips duplicate weeks inside the file', () => {
    const r = parseBlocks(extractBlocks(doc(week1 + week1)));
    expect(r.weeks).toHaveLength(1);
    expect(r.warnings[0]).toContain('פעמיים');
  });

  it('snaps a non-Sunday start date to its Sunday and reports it', () => {
    const r = parseBlocks(extractBlocks(doc(week1.replace('-2/4/23 עד 8/4/23', '4/4/23 עד 10/4/23'))));
    expect(r.weeks[0].week.sundayDate).toBe('2023-04-02');
    expect(r.weeks[0].issues.length).toBeGreaterThan(0);
  });
});

describe('row and cell helpers', () => {
  it('recognizes row labels', () => {
    expect(rowKind('ארוחת צהריים בריאה')).toBe('lunch');
    expect(rowKind('ארוחת צהרים בריאה')).toBe('lunch');
    expect(rowKind('מעשן?')).toBe('smoking');
    expect(rowKind('מעשן סיגריה?')).toBe('smoking');
    expect(rowKind('פעילות ספורט')).toBe('sport');
  });

  it('normalizes sport text', () => {
    expect(parseSportCell('אימון כוח\nוחד"כ\n( שעה )').label).toBe('אימון כוח וחד"כ (שעה)');
    expect(parseSportCell(' x ').status).toBe('X');
  });
});

describe('parseDocx (zipped file)', () => {
  it('reads word/document.xml from a .docx archive', () => {
    const zip = zipSync({ 'word/document.xml': strToU8(XML), '[Content_Types].xml': strToU8('<Types/>') });
    expect(parseDocx(zip).weeks).toHaveLength(3);
  });

  it('rejects non-docx input with a Hebrew message', () => {
    expect(() => parseDocx(strToU8('hello'))).toThrow(/Word/);
  });
});
