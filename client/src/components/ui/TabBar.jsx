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

// 24px line icons drawn in currentColor. Tabs without an entry here (My jobs,
// the worker tabs) keep the rounded-square placeholder.
const glyph = paths => () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const ICONS = {
  find: glyph(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>),
  post: glyph(<path d="M12 5v14M5 12h14" />),
  profile: glyph(<><circle cx="12" cy="8" r="4" /><path d="M4 20.5c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>)
};

// The active tab sits in a soft mint pill; colour alone never carries state
// because the label also turns bold.
function TabIcon({ name, active }) {
  const Icon = ICONS[name];
  return (
    <span className={`w-14 h-8 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-accent-soft text-heading' : 'text-muted'}`}>
      {Icon ? <Icon /> : (
        <span
          aria-hidden="true"
          className={`block w-6 h-6 rounded-md ${active ? 'bg-accent' : 'border-2 border-faint'}`}
        />
      )}
    </span>
  );
}

// Phones: a fixed bar along the bottom. From 768px: a sticky bar along the
// top with the logo on the left, so wide screens keep the content in view.
export default function TabBar({ role }) {
  const tabs = TABS[role] || [];
  return (
    <>
      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 h-tabbar bg-surface shadow-tabbar pb-[env(safe-area-inset-bottom)] z-20"
      >
        <ul className="h-full flex">
          {tabs.map(tab => (
            <li key={tab.to} className="flex-1">
              <NavLink to={tab.to} className="h-full flex flex-col items-center justify-center gap-1">
                {({ isActive }) => (
                  <>
                    <TabIcon name={tab.icon} active={isActive} />
                    <span className={`text-micro ${isActive ? 'font-semibold text-heading' : 'text-muted'}`}>{tab.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <nav
        aria-label="Main"
        className="hidden md:block sticky top-0 z-20 bg-surface shadow-card"
      >
        <div className="mx-auto max-w-[1280px] px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" aria-label="Middleman home">
            <LogoMark size={32} />
            <span className="text-section text-heading">Middleman</span>
          </Link>
          <ul className="flex items-center gap-2">
            {tabs.map(tab => {
              const Icon = ICONS[tab.icon];
              return (
                <li key={tab.to}>
                  <NavLink
                    to={tab.to}
                    className={({ isActive }) =>
                      `h-11 px-4 rounded-full inline-flex items-center gap-2 text-body ${isActive ? 'bg-accent-soft text-heading font-semibold' : 'text-muted font-medium hover:text-heading'}`
                    }
                  >
                    {Icon && <Icon />}
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