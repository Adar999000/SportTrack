import { chatPanel, type Scope } from './chatPanel';
import { h } from './dom';
import { aiBadge } from './icons';
import { t } from '../i18n';

export function renderChat(root: HTMLElement, scope: Scope, userId?: string): void {
  root.replaceChildren(
    h('section', { class: 'card chat-card' },
      h('div', { class: 'chat-head' },
        h('h2', { class: 'card-title' }, scope === 'all' ? t('עוזר AI · כל המשתמשים') : t('עוזר AI'), ' ', aiBadge()),
      ),
      chatPanel(scope, userId),
    ),
  );
}
