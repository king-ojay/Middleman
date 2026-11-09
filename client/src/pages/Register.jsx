import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homePathFor } from '../auth.jsx';
import OtpField from '../components/OtpField.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import AreaPicker from '../components/AreaPicker.jsx';
import { CATEGORIES, areaLabel } from '../options.js';
import {
  Button, Card, Chip, ChipRow, FormField, OptionCard, PinBoxes, SlowNotice, StepBar, TextInput
} from '../components/ui/index.js';

// Rwandan mobile number, as typed: 078X XXX XXX, with or without +250.
const isPhone = value => /^(\+?250|0)?7\d{8}$/.test(value.replace(/[\s-]/g, ''));

// Two steps (FR-01, FR-02, FR-03): who you are, then a PIN and who invited you.
export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [details, setDetails] = useState({ role: 'client', name: '', phone: '', area: '', skills: [] });
  const [pin, setPin] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [sending, setSending] = useState(false);
  const [inviter, setInviter] = useState(null); // { phone, person } once confirmed
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const set = patch => setDetails(d => ({ ...d, ...patch }));
  const toggleSkill = value =>
    set({ skills: details.skills.includes(value) ? details.skills.filter(s => s !== value) : [...details.skills, value] });

  const continueToPin = async e => {
    e.preventDefault();
    if (!details.name.trim()) return setError('Enter your full name.');
    if (!isPhone(details.phone)) return setError('Enter a mobile number like 078X XXX XXX.');
    if (details.role === 'worker' && details.skills.length === 0) return setError('Choose at least one kind of work you do.');
    // No default area: the person picks one (it decides their area trust and default lists).
    if (!details.area) return setError('Choose your area.');
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
      const u = await register({ ...details, pin, otpCode, referrerPhone: inviter?.phone });
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (step === 2) {
    return (
      <AuthLayout back={() => { setError(''); setStep(1); }} right="Step 2 of 2">
        <StepBar step={2} />
        <h1 className="text-display tracking-tight text-ink">Set your PIN</h1>
        <p className="text-body text-muted mt-2 mb-6">First enter the code we sent by SMS, then choose the PIN you will log in with.</p>
        <form onSubmit={create} className="space-y-6">
          <OtpField phone={details.phone} purpose="register" value={otpCode} onChange={setOtpCode} autoFocus />
          <div>
            <p className="text-label text-ink mb-2">Choose a 4-digit PIN</p>
            <PinBoxes value={pin} onChange={setPin} />
          </div>
          <InviterPhone confirmed={inviter} onConfirm={setInviter} />
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <div>
            <Button type="submit" disabled={submitting || pin.length !== 4 || otpCode.length !== 6} aria-busy={submitting}>{submitting ? 'Creating account…' : 'Create account'}</Button>
            <SlowNotice active={submitting} className="mt-3 text-center" />
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout back="/login" right="Step 1 of 2">
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

        <AreaPicker
          label="Your area"
          value={details.area}
          onChange={area => { set({ area }); if (error === 'Choose your area.') setError(''); }}
          error={error === 'Choose your area.' ? error : ''}
        />

        {error && error !== 'Choose your area.' && <p className="text-small text-danger" role="alert">{error}</p>}
        <div>
          <Button type="submit" disabled={sending} aria-busy={sending}>{sending ? 'Sending code…' : 'Continue'}</Button>
          <SlowNotice active={sending} className="mt-3 text-center" />
        </div>
      </form>
    </AuthLayout>
  );
}

// "Who invited you?" — optional, creates the referral edge on signup (FR-03).
// The inviter is found by their exact phone number, never by name (two people
// can share a name), and only counts once the person confirms the match.
function InviterPhone({ confirmed, onConfirm }) {
  const [phone, setPhone] = useState(confirmed?.phone || '');
  const [found, setFound] = useState(null);
  const [error, setError] = useState(null);
  const [looking, setLooking] = useState(false);
  const latest = useRef(0);
  const inputId = useRef(null);

  const lookup = async number => {
    const ticket = ++latest.current;
    setLooking(true);
    setError(null);
    setFound(null);
    try {
      const person = await api('/api/users/lookup', { method: 'POST', body: JSON.stringify({ phone: number }) });
      if (ticket === latest.current) setFound(person);
    } catch (err) {
      if (ticket === latest.current) setError(err);
    } finally {
      if (ticket === latest.current) setLooking(false);
    }
  };

  const change = value => {
    setPhone(value);
    latest.current += 1; // drop any lookup still on its way
    setFound(null);
    setError(null);
    setLooking(false);
    if (isPhone(value)) lookup(value);
  };

  const startOver = () => {
    onConfirm(null);
    change('');
    // after the input is back on screen
    setTimeout(() => document.getElementById(inputId.current)?.focus());
  };

  const summary = person =>
    `${person.name} · ${areaLabel(person.area)} · ${person.role === 'worker' ? 'Worker' : 'Client'} · phone ending ${person.phoneEnding}`;

  if (confirmed) {
    return (
      <div>
        <p className="text-label text-ink mb-2">Who invited you?</p>
        <Card className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-body text-ink">Invited by {summary(confirmed.person)}</p>
          <Button variant="outline" size="md" onClick={startOver}>Change</Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <FormField label="Inviter's phone number (optional)" helper="Being vouched for helps you get found faster. You can skip this.">
        {field => {
          inputId.current = field.id;
          return (
            <TextInput
              {...field}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              value={phone}
              onChange={e => change(e.target.value)}
              placeholder="078X XXX XXX"
            />
          );
        }}
      </FormField>
      <div aria-live="polite">
        {looking && <p className="text-small text-muted mt-3">Looking up this number…</p>}
        {found && (
          <Card className="mt-3">
            <p className="text-body text-ink">{summary(found)}. Is this who invited you?</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button size="md" onClick={() => onConfirm({ phone, person: found })}>Confirm</Button>
              <Button variant="outline" size="md" onClick={startOver}>Change</Button>
            </div>
          </Card>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <p className="text-small text-danger" role="alert">{error.message}</p>
          {(error.retryable || error.status === 429) && (
            <Button variant="outline" size="md" className="mt-3" onClick={() => lookup(phone)}>Try again</Button>
          )}
        </div>
      )}
    </div>
  );
}
