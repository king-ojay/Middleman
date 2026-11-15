// First name and time-of-day greeting for page headers.
export const firstName = user => (user?.name || '').split(' ')[0];

// How someone who deleted their account is shown (server: users/deleteUser.js).
export const DELETED_USER = 'Deleted user';

export function greeting(user, date = new Date()) {
  const hour = date.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${firstName(user)}`;
}
