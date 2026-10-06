export const firstName = user => (user?.name || '').split(' ')[0];

export function greeting(user, date = new Date()) {
  const hour = date.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  return `${part}, ${firstName(user)}`;
}
