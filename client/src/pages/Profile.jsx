import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { categoryLabel, areaLabel } from '../options.js';
import { formatRwf } from '../format.js';
import { THEMES, loadTheme, saveTheme } from '../theme.js';
import AreaPicker from '../components/AreaPicker.jsx';
import LanguageSwitch from '../components/LanguageSwitch.jsx';
import { t, tn } from '../i18n/index.js';
import {
  Avatar, Button, Card, Chip, ChipRow, LoadingState, PageLayout, Skeleton, SkeletonText, StarRating, TierBadge, VerifiedBadge
} from '../components/ui/index.js';

const MAX_VOUCHER_CHIPS = 3;

// Frame 09. /profile is your own; /people/:id is someone else's, with their
// trust tier from your side. Works for clients as well as workers.
export default function Profile() {
  const { id } = useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const profileId = id || user._id;
  const isOwn = profileId === user._id;
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Ignore a slow answer for a profile we have already moved away from.
    let current = true;
    setProfile(null);
    setError('');
    api(`/api/users/${profileId}/profile`)
      .then(data => current && setProfile(data))
      .catch(err => current && setError(err.message));
    return () => { current = false; };
  }, [profileId]);

  const layout = { back: isOwn ? undefined : true, tabBar: true, role: user.role, width: 'medium' };
  if (error) return <PageLayout {...layout}><p className="text-body text-danger" role="alert">{t('common.loadError', { what: t('profile.loadError'), message: error })}</p></PageLayout>;
  if (!profile) return <PageLayout {...layout}><ProfileSkeleton /></PageLayout>;

  const role = profile.role === 'worker' ? (profile.skills || []).map(categoryLabel).join(', ') : t('common.client');
  const { stats } = profile;
  const extraVouchers = profile.vouchedBy.length - MAX_VOUCHER_CHIPS;

  return (
    <PageLayout {...layout}>
      <div className="flex flex-col items-center text-center pt-2">
        <Avatar name={profile.name} size={88} />
        <h1 className="text-title text-ink mt-4">{profile.name}</h1>
        <p className="text-body text-muted mt-1">{role} · {areaLabel(profile.area)}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {profile.verifiedStatus === 'verified' && <VerifiedBadge />}
          {!isOwn && <TierBadge tier={profile.trustSource} />}
        </div>
      </div>

      <Card className="grid grid-cols-3 text-center py-5 mt-6">
        <Stat value={stats.jobsDone} label={t('profile.jobsDone')} />
        <Stat value={stats.avgRating ?? '–'} label={t('profile.avgRating')} />
        <Stat value={stats.vouches} label={t('profile.vouches')} />
      </Card>

      {isOwn && profile.earnings && <Earnings earnings={profile.earnings} role={profile.role} />}

      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.vouchedBy')}</h2>
      {profile.vouchedBy.length === 0 ? (
        <p className="text-body text-muted">{t('profile.noVouches')}</p>
      ) : (
        <ChipRow label={t('profile.vouchedBy')}>
          {profile.vouchedBy.slice(0, MAX_VOUCHER_CHIPS).map(name => <Chip static key={name}>{name}</Chip>)}
          {extraVouchers > 0 && <Chip static>{t('profile.more', { n: extraVouchers })}</Chip>}
        </ChipRow>
      )}

      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.recentRatings')}</h2>
      {profile.recentRatings.length === 0 ? (
        <p className="text-body text-muted">{t('profile.noRatings')}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {profile.recentRatings.map(r => (
            <Card as="li" key={r._id} className="p-5">
              <div className="flex items-center gap-3">
                <StarRating readOnly value={r.score} />
                <span className="text-body font-semibold text-ink">{r.from}</span>
              </div>
              {r.comment && <p className="text-body text-muted mt-2">{r.comment}</p>}
            </Card>
          ))}
        </ul>
      )}

      {isOwn && <AreaSetting area={profile.area} onSaved={area => setProfile(p => ({ ...p, area }))} />}
      {isOwn && <Preferences />}

      {isOwn && (
        <>
          <Link to="/privacy" className="inline-flex items-center h-11 mt-6 text-body text-muted underline hover:text-ink">{t('privacy.link')}</Link>
          <Button variant="outline" className="mt-4" onClick={() => { logout(); navigate('/'); }}>{t('profile.logOut')}</Button>
        </>
      )}
    </PageLayout>
  );
}

