import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { categoryLabel, areaLabel } from '../options.js';
import { Avatar, Button, PageLayout } from '../components/ui/index.js';

// Minimal for now: who you are and log out. The full profile is Phase 2.
export default function Profile() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user.role === 'worker' ? (user.skills || []).map(categoryLabel).join(', ') : 'Client';

  return (
    <PageLayout tabBar role={user.role}>
      <div className="flex flex-col items-center text-center pt-6">
        <Avatar name={user.name} size={88} />
        <h1 className="text-title text-ink mt-4">{user.name}</h1>
        <p className="text-body text-muted mt-1">{role} · {areaLabel(user.area)}</p>
      </div>
      <Button variant="outline" className="mt-10" onClick={() => { logout(); navigate('/'); }}>Log out</Button>
    </PageLayout>
  );
}
