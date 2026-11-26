import { h, toast } from './dom';
import { t } from '../i18n';
import { call, type User } from '../api';
import { currentUser, setUser } from '../session';
import { goalChips } from './goalChips';
import { applyGoals } from '../goalEffects';
import { icon } from './icons';
import { HASH, navigate } from './router';

export function renderGoals(main: HTMLElement): void {
  const u = currentUser()!;
  const chips = goalChips(u.profile?.goals ?? []);
  const save = h('button', { class: 'btn btn-primary', type: 'button' }, t('שמירה'));
  save.addEventListener('click', async () => {
    save.disabled = true;
    try {
      const res = await call<{ user: User }>('updateProfile', { profile: { goals: chips.value() } });
      await setUser(res.user);
      const changed = applyGoals(chips.value());
      toast(changed.length ? t('נשמר. הוספנו לפי המטרות: ') + changed.join(', ') : t('נשמר'));
      navigate(HASH.profile);
    } catch (e: any) { toast(e.message); save.disabled = false; }
  });
  main.replaceChildren(
    h('h1', { class: 'page-title' }, icon('star'), ' ', t('המטרות שלי')),
    h('section', { class: 'card stack' },
      h('p', { class: 'muted' }, t('סמנו כל מה שמתאים. העוזר והטיפים יתאימו את עצמם למה שחשוב לכם.')),
      chips.el,
      save,
    ),
  );
}
