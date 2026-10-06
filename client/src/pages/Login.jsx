import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../auth.jsx';
import { Avatar, Button, FormField, LogoMark, PageLayout, TextInput } from '../components/ui/index.js';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const u = await login(phone, pin);
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageLayout>
      <div className="flex items-center gap-3 mb-12">
        <LogoMark size={36} />
        <span className="text-title text-forest">Middleman</span>
      </div>

      <h1 className="text-display tracking-tight text-ink">Welcome back</h1>
      <p className="text-body text-muted mt-2 mb-8">Log in with your phone number and PIN.</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField label="Phone number">
          {field => (
            <TextInput
              {...field}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="078X XXX XXX"
              required
            />
          )}
        </FormField>
        <FormField label="PIN" error={error}>
          {field => (
            <TextInput
              {...field}
              type="password"
              inputMode="numeric"
              autoComplete="current-password"
              maxLength={4}
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
            />
          )}
        </FormField>
        <Button type="submit" disabled={submitting}>{submitting ? 'Logging in…' : 'Log in'}</Button>
      </form>
      <div className="flex flex-col items-center mt-4">
        <Link to="/reset-pin" className="inline-flex items-center h-11 text-body text-muted">Forgot your PIN?</Link>
        <Link to="/register" className="inline-flex items-center h-11 text-body font-semibold text-forest">New here? Create an account</Link>
      </div>

      <section className="mt-12 bg-forest rounded-hero p-6">
        <h2 className="text-title text-mint">Find someone trusted by people you trust.</h2>
        <p className="text-body text-white mt-2">See the workers your network already trusts.</p>
        <div className="mt-5 flex items-center gap-3 bg-white/10 rounded-card p-3">
          <Avatar name="Eric Habimana" tier="area" size={44} />
          <div>
            <p className="text-body font-semibold text-white">Eric Habimana</p>
            <p className="text-small text-mint">Trusted in your network</p>
          </div>
        </div>
      </section>
    </PageLayout>
  );
}
