const DEFAULT_URI = 'mongodb://localhost:27017/middleman';

/**
 * Reads MONGO_URI and catches the most common copy-paste mistake before the
 * driver turns it into a cryptic DNS error: an unencoded '@' in the password.
 * Returns the URI plus a credential-free description safe to log.
 */
export function getMongoUri() {
  const uri = (process.env.MONGO_URI || DEFAULT_URI).trim();
  const authority = uri.replace(/^mongodb(\+srv)?:\/\//, '').split(/[/?]/)[0];

  const atCount = (authority.match(/@/g) || []).length;
  if (atCount > 1) {
    throw new Error(
      'MONGO_URI contains more than one "@" before the host. The password must not contain a raw "@" ' +
      '(write it as %40, or set a password with only letters and numbers). Expected shape: ' +
      'mongodb+srv://USERNAME:PASSWORD@cluster.xxxxx.mongodb.net/middleman?retryWrites=true&w=majority'
    );
  }
  if (atCount === 1 && /^:|^@/.test(authority)) {
    throw new Error('MONGO_URI is missing the username: it should start mongodb+srv://USERNAME:PASSWORD@...');
  }

  const host = authority.split('@').pop();
  const source = process.env.MONGO_URI ? 'MONGO_URI' : 'default (MONGO_URI not set)';
  return { uri, description: `${host} via ${source}` };
}
