import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(phone);
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-sm mx-auto px-6 py-12">
      <h1 className="font-display text-3xl text-ink mb-2">Log in</h1>
      <p className="text-ink/60 mb-8">Enter the phone number you registered with.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="phone" className="block text-sm font-medium text-ink mb-1">Phone number</label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="0788000001"
            required
            className="w-full border border-ink/20 rounded px-3 py-2 bg-white/60"
          />
        </div>
        {error && <p className="text-sm text-brick">{error}</p>}
        <button type="submit" disabled={submitting} className="px-5 py-3 bg-steel text-paper rounded font-medium hover:bg-steel-dark transition-colors disabled:opacity-60">
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}
