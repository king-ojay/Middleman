import { initials } from './ui/Avatar.jsx';
import { reasonPath } from '../trustReason.js';
import { t } from '../i18n/index.js';

// The trust path as overlapping round avatars: you, the named hop-1 person
// (only when the sentence names them), a blank grey circle for anyone kept
// anonymous, then the worker. Built from the same reason as the sentence
// beside it (trustReason.js reasonPath), which says it in words, so the
// picture is hidden from screen readers. `ring` is the colour it sits on.
// Earlier circles sit on top of later ones, so "You" is never covered.
const STACK = ['z-30', 'z-20', 'z-10', 'z-0'];

const FILL = {
  you: 'bg-surface text-ink border border-line',
  named: 'bg-trust text-on-trust',
  anonymous: 'bg-shade',
  worker: 'bg-trust text-on-trust'
};

export default function TrustPath({ reason, ring = 'ring-surface' }) {
  const people = reasonPath(reason);
  if (people.length === 0) return null;
  return (
    <span aria-hidden="true" className="flex shrink-0">
      {people.map((p, i) => {
        const kind = p.you ? 'you' : p.worker ? 'worker' : p.anonymous ? 'anonymous' : 'named';
        return (
          <span
            key={i}
            className={`relative ${STACK[i]} w-10 h-10 rounded-full ring-2 ${ring} inline-flex items-center justify-center text-[11px] font-semibold ${i > 0 ? '-ml-2' : ''} ${FILL[kind]}`}
          >
            {p.you ? t('common.you') : p.anonymous ? '' : initials(p.name)}
          </span>
        );
      })}
    </span>
  );
}
