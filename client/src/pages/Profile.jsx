import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { categoryLabel, areaLabel } from '../options.js';
import { THEMES, loadTheme, saveTheme } from '../theme.js';
import AreaPicker from '../components/AreaPicker.jsx';
import { Avatar, Badge, Button, Card, Chip, ChipRow, PageLayout, StarRating, TierBadge } from '../components/ui/index.js';

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
  if (error) return <PageLayout {...layout}><p className="text-body text-danger" role="alert">Couldn't load this profile: {error}</p></PageLayout>;
  if (!profile) return <PageLayout {...layout}><p className="text-body text-muted">Loading…</p></PageLayout>;

  const role = profile.role === 'worker' ? (profile.skills || []).map(categoryLabel).join(', ') : 'Client';
  const { stats } = profile;
  const extraVouchers = profile.vouchedBy.length - MAX_VOUCHER_CHIPS;

  return (
    <PageLayout {...layout}>
      <div className="flex flex-col items-center text-center pt-2">
        <Avatar name={profile.name} tier={isOwn ? 'network' : profile.trustSource} size={88} />
        <h1 className="text-title text-ink mt-4">{profile.name}</h1>
        <p className="text-body text-muted mt-1">{role} · {areaLabel(profile.area)}</p>
        <div className="flex flex-wrap justify-center gap-2 mt-3">
          {profile.verifiedStatus === 'verified' && <Badge tone="signal">Verified</Badge>}
          {!isOwn && <TierBadge tier={profile.trustSource} />}
        </div>
      </div>

      <Card className="grid grid-cols-3 text-center py-5 mt-6">
        <Stat value={stats.jobsDone} label="Jobs done" />
        <Stat value={stats.avgRating ?? '–'} label="Avg rating" />
        <Stat value={stats.vouches} label="Vouches" />
      </Card>

      <h2 className="text-section text-ink mt-8 mb-3">Vouched for by</h2>
      {profile.vouchedBy.length === 0 ? (
        <p className="text-body text-muted">No vouches yet.</p>
      ) : (
        <ChipRow label="Vouched for by">
          {profile.vouchedBy.slice(0, MAX_VOUCHER_CHIPS).map(name => <Chip static key={name}>{name}</Chip>)}
          {extraVouchers > 0 && <Chip static>+ {extraVouchers} more</Chip>}
        </ChipRow>
      )}

      <h2 className="text-section text-ink mt-8 mb-3">Recent ratings</h2>
      {profile.recentRatings.length === 0 ? (
        <p className="text-body text-muted">No ratings yet.</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 items-start">
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
        <Button variant="outline" className="mt-10" onClick={() => { logout(); navigate('/'); }}>Log out</Button>
      )}
    </PageLayout>
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
      <h2 className="text-section text-ink mt-8 mb-3">Your area</h2>
      <Card className="p-5">
        {!editing ? (
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-body font-semibold text-ink">{areaLabel(area)}</p>
              <p className="text-small text-muted mt-1">Where you live or work. It decides who counts as "in this area" and which jobs and workers you see first.</p>
            </div>
            <Button variant="outline" size="md" className="shrink-0" onClick={() => { setChoice(area); setEditing(true); }}>Change</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <AreaPicker label="Choose your area" value={choice} onChange={setChoice} />
            {error && <p className="text-small text-danger" role="alert">{error}</p>}
            <div className="flex flex-wrap gap-3">
              <Button size="md" onClick={save} disabled={saving || choice === area}>{saving ? 'Saving…' : 'Save area'}</Button>
              <Button variant="outline" size="md" onClick={() => setEditing(false)} disabled={saving}>Cancel</Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

const THEME_LABELS = { system: 'Match phone', light: 'Light', dark: 'Dark' };

// Your own profile only. Appearance is saved on this device (theme.js).
function Preferences() {
  const [theme, setTheme] = useState(loadTheme);
  const choose = next => { saveTheme(next); setTheme(next); };
  return (
    <>
      <h2 className="text-section text-ink mt-8 mb-3">Preferences</h2>
      <Card className="p-5">
        <p className="text-body font-semibold text-ink">Appearance</p>
        <p className="text-small text-muted mt-1">Dark mode is easier on the eyes at night and saves battery on many phones.</p>
        <div role="group" aria-label="Appearance" className="flex flex-wrap gap-2 mt-4">
          {THEMES.map(t => <Chip key={t} active={theme === t} onClick={() => choose(t)}>{THEME_LABELS[t]}</Chip>)}
        </div>
      </Card>
    </>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-title text-heading">{value}</p>
      <p className="text-small text-muted mt-1">{label}</p>
    </div>
  );
}