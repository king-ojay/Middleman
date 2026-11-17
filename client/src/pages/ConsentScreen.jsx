// Shown instead of the app to a logged-in account that hasn't agreed to the
// current Privacy Policy & Terms (auth.jsx needsConsent): an account from
// before consent was asked for, or after the policy changed. The same two
// boxes as sign-up; Continue records consent (POST /api/auth/consent). The
// server refuses every other logged-in route until then. Log out is always
// there for someone who doesn't agree.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { POLICY_VERSION } from '../policy.shared.js';
import { t } from '../i18n/index.js';
import AuthLayout from '../components/AuthLayout.jsx';
import ConsentBoxes from '../components/ConsentBoxes.jsx';
import LanguageSwitch from '../components/LanguageSwitch.jsx';
import { Button, SlowNotice } from '../components/ui/index.js';

export default function ConsentScreen() {
  const { giveConsent, logout } = useAuth();
  const navigate = useNavigate();
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await giveConsent();
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <LanguageSwitch className="mb-8" />
      <h1 className="text-display tracking-tight text-ink">{t('consent.title')}</h1>
      <p className="text-body text-muted mt-2 mb-6">{t('consent.sub', { version: POLICY_VERSION })}</p>
      <form onSubmit={save} className="space-y-6">
        <ConsentBoxes ageConfirmed={ageConfirmed} onAgeConfirmed={setAgeConfirmed} policyAccepted={policyAccepted} onPolicyAccepted={setPolicyAccepted} />
        {error && <p className="text-small text-danger" role="alert">{error}</p>}
        <div className="space-y-3">
          <Button type="submit" disabled={saving || !ageConfirmed || !policyAccepted} aria-busy={saving}>{saving ? t('common.saving') : t('consent.continue')}</Button>
          <SlowNotice active={saving} className="text-center" />
          <Button variant="outline" onClick={() => { logout(); navigate('/'); }} disabled={saving}>{t('profile.logOut')}</Button>
        </div>
      </form>
    </AuthLayout>
  );
}
