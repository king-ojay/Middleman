import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Discover from './pages/Discover.jsx';
import PostJob from './pages/PostJob.jsx';
import OpenJobs from './pages/OpenJobs.jsx';
import MyJobs from './pages/MyJobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import Profile from './pages/Profile.jsx';
import { useAuth, homePathFor, RequireRole, RequireUser } from './auth.jsx';

// Mobile-first: every screen is designed at 390px; on wider screens the app
// sits in a centred 430px column.
export default function App() {
  const { user } = useAuth();
  return (
    <main className="mx-auto max-w-[430px] min-h-screen bg-canvas">
      <Routes>
        <Route path="/" element={user ? <Navigate to={homePathFor(user)} replace /> : <Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/discover" element={<RequireRole role="client"><Discover /></RequireRole>} />
        <Route path="/post-job" element={<RequireRole role="client"><PostJob /></RequireRole>} />
        <Route path="/jobs" element={<RequireRole role="worker"><OpenJobs /></RequireRole>} />
        <Route path="/my-jobs" element={<RequireUser><MyJobs /></RequireUser>} />
        <Route path="/my-jobs/:id" element={<RequireUser><JobDetail /></RequireUser>} />
        <Route path="/profile" element={<RequireUser><Profile /></RequireUser>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </main>
  );
}
