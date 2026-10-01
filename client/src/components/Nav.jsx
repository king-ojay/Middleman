import { NavLink } from 'react-router-dom';

const linkClass = ({ isActive }) =>
  `text-sm font-medium pb-1 border-b-2 transition-colors ${
    isActive ? 'border-steel text-ink' : 'border-transparent text-ink/60 hover:text-ink'
  }`;

export default function Nav() {
  return (
    <header className="border-b border-ink/10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <NavLink to="/" className="font-display text-xl font-semibold tracking-tight">
          Middleman
        </NavLink>
        <nav className="flex items-center gap-8">
          <NavLink to="/discover" className={linkClass}>Find a worker</NavLink>
          <NavLink to="/post-job" className={linkClass}>Post a job</NavLink>
        </nav>
      </div>
    </header>
  );
}
