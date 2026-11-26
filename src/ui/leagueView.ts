import { t, tr } from '../i18n';
import { call } from '../api';
import { avatar } from './avatar';
import { h } from './dom';

interface Member { rank: number; userId: string; name: string; photoId: string | null; frame: string; level: number; week: number; me: boolean }
const TIER_ICON: Record<string, string> = { 'יהלום': '💎', 'פלטינה': '🔷', 'זהב': '🥇', 'כסף': '🥈', 'ארד': '🥉' };

/** This week's league table: top 3 move up, bottom 3 move down (by coins earned this week). */
export function leagueCard(): HTMLElement {
  const card = h('section', { class: 'card league' }, h('p', { class: 'muted' }, t('טוען…')));
  call<{ tier: string; members: Member[]; up: number; down: number }>('league').then((r) => {
    const n = r.members.length;
    card.replaceChildren(
      h('div', { class: 'row-between' },
        h('h2', { class: 'card-title' }, `${TIER_ICON[r.tier] ?? '🏆'} ${tr`ליגת ${t(r.tier)}`}`),
        h('span', { class: 'muted small' }, t('מתאפס ביום ראשון'))),
      h('ol', { class: 'league-list' }, r.members.map((m) => h('li', {
        class: (m.me ? 'me ' : '') + (r.up && m.rank <= r.up ? 'up' : r.down && m.rank > n - r.down && n > 6 ? 'down' : ''),
      },
      h('span', { class: 'lg-rank' }, String(m.rank)),
      avatar(m.name, m.photoId, 32, m.frame),
      h('span', { class: 'lg-name' }, m.me ? t('את/ה') : m.name),
      h('b', { class: 'lg-pts' }, String(m.week), h('span', { class: 'coin', 'aria-hidden': 'true' }))))),
      h('p', { class: 'hint' }, r.up || r.down ? t('3 הראשונים עולים ליגה, 3 האחרונים יורדים. הניקוד: מטבעות שנצברו השבוע.') : t('הניקוד: מטבעות שנצברו השבוע. כשיהיו יותר משתתפים ייפתחו ליגות נוספות.')),
    );
  }).catch(() => card.remove());
  return card;
}
