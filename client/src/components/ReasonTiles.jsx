import { reasonTiles } from '../trustReason.js';

// Two or three small grey tiles of facts from the worker's reason
// (trustReason.js reasonTiles): "2 steps / from you", "5★ / from Amina".
// Never a score.
const COLUMNS = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

export default function ReasonTiles({ reason, className = '' }) {
  const tiles = reasonTiles(reason);
  if (tiles.length === 0) return null;
  return (
    <ul className={`grid gap-2 ${COLUMNS[tiles.length]} ${className}`}>
      {tiles.map(t => (
        <li key={`${t.value} ${t.label}`} className="bg-soft rounded-tile px-3 py-2.5 min-w-0">
          <p className="text-card font-extrabold text-ink">{t.value}</p>
          <p className="text-small text-muted">{t.label}</p>
        </li>
      ))}
    </ul>
  );
}
