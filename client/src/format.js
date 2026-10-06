export const formatRwf = amount => `${Number(amount).toLocaleString('en-US')} RWF`;

// "posted 2 hours ago" style relative time.
export function timeAgo(date, now = new Date()) {
  const minutes = Math.round((now - new Date(date)) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
