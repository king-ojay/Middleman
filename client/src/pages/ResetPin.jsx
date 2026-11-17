import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homePathFor } from '../auth.jsx';
import OtpField from '../components/OtpField.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import { Button, FormField, PinBoxes, SlowNotice, StepBar, TextInput } from '../components/ui/index.js';
import { t } from '../i18n/index.js';

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
      <AuthLayout back={() => { setError(''); setStep(1); }} right={t('common.stepOf', { step: 2, total: 2 })}>
        <StepBar step={2} />
        <h1 className="text-display tracking-tight text-ink">{t('reset.newTitle')}</h1>
        <p className="text-body text-muted mt-2 mb-6">{t('reset.newSub')}</p>
        <form onSubmit={reset} className="space-y-6">
          <OtpField phone={phone} purpose="pin_reset" value={code} onChange={setCode} autoFocus />
          <div>
            <p className="text-label text-ink mb-2">{t('reset.newPin')}</p>
            <PinBoxes value={pin} onChange={setPin} label={t('reset.newPinLabel')} />
          </div>
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <div>
            <Button type="submit" disabled={busy || code.length !== 6 || pin.length !== 4} aria-busy={busy}>{busy ? t('common.saving') : t('reset.save')}</Button>
            <SlowNotice active={busy} className="mt-3 text-center" />
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout back="/login" right={t('common.stepOf', { step: 1, total: 2 })}>
      <StepBar step={1} />
      <h1 className="text-display tracking-tight text-ink">{t('reset.title')}</h1>
      <p className="text-body text-muted mt-2 mb-6">{t('reset.sub')}</p>
      <form onSubmit={sendCode} className="space-y-6">
        <FormField label={t('common.phoneNumber')} error={error}>
          {field => <TextInput {...field} type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('common.phonePlaceholder')} required />}
        </FormField>
        <div>
          <Button type="submit" disabled={busy} aria-busy={busy}>{busy ? t('register.sendingCode') : t('reset.send')}</Button>
          <SlowNotice active={busy} className="mt-3 text-center" />
        </div>
      </form>
    </AuthLayout>
  );
}
