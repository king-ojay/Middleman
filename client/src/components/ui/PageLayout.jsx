import { useNavigate } from 'react-router-dom';
import TabBar from './TabBar.jsx';

// `back` may be true (browser back), a path, or a function (e.g. previous step).
function BackButton({ back }) {
  const navigate = useNavigate();
  const goBack = () => {
    if (typeof back === 'function') return back();
    if (typeof back === 'string') return navigate(back);
    return navigate(-1);
  };
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label="Back"
      className="-ml-3 w-11 h-11 inline-flex items-center justify-center rounded-full text-ink"
    >
      <svg width="12" height="20" viewBox="0 0 12 20" fill="none" aria-hidden="true">
        <path d="M10 2 2 10l8 8" className="stroke-current" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

// Screen scaffold: status-safe top padding, optional back chevron and right
// slot, eyebrow + title + subtitle, content, and the role's tab bar.
export default function PageLayout({ back, right, eyebrow, title, subtitle, tabBar, role, children }) {
  const hasHeaderRow = back || right;
  return (
    <div className={`px-screen pt-[max(env(safe-area-inset-top),24px)] ${tabBar ? 'pb-[100px]' : 'pb-10'}`}>
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
      {tabBar && <TabBar role={role} />}
    </div>
  );
}
