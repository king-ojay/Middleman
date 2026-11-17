// App shell: the strip behind the phone's status bar, the routes for each
// screen (guarded by role), and the notice shown while the free-tier API wakes
// up. The tree is keyed on the language, so switching it redraws every
// screen in the new words (i18n/index.js).
import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import ResetPin from './pages/ResetPin.jsx';
import Discover from './pages/Discover.jsx';
import PostJob from './pages/PostJob.jsx';
import OpenJobs from './pages/OpenJobs.jsx';
import MyJobs from './pages/MyJobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Profile from './pages/Profile.jsx';
import Transactions from './pages/Transactions.jsx';
import Admin from './pages/Admin.jsx';
import Privacy from './pages/Privacy.jsx';
import ServerWaking from './components/ServerWaking.jsx';
import StatusBarBackdrop from './components/StatusBarBackdrop.jsx';
import { useLang } from './i18n/useLang.js';
import { useAuth, homePathFor, RequireRole, RequireUser } from './auth.jsx';

// Mobile-first: every screen is designed at 390px. From 768px up, PageLayout
// widens the content and the tab bar becomes a top navigation bar.
export default function App() {
  const { user } = useAuth();
  const lang = useLang();
  return (
    <main key={lang} className="min-h-dvh bg-canvas">
      <StatusBarBackdrop />
      <Routes>
        <Route path="/" element={user ? <Navigate to={homePathFor(user)} replace /> : <Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/reset-pin" element={<ResetPin />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/discover" element={<RequireRole role="client"><Discover /></RequireRole>} />
        <Route path="/post-job" element={<RequireRole role="client"><PostJob /></RequireRole>} />
        <Route path="/jobs" element={<RequireRole role="worker"><OpenJobs /></RequireRole>} />
        <Route path="/my-jobs" element={<RequireUser><MyJobs /></RequireUser>} />
        <Route path="/my-jobs/:id" element={<RequireUser><JobDetail /></RequireUser>} />
        <Route path="/profile" element={<RequireUser><Profile /></RequireUser>} />
        <Route path="/people/:id" element={<RequireUser><Profile /></RequireUser>} />
        <Route path="/transactions" element={<RequireUser><Transactions /></RequireUser>} />
        {/* the researcher's page: needs ADMIN_SECRET, not a login; not in any tab bar */}
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ServerWaking />
    </main>
  );
}