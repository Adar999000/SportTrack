import { t, tr } from '../i18n';
import { CELL_TYPES, ICONS, TEMPLATES, deleteTracker, mainCfg, saveMainCfg, saveTracker, uid, type CellType, type TCol, type TRow, type Tracker } from '../trackers';
import { confirmButton, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { track } from '../analytics';

const MAX_ROWS = 20, MAX_COLS = 14;

function typeSelect(value: CellType, onChange: (v: CellType) => void): HTMLSelectElement {
  const s = h('select', { class: 'input', 'aria-label': t('מה מסמנים') },
    CELL_TYPES.map((c) => h('option', { value: c.id, selected: c.id === value }, t(c.name)))) as HTMLSelectElement;
  s.addEventListener('change', () => onChange(s.value as CellType));
  return s;
}

/** An editable list (labels, order, delete); rows also get a mark type and unit. */
function listEditor<T extends { id: string; label: string }>(items: T[], kind: 'row' | 'col', make: () => T, max: number): HTMLElement {
  const box = h('div', { class: 'stack list-editor' });
  const draw = () => {
    box.replaceChildren(
      ...items.map((it, i) => {
        const label = h('input', { class: 'input', value: it.label, maxlength: 40, 'aria-label': kind === 'row' ? tr`שם שורה ${i + 1}` : tr`שם עמודה ${i + 1}` }) as HTMLInputElement;
        label.addEventListener('input', () => { it.label = label.value; });
        const move = (d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; [items[i], items[j]] = [items[j], items[i]]; draw(); };
        const row = it as unknown as TRow;
        const unit = h('input', { class: 'input unit-input', value: row.unit ?? '', maxlength: 12, placeholder: t('יחידה'), 'aria-label': t('יחידה') }) as HTMLInputElement;
        unit.addEventListener('input', () => { row.unit = unit.value.trim() || undefined; });
        const unitWrap = h('span', { hidden: kind !== 'row' || row.type !== 'number' }, unit);
        return h('div', { class: 'le-item' },
          h('div', { class: 'le-main' }, label,
            kind === 'row' && typeSelect(row.type, (v) => { row.type = v; unitWrap.hidden = v !== 'number'; }),
            unitWrap),
          h('div', { class: 'le-btns' },
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('הזז למעלה'), disabled: i === 0, onclick: () => move(-1) }, '↑'),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('הזז למטה'), disabled: i === items.length - 1, onclick: () => move(1) }, '↓'),
            h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('מחק'), onclick: () => { items.splice(i, 1); draw(); } }, '✕'),
          ),
        );
      }),
      items.length < max ? h('button', { class: 'btn', type: 'button', onclick: () => { items.push(make()); draw(); (box.querySelector('.le-item:last-of-type input') as HTMLInputElement | null)?.focus(); } },
        kind === 'row' ? t('+ הוסף שורה') : t('+ הוסף עמודה')) : h('p', { class: 'hint' }, tr`עד ${max}`),
    );
  };
  draw();
  return box;
}

const clean = <T extends { label: string }>(list: T[]) => list.map((x) => ({ ...x, label: x.label.trim().slice(0, 40) })).filter((x) => x.label);

