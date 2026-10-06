import { NavLink } from 'react-router-dom';

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

// Placeholder icons: rounded squares. Swap in real glyphs by adding entries
// keyed by the tab's `icon` name; anything missing falls back to the square.
const ICONS = {};

function TabIcon({ name, active }) {
  const Icon = ICONS[name];
  if (Icon) return <Icon active={active} />;
  return (
    <span
      aria-hidden="true"
      className={`block w-6 h-6 rounded-md ${active ? 'bg-signal' : 'border-2 border-faint'}`}
    />
  );
}

export default function TabBar({ role }) {
  const tabs = TABS[role] || [];
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-0 inset-x-0 mx-auto max-w-[430px] h-tabbar bg-white shadow-tabbar pb-[env(safe-area-inset-bottom)] z-20"
    >
      <ul className="h-full flex">
        {tabs.map(tab => (
          <li key={tab.to} className="flex-1">
            <NavLink to={tab.to} className="h-full flex flex-col items-center justify-center gap-1">
              {({ isActive }) => (
                <>
                  <TabIcon name={tab.icon} active={isActive} />
                  <span className={`text-micro ${isActive ? 'font-semibold text-forest' : 'text-muted'}`}>{tab.label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
