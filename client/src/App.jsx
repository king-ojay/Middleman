import { Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Discover from './pages/Discover.jsx';
import PostJob from './pages/PostJob.jsx';
import OpenJobs from './pages/OpenJobs.jsx';
import MyJobs from './pages/MyJobs.jsx';
import JobDetail from './pages/JobDetail.jsx';
import { useAuth, homePathFor, RequireRole, RequireUser } from './auth.jsx';

export default function App() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={user ? <Navigate to={homePathFor(user)} replace /> : <Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/discover" element={<RequireRole role="client"><Discover /></RequireRole>} />
          <Route path="/post-job" element={<RequireRole role="client"><PostJob /></RequireRole>} />
          <Route path="/jobs" element={<RequireRole role="worker"><OpenJobs /></RequireRole>} />
          <Route path="/my-jobs" element={<RequireUser><MyJobs /></RequireUser>} />
          <Route path="/my-jobs/:id" element={<RequireUser><JobDetail /></RequireUser>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
