// First name and time-of-day greeting for page headers.
import { t } from './i18n/index.js';

export const firstName = user => (user?.name || '').split(' ')[0];

// How someone who deleted their account is shown (server: users/deleteUser.js).
export const deletedUser = () => t('common.deletedUser');

export function greeting(user, date = new Date()) {
  const hour = date.getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  return t(`greeting.${part}`, { name: firstName(user) });
}
