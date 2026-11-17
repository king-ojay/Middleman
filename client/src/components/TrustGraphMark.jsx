import { t } from '../i18n/index.js';

// The trust mechanism in one picture, drawn for the ink (brand) panel. Trust
// is directed, so every edge has an arrowhead pointing away from you:
//   You -> Amina  solid: a real edge (you invited her: the signup_referral
//                 edge, written from inviter to invitee, auth.routes.js)
//   Amina -> Eric solid: a real edge (she hired him and rated him highly)
//   You -> Eric   dashed: no edge of its own, inferred along the path above
// Endpoints stop at the circle edges (r 24) so the arrowheads show.
export default function TrustGraphMark({ className = '' }) {
  return (
    <svg
      viewBox="0 0 260 140"
      className={className}
      role="img"
      aria-label={t('trustExample.picture')}
    >
      <defs>
        <marker id="trust-arrow-tie" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 10 5 0 10z" className="fill-on-brand-soft" />
        </marker>
        <marker id="trust-arrow-inferred" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0 0 10 5 0 10z" className="fill-on-brand" />
        </marker>
      </defs>
      <path d="M64 30 H125" className="stroke-on-brand-soft" strokeWidth="2" markerEnd="url(#trust-arrow-tie)" />
      <path d="M135.8 49.4 L105.4 91" className="stroke-on-brand-soft" strokeWidth="2" markerEnd="url(#trust-arrow-tie)" />
      <path d="M22 46 Q8 95 64.5 106.7" fill="none" className="stroke-on-brand" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#trust-arrow-inferred)" />
      <circle cx="40" cy="30" r="24" className="fill-on-brand-soft" />
      <circle cx="150" cy="30" r="24" className="fill-on-brand-soft" />
      <circle cx="90" cy="112" r="24" className="fill-on-brand" />
      <text x="40" y="34" textAnchor="middle" className="fill-brand font-sans text-micro font-semibold">{t('common.you')}</text>
      <text x="150" y="34" textAnchor="middle" className="fill-brand font-sans text-micro font-semibold">Amina</text>
      <text x="90" y="116" textAnchor="middle" className="fill-brand font-sans text-micro font-semibold">Eric</text>
    </svg>
  );
}

// The picture with its explanation, as shown on the landing page and beside
// the log-in and sign-up forms. "Worked with", not "knows": a rating exists
// only after a confirmed, paid job.
export function TrustExample({ markClassName = '' }) {
  return (
    <>
      <h2 className="text-section text-on-brand">{t('trustExample.title')}</h2>
      <TrustGraphMark className={`w-full h-auto mt-4 ${markClassName}`} />
      {/* caption for the dashed line, outside the picture so it stays caption-sized */}
      <p className="flex items-center gap-2 text-small text-on-brand-soft mt-2">
        <svg width="28" height="4" viewBox="0 0 28 4" aria-hidden="true" className="shrink-0">
          <path d="M0 2 H28" className="stroke-on-brand" strokeWidth="2" strokeDasharray="4 4" />
        </svg>
        {t('trustExample.inferred')}
      </p>
      <p className="text-body text-on-brand mt-4">{t('trustExample.body')}</p>
      <p className="text-small text-on-brand-soft mt-1">{t('trustExample.note')}</p>
    </>
  );
}
