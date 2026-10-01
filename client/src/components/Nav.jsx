import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

const linkClass = ({ isActive }) =>
  `text-sm font-medium pb-1 border-b-2 transition-colors ${
    isActive ? 'border-steel text-ink' : 'border-transparent text-ink/60 hover:text-ink'
  }`;

export default function Nav() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="border-b border-ink/10">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <NavLink to="/" className="font-display text-xl font-semibold tracking-tight">
          Middleman
        </NavLink>
        <nav className="flex items-center gap-8">
          {user?.role === 'client' && (
            <>
              <NavLink to="/discover" className={linkClass}>Find a worker</NavLink>
              <NavLink to="/post-job" className={linkClass}>Post a job</NavLink>
            </>
          )}
          {user?.role === 'worker' && (
            <NavLink to="/jobs" className={linkClass}>Open jobs</NavLink>
          )}
          {user ? (
            <>
              <span className="text-sm text-ink/60">{user.name} ({user.role})</span>
              <button onClick={handleLogout} className="text-sm font-medium text-ink/60 hover:text-ink">Log out</button>
            </>
          ) : (
            <NavLink to="/login" className={linkClass}>Log in</NavLink>
          )}
        </nav>
      </div>
    </header>
  );
}
