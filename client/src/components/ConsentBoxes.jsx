import { useState } from 'react';
import { t } from '../i18n/index.js';
import { Sheet } from './ui/index.js';
import PrivacyPolicy from './PrivacyPolicy.jsx';

// The two consent boxes, at sign-up (Register.jsx) and on the consent screen
// for accounts without consent to the current policy (ConsentScreen.jsx):
// "I am 18 or older" and "I have read and agree to the Privacy Policy &
// Terms", whose name opens the policy in a sheet so nothing typed is lost.
export default function ConsentBoxes({ ageConfirmed, onAgeConfirmed, policyAccepted, onPolicyAccepted }) {
  const [reading, setReading] = useState(false);
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="sr-only">{t('register.consentHelper')}</legend>
        <Consent checked={ageConfirmed} onChange={onAgeConfirmed}>{t('register.age')}</Consent>
        <Consent checked={policyAccepted} onChange={onPolicyAccepted}>
          <AgreeText onOpen={() => setReading(true)} />
        </Consent>
        {!(ageConfirmed && policyAccepted) && <p className="text-small text-muted">{t('register.consentHelper')}</p>}
      </fieldset>
      <Sheet open={reading} title={t('privacy.title')} onClose={() => setReading(false)}>
        <PrivacyPolicy />
      </Sheet>
    </>
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
