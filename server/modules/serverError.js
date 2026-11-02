// Unknown server errors: the person gets one generic message, and the real
// error goes to the server log without personal data (ethics form: logs never
// carry names or phone numbers). The log line has the path with ids replaced
// by :id (no query or body), the error's name and code, its message with
// phone numbers masked, and the top of the stack. Database errors that echo
// submitted values (validation, cast, duplicate key) are logged by field name
// only. Other messages normally come from code, not from what people typed.
import { maskPhonesIn } from './auth/otp/providers.js';

export const SERVER_ERROR = 'Something went wrong. Please try again.';

export function describeError(err) {
  if (err?.name === 'ValidationError') return `invalid ${Object.keys(err.errors || {}).join(', ') || 'document'}`;
  if (err?.name === 'CastError') return `cast failed for ${err.path || 'a value'}`;
  if (err?.code === 11000) return `duplicate key on ${Object.keys(err.keyPattern || {}).join(', ') || 'an index'}`;
  return maskPhonesIn(err?.message).slice(0, 300);
}

export function serverError(res, err, req) {
  const path = String(req?.originalUrl ?? '').split('?')[0].replace(/[0-9a-f]{24}/gi, ':id');
  const where = req ? `${req.method} ${path}` : '';
  const stack = String(err?.stack ?? '').split('\n').slice(1, 6).join('\n');
  console.error(`[error] ${where} ${err?.name || 'Error'}${err?.code ? ` (${err.code})` : ''}: ${describeError(err)}${stack ? `\n${stack}` : ''}`);
  return res.status(500).json({ error: SERVER_ERROR });
}