// Your own profile only (the server sends it to nobody else): money released
// from escrow to you as a worker, or paid by you as a client, and the way
// into every movement (Transactions).
function Earnings({ earnings, role }) {
  return (
    <Card className="p-5 mt-3">
      <p className="text-body font-semibold text-ink">{role === 'worker' ? t('profile.earned') : t('profile.paid')}</p>
      <p className="text-amount text-ink mt-2">{formatRwf(earnings.total)}</p>
      <p className="text-small text-muted mt-1">
        {tn('profile.completedJobs', earnings.jobs)}
      </p>
      <Button to="/transactions" variant="outline" size="md" className="mt-4">{t('profile.viewTransactions')}</Button>
    </Card>
  );
}

// Your own profile only. The area decides "Trusted in this area", which area
// Discover and your job list start on, and the default area for new jobs.
function AreaSetting({ area, onSaved }) {
  const { updateUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState(area);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { user } = await api('/api/users/me', { method: 'PATCH', body: JSON.stringify({ area: choice }) });
      updateUser(user);
      onSaved(user.area);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.yourArea')}</h2>
      <Card className="p-5">
        {!editing ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-ink">{areaLabel(area)}</p>
              <p className="text-small text-muted mt-1">{t('profile.areaNote')}</p>
            </div>
            <Button variant="outline" size="md" className="shrink-0" onClick={() => { setChoice(area); setEditing(true); }}>{t('common.change')}</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AreaPicker label={t('profile.chooseArea')} value={choice} onChange={setChoice} />
            {error && <p className="text-small text-danger" role="alert">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <Button size="md" onClick={save} disabled={saving || choice === area}>{saving ? t('common.saving') : t('profile.saveArea')}</Button>
              <Button variant="outline" size="md" onClick={() => setEditing(false)} disabled={saving}>{t('common.cancel')}</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

// Your own profile only. Appearance (theme.js) and language (i18n) are saved
// on this device.
function Preferences() {
  const [theme, setTheme] = useState(loadTheme);
  const choose = next => { saveTheme(next); setTheme(next); };
  return (
    <>
      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.preferences')}</h2>
      <Card className="p-5">
        <p className="text-body font-semibold text-ink">{t('profile.appearance')}</p>
        <p className="text-small text-muted mt-1">{t('profile.appearanceNote')}</p>
        <div role="group" aria-label={t('profile.appearance')} className="flex flex-wrap gap-2 mt-4">
          {THEMES.map(name => <Chip key={name} active={theme === name} onClick={() => choose(name)}>{t(`theme.${name}`)}</Chip>)}
        </div>
      </Card>
      <Card className="p-5 mt-3">
        <p className="text-body font-semibold text-ink">{t('language.label')}</p>
        <p className="text-small text-muted mt-1">{t('profile.languageNote')}</p>
        <LanguageSwitch className="mt-4" />
      </Card>
    </>
  );
}

// The shape of the profile above: avatar, name, trade · area, badges, the
// three stats, then the vouches and recent ratings.
function ProfileSkeleton() {
  return (
    <LoadingState label={t('profile.loading')}>
      <div className="flex flex-col items-center pt-2">
        <Skeleton on="canvas" className="w-[88px] h-[88px] rounded-full" />
        <SkeletonText size="title" on="canvas" className="w-48 mt-4" />
        <SkeletonText on="canvas" className="w-40 mt-1" />
        <Skeleton on="canvas" className="w-40 h-[26px] mt-3 rounded-full" />
      </div>
      <Card className="grid grid-cols-3 py-5 mt-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="flex flex-col items-center">
            <SkeletonText size="title" className="w-10" />
            <SkeletonText size="small" className="w-16 mt-1" />
          </div>
        ))}
      </Card>
      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.vouchedBy')}</h2>
      <div className="flex gap-2">
        {[0, 1].map(i => <Skeleton key={i} on="canvas" className="h-11 w-28 rounded-full" />)}
      </div>
      <h2 className="text-section text-ink mt-8 mb-3">{t('profile.recentRatings')}</h2>
      <ul className="grid gap-3 md:grid-cols-2">
        {[0, 1].map(i => (
          <Card as="li" key={i} className="p-5">
            <SkeletonText className="w-1/2" />
            <SkeletonText className="w-3/4 mt-2" />
          </Card>
        ))}
      </ul>
    </LoadingState>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-title text-ink">{value}</p>
      <p className="text-small text-muted mt-1">{label}</p>
    </div>
  );
}