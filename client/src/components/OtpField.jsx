import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, FormField, TextInput } from './ui/index.js';

const RESEND_SECONDS = 30;

// The 6-digit code sent by SMS, with a "Resend code" button that waits 30
// seconds between requests. The server's limit (3 codes per number per 15
// minutes) still applies; when it is reached its message shows here.
export default function OtpField({ phone, purpose, value, onChange, autoFocus }) {
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setNote('');
    setError('');
    setSending(true);
    try {
      await api('/api/auth/otp', { method: 'POST', body: JSON.stringify({ phone, purpose }) });
      setNote('We sent a new code.');
    } catch (err) {
      setError(err.message);
    } finally {
      // wait again either way, so a failed request isn't repeated straight away
      setWait(RESEND_SECONDS);
      setSending(false);
    }
  };

  return (
    <div>
      <FormField label={`Code we sent to ${phone}`} helper={note || 'It can take a minute to arrive. It expires after 5 minutes.'} error={error}>
        {field => (
          <TextInput
            {...field}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={value}
            onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6-digit code"
            autoFocus={autoFocus}
          />
        )}
      </FormField>
      <Button variant="plain" size="md" className="-ml-5" disabled={wait > 0 || sending} aria-busy={sending} onClick={resend}>
        {sending ? 'Sending…' : wait > 0 ? `Resend code in ${wait}s` : 'Resend code'}
      </Button>
    </div>
  );
}