/** Create (from a template) or edit a tracker. */
export function openTrackerEditor(existing?: Tracker): void {
  if (!existing) return pickTemplate();
  const tr0: Tracker = structuredClone(existing);
  const name = h('input', { class: 'input', id: 'trk-name', value: tr0.name, maxlength: 40 }) as HTMLInputElement;
  const corner = h('input', { class: 'input', id: 'trk-corner', value: tr0.corner ?? '', maxlength: 30, placeholder: t('משימה') }) as HTMLInputElement;
  let icon = tr0.icon;
  const icons = h('div', { class: 'icon-pick', role: 'radiogroup', 'aria-label': t('אייקון') },
    ICONS.map((ic) => {
      const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(ic === icon), onclick: () => {
        icon = ic; icons.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      } }, ic);
      return b;
    }));
  const rows: TRow[] = tr0.rows;
  const cols: TCol[] = tr0.cols;
  const close = openSheet(t('עריכת מעקב'), h('form', { class: 'stack', onsubmit: (e: Event) => {
    e.preventDefault();
    const r = clean(rows), c = clean(cols);
    if (!name.value.trim()) return toast(t('נא לתת שם למעקב'));
    if (!r.length) return toast(t('צריך לפחות שורה אחת'));
    if (tr0.mode === 'grid' && !c.length) return toast(t('צריך לפחות עמודה אחת'));
    saveTracker({ ...tr0, name: name.value.trim().slice(0, 40), icon, corner: corner.value.trim() || undefined, rows: r, cols: c });
    close();
    toast(t('נשמר'));
  } },
    h('div', { class: 'field' }, h('label', { for: 'trk-name' }, t('שם המעקב')), name),
    h('div', { class: 'field' }, h('span', null, t('אייקון')), icons),
    h('div', { class: 'field' }, h('label', { for: 'trk-corner' }, t('כותרת הפינה (מעל השורות)')), corner),
    h('h3', { class: 'section-title' }, t('שורות (הכותרות בצד)')),
    h('p', { class: 'hint' }, t('לכל שורה בוחרים מה מסמנים בה: V/X, וי, מצב רוח, כוכבים, מספר או טקסט.')),
    listEditor(rows, 'row', () => ({ id: uid(), label: '', type: 'vxd' as CellType }), MAX_ROWS),
    tr0.mode === 'grid' && h('h3', { class: 'section-title' }, t('עמודות (הכותרות למעלה)')),
    tr0.mode === 'grid' && listEditor(cols, 'col', () => ({ id: uid(), label: '' }), MAX_COLS),
    tr0.mode === 'week' && h('p', { class: 'hint' }, t('במעקב לפי ימים העמודות הן ימי השבוע, וכל שבוע נשמר בנפרד.')),
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('שמור')),
    confirmButton(t('מחק את המעקב'), t('הקש שוב: כל הנתונים שלו יימחקו'), () => { deleteTracker(tr0.id); close(); navigate(HASH.week()); toast(t('המעקב נמחק')); }, 'btn btn-danger'),
  ), { full: true });
}

function pickTemplate(): void {
  const close = openSheet(t('מעקב חדש'), h('div', { class: 'stack' },
    h('p', { class: 'hint' }, t('בוחרים נקודת התחלה, ואחר כך משנים הכל: שם, שורות, עמודות ומה מסמנים.')),
    ...TEMPLATES.map((tp) => h('button', { class: 'btn template-btn', type: 'button', onclick: () => {
      const tr = { ...tp.make(), id: uid(), createdAt: Date.now() };
      saveTracker(tr);
      track('tracker:create:' + tp.id);
      close();
      navigate(HASH.tracker(tr.id));
      setTimeout(() => openTrackerEditor(tr), 50);
    } }, t(tp.name))),
  ));
}

/** Rename the main table's rows and add your own rows to it. */
export function openMainEditor(showSmoking: boolean): void {
  const cfg = structuredClone(mainCfg());
  const labels = { ...(cfg.labels ?? {}) };
  const extra: TRow[] = cfg.extraRows ?? [];
  const fixed: [keyof typeof labels, string][] = [['breakfast', 'ארוחת בוקר בריאה'], ['lunch', 'ארוחת צהריים בריאה'], ['dinner', 'ארוחת ערב בריאה'], ['sport', 'פעילות ספורט']];
  if (showSmoking) fixed.push(['smoked', 'מעשן?']);
  const corner = h('input', { class: 'input', id: 'main-corner', value: cfg.corner ?? '', maxlength: 30, placeholder: t('משימה') }) as HTMLInputElement;
  const inputs = fixed.map(([k, def]) => {
    const i = h('input', { class: 'input', id: 'main-' + k, value: labels[k] ?? '', maxlength: 40, placeholder: t(def) }) as HTMLInputElement;
    return [k, i, def] as const;
  });
  const close = openSheet(t('עריכת הטבלה'), h('form', { class: 'stack', onsubmit: (e: Event) => {
    e.preventDefault();
    const next: typeof labels = {};
    inputs.forEach(([k, i]) => { if (i.value.trim()) next[k] = i.value.trim().slice(0, 40); });
    track('table:customize');
    saveMainCfg({ corner: corner.value.trim() || undefined, labels: next, extraRows: clean(extra) });
    close();
    toast(t('נשמר'));
  } },
    h('div', { class: 'field' }, h('label', { for: 'main-corner' }, t('כותרת הפינה (מעל השורות)')), corner),
    h('h3', { class: 'section-title' }, t('שמות השורות')),
    h('p', { class: 'hint' }, t('משאירים ריק כדי להשתמש בשם הרגיל. המטבעות והסטטיסטיקה ממשיכים לספור את השורות האלה כרגיל.')),
    ...inputs.map(([k, i, def]) => h('div', { class: 'field' }, h('label', { for: 'main-' + k }, t(def)), i)),
    h('h3', { class: 'section-title' }, t('שורות נוספות משלך')),
    listEditor(extra, 'row', () => ({ id: uid(), label: '', type: 'vxd' as CellType }), 10),
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('שמור')),
  ), { full: true });
}
