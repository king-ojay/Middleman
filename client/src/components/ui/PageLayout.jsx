import { useNavigate } from 'react-router-dom';
import TabBar from './TabBar.jsx';
import { t } from '../../i18n/index.js';

// `back` may be true (browser back), a path, or a function (e.g. previous step).
// Browser back only within the app: on a page opened straight from a link
// (React Router's history index 0) it goes home instead of leaving the site.
function BackButton({ back }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'function') return back();
    if (typeof back === 'string') return navigate(back);
    return window.history.state?.idx > 0 ? navigate(-1) : navigate('/');
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t('common.back')}
      className="w-11 h-11 inline-flex items-center justify-center rounded-full bg-surface text-ink transition-colors hover:bg-soft"
    >
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
        <path d="M10 2 2 10l8 8" className="stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Content width from 768px up. Phones always use the full width.
//   narrow: forms and sign-in (a centred column; the form half of AuthLayout from 1024px)
//   column: every signed-in page and the admin page: a centred column of
//           720px (plus the side padding) on the grey page
//   wide:   the landing page
const WIDTHS = {
  narrow: 'max-w-md md:max-w-xl lg:max-w-lg',
  column: 'max-w-[768px] lg:max-w-[800px]',
  wide: 'max-w-[1280px]'
};

// Screen scaffold: status-safe top padding, optional back chevron and right
// slot, eyebrow + title + subtitle, content, and the role's navigation
// (floating buttons on phones and tablets, a top bar from 1024px).
export default function PageLayout({ back, right, eyebrow, title, subtitle, tabBar, role, width, children }) {
  const hasHeaderRow = back || right;
  const size = tabBar || width === 'medium' ? 'column' : width || 'narrow';
  return (
    <>
      {tabBar && <TabBar role={role} />}
      {/* Side padding matches the top bar (24px, 40px from 1024px) so content lines up with the logo. */}
      <div className={`mx-auto w-full ${WIDTHS[size]}`}>
        <div className={`px-screen lg:px-10 pt-[max(var(--safe-top),24px)] lg:pt-6 ${tabBar ? 'pb-[calc(100px+env(safe-area-inset-bottom))] lg:pb-12' : 'pb-10'}`}>
          {hasHeaderRow && (
            <div className="flex items-center justify-between h-11 mb-4">
              <div>{back && <BackButton back={back} />}</div>
              <div className="text-label text-muted">{right}</div>
            </div>
          )}
          {(eyebrow || title || subtitle) && (
            <header className="mb-6">
              {eyebrow && <p className="text-body text-muted mb-1">{eyebrow}</p>}
              {title && <h1 className="text-display tracking-tight text-ink">{title}</h1>}
              {subtitle && <p className="text-body text-muted mt-2">{subtitle}</p>}
            </header>
          )}
          {children}
        </div>
      </div>
    </>
  );
}