import { t } from '../../i18n/index.js';

// "Verified" (reviewed manually by the researcher): an outlined pill with a
// green check (green marks meaning), so it never reads as part of the tier chip it often
// sits next to.
export default function VerifiedBadge() {
  return (
    <span className="inline-flex items-center gap-1 h-[26px] px-2.5 rounded-full text-micro whitespace-nowrap bg-surface border border-line text-ink">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="m2.5 6.2 2.3 2.3 4.7-5" className="stroke-signal" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {t('common.verified')}
    </span>
  );
}
