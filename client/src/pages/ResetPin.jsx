import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homePathFor } from '../auth.jsx';
import OtpField from '../components/OtpField.jsx';
import { Button, FormField, PageLayout, PinBoxes, StepBar, TextInput } from '../components/ui/index.js';

// Forgot PIN: phone -> code by SMS + new PIN. The only time codes are used
// after signup; daily login is phone + PIN.
export default function ResetPin() {
  const { resetPin } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api('/api/auth/otp', { method: 'POST', body: JSON.stringify({ phone, purpose: 'pin_reset' }) });
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reset = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const u = await resetPin(phone, code, pin);
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  if (step === 2) {
    return (
      <PageLayout back={() => { setError(''); setStep(1); }} right="Step 2 of 2">
        <StepBar step={2} />
        <h1 className="text-display tracking-tight text-ink">Choose a new PIN</h1>
        <p className="text-body text-muted mt-2 mb-6">If this number has an account, we sent it a code.</p>
        <form onSubmit={reset} className="space-y-6">
          <OtpField phone={phone} purpose="pin_reset" value={code} onChange={setCode} autoFocus />
          <div>
            <p className="text-label text-ink mb-2">New 4-digit PIN</p>
            <PinBoxes value={pin} onChange={setPin} label="New PIN" />
          </div>
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <Button type="submit" disabled={busy || code.length !== 6 || pin.length !== 4}>{busy ? 'Saving…' : 'Save PIN and log in'}</Button>
        </form>
      </PageLayout>
    );
  }

  return (
    <PageLayout back="/login" right="Step 1 of 2">
      <StepBar step={1} />
      <h1 className="text-display tracking-tight text-ink">Forgot your PIN?</h1>
      <p className="text-body text-muted mt-2 mb-6">We will text a code to your phone.</p>
      <form onSubmit={sendCode} className="space-y-6">
        <FormField label="Phone number" error={error}>
          {field => <TextInput {...field} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="078X XXX XXX" required />}
        </FormField>
        <Button type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Send code'}</Button>
      </form>
    </PageLayout>
  );
}
