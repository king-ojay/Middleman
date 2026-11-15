// Role-based navigation. Phones and tablets: separate round buttons floating
// above the bottom edge, the active one filled green with its label. From
// 1024px: a top bar of pills beside the logo (inactive ones white with a
// thin border).
import { Link, NavLink } from 'react-router-dom';
import LogoMark from './LogoMark.jsx';

const TABS = {
  client: [
    { to: '/discover', label: 'Find', icon: 'find' },
    { to: '/post-job', label: 'Post', icon: 'post' },
    { to: '/my-jobs', label: 'My jobs', icon: 'jobs' },
    { to: '/profile', label: 'Profile', icon: 'profile' }
  ],
  worker: [
    { to: '/jobs', label: 'Jobs', icon: 'jobs' },
    { to: '/my-jobs', label: 'My work', icon: 'work' },
    { to: '/profile', label: 'Profile', icon: 'profile' }
  ]
};

// 24px line icons drawn in currentColor.
const glyph = paths => () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const ICONS = {
  find: glyph(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>),
  post: glyph(<path d="M12 5v14M5 12h14" />),
  // clipboard with lines: a list of jobs
  jobs: glyph(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>),
  // toolbox: the worker's own work
  work: glyph(<><rect x="3" y="8" width="18" height="12" rx="2" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></>),
  profile: glyph(<><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>)
};

export default function TabBar({ role }) {
  const tabs = TABS[role] || [];
  return (
    <>
      {/* No container behind the buttons: only the buttons take taps. Pages
          leave 100px free at the bottom (PageLayout) so nothing hides under them. */}
      <nav
        aria-label="Main"
        className="lg:hidden fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-20 pointer-events-none"
      >
        <ul className="mx-auto max-w-md px-4 flex items-center justify-evenly">
          {tabs.map(tab => {
            const Icon = ICONS[tab.icon];
            return (
              <li key={tab.to} className="pointer-events-auto">
                <NavLink
                  to={tab.to}
                  aria-label={tab.label}
                  className={({ isActive }) =>
                    `h-[52px] rounded-full shadow-float inline-flex items-center justify-center gap-2 transition-colors ${
                      isActive ? 'px-5 bg-primary text-on-primary' : 'w-[52px] bg-surface text-ink hover:bg-soft'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon />
                      {isActive && <span className="text-label">{tab.label}</span>}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav aria-label="Main" className="hidden lg:block sticky top-0 z-20 bg-canvas">
        <div className="mx-auto max-w-[800px] px-10 h-[72px] flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 rounded-full transition-opacity hover:opacity-80" aria-label="Middleman home">
            <LogoMark size={32} />
            <span className="text-section text-ink">Middleman</span>
          </Link>
          <ul className="flex items-center gap-2">
            {tabs.map(tab => {
              const Icon = ICONS[tab.icon];
              return (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    className={({ isActive }) =>
                      `h-11 px-4 rounded-full inline-flex items-center gap-2 text-body font-semibold border transition-colors ${
                        isActive ? 'bg-primary border-primary text-on-primary' : 'bg-surface border-line text-ink hover:bg-soft'
                      }`
                    }
                  >
                    <Icon />
                    {tab.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </>
  );
}
