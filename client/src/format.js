import { t, tn } from './i18n/index.js';

// A no-break space keeps the amount and "RWF" on one line in narrow cards.
export const formatRwf = amount => `${Number(amount).toLocaleString('en-US')}\u00a0RWF`;

// "posted 2 hours ago" style relative time.
export function timeAgo(date, now = new Date()) {
  const minutes = Math.round((now - new Date(date)) / 60000);
  if (minutes < 1) return t('time.justNow');
  if (minutes < 60) return tn('time.minutesAgo', minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return tn('time.hoursAgo', hours);
  const days = Math.round(hours / 24);
  if (days === 1) return t('time.yesterday');
  return t('time.daysAgo', { n: days });
}

// A tel: link for a stored Rwandan number (07XXXXXXXX), in international form
// so it dials from any phone: "0788123456" -> "tel:+250788123456".
export function telHref(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (/^07\d{8}$/.test(digits)) return `tel:+250${digits.slice(1)}`;
  if (/^2507\d{8}$/.test(digits)) return `tel:+${digits}`;
  return `tel:${digits}`;
}
