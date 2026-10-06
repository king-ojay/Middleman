import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { categoryLabel, areaLabel } from '../options.js';
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
    setProfile(null);
    api(`/api/users/${profileId}/profile`).then(setProfile).catch(err => setError(err.message));
  }, [profileId]);

  const layout = { back: isOwn ? undefined : true, tabBar: true, role: user.role };
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
        <ul className="space-y-3">
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

      {isOwn && (
        <Button variant="outline" className="mt-10" onClick={() => { logout(); navigate('/'); }}>Log out</Button>
      )}
    </PageLayout>
  );
}

function Stat({ value, label }) {
  return (
    <div>
      <p className="text-title text-forest">{value}</p>
      <p className="text-small text-muted mt-1">{label}</p>
    </div>
  );
}
