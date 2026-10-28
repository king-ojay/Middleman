// Which web origins may call the API from a browser. CORS_ORIGINS is a
// comma-separated list (production: the Vercel app). Outside production the
// local Vite dev and preview servers are allowed as well.
export const DEV_ORIGINS = Object.freeze([
  'http://localhost:5173', 'http://127.0.0.1:5173', // npm run dev
  'http://localhost:4173', 'http://127.0.0.1:4173'  // npm run preview
]);

export function allowedOrigins(env = process.env) {
  const configured = (env.CORS_ORIGINS || '').split(',').map(o => o.trim().replace(/\/+$/, '')).filter(Boolean);
  if (env.NODE_ENV === 'production') {
    if (configured.length === 0) throw new Error('CORS_ORIGINS must be set in production, e.g. https://middleman-client.vercel.app');
    return new Set(configured);
  }
  return new Set([...configured, ...DEV_ORIGINS]);
}

// Rejects any request that carries an Origin header not on the list (403),
// including preflights. Requests with no Origin header (curl, health checks,
// server-to-server) aren't from a browser page and pass through.
export function rejectOtherOrigins(origins) {
  return (req, res, next) => {
    const { origin } = req.headers;
    if (origin && !origins.has(origin)) return res.status(403).json({ error: 'Origin not allowed' });
    next();
  };
}
