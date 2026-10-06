// Small in-memory fixed-window limiter. Good for a single API instance; a
// shared store (e.g. Redis) is needed if the API ever runs on several.
const buckets = new Map(); // key -> { count, resetAt }

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

// Drop expired buckets now and then so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(key);
}, 10 * 60 * 1000).unref();
