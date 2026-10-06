import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Button, FormField, TextInput } from './ui/index.js';

const RESEND_SECONDS = 60;

// The 6-digit code sent by SMS, with a "send a new code" link that waits a
// minute between requests (the server rate-limits as well).
export default function OtpField({ phone, purpose, value, onChange, autoFocus }) {
  const [wait, setWait] = useState(RESEND_SECONDS);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const resend = async () => {
    setNote('');
    try {
      await api('/api/auth/otp', { method: 'POST', body: JSON.stringify({ phone, purpose }) });
      setWait(RESEND_SECONDS);
      setNote('We sent a new code.');
    } catch (err) {
      setNote(err.message);
    }
  };

  return (
    <div>
      <FormField label={`Code we sent to ${phone}`} helper={note || 'It can take a minute to arrive. It expires after 5 minutes.'}>
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
      <Button variant="plain" size="md" className="-ml-5" disabled={wait > 0} onClick={resend}>
        {wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}
      </Button>
    </div>
  );
}
