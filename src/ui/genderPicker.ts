import { h } from './dom';
import { t } from '../i18n';
import type { Gender } from '../gender';

/** Three pill radio buttons: גבר / אישה / לא לציין. */
export function genderPicker(value: Gender = ''): { el: HTMLElement; value: () => Gender } {
  let cur: Gender = value;
  const opts: [Gender, string][] = [['male', 'גבר'], ['female', 'אישה'], ['', 'לא לציין']];
  const el = h('div', { class: 'gender-pick', role: 'radiogroup', 'aria-label': t('איך לפנות אליך?') });
  const draw = () => el.replaceChildren(...opts.map(([k, label]) => h('button', {
    type: 'button', class: 'goal-chip', role: 'radio', 'aria-checked': String(cur === k), 'aria-pressed': String(cur === k),
    onclick: () => { cur = k; draw(); },
  }, t(label))));
  draw();
  return { el, value: () => cur };
}
