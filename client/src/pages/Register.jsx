import { useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth, homePathFor } from '../auth.jsx';
import OtpField from '../components/OtpField.jsx';
import AuthLayout from '../components/AuthLayout.jsx';
import AreaPicker from '../components/AreaPicker.jsx';
import PrivacyPolicy from '../components/PrivacyPolicy.jsx';
import { POLICY_VERSION } from '../policy.shared.js';
import { CATEGORIES, areaLabel } from '../options.js';
import {
  Button, Card, Chip, ChipRow, FormField, OptionCard, PinBoxes, Sheet, SlowNotice, StepBar, TextInput
} from '../components/ui/index.js';
import { t } from '../i18n/index.js';

// Rwandan mobile number, as typed: 078X XXX XXX, with or without +250.
const isPhone = value => /^(\+?250|0)?7\d{8}$/.test(value.replace(/[\s-]/g, ''));

// Two steps (FR-01, FR-02, FR-03): who you are, then a PIN, who invited you,
// and consent: 18 or older, and agreement to the Privacy Policy & Terms
// (shown in a sheet, so the form stays as it is). Create account stays off
// until both are ticked; the server refuses sign-up without them too.
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
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [readingPolicy, setReadingPolicy] = useState(false);
  // The SMS couldn't be sent (MTN rejects the shared sender ID): the code is
  // with the researcher (the admin code relay).
  const [relay, setRelay] = useState(false);

  if (user) return <Navigate to={homePathFor(user)} replace />;

  const set = patch => setDetails(d => ({ ...d, ...patch }));
  const toggleSkill = value =>
    set({ skills: details.skills.includes(value) ? details.skills.filter(s => s !== value) : [...details.skills, value] });

  const continueToPin = async e => {
    e.preventDefault();
    if (!details.name.trim()) return setError(t('register.err.name'));
    if (!isPhone(details.phone)) return setError(t('register.err.phone'));
    if (details.role === 'worker' && details.skills.length === 0) return setError(t('register.err.skills'));
    // No default area: the person picks one (it decides their area trust and default lists).
    if (!details.area) return setError(t('register.err.area'));
    setError('');
    setSending(true);
    try {
      // Confirms the phone number belongs to them before the account exists.
      const sent = await api('/api/auth/otp', { method: 'POST', body: JSON.stringify({ phone: details.phone, purpose: 'register' }) });
      setRelay(sent?.relay === true);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const create = async e => {
    e.preventDefault();
    if (otpCode.length !== 6) return setError(t('register.err.code'));
    if (pin.length !== 4) return setError(t('register.err.pin'));
    setError('');
    setSubmitting(true);
    try {
      const u = await register({ ...details, pin, otpCode, referrerPhone: inviter?.phone, ageConfirmed, policyAccepted, policyVersion: POLICY_VERSION });
      navigate(homePathFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (step === 2) {
    return (
      <AuthLayout back={() => { setError(''); setStep(1); }} right={t('common.stepOf', { step: 2, total: 2 })}>
        <StepBar step={2} />
        <h1 className="text-display tracking-tight text-ink">{t('register.pinTitle')}</h1>
        <p className="text-body text-muted mt-2 mb-6">{t('register.pinSub')}</p>
        <form onSubmit={create} className="space-y-6">
          {relay && <p role="status" className="text-body text-on-warn bg-warn rounded-field px-4 py-3">{t('register.relayNote')}</p>}
          <OtpField phone={details.phone} purpose="register" value={otpCode} onChange={setOtpCode} autoFocus />
          <div>
            <p className="text-label text-ink mb-2">{t('register.choosePin')}</p>
            <PinBoxes value={pin} onChange={setPin} />
          </div>
          <InviterPhone confirmed={inviter} onConfirm={setInviter} />
          <fieldset className="space-y-2">
            <legend className="sr-only">{t('register.consentHelper')}</legend>
            <Consent checked={ageConfirmed} onChange={setAgeConfirmed}>{t('register.age')}</Consent>
            <Consent checked={policyAccepted} onChange={setPolicyAccepted}>
              <AgreeText onOpen={() => setReadingPolicy(true)} />
            </Consent>
            {!(ageConfirmed && policyAccepted) && <p className="text-small text-muted">{t('register.consentHelper')}</p>}
          </fieldset>
          {error && <p className="text-small text-danger" role="alert">{error}</p>}
          <div>
            <Button type="submit" disabled={submitting || pin.length !== 4 || otpCode.length !== 6 || !ageConfirmed || !policyAccepted} aria-busy={submitting}>{submitting ? t('register.creating') : t('register.create')}</Button>
            <SlowNotice active={submitting} className="mt-3 text-center" />
          </div>
        </form>
        <Sheet open={readingPolicy} title={t('privacy.title')} onClose={() => setReadingPolicy(false)}>
          <PrivacyPolicy />
        </Sheet>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout back="/login" right={t('common.stepOf', { step: 1, total: 2 })}>
      <StepBar step={1} />
      <h1 className="text-display tracking-tight text-ink">{t('register.title')}</h1>
      <p className="text-body text-muted mt-2 mb-6">{t('register.sub')}</p>

      <form onSubmit={continueToPin} className="space-y-6">
        <div>
          <p className="text-label text-ink mb-2">{t('register.iAm')}</p>
          <div role="radiogroup" aria-label={t('register.iAmLabel')} className="grid grid-cols-2 gap-3">
            <OptionCard selected={details.role === 'client'} title={t('common.client')} description={t('register.client.desc')} onSelect={() => set({ role: 'client' })} />
            <OptionCard selected={details.role === 'worker'} title={t('common.worker')} description={t('register.worker.desc')} onSelect={() => set({ role: 'worker' })} />
          </div>
        </div>

        {details.role === 'worker' && (
          <div>
            <p className="text-label text-ink mb-2">{t('register.whatWork')}</p>
            <ChipRow label={t('register.whatWork')}>
              {CATEGORIES.map(c => (
                <Chip key={c.value} active={details.skills.includes(c.value)} onClick={() => toggleSkill(c.value)}>{c.label}</Chip>
              ))}
            </ChipRow>
          </div>
        )}

        <FormField label={t('register.fullName')}>
          {field => <TextInput {...field} autoComplete="name" value={details.name} onChange={e => set({ name: e.target.value })} placeholder={t('register.namePlaceholder')} />}
        </FormField>

        <FormField label={t('common.phoneNumber')}>
          {field => <TextInput {...field} type="tel" inputMode="tel" autoComplete="tel" value={details.phone} onChange={e => set({ phone: e.target.value })} placeholder={t('common.phonePlaceholder')} />}
        </FormField>

        <AreaPicker
          label={t('register.yourArea')}
          value={details.area}
          onChange={area => { set({ area }); if (error === t('register.err.area')) setError(''); }}
          error={error === t('register.err.area') ? error : ''}
        />

        {error && error !== t('register.err.area') && <p className="text-small text-danger" role="alert">{error}</p>}
        <div>
          <Button type="submit" disabled={sending} aria-busy={sending}>{sending ? t('register.sendingCode') : t('common.continue')}</Button>
          <SlowNotice active={sending} className="mt-3 text-center" />
        </div>
      </form>
    </AuthLayout>
  );
}

// One consent checkbox: a native checkbox (keyboard and screen readers as
// usual) in a 52px row that is tappable as a whole.
function Consent({ checked, onChange, children }) {
  return (
    <label className="flex items-start gap-3 min-h-[52px] py-3 px-4 rounded-field bg-surface border border-line cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[rgb(var(--primary))]" />
      <span className="text-body text-ink">{children}</span>
    </label>
  );
}

// "I have read and agree to the Privacy Policy & Terms", the policy's name a
// button that opens it in a sheet. The sentence comes from i18n with {link}
// where the name goes, so the word order can differ by language.
function AgreeText({ onOpen }) {
  const [before, after = ''] = t('register.agree').split('{link}');
  const open = e => { e.preventDefault(); onOpen(); };
  return (
    <>
      {before}
      <button type="button" onClick={open} className="font-semibold underline text-ink">{t('register.agreeLink')}</button>
      {after}
    </>
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
    t('register.inviter.summary', { name: person.name, area: areaLabel(person.area), role: t(person.role === 'worker' ? 'common.worker' : 'common.client'), ending: person.phoneEnding });

  if (confirmed) {
    return (
      <div>
        <p className="text-label text-ink mb-2">{t('register.inviter.who')}</p>
        <Card className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-body text-ink">{t('register.inviter.by', { summary: summary(confirmed.person) })}</p>
          <Button variant="outline" size="md" onClick={startOver}>{t('common.change')}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <FormField label={t('register.inviter.label')} helper={t('register.inviter.helper')}>
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
              placeholder={t('common.phonePlaceholder')}
            />
          );
        }}
      </FormField>
      <div aria-live="polite">
        {looking && <p className="text-small text-muted mt-3">{t('register.inviter.looking')}</p>}
        {found && (
          <Card className="mt-3">
            <p className="text-body text-ink">{t('register.inviter.isThis', { summary: summary(found) })}</p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Button size="md" onClick={() => onConfirm({ phone, person: found })}>{t('common.confirm')}</Button>
              <Button variant="outline" size="md" onClick={startOver}>{t('common.change')}</Button>
            </div>
          </Card>
        )}
      </div>
      {error && (
        <div className="mt-3">
          <p className="text-small text-danger" role="alert">{error.message}</p>
          {(error.retryable || error.status === 429) && (
            <Button variant="outline" size="md" className="mt-3" onClick={() => lookup(phone)}>{t('common.tryAgain')}</Button>
          )}
        </div>
      )}
    </div>
  );
}
