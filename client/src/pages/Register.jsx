import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homePathFor } from '../auth.jsx';
import OtpField from '../components/OtpField.jsx';
import { AREAS, CATEGORIES, areaLabel } from '../options.js';
import {
  Avatar, Button, Card, Chip, ChipRow, FormField, OptionCard, PageLayout, PinBoxes, StepBar, TextInput
} from '../components/ui/index.js';

// Two steps (FR-01, FR-02, FR-03): who you are, then a PIN and who invited you.
export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({ role: 'client', name: '', phone: '', area: 'kimironko', skills: [] });
  const [pin, setPin] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [referrer, setReferrer] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const set = patch => setDetails(d => ({ ...d, ...patch }));
  const toggleSkill = value =>
    set({ skills: details.skills.includes(value) ? details.skills.filter(s => s !== value) : [...details.skills, value] });

  const continueToPin = async e => {
    e.preventDefault();
    if (!details.name.trim()) return setError('Enter your full name.');
    if (!/^(\+?250|0)?7\d{8}$/.test(details.phone.replace(/[\s-]/g, ''))) return setError('Enter a mobile number like 078X XXX XXX.');
    if (details.role === 'worker' && details.skills.length === 0) return setError('Choose at least one kind of work you do.');
    setError('');
    setSending(true);
    try {
      // Confirms the phone number belongs to them before the account exists.
      await api('/api/auth/otp', { method: 'POST', body: JSON.stringify({ phone: details.phone, purpose: 'register' }) });
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const create = async e => {
    e.preventDefault();
    if (otpCode.length !== 6) return setError('Enter the 6-digit code we sent you.');
    if (pin.length !== 4) return setError('Choose a 4-digit PIN.');
    setError('');
    setSubmitting(true);
    try {
      const u = await register({ ...details, pin, otpCode, referrerId: referrer?._id });
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (step === 2) {
    return (
      <PageLayout back={() => { setError(''); setStep(1); }} right="Step 2 of 2">
        <StepBar step={2} />
        <h1 className="text-display tracking-tight text-ink">Set your PIN</h1>
        <p className="text-body text-muted mt-2 mb-6">First enter the code we sent by SMS, then choose the PIN you will log in with.</p>
        <form onSubmit={create} className="space-y-6">
          <OtpField phone={details.phone} purpose="register" value={otpCode} onChange={setOtpCode} autoFocus />
          <div>
            <p className="text-label text-ink mb-2">Choose a 4-digit PIN</p>
            <PinBoxes value={pin} onChange={setPin} />
          </div>
          <ReferrerSearch selected={referrer} onSelect={setReferrer} />
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={submitting || pin.length !== 4 || otpCode.length !== 6}>{submitting ? 'Creating account…' : 'Create account'}</Button>
        </form>
      </PageLayout>
    );
  }

  return (
    <PageLayout back="/login" right="Step 1 of 2">
      <StepBar step={1} />
      <h1 className="text-display tracking-tight text-ink">Create your account</h1>
      <p className="text-body text-muted mt-2 mb-6">Tell us who you are.</p>

      <form onSubmit={continueToPin} className="space-y-6">
        <div>
          <p className="text-label text-ink mb-2">I am a…</p>
          <div role="radiogroup" aria-label="I am a" className="grid grid-cols-2 gap-3">
            <OptionCard selected={details.role === 'client'} title="Client" description="I need work done" onSelect={() => set({ role: 'client' })} />
            <OptionCard selected={details.role === 'worker'} title="Worker" description="I do the work" onSelect={() => set({ role: 'worker' })} />
          </div>
        </div>

        {details.role === 'worker' && (
          <div>
            <p className="text-label text-ink mb-2">What work do you do?</p>
            <ChipRow label="What work do you do?">
              {CATEGORIES.map(c => (
                <Chip key={c.value} active={details.skills.includes(c.value)} onClick={() => toggleSkill(c.value)}>{c.label}</Chip>
              ))}
            </ChipRow>
          </div>
        )}

        <FormField label="Full name">
          {field => <TextInput {...field} autoComplete="name" value={details.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Eric Habimana" />}
        </FormField>

        <FormField label="Phone number">
          {field => <TextInput {...field} type="tel" inputMode="tel" autoComplete="tel" value={details.phone} onChange={e => set({ phone: e.target.value })} placeholder="078X XXX XXX" />}
        </FormField>

        <div>
          <p className="text-label text-ink mb-2">Area</p>
          <ChipRow label="Area">
            {AREAS.map(a => (
              <Chip key={a.value} active={details.area === a.value} onClick={() => set({ area: a.value })}>{a.label}</Chip>
            ))}
          </ChipRow>
        </div>

        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <Button type="submit" disabled={sending}>{sending ? 'Sending code…' : 'Continue'}</Button>
      </form>
    </PageLayout>
  );
}

// "Who invited you?" — optional, creates the referral edge on signup (FR-03).
function ReferrerSearch({ selected, onSelect }) {
  const [query, setQuery] = useState(selected?.name || '');
  const [results, setResults] = useState([]);

  useEffect(() => {
    if (query.trim().length < 2 || query === selected?.name) return undefined;
    const timer = setTimeout(() => {
      api(`/api/users/search?q=${encodeURIComponent(query.trim())}`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, selected]);

  const shown = selected && !results.some(r => r._id === selected._id) ? [selected, ...results] : results;

  return (
    <div>
      <FormField label="Who invited you? (optional)" helper="Being vouched for helps you get found faster. You can skip this.">
        {field => (
          <TextInput
            {...field}
            value={query}
            onChange={e => { setQuery(e.target.value); if (selected) onSelect(null); }}
            placeholder="Start typing a name"
            autoComplete="off"
          />
        )}
      </FormField>
      {query.trim().length >= 2 && shown.length > 0 && (
        <Card className="mt-3 p-0 overflow-hidden">
          <ul role="listbox" aria-label="People who might have invited you" className="divide-y divide-line">
            {shown.map(person => {
              const isSelected = selected?._id === person._id;
              return (
                <li key={person._id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { onSelect(isSelected ? null : person); setQuery(isSelected ? '' : person.name); }}
                    className="w-full flex items-center gap-3 px-4 py-3 min-h-[72px] text-left"
                  >
                    <Avatar name={person.name} tier={isSelected ? 'network' : 'new'} size={52} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-card text-ink">{person.name}</span>
                      <span className="block text-body text-muted capitalize">{person.role} · {areaLabel(person.area)}</span>
                    </span>
                    {isSelected && (
                      <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
                        <path d="m2 8 6 6L18 2" className="stroke-signal" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
