import { t, tMaybe } from './index.js';

// A server error in the person's language: by its code (server
// modules/errorCodes.js, i18n "error.<code>"), filling in its numbers; any
// error without a known code keeps the server's English text.
export function errorText(data, status) {
  if (data?.code) {
    const params = data.params || {};
    const [count] = Object.values(params);
    const counted = typeof count === 'number' && tMaybe(`error.${data.code}.one`) !== null;
    const text = counted ? tMaybe(`error.${data.code}.${count === 1 ? 'one' : 'other'}`, { n: count, ...params }) : tMaybe(`error.${data.code}`, params);
    if (text) return text;
  }
  return data?.error || t('error.requestFailed', { status });
}
