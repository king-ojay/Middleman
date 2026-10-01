import { Routes, Route } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Landing from './pages/Landing.jsx';
import Discover from './pages/Discover.jsx';
import PostJob from './pages/PostJob.jsx';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/post-job" element={<PostJob />} />
        </Routes>
      </main>
    </div>
  );
}
