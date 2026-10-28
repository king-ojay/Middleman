// Small in-memory limiters. Good for a single API instance; a shared store
// (e.g. Redis) is needed if the API ever runs on several. Keys may contain a
// phone number or an IP address: they live only in this process's memory,
// are dropped once expired, and are never written to the database or logs.
const buckets = new Map();  // key -> { count, resetAt }            fixed-window counters
const failures = new Map(); // key -> { count, resetAt, lockedUntil } failed attempts and lockouts

export function hit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }
  bucket.count += 1;
  return { allowed: bucket.count <= limit, retryAfterMs: bucket.resetAt - now };
}

// Milliseconds left on `key`'s lockout, or 0 if it isn't locked.
export function lockedFor(key) {
  const entry = failures.get(key);
  return entry && entry.lockedUntil > Date.now() ? entry.lockedUntil - Date.now() : 0;
}

// Counts one failed attempt. The `limit`-th failure inside `windowMs` locks
// the key for `lockMs`. Returns true if the key is now locked.
export function recordFailure(key, limit, windowMs, lockMs) {
  const now = Date.now();
  let entry = failures.get(key);
  if (!entry || (entry.resetAt <= now && entry.lockedUntil <= now)) {
    entry = { count: 0, resetAt: now + windowMs, lockedUntil: 0 };
    failures.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= limit) entry.lockedUntil = now + lockMs;
  return entry.lockedUntil > now;
}

export function clearFailures(key) {
  failures.delete(key);
}

// Drop expired entries now and then so the maps don't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
  for (const [key, entry] of failures) if (entry.resetAt <= now && entry.lockedUntil <= now) failures.delete(key);
}, 10 * 60 * 1000).unref();
